/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { ThermostatClient } from "#behaviors/thermostat";
import { Endpoint } from "#endpoint/index.js";
import { ClientNode } from "#node/ClientNode.js";
import { Bytes } from "@matter/general";
import { MockServerNode, MockSite, subscribedPeer } from "@matter/node/testing";
import { Write } from "@matter/protocol";
import { EndpointNumber, Status } from "@matter/types";
import { Thermostat } from "@matter/types/clusters/thermostat";
import { newPreset, PRESETS_ATTRIBUTE } from "./preset-helpers.js";
import {
    newSchedule,
    newScheduleTransition,
    recordThermostatChanges,
    SCHEDULES_ATTRIBUTE,
    schedulesEndpoint,
    SchedulesThermostat,
    thermostatConfig,
} from "./schedule-helpers.js";

function commissionedThermostat() {
    return commissioned(schedulesEndpoint());
}

async function commissioned<E extends Endpoint>(deviceEp: E) {
    const site = new MockSite();
    const { controller, device } = await site.addCommissionedPair({
        device: { type: MockServerNode.RootEndpoint, device: deviceEp },
    });

    const peer1 = await subscribedPeer(controller, "peer1");
    const ep1 = peer1.parts.get("ep1")!;
    expect(ep1).not.undefined;

    return { device, deviceEp, peer1, ep1, [Symbol.asyncDispose]: () => site[Symbol.asyncDispose]() };
}

function beginWrite(ep1: Endpoint) {
    return MockTime.resolve(
        ep1.commandsOf(ThermostatClient).atomicRequest({
            requestType: Thermostat.RequestType.BeginWrite,
            attributeRequests: [SCHEDULES_ATTRIBUTE],
            timeout: 5000,
        }),
    );
}

function commitWrite(ep1: Endpoint) {
    return MockTime.resolve(
        ep1.commandsOf(ThermostatClient).atomicRequest({
            requestType: Thermostat.RequestType.CommitWrite,
            attributeRequests: [SCHEDULES_ATTRIBUTE],
        }),
    );
}

/**
 * Writes the schedules as raw Matter write requests, so the device sees values the client's own schema validation
 * would refuse to send. Returns the status of each write request.
 */
async function writeSchedulesUnchecked(peer: ClientNode, schedules: Thermostat.Schedule[]) {
    const result = await MockTime.resolve(
        peer.interaction.write(
            Write(
                Write.Attribute({
                    endpoint: EndpointNumber(1),
                    cluster: Thermostat,
                    attributes: "schedules",
                    value: schedules,
                }),
            ),
        ),
    );
    return result.map(({ status }) => status);
}

function cachedSchedules(ep1: Endpoint) {
    return ep1.stateOf(ThermostatClient).schedules ?? [];
}

function writeSchedules(ep1: Endpoint, schedules: Thermostat.Schedule[]) {
    return MockTime.resolve(
        ep1.act(agent => {
            agent.get(ThermostatClient).state.schedules = schedules;
        }),
    );
}

