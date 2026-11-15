/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { ThermostatClient } from "#behaviors/thermostat";
import { ThermostatDevice } from "#devices/thermostat";
import { Endpoint } from "#endpoint/index.js";
import { Environment, ImplementationError, MockStorageService, StorageService } from "@matter/general";
import { Specification } from "@matter/model";
import { MockServerNode, MockSite, subscribedPeer } from "@matter/node/testing";
import { StatusResponse } from "@matter/types";
import { Thermostat } from "@matter/types/clusters/thermostat";
import {
    newSchedule,
    newScheduleTransition,
    schedulesEndpoint,
    SchedulesThermostat,
    SchedulesThermostatServer,
    thermostatConfig,
    unconfiguredSchedulesEndpoint,
} from "./schedule-helpers.js";

function writeSchedules(deviceEp: Endpoint<typeof SchedulesThermostat>, schedules: Thermostat.Schedule[]) {
    return MockTime.resolve(deviceEp.set({ thermostat: { schedules } }), { macrotasks: true });
}

/** The ImplementationError messages that kept the endpoint's behaviors from starting. */
async function startupRefusals(device: Endpoint) {
    const error = await MockServerNode.createOnline(undefined, { device }).then(
        () => undefined,
        (e: unknown) => e,
    );
    expect(error).instanceOf(AggregateError);
    if (!(error instanceof AggregateError)) {
        return [];
    }
    return error.errors
        .map((e: unknown) => (e instanceof Error ? e.cause : undefined))
        .filter(cause => cause instanceof ImplementationError)
        .map(cause => cause.message);
}

describe("MatterScheduleConfiguration without the thermostat-msch forward feature", () => {
    before(() => MockTime.init());

    it("refuses to start", async function () {
        if (Specification.ENABLE_FORWARD_MATTER_FEATURES) {
            this.skip();
        }

        const refusals = await startupRefusals(schedulesEndpoint());

        expect(refusals.length).equals(1);
        expect(refusals[0]).contains('"thermostat-msch" forward feature');
    });
});

