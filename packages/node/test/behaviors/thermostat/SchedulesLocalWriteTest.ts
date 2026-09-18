/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { Endpoint } from "#endpoint/index.js";
import { Entropy, Environment, MemoryStorageDriver, StorageManager, StorageService } from "@matter/general";
import { StatusResponse } from "@matter/types";
import { Thermostat } from "@matter/types/clusters/thermostat";
import { MockServerNode } from "../../node/mock-server-node.js";
import { newPreset } from "./preset-helpers.js";
import {
    newSchedule,
    newScheduleTransition,
    recordThermostatChanges,
    SCHEDULES_ATTRIBUTE,
    SchedulesThermostat,
    schedulesEndpoint,
    SchedulesThermostatServer,
    thermostatConfig,
} from "./schedule-helpers.js";

async function thermostat(numberOfSchedules?: number, schedules?: Thermostat.Schedule[]) {
    const deviceEp = schedulesEndpoint(numberOfSchedules, schedules);
    const node = await MockServerNode.createOnline(MockServerNode.RootEndpoint, { device: deviceEp });
    return { node, deviceEp, [Symbol.asyncDispose]: () => node.close() };
}

function writeSchedules(deviceEp: Endpoint<typeof SchedulesThermostat>, schedules: Thermostat.Schedule[]) {
    return MockTime.resolve(deviceEp.set({ thermostat: { schedules } }), { macrotasks: true });
}

function storedSchedules(deviceEp: Endpoint<typeof SchedulesThermostat>) {
    return deviceEp.state.thermostat.persistedSchedules!;
}