describe("Schedules atomic write", () => {
    before(() => {
        MockTime.init();
    });

    it("encodes a whole-list assignment as replace-all followed by ADD", () => {
        const write = Write(
            Write.Attribute({
                endpoint: EndpointNumber(1),
                cluster: Thermostat,
                attributes: "schedules",
                value: [newSchedule()],
            }),
        );

        expect(write.writeRequests.map(({ path }) => path.listIndex)).deep.equals([undefined, null]);
    });

    it("applies schedules through BeginWrite, write and CommitWrite", async () => {
        await using ctx = await commissionedThermostat();
        const { device, deviceEp, ep1 } = ctx;

        const deviceAnnouncements = recordThermostatChanges(device);
        const clientReports = new Array<Thermostat.Schedule[]>();
        ep1.eventsOf(ThermostatClient).schedules$Changed.on(value => void clientReports.push([...value]));

        expect(await beginWrite(ep1)).deep.equals({
            statusCode: 0,
            attributeStatus: [{ attributeId: SCHEDULES_ATTRIBUTE, statusCode: 0 }],
            timeout: 5000,
        });

        await writeSchedules(ep1, [newSchedule()]);

        // The write is staged only; the device's stored value stays empty until commit
        expect(deviceEp.state.thermostat.persistedSchedules).deep.equals([]);

        expect(await commitWrite(ep1)).deep.equals({
            statusCode: 0,
            attributeStatus: [{ attributeId: SCHEDULES_ATTRIBUTE, statusCode: 0 }],
        });

        await MockTime.resolve(MockTime.yield(), { macrotasks: true });

        const persisted = deviceEp.state.thermostat.persistedSchedules!;
        expect(persisted.length).equals(1);
        expect(persisted[0].scheduleHandle?.byteLength).equals(16);
        expect(persisted[0].systemMode).equals(Thermostat.SystemMode.Auto);
        expect(persisted[0].builtIn).equals(false);

        expect(deviceAnnouncements.filter(attrs => attrs.includes(SCHEDULES_ATTRIBUTE))).length(1);

        // The controller learns the handle the device generated, so it can address the schedule in a later write
        const cached = cachedSchedules(ep1);
        expect(cached.length).equals(1);
        expect(cached[0].scheduleHandle?.byteLength).equals(16);
        expect(clientReports[clientReports.length - 1][0].scheduleHandle?.byteLength).equals(16);
    });

    it("declines a write outside an atomic write", async () => {
        await using ctx = await commissionedThermostat();
        const { deviceEp, ep1 } = ctx;

        await expect(writeSchedules(ep1, [newSchedule()])).rejectedWith("Multiple writes failed");

        expect(deviceEp.state.thermostat.persistedSchedules).deep.equals([]);
        expect(cachedSchedules(ep1).length).equals(0);
    });

    it("declines a schedule carrying a handle the device does not know", async () => {
        await using ctx = await commissionedThermostat();
        const { deviceEp, ep1 } = ctx;

        await beginWrite(ep1);

        await expect(writeSchedules(ep1, [newSchedule({ scheduleHandle: new Uint8Array([1, 2, 3, 4]) })])).rejectedWith(
            "Not found",
        );

        expect(deviceEp.state.thermostat.persistedSchedules).deep.equals([]);
        expect(cachedSchedules(ep1).length).equals(0);
    });

    it("declines a schedule for an unsupported systemMode", async () => {
        await using ctx = await commissionedThermostat();
        const { ep1 } = ctx;

        await beginWrite(ep1);

        await expect(writeSchedules(ep1, [newSchedule({ systemMode: Thermostat.SystemMode.Cool })])).rejectedWith(
            "Constraint error",
        );
    });

    it("declines a schedule with more transitions than NumberOfScheduleTransitions", async () => {
        await using ctx = await commissionedThermostat();
        const { deviceEp, peer1, ep1 } = ctx;

        await beginWrite(ep1);

        const transitions = Array.from({ length: 11 }, (_, i) => newScheduleTransition({ transitionTime: i * 10 }));
        expect(await writeSchedulesUnchecked(peer1, [newSchedule({ transitions })])).deep.equals([
            Status.Success,
            Status.ResourceExhausted,
        ]);

        expect(deviceEp.state.thermostat.persistedSchedules).deep.equals([]);
    });

    it("declines a transition systemMode equal to the schedule's systemMode", async () => {
        await using ctx = await commissionedThermostat();
        const { peer1, ep1 } = ctx;

        await beginWrite(ep1);

        expect(
            await writeSchedulesUnchecked(peer1, [
                newSchedule({ transitions: [newScheduleTransition({ systemMode: Thermostat.SystemMode.Auto })] }),
            ]),
        ).deep.equals([Status.Success, Status.ConstraintError]);
    });

    it("declines a schedule name longer than 64 characters through the schema constraint", async () => {
        await using ctx = await commissioned(
            new Endpoint(SchedulesThermostat, {
                id: "thermostat",
                number: 1,
                thermostat: {
                    ...thermostatConfig(),
                    scheduleTypes: [
                        {
                            systemMode: Thermostat.SystemMode.Auto,
                            numberOfSchedules: 5,
                            scheduleTypeFeatures: {
                                supportsPresets: true,
                                supportsSetpoints: true,
                                supportsNames: true,
                            },
                        },
                    ],
                },
            }),
        );
        const { peer1, ep1 } = ctx;

        await beginWrite(ep1);

        expect(await writeSchedulesUnchecked(peer1, [newSchedule({ name: "x".repeat(65) })])).deep.equals([
            Status.Success,
            Status.ConstraintError,
        ]);
    });

    it("declines a schedule without transitions through the schema constraint", async () => {
        await using ctx = await commissionedThermostat();
        const { peer1, ep1 } = ctx;

        await beginWrite(ep1);

        expect(await writeSchedulesUnchecked(peer1, [newSchedule({ transitions: [] })])).deep.equals([
            Status.Success,
            Status.ConstraintError,
        ]);
    });

    it("declines a transitionTime past the end of the day through the schema constraint", async () => {
        await using ctx = await commissionedThermostat();
        const { peer1, ep1 } = ctx;

        await beginWrite(ep1);

        expect(
            await writeSchedulesUnchecked(peer1, [
                newSchedule({ transitions: [newScheduleTransition({ transitionTime: 1440 })] }),
            ]),
        ).deep.equals([Status.Success, Status.ConstraintError]);
    });

    it("refuses a commit whose settled schedules an observer stripped the handle from", async () => {
        await using ctx = await commissionedThermostat();
        const { device, deviceEp, ep1 } = ctx;

        deviceEp.events.thermostat.persistedSchedules$Changing.on((schedules: Thermostat.Schedule[]) => {
            for (const schedule of schedules) {
                schedule.scheduleHandle = null;
            }
        });

        const deviceAnnouncements = recordThermostatChanges(device);

        await beginWrite(ep1);
        await writeSchedules(ep1, [newSchedule()]);

        // The command reports a generic failure; the reason travels in the attribute's status
        expect(await commitWrite(ep1)).deep.equals({
            statusCode: Status.Failure,
            attributeStatus: [{ attributeId: SCHEDULES_ATTRIBUTE, statusCode: Status.ConstraintError }],
        });

        await MockTime.resolve(MockTime.yield(), { macrotasks: true });

        expect(deviceEp.state.thermostat.persistedSchedules).deep.equals([]);
        expect(deviceAnnouncements.filter(attrs => attrs.includes(SCHEDULES_ATTRIBUTE))).length(0);
    });

    it("discards a staged write on RollbackWrite", async () => {
        await using ctx = await commissionedThermostat();
        const { deviceEp, ep1 } = ctx;

        await beginWrite(ep1);
        await writeSchedules(ep1, [newSchedule()]);

        expect(
            await MockTime.resolve(
                ep1.commandsOf(ThermostatClient).atomicRequest({
                    requestType: Thermostat.RequestType.RollbackWrite,
                    attributeRequests: [SCHEDULES_ATTRIBUTE],
                }),
            ),
        ).deep.equals({
            statusCode: 0,
            attributeStatus: [{ attributeId: SCHEDULES_ATTRIBUTE, statusCode: 0 }],
        });

        expect(deviceEp.state.thermostat.persistedSchedules).deep.equals([]);
    });

    describe("with Presets in the same atomic write", () => {
        const PRESET_HANDLE = Bytes.fromHex("aa");
        const SCHEDULE_HANDLE = Bytes.fromHex("01");
        const attributes = [PRESETS_ATTRIBUTE, SCHEDULES_ATTRIBUTE];

        /** A thermostat whose one schedule switches to its one preset */
        function presetSchedulingEndpoint() {
            return new Endpoint(SchedulesThermostat, {
                id: "thermostat",
                number: 1,
                thermostat: {
                    ...thermostatConfig(5, [usingPreset()]),
                    presets: [newPreset({ presetHandle: PRESET_HANDLE })],
                },
            });
        }

        function usingPreset() {
            return newSchedule({
                scheduleHandle: SCHEDULE_HANDLE,
                transitions: [newScheduleTransition({ presetHandle: PRESET_HANDLE })],
            });
        }

        function usingSetpoints() {
            return newSchedule({ scheduleHandle: SCHEDULE_HANDLE, transitions: [newScheduleTransition()] });
        }

        function atomicRequest(ep1: Endpoint, requestType: Thermostat.RequestType) {
            return MockTime.resolve(
                ep1.commandsOf(ThermostatClient).atomicRequest({
                    requestType,
                    attributeRequests: attributes,
                    timeout: requestType === Thermostat.RequestType.BeginWrite ? 5000 : undefined,
                }),
            );
        }

        async function writePresetsUnchecked(peer: ClientNode, presets: Thermostat.Preset[]) {
            const result = await MockTime.resolve(
                peer.interaction.write(
                    Write(
                        Write.Attribute({
                            endpoint: EndpointNumber(1),
                            cluster: Thermostat,
                            attributes: "presets",
                            value: presets,
                        }),
                    ),
                ),
            );
            return result.map(({ status }) => status);
        }

        it("removes a preset together with the schedule transition that referenced it", async () => {
            await using ctx = await commissioned(presetSchedulingEndpoint());
            const { deviceEp, peer1, ep1 } = ctx;

            await atomicRequest(ep1, Thermostat.RequestType.BeginWrite);
            await writePresetsUnchecked(peer1, []);
            await writeSchedulesUnchecked(peer1, [usingSetpoints()]);

            expect(await atomicRequest(ep1, Thermostat.RequestType.CommitWrite)).deep.equals({
                statusCode: Status.Success,
                attributeStatus: [
                    { attributeId: PRESETS_ATTRIBUTE, statusCode: Status.Success },
                    { attributeId: SCHEDULES_ATTRIBUTE, statusCode: Status.Success },
                ],
            });
            expect(deviceEp.state.thermostat.persistedPresets).deep.equals([]);
            expect(deviceEp.state.thermostat.persistedSchedules?.[0].transitions[0].presetHandle).undefined;
        });

        it("refuses the whole atomic write when Presets staged after Schedules removes a referenced preset", async () => {
            await using ctx = await commissioned(presetSchedulingEndpoint());
            const { deviceEp, peer1, ep1 } = ctx;

            await atomicRequest(ep1, Thermostat.RequestType.BeginWrite);
            expect(await writeSchedulesUnchecked(peer1, [usingPreset()])).deep.equals([Status.Success, Status.Success]);
            expect(await writePresetsUnchecked(peer1, [])).deep.equals([Status.Success]);

            const { statusCode } = await atomicRequest(ep1, Thermostat.RequestType.CommitWrite);
            expect(statusCode).equals(Status.Failure);
            expect(deviceEp.state.thermostat.persistedPresets?.length).equals(1);
            expect(deviceEp.state.thermostat.persistedSchedules?.[0].transitions[0].presetHandle).deep.equals(
                PRESET_HANDLE,
            );
        });

        it("declines a schedule that references a preset the same atomic write removes", async () => {
            await using ctx = await commissioned(presetSchedulingEndpoint());
            const { deviceEp, peer1, ep1 } = ctx;

            await atomicRequest(ep1, Thermostat.RequestType.BeginWrite);
            await writePresetsUnchecked(peer1, []);

            // The schedule is unchanged, but its preset no longer exists once the pending Presets apply
            expect(await writeSchedulesUnchecked(peer1, [usingPreset()])).deep.equals([
                Status.Success,
                Status.ConstraintError,
            ]);

            await atomicRequest(ep1, Thermostat.RequestType.RollbackWrite);
            expect(deviceEp.state.thermostat.persistedPresets?.length).equals(1);
        });

        it("declines a schedule whose own presetHandle names a preset the same atomic write removes", async () => {
            await using ctx = await commissioned(presetSchedulingEndpoint());
            const { peer1, ep1 } = ctx;

            await atomicRequest(ep1, Thermostat.RequestType.BeginWrite);
            await writePresetsUnchecked(peer1, []);

            expect(
                await writeSchedulesUnchecked(peer1, [
                    newSchedule({
                        scheduleHandle: SCHEDULE_HANDLE,
                        presetHandle: PRESET_HANDLE,
                        transitions: [newScheduleTransition()],
                    }),
                ]),
            ).deep.equals([Status.Success, Status.ConstraintError]);

            await atomicRequest(ep1, Thermostat.RequestType.RollbackWrite);
        });
    });
});