describe("Schedules configuration", () => {
    MockForwardFeatures.enable("thermostat-msch");

    before(() => MockTime.init());

    it("refuses to start with a configured schedule the write rules refuse", async () => {
        const invalid = newSchedule({
            transitions: [newScheduleTransition({ systemMode: Thermostat.SystemMode.Auto })],
        });

        const refusals = await startupRefusals(schedulesEndpoint(5, [invalid]));

        expect(refusals.length).equals(1);
        expect(refusals[0]).contains("Configured schedules are invalid");
        expect(refusals[0]).contains("must be omitted when it equals the schedule's systemMode");
    });

    it("refuses to start with a configured transition closer than the configured deadband", async () => {
        const device = new Endpoint(SchedulesThermostat, {
            id: "thermostat",
            number: 1,
            thermostat: {
                ...thermostatConfig(5, [
                    newSchedule({
                        transitions: [newScheduleTransition({ heatingSetpoint: 2000, coolingSetpoint: 2200 })],
                    }),
                ]),
                minSetpointDeadBand: 25,
            },
        });

        const refusals = await startupRefusals(device);

        expect(refusals.length).equals(1);
        expect(refusals[0]).contains("Configured schedules are invalid");
    });

    describe("refuses to start with ScheduleTypes that", () => {
        const autoType = { systemMode: Thermostat.SystemMode.Auto, numberOfSchedules: 5 };
        const cases: [string, Thermostat.ScheduleType[], string][] = [
            [
                "name a systemMode twice",
                [
                    { ...autoType, scheduleTypeFeatures: { supportsSetpoints: true } },
                    { ...autoType, scheduleTypeFeatures: { supportsPresets: true } },
                ],
                "more than once",
            ],
            [
                "name a systemMode other than Auto, Heat or Cool",
                [
                    {
                        ...autoType,
                        systemMode: Thermostat.SystemMode.Off,
                        scheduleTypeFeatures: { supportsSetpoints: true },
                    },
                ],
                "may only name Auto, Heat or Cool",
            ],
            [
                "support neither presets nor setpoints",
                [{ ...autoType, scheduleTypeFeatures: { supportsNames: true } }],
                "supports neither presets nor setpoints",
            ],
        ];

        for (const [name, scheduleTypes, reason] of cases) {
            it(name, async () => {
                const device = new Endpoint(SchedulesThermostat, {
                    id: "thermostat",
                    number: 1,
                    thermostat: { ...thermostatConfig(), scheduleTypes },
                });

                const refusals = await startupRefusals(device);

                expect(refusals.length).equals(1);
                expect(refusals[0]).contains(reason);
            });
        }
    });

    it("starts with configured schedules the write rules accept", async () => {
        const node = await MockServerNode.createOnline(undefined, { device: schedulesEndpoint(5, [newSchedule()]) });
        await node.close();
    });

    it("declines a remote write outside an atomic write when the application configured no schedules", async () => {
        await using site = new MockSite();
        const deviceEp = unconfiguredSchedulesEndpoint();
        const { controller } = await site.addCommissionedPair({
            device: { type: MockServerNode.RootEndpoint, device: deviceEp },
        });
        const peer1 = await subscribedPeer(controller, "peer1");
        const ep1 = peer1.parts.get("ep1")!;

        // Schedules carries quality T, so a client may only write it inside an atomic write
        const write = () =>
            MockTime.resolve(
                ep1.act(agent => {
                    agent.get(ThermostatClient).state.schedules = [newSchedule()];
                }),
            );

        await expect(write()).rejected;
        expect(deviceEp.state.thermostat.schedules).deep.equals([]);

        // The same write inside an atomic write is accepted, so the refusal above is the atomicity rule rather than
        // the endpoint failing to serve the attribute at all
        await MockTime.resolve(
            ep1.commandsOf(ThermostatClient).atomicRequest({
                requestType: Thermostat.RequestType.BeginWrite,
                attributeRequests: [Thermostat.attributes.schedules.id],
                timeout: 5000,
            }),
        );
        await write();
        await MockTime.resolve(
            ep1.commandsOf(ThermostatClient).atomicRequest({
                requestType: Thermostat.RequestType.CommitWrite,
                attributeRequests: [Thermostat.attributes.schedules.id],
            }),
        );
        await MockTime.resolve(MockTime.yield(), { macrotasks: true });

        expect(deviceEp.state.thermostat.schedules.length).equals(1);
        expect(deviceEp.state.thermostat.schedules[0].scheduleHandle?.byteLength).equals(16);
    });

    it("validates a local write when the application configured no schedules", async () => {
        const deviceEp = unconfiguredSchedulesEndpoint();
        await using node = await MockServerNode.createOnline(MockServerNode.RootEndpoint, { device: deviceEp });
        expect(node.lifecycle.isOnline).true;

        await expect(
            writeSchedules(deviceEp, [newSchedule({ scheduleHandle: new Uint8Array([1, 2, 3, 4]) })]),
        ).rejectedWith(StatusResponse.NotFoundError, "does not exist in old Schedules");

        await writeSchedules(deviceEp, [newSchedule()]);
        expect(deviceEp.state.thermostat.schedules[0].scheduleHandle?.byteLength).equals(16);
    });

    it("serves schedules a behavior type supplies as its own default", async () => {
        const schedule = newSchedule({ scheduleHandle: new Uint8Array(16).fill(9) });
        const Configured = SchedulesThermostatServer.set({ ...thermostatConfig(), schedules: [schedule] });
        const deviceEp = new Endpoint(ThermostatDevice.with(Configured), { id: "thermostat", number: 1 });

        await using node = await MockServerNode.createOnline(MockServerNode.RootEndpoint, { device: deviceEp });
        expect(node.lifecycle.isOnline).true;

        const schedules = deviceEp.state.thermostat.schedules;
        expect(schedules.length).equals(1);
        expect(schedules[0].scheduleHandle).deep.equals(schedule.scheduleHandle);
    });

    it("leaves the schedules a behavior type supplies untouched", async () => {
        const schedule = newSchedule();
        const Configured = SchedulesThermostatServer.set({ ...thermostatConfig(), schedules: [schedule] });

        await using node = await MockServerNode.createOnline(MockServerNode.RootEndpoint, {
            device: new Endpoint(ThermostatDevice.with(Configured), { id: "thermostat", number: 1 }),
        });
        expect(node.lifecycle.isOnline).true;

        // Every endpoint of a type shares that type's defaults, and validation issues handles into the schedules it
        // is given
        expect(schedule.scheduleHandle).equals(null);
        expect(Configured.defaults.schedules?.[0].scheduleHandle).equals(null);
    });

    it("seeds from configuration, not from schedules a device stored before the accessor existed", async () => {
        const environment = new Environment("test");
        const storage = new MockStorageService(environment);
        environment.set(StorageService, storage);
        const context = `root.parts.${unconfiguredSchedulesEndpoint().id}.${SchedulesThermostatServer.id}`;

        {
            await using node = await MockServerNode.createOnline(MockServerNode.RootEndpoint, {
                device: unconfiguredSchedulesEndpoint(),
                environment,
            });
            await node.close();
        }

        // What a device left behind while the attribute was an ordinary stored value: written with no validation,
        // so it carries no handle and no client can address it
        const values = storage.store("node0").data;
        expect(values[context], "the thermostat's stored values").not.undefined;
        values[context].schedules = [
            {
                scheduleHandle: null,
                systemMode: Thermostat.SystemMode.Auto,
                transitions: [{ dayOfWeek: { monday: true }, transitionTime: 360, heatingSetpoint: 2000 }],
                builtIn: false,
            },
        ];

        // Without this the seed never runs, so the stale value could not have been consulted either way
        delete values[context].persistedSchedules;

        {
            const deviceEp = unconfiguredSchedulesEndpoint();
            await using node = await MockServerNode.createOnline(MockServerNode.RootEndpoint, {
                device: deviceEp,
                environment,
            });

            expect(deviceEp.state.thermostat.schedules).deep.equals([]);

            await node.close();
        }
    });

    it("starts with stored schedules that no longer meet the configured limits", async () => {
        const environment = new Environment("test");
        environment.set(StorageService, new MockStorageService(environment));
        const threeOnMonday = newSchedule({
            transitions: [360, 720, 1080].map(transitionTime => newScheduleTransition({ transitionTime })),
        });

        {
            const deviceEp = schedulesEndpoint(5, [threeOnMonday]);
            await using node = await MockServerNode.createOnline(MockServerNode.RootEndpoint, {
                id: "msch",
                device: deviceEp,
                environment,
            });
            expect(deviceEp.state.thermostat.persistedSchedules?.length).equals(1);
            await node.close();
        }

        // The stored schedule now has more Monday transitions than allowed per day
        const deviceEp = new Endpoint(SchedulesThermostat, {
            id: "thermostat",
            number: 1,
            thermostat: { ...thermostatConfig(), numberOfScheduleTransitionPerDay: 2 },
        });
        await using node = await MockServerNode.createOnline(MockServerNode.RootEndpoint, {
            id: "msch",
            device: deviceEp,
            environment,
        });

        expect(deviceEp.state.thermostat.persistedSchedules?.[0].transitions.length).equals(3);
        await node.close();
    });

    it("starts with more stored schedules and transitions than the limits allow and raises the limits", async () => {
        const environment = new Environment("test");
        environment.set(StorageService, new MockStorageService(environment));
        const threeTransitions = [360, 720, 1080].map(transitionTime => newScheduleTransition({ transitionTime }));

        {
            await using node = await MockServerNode.createOnline(MockServerNode.RootEndpoint, {
                id: "msch-limits",
                device: schedulesEndpoint(5, [
                    newSchedule({ scheduleHandle: Uint8Array.of(1), transitions: threeTransitions }),
                    newSchedule({ scheduleHandle: Uint8Array.of(2) }),
                ]),
                environment,
            });
            await node.close();
        }

        const deviceEp = new Endpoint(SchedulesThermostat, {
            id: "thermostat",
            number: 1,
            thermostat: { ...thermostatConfig(1), numberOfScheduleTransitions: 1 },
        });
        await using node = await MockServerNode.createOnline(MockServerNode.RootEndpoint, {
            id: "msch-limits",
            device: deviceEp,
            environment,
        });

        expect(deviceEp.state.thermostat.persistedSchedules?.length).equals(2);
        expect(deviceEp.state.thermostat.numberOfSchedules).equals(2);
        expect(deviceEp.state.thermostat.numberOfScheduleTransitions).equals(3);
        await node.close();
    });
});