describe("Schedules local write", () => {
    before(() => MockTime.init());

    it("stores a locally written schedule and generates a handle", async () => {
        await using ctx = await thermostat();
        const { deviceEp } = ctx;

        await writeSchedules(deviceEp, [newSchedule()]);

        const stored = storedSchedules(deviceEp);
        expect(stored.length).equals(1);
        expect(stored[0].scheduleHandle?.byteLength).equals(16);
        expect(stored[0].builtIn).equals(false);
    });

    it("stores schedules written directly to persistedSchedules", async () => {
        await using ctx = await thermostat();
        const { deviceEp } = ctx;

        await MockTime.resolve(deviceEp.set({ thermostat: { persistedSchedules: [newSchedule()] } }), {
            macrotasks: true,
        });

        const stored = storedSchedules(deviceEp);
        expect(stored.length).equals(1);
        expect(stored[0].scheduleHandle?.byteLength).equals(16);
    });

    it("serves the stored schedules through the attribute", async () => {
        await using ctx = await thermostat();
        const { deviceEp } = ctx;

        await writeSchedules(deviceEp, [newSchedule()]);

        const schedules = deviceEp.state.thermostat.schedules;
        expect(schedules.length).equals(1);
        expect(schedules[0].scheduleHandle?.byteLength).equals(16);
    });

    it("announces the attribute as changed", async () => {
        await using ctx = await thermostat();
        const { node, deviceEp } = ctx;

        const announcements = recordThermostatChanges(node);

        await writeSchedules(deviceEp, [newSchedule()]);

        expect(announcements.filter(attrs => attrs.includes(SCHEDULES_ATTRIBUTE))).length(1);
    });

    it("announces nothing when the write is refused", async () => {
        await using ctx = await thermostat(2);
        const { node, deviceEp } = ctx;

        const announcements = recordThermostatChanges(node);

        await expect(writeSchedules(deviceEp, [newSchedule(), newSchedule(), newSchedule()])).rejected;

        expect(announcements.filter(attrs => attrs.includes(SCHEDULES_ATTRIBUTE))).length(0);
    });

    it("keeps the generated handle across a restart", async () => {
        const environment = new Environment("test");
        const storage = new StorageManager(new MemoryStorageDriver());
        storage.close = () => {};
        await storage.initialize();
        environment.get(StorageService).open = () => Promise.resolve(storage);

        // MockCrypto's entropy is constant, so a handle regenerated on the second boot would be indistinguishable
        // from the persisted one
        let nextByte = 0;
        environment.set(
            Entropy,
            new (class extends Entropy {
                randomBytes(length: number) {
                    return new Uint8Array(length).fill(++nextByte);
                }
            })(),
        );

        let handle: Thermostat.Schedule["scheduleHandle"];

        {
            await using node = new MockServerNode({ id: "node0", environment });
            await node.construction.ready;
            const deviceEp = schedulesEndpoint();
            await node.add(deviceEp);

            await writeSchedules(deviceEp, [newSchedule()]);
            handle = storedSchedules(deviceEp)[0].scheduleHandle;
            expect(handle?.byteLength).equals(16);

            await node.close();
        }

        {
            await using node = new MockServerNode({ id: "node0", environment });
            await node.construction.ready;
            const deviceEp = schedulesEndpoint();
            await node.add(deviceEp);

            expect(storedSchedules(deviceEp).length).equals(1);
            expect(storedSchedules(deviceEp)[0].scheduleHandle).deep.equals(handle);

            await node.close();
        }
    });

    it("edits a stored schedule addressed by its handle", async () => {
        await using ctx = await thermostat();
        const { deviceEp } = ctx;

        await writeSchedules(deviceEp, [newSchedule()]);
        const handle = storedSchedules(deviceEp)[0].scheduleHandle!;

        await writeSchedules(deviceEp, [
            newSchedule({ scheduleHandle: handle, transitions: [newScheduleTransition({ transitionTime: 480 })] }),
        ]);

        const stored = storedSchedules(deviceEp);
        expect(stored.length).equals(1);
        expect(stored[0].scheduleHandle).deep.equals(handle);
        expect(stored[0].transitions[0].transitionTime).equals(480);
    });

    it("rejects a schedule citing an unknown handle and keeps the stored schedules", async () => {
        await using ctx = await thermostat();
        const { deviceEp } = ctx;

        await writeSchedules(deviceEp, [newSchedule()]);
        const stored = [...storedSchedules(deviceEp)];

        await expect(
            writeSchedules(deviceEp, [newSchedule({ scheduleHandle: new Uint8Array([1, 2, 3, 4]) })]),
        ).rejectedWith(StatusResponse.NotFoundError, "does not exist in old Schedules");

        expect(storedSchedules(deviceEp)).deep.equals(stored);
    });

    it("refuses a schedule an observer stripped the handle from, and stays writable", async () => {
        await using ctx = await thermostat();
        const { deviceEp } = ctx;

        const revert = (schedules: Thermostat.Schedule[]) => {
            schedules[0].scheduleHandle = null;
        };
        deviceEp.events.thermostat.persistedSchedules$Changing.on(revert);

        await expect(writeSchedules(deviceEp, [newSchedule()])).rejectedWith(
            StatusResponse.ConstraintErrorError,
            "carries no scheduleHandle",
        );
        expect(storedSchedules(deviceEp)).deep.equals([]);

        deviceEp.events.thermostat.persistedSchedules$Changing.off(revert);
        await writeSchedules(deviceEp, [newSchedule()]);

        const stored = storedSchedules(deviceEp);
        expect(stored.length).equals(1);
        expect(stored[0].scheduleHandle?.byteLength).equals(16);
    });

    it("refuses a schedule an observer marks built-in after the thermostat issued its handle", async () => {
        await using ctx = await thermostat();
        const { deviceEp } = ctx;

        deviceEp.events.thermostat.persistedSchedules$Changing.on(schedules => {
            if (schedules[0].scheduleHandle !== null) {
                schedules[0].builtIn = true;
            }
        });

        await expect(writeSchedules(deviceEp, [newSchedule()])).rejectedWith(
            StatusResponse.ConstraintErrorError,
            "Can not add a new built-in schedule",
        );

        expect(storedSchedules(deviceEp)).deep.equals([]);
    });

    it("validates a change an observer makes after the thermostat normalized", async () => {
        await using ctx = await thermostat();
        const { deviceEp } = ctx;

        // An application observer registers after the behavior, so it runs after normalization; only the first
        // announcement that follows is the normalization coming back around
        deviceEp.events.thermostat.persistedSchedules$Changing.on(schedules => {
            if (schedules[0].transitions[0].heatingSetpoint === 2000) {
                schedules[0].transitions[0].heatingSetpoint = 3100;
            }
        });

        await expect(writeSchedules(deviceEp, [newSchedule()])).rejectedWith(
            StatusResponse.ConstraintErrorError,
            "out of bounds",
        );

        expect(storedSchedules(deviceEp)).deep.equals([]);
    });

    it("rejects more schedules than the thermostat supports", async () => {
        await using ctx = await thermostat(2);
        const { deviceEp } = ctx;

        await expect(writeSchedules(deviceEp, [newSchedule(), newSchedule(), newSchedule()])).rejectedWith(
            "exceeds NumberOfSchedules",
        );

        expect(storedSchedules(deviceEp)).deep.equals([]);
    });

    it("rejects more schedules than a systemMode scenario supports", async () => {
        const deviceEp = new Endpoint(SchedulesThermostat, {
            id: "thermostat",
            number: 1,
            thermostat: {
                ...thermostatConfig(5),
                scheduleTypes: [
                    {
                        systemMode: Thermostat.SystemMode.Auto,
                        numberOfSchedules: 1,
                        scheduleTypeFeatures: { supportsPresets: true, supportsSetpoints: true },
                    },
                ],
            },
        });
        await using _node = await MockServerNode.createOnline(MockServerNode.RootEndpoint, { device: deviceEp });

        await expect(writeSchedules(deviceEp, [newSchedule(), newSchedule()])).rejectedWith(
            StatusResponse.ResourceExhaustedError,
            "exceeds allowed number",
        );

        expect(storedSchedules(deviceEp)).deep.equals([]);
    });

    it("rejects a schedule for an unsupported systemMode", async () => {
        await using ctx = await thermostat();
        const { deviceEp } = ctx;

        await expect(writeSchedules(deviceEp, [newSchedule({ systemMode: Thermostat.SystemMode.Cool })])).rejectedWith(
            StatusResponse.ConstraintErrorError,
            "No ScheduleType defined",
        );

        expect(storedSchedules(deviceEp)).deep.equals([]);
    });

    it("rejects a named schedule when the schedule type does not support names", async () => {
        await using ctx = await thermostat();
        const { deviceEp } = ctx;

        await expect(writeSchedules(deviceEp, [newSchedule({ name: "Weekdays" })])).rejectedWith(
            StatusResponse.ConstraintErrorError,
            "Schedule names are not supported",
        );

        expect(storedSchedules(deviceEp)).deep.equals([]);
    });

    it("accepts an unnamed schedule, which carries no name", async () => {
        await using ctx = await thermostat();
        const { deviceEp } = ctx;

        await writeSchedules(deviceEp, [newSchedule()]);

        expect(storedSchedules(deviceEp)[0].name).equals(undefined);
    });

    it("rejects a schedule presetHandle when the schedule type does not support presets", async () => {
        const deviceEp = new Endpoint(SchedulesThermostat, {
            id: "thermostat",
            number: 1,
            thermostat: {
                ...thermostatConfig(),
                scheduleTypes: [
                    {
                        systemMode: Thermostat.SystemMode.Auto,
                        numberOfSchedules: 5,
                        scheduleTypeFeatures: { supportsSetpoints: true },
                    },
                ],
            },
        });
        await using _node = await MockServerNode.createOnline(MockServerNode.RootEndpoint, { device: deviceEp });

        await expect(
            writeSchedules(deviceEp, [newSchedule({ presetHandle: new Uint8Array(16).fill(1) })]),
        ).rejectedWith(StatusResponse.ConstraintErrorError, "Presets are not supported");
    });

    it("rejects a schedule presetHandle that matches no existing preset", async () => {
        await using ctx = await thermostat();
        const { deviceEp } = ctx;

        await expect(
            writeSchedules(deviceEp, [newSchedule({ presetHandle: new Uint8Array(16).fill(1) })]),
        ).rejectedWith(StatusResponse.ConstraintErrorError, "does not match any existing Preset");

        expect(storedSchedules(deviceEp)).deep.equals([]);
    });

    it("accepts a schedule presetHandle that matches an existing preset", async () => {
        const preset = newPreset({ presetHandle: new Uint8Array(16).fill(2) });
        const deviceEp = new Endpoint(SchedulesThermostat, {
            id: "thermostat",
            number: 1,
            thermostat: { ...thermostatConfig(), presets: [preset] },
        });
        await using _node = await MockServerNode.createOnline(MockServerNode.RootEndpoint, { device: deviceEp });

        await writeSchedules(deviceEp, [newSchedule({ presetHandle: preset.presetHandle! })]);

        expect(storedSchedules(deviceEp)[0].presetHandle).deep.equals(preset.presetHandle);
    });

    it("rejects a transition presetHandle that matches no existing preset", async () => {
        await using ctx = await thermostat();
        const { deviceEp } = ctx;

        await expect(
            writeSchedules(deviceEp, [
                newSchedule({
                    transitions: [newScheduleTransition({ presetHandle: new Uint8Array(16).fill(3) })],
                }),
            ]),
        ).rejectedWith(StatusResponse.ConstraintErrorError, "does not match any existing Preset");

        expect(storedSchedules(deviceEp)).deep.equals([]);
    });

    it("rejects a transition combining a presetHandle with a setpoint", async () => {
        const preset = newPreset({ presetHandle: new Uint8Array(16).fill(4) });
        const deviceEp = new Endpoint(SchedulesThermostat, {
            id: "thermostat",
            number: 1,
            thermostat: { ...thermostatConfig(), presets: [preset] },
        });
        await using _node = await MockServerNode.createOnline(MockServerNode.RootEndpoint, { device: deviceEp });

        await expect(
            writeSchedules(deviceEp, [
                newSchedule({
                    transitions: [newScheduleTransition({ presetHandle: preset.presetHandle!, heatingSetpoint: 2000 })],
                }),
            ]),
        ).rejectedWith(
            StatusResponse.ConstraintErrorError,
            "must not also specify systemMode, coolingSetpoint or heatingSetpoint",
        );
    });

    it("rejects a transition system mode Off when the schedule type does not support Off", async () => {
        await using ctx = await thermostat();
        const { deviceEp } = ctx;

        await expect(
            writeSchedules(deviceEp, [
                newSchedule({
                    transitions: [newScheduleTransition({ systemMode: Thermostat.SystemMode.Off })],
                }),
            ]),
        ).rejectedWith(StatusResponse.ConstraintErrorError, "SystemMode Off is not supported");

        expect(storedSchedules(deviceEp)).deep.equals([]);
    });

    it("rejects a transition setpoint when the schedule type does not support setpoints", async () => {
        const deviceEp = new Endpoint(SchedulesThermostat, {
            id: "thermostat",
            number: 1,
            thermostat: {
                ...thermostatConfig(),
                scheduleTypes: [
                    {
                        systemMode: Thermostat.SystemMode.Auto,
                        numberOfSchedules: 5,
                        scheduleTypeFeatures: { supportsPresets: true },
                    },
                ],
            },
        });
        await using _node = await MockServerNode.createOnline(MockServerNode.RootEndpoint, { device: deviceEp });

        await expect(
            writeSchedules(deviceEp, [
                newSchedule({ transitions: [newScheduleTransition({ heatingSetpoint: 2000, coolingSetpoint: 2600 })] }),
            ]),
        ).rejectedWith(StatusResponse.ConstraintErrorError, "Setpoints are not supported");

        expect(storedSchedules(deviceEp)).deep.equals([]);
    });

    it("rejects transitions exceeding NumberOfScheduleTransitionPerDay", async () => {
        const deviceEp = new Endpoint(SchedulesThermostat, {
            id: "thermostat",
            number: 1,
            thermostat: { ...thermostatConfig(), numberOfScheduleTransitionPerDay: 1 },
        });
        await using _node = await MockServerNode.createOnline(MockServerNode.RootEndpoint, { device: deviceEp });

        await expect(
            writeSchedules(deviceEp, [
                newSchedule({
                    transitions: [
                        newScheduleTransition({ dayOfWeek: { monday: true }, transitionTime: 360 }),
                        newScheduleTransition({ dayOfWeek: { monday: true }, transitionTime: 480 }),
                    ],
                }),
            ]),
        ).rejectedWith(StatusResponse.ResourceExhaustedError, "exceeds NumberOfScheduleTransitionPerDay");

        expect(storedSchedules(deviceEp)).deep.equals([]);
    });

    it("rejects duplicate transitions on the same day and time", async () => {
        await using ctx = await thermostat();
        const { deviceEp } = ctx;

        await expect(
            writeSchedules(deviceEp, [
                newSchedule({
                    transitions: [
                        newScheduleTransition({ dayOfWeek: { monday: true, tuesday: true }, transitionTime: 360 }),
                        newScheduleTransition({ dayOfWeek: { tuesday: true }, transitionTime: 360 }),
                    ],
                }),
            ]),
        ).rejectedWith(StatusResponse.ConstraintErrorError, "Duplicate transitions");

        expect(storedSchedules(deviceEp)).deep.equals([]);
    });

    it("rejects a transition whose dayOfWeek sets the away/vacation bit", async () => {
        await using ctx = await thermostat();
        const { deviceEp } = ctx;

        await expect(
            writeSchedules(deviceEp, [
                newSchedule({ transitions: [newScheduleTransition({ dayOfWeek: { away: true } })] }),
            ]),
        ).rejectedWith(StatusResponse.ConstraintErrorError, "Away/Vacation bit must not be set");

        expect(storedSchedules(deviceEp)).deep.equals([]);
    });

    it("clears an activeScheduleHandle no schedule carries", async () => {
        const deviceEp = new Endpoint(SchedulesThermostat, {
            id: "thermostat",
            number: 1,
            thermostat: { ...thermostatConfig(), activeScheduleHandle: new Uint8Array(16).fill(7) },
        });
        await using node = await MockServerNode.createOnline(MockServerNode.RootEndpoint, { device: deviceEp });

        expect(node.lifecycle.isOnline).true;
        expect(deviceEp.state.thermostat.activeScheduleHandle).equals(null);
    });

    it("keeps an activeScheduleHandle a configured schedule carries", async () => {
        const configured = newSchedule({ scheduleHandle: new Uint8Array(16).fill(7) });
        const deviceEp = new Endpoint(SchedulesThermostat, {
            id: "thermostat",
            number: 1,
            thermostat: { ...thermostatConfig(5, [configured]), activeScheduleHandle: configured.scheduleHandle },
        });
        await using _node = await MockServerNode.createOnline(MockServerNode.RootEndpoint, { device: deviceEp });

        expect(deviceEp.state.thermostat.activeScheduleHandle).deep.equals(configured.scheduleHandle);
    });

    it("refuses to remove the active schedule", async () => {
        await using ctx = await thermostat();
        const { deviceEp } = ctx;

        await writeSchedules(deviceEp, [newSchedule()]);
        const handle = storedSchedules(deviceEp)[0].scheduleHandle!;
        await MockTime.resolve(deviceEp.set({ thermostat: { activeScheduleHandle: handle } }), { macrotasks: true });

        await expect(writeSchedules(deviceEp, [])).rejectedWith("while it is the active schedule");

        expect(storedSchedules(deviceEp).length).equals(1);
    });

    it("refuses to remove a schedule the application marked built-in", async () => {
        const builtIn = newSchedule({ scheduleHandle: new Uint8Array(16).fill(7), builtIn: true });
        await using ctx = await thermostat(5, [builtIn]);
        const { deviceEp } = ctx;

        await expect(writeSchedules(deviceEp, [])).rejectedWith("Cannot remove built-in schedule");

        const stored = storedSchedules(deviceEp);
        expect(stored.length).equals(1);
        expect(stored[0].scheduleHandle).deep.equals(builtIn.scheduleHandle);
        expect(stored[0].builtIn).equals(true);
    });

    it("refuses to remove a preset a schedule's presetHandle still references", async () => {
        const preset = newPreset({ presetHandle: new Uint8Array(16).fill(8) });
        const schedule = newSchedule({
            scheduleHandle: new Uint8Array(16).fill(9),
            presetHandle: preset.presetHandle!,
        });
        const deviceEp = new Endpoint(SchedulesThermostat, {
            id: "thermostat",
            number: 1,
            thermostat: { ...thermostatConfig(5, [schedule]), presets: [preset] },
        });
        await using _node = await MockServerNode.createOnline(MockServerNode.RootEndpoint, { device: deviceEp });

        await expect(
            MockTime.resolve(deviceEp.set({ thermostat: { presets: [] } }), { macrotasks: true }),
        ).rejectedWith(StatusResponse.InvalidInStateError, "referenced by schedule");
    });

    it("refuses to remove a preset a schedule transition's presetHandle still references", async () => {
        const preset = newPreset({ presetHandle: new Uint8Array(16).fill(10) });
        const schedule = newSchedule({
            scheduleHandle: new Uint8Array(16).fill(11),
            transitions: [newScheduleTransition({ presetHandle: preset.presetHandle! })],
        });
        const deviceEp = new Endpoint(SchedulesThermostat, {
            id: "thermostat",
            number: 1,
            thermostat: { ...thermostatConfig(5, [schedule]), presets: [preset] },
        });
        await using _node = await MockServerNode.createOnline(MockServerNode.RootEndpoint, { device: deviceEp });

        await expect(
            MockTime.resolve(deviceEp.set({ thermostat: { presets: [] } }), { macrotasks: true }),
        ).rejectedWith(StatusResponse.InvalidInStateError, "referenced by a transition");
    });

    it("sets the active schedule via SetActiveScheduleRequest", async () => {
        await using ctx = await thermostat();
        const { deviceEp } = ctx;

        await writeSchedules(deviceEp, [newSchedule()]);
        const handle = storedSchedules(deviceEp)[0].scheduleHandle!;

        await MockTime.resolve(
            deviceEp.act(agent =>
                agent.get(SchedulesThermostatServer).setActiveScheduleRequest({ scheduleHandle: handle }),
            ),
            { macrotasks: true },
        );

        expect(deviceEp.state.thermostat.activeScheduleHandle).deep.equals(handle);
    });

    it("rejects SetActiveScheduleRequest for an unknown handle", async () => {
        await using ctx = await thermostat();
        const { deviceEp } = ctx;

        await expect(
            MockTime.resolve(
                deviceEp.act(agent =>
                    agent
                        .get(SchedulesThermostatServer)
                        .setActiveScheduleRequest({ scheduleHandle: new Uint8Array(16).fill(1) }),
                ),
                { macrotasks: true },
            ),
        ).rejectedWith(StatusResponse.InvalidCommandError, "not found");

        expect(deviceEp.state.thermostat.activeScheduleHandle).equals(null);
    });
});
