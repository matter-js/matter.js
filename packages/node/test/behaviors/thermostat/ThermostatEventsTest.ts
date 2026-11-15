/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { ThermostatServer } from "#behaviors/thermostat";
import { ThermostatDevice } from "#devices/thermostat";
import { Endpoint } from "#endpoint/index.js";
import { Bytes, ImplementationError, Logger, LogLevel, Millis, Seconds, Time } from "@matter/general";
import { Specification } from "@matter/model";
import { captureLog, MockServerNode } from "@matter/node/testing";
import { OccurrenceManager } from "@matter/protocol";
import { TlvObject, TlvOfModel, TlvOptionalField, TlvUInt8 } from "@matter/types";
import { Thermostat } from "@matter/types/clusters/thermostat";
import { newPreset } from "./preset-helpers.js";
import { newSchedule } from "./schedule-helpers.js";

/** The name of the timer that holds back a LocalTemperatureChange event */
const REPORT_TIMER = "Thermostat LocalTemperatureChange";

const ALL_EVENTS = {
    systemModeChange: true,
    localTemperatureChange: true,
    occupancyChange: true,
    setpointChange: true,
    runningStateChange: true,
    runningModeChange: true,
    activeScheduleChange: true,
    activePresetChange: true,
} as const;

const FullServer = ThermostatServer.with(
    "Heating",
    "Cooling",
    "Occupancy",
    "AutoMode",
    "Presets",
    "MatterScheduleConfiguration",
    "Events",
).enable({ events: ALL_EVENTS });

const FullThermostat = ThermostatDevice.with(FullServer);

/** Events selected but not enabled: provisional events are optional */
const NotEnabledServer = ThermostatServer.with("Heating", "Cooling", "AutoMode", "Events");

const NotEnabledThermostat = ThermostatDevice.with(NotEnabledServer);

/** No Occupancy, Presets or MatterScheduleConfiguration: the conditional events do not exist */
const BasicServer = ThermostatServer.with("Heating", "Cooling", "AutoMode", "Events").enable({
    events: {
        systemModeChange: true,
        localTemperatureChange: true,
        setpointChange: true,
        runningStateChange: true,
        runningModeChange: true,
    },
});

const BasicThermostat = ThermostatDevice.with(BasicServer);

const HeatingOnlyServer = ThermostatServer.with("Heating", "Events").enable({ events: { setpointChange: true } });

const HeatingOnlyThermostat = ThermostatDevice.with(HeatingOnlyServer);

const CoolingOnlyServer = ThermostatServer.with("Cooling", "Events").enable({ events: { setpointChange: true } });

const CoolingOnlyThermostat = ThermostatDevice.with(CoolingOnlyServer);

const NoEventsServer = ThermostatServer.with("Heating", "Cooling", "AutoMode");

const NoEventsThermostat = ThermostatDevice.with(NoEventsServer);

const LocalTemperatureHiddenServer = ThermostatServer.with(
    "Heating",
    "Cooling",
    "AutoMode",
    "Events",
    "LocalTemperatureNotExposed",
).enable({
    events: { systemModeChange: true },
});

const LocalTemperatureHiddenThermostat = ThermostatDevice.with(LocalTemperatureHiddenServer);

const CONFIG = {
    controlSequenceOfOperation: Thermostat.ControlSequenceOfOperation.CoolingAndHeating,
    systemMode: Thermostat.SystemMode.Auto,
    occupiedHeatingSetpoint: 2000,
    occupiedCoolingSetpoint: 2600,
    minSetpointDeadBand: 25,
};

const PRESETS_CONFIG = {
    ...CONFIG,
    numberOfPresets: 5,
    presetTypes: [
        { presetScenario: Thermostat.PresetScenario.Occupied, numberOfPresets: 5, presetTypeFeatures: {} },
        { presetScenario: Thermostat.PresetScenario.Unoccupied, numberOfPresets: 5, presetTypeFeatures: {} },
    ],
    activePresetHandle: null,
    presets: [],
    numberOfSchedules: 5,
    numberOfScheduleTransitions: 10,
    numberOfScheduleTransitionPerDay: null,
    scheduleTypes: [
        {
            systemMode: Thermostat.SystemMode.Auto,
            numberOfSchedules: 5,
            scheduleTypeFeatures: { supportsPresets: true, supportsSetpoints: true },
        },
    ],
    activeScheduleHandle: null,
    schedules: [],
};

function record<T>(event: { on(observer: (payload: T) => void): void } | undefined) {
    const payloads = new Array<T>();
    event?.on(payload => {
        payloads.push(payload);
    });
    return payloads;
}

async function online<T extends Endpoint>(device: T) {
    const node = await MockServerNode.createOnline(MockServerNode.RootEndpoint, { device });
    return { node, device, [Symbol.asyncDispose]: () => node.close() };
}

function fullThermostat(thermostat: Record<string, unknown> = {}) {
    return new Endpoint(FullThermostat, {
        id: "thermostat",
        number: 1,
        thermostat: { ...PRESETS_CONFIG, ...thermostat },
    });
}

function basicThermostat(thermostat: Record<string, unknown> = {}) {
    return new Endpoint(BasicThermostat, { id: "thermostat", number: 1, thermostat: { ...CONFIG, ...thermostat } });
}

/** Shows that {@link captureLog} records a warning, so an empty capture means that nothing was logged */
function expectCaptures(log: { messages: string[] }) {
    const before = log.messages.length;
    Logger.get("ThermostatEventsTest").warn("capture check");
    expect(log.messages.length).equals(before + 1);
    expect(log.messages[before]).contains("capture check");
}

/** Reactions and callbacks of a behavior run asynchronously */
function settle() {
    return MockTime.resolve(Promise.resolve(), { macrotasks: true });
}

function setTemperature(device: Endpoint<typeof BasicThermostat>, localTemperature: number | null) {
    return MockTime.resolve(device.set({ thermostat: { localTemperature } }), { macrotasks: true });
}

describe("Thermostat events", () => {
    MockForwardFeatures.enable("thermostat-events", "thermostat-msch");

    before(() => MockTime.init());

    describe("SystemModeChange", () => {
        it("generates one event with previous and current mode", async () => {
            await using ctx = await online(basicThermostat());
            const { device } = ctx;
            const events = record(device.eventsOf(BasicServer).systemModeChange);

            await device.set({ thermostat: { systemMode: Thermostat.SystemMode.Heat } });

            expect(events.length).equals(1);
            expect(events[0].previousSystemMode).equals(Thermostat.SystemMode.Auto);
            expect(events[0].currentSystemMode).equals(Thermostat.SystemMode.Heat);
        });

        it("generates no event when the value does not change", async () => {
            await using ctx = await online(basicThermostat());
            const { device } = ctx;
            const events = record(device.eventsOf(BasicServer).systemModeChange);

            await device.set({ thermostat: { systemMode: Thermostat.SystemMode.Auto } });

            expect(events.length).equals(0);
        });

        it("generates no event when the transaction rolls back", async () => {
            await using ctx = await online(basicThermostat());
            const { device } = ctx;
            const events = record(device.eventsOf(BasicServer).systemModeChange);

            await expect(
                device.act(async agent => {
                    agent.get(BasicServer).state.systemMode = Thermostat.SystemMode.Heat;
                    throw new ImplementationError("abandon the write");
                }),
            ).rejectedWith(ImplementationError);

            expect(events.length).equals(0);
            expect(device.state.thermostat.systemMode).equals(Thermostat.SystemMode.Auto);
        });
    });

    describe("RunningModeChange and RunningStateChange", () => {
        it("generates RunningModeChange with previous and current mode", async () => {
            await using ctx = await online(
                basicThermostat({ thermostatRunningMode: Thermostat.ThermostatRunningMode.Off }),
            );
            const { device } = ctx;
            const events = record(device.eventsOf(BasicServer).runningModeChange);

            await device.set({ thermostat: { thermostatRunningMode: Thermostat.ThermostatRunningMode.Heat } });
            await device.set({ thermostat: { thermostatRunningMode: Thermostat.ThermostatRunningMode.Heat } });

            expect(events.length).equals(1);
            expect(events[0].previousRunningMode).equals(Thermostat.ThermostatRunningMode.Off);
            expect(events[0].currentRunningMode).equals(Thermostat.ThermostatRunningMode.Heat);
        });

        it("generates RunningModeChange when a SystemMode change sets the running mode", async () => {
            await using ctx = await online(
                basicThermostat({ thermostatRunningMode: Thermostat.ThermostatRunningMode.Off }),
            );
            const { device } = ctx;
            const events = record(device.eventsOf(BasicServer).runningModeChange);

            await MockTime.resolve(device.set({ thermostat: { systemMode: Thermostat.SystemMode.Heat } }), {
                macrotasks: true,
            });

            expect(events).deep.equals([
                {
                    previousRunningMode: Thermostat.ThermostatRunningMode.Off,
                    currentRunningMode: Thermostat.ThermostatRunningMode.Heat,
                },
            ]);
        });

        it("generates RunningStateChange with previous and current state", async () => {
            await using ctx = await online(basicThermostat({ thermostatRunningState: {} }));
            const { device } = ctx;
            const events = record(device.eventsOf(BasicServer).runningStateChange);

            await device.set({ thermostat: { thermostatRunningState: { heat: true } } });
            await device.set({ thermostat: { thermostatRunningState: { heat: true } } });

            expect(events.length).equals(1);
            expect(events[0].previousRunningState).deep.equals({});
            expect(events[0].currentRunningState).deep.equals({ heat: true });
        });
    });

    describe("OccupancyChange", () => {
        it("generates one event with previous and current occupancy", async () => {
            await using ctx = await online(fullThermostat({ occupancy: { occupied: true } }));
            const { device } = ctx;
            const events = record(device.eventsOf(FullServer).occupancyChange);

            await device.set({ thermostat: { occupancy: { occupied: false } } });
            await device.set({ thermostat: { occupancy: { occupied: false } } });

            expect(events.length).equals(1);
            expect(events[0].previousOccupancy).deep.equals({ occupied: true });
            expect(events[0].currentOccupancy).deep.equals({ occupied: false });
        });
    });

    describe("SetpointChange", () => {
        const cases = [
            ["occupiedHeatingSetpoint", Thermostat.SystemMode.Heat, true, 2000, 2100],
            ["unoccupiedHeatingSetpoint", Thermostat.SystemMode.Heat, false, 1900, 1950],
            ["occupiedCoolingSetpoint", Thermostat.SystemMode.Cool, true, 2600, 2700],
            ["unoccupiedCoolingSetpoint", Thermostat.SystemMode.Cool, false, 2700, 2800],
        ] as const;

        for (const [attribute, systemMode, occupied, previous, current] of cases) {
            it(`reports ${attribute} with the Occupancy field`, async () => {
                await using ctx = await online(
                    fullThermostat({ unoccupiedHeatingSetpoint: 1900, unoccupiedCoolingSetpoint: 2700 }),
                );
                const { device } = ctx;
                const events = record(device.eventsOf(FullServer).setpointChange);

                await device.set({ thermostat: { [attribute]: current } });

                expect(events.length).equals(1);
                expect(events[0]).deep.equals({
                    systemMode,
                    occupancy: { occupied },
                    previousSetpoint: previous,
                    currentSetpoint: current,
                });
            });
        }

        it("encodes the Occupancy field of an Unoccupied setpoint change as 0", async () => {
            await using ctx = await online(fullThermostat({ unoccupiedHeatingSetpoint: 1900 }));
            const { device } = ctx;
            const events = record(device.eventsOf(FullServer).setpointChange);

            await device.set({ thermostat: { unoccupiedHeatingSetpoint: 1950 } });

            expect(events.length).equals(1);
            const encoded = TlvOfModel(Thermostat.events.setpointChange).encode(events[0]);
            const { occupancy } = TlvObject({ occupancy: TlvOptionalField(1, TlvUInt8) }).decode(encoded);
            expect(occupancy).equals(0);
        });

        it("generates events on a Heating-only server", async () => {
            await using ctx = await online(
                new Endpoint(HeatingOnlyThermostat, {
                    id: "thermostat",
                    number: 1,
                    thermostat: {
                        controlSequenceOfOperation: Thermostat.ControlSequenceOfOperation.HeatingOnly,
                        systemMode: Thermostat.SystemMode.Heat,
                        occupiedHeatingSetpoint: 2000,
                    },
                }),
            );
            const { device } = ctx;
            const events = record(device.eventsOf(HeatingOnlyServer).setpointChange);

            await device.set({ thermostat: { occupiedHeatingSetpoint: 2100 } });

            expect(events).deep.equals([
                {
                    systemMode: Thermostat.SystemMode.Heat,
                    occupancy: undefined,
                    previousSetpoint: 2000,
                    currentSetpoint: 2100,
                },
            ]);
        });

        it("generates events on a Cooling-only server", async () => {
            await using ctx = await online(
                new Endpoint(CoolingOnlyThermostat, {
                    id: "thermostat",
                    number: 1,
                    thermostat: {
                        controlSequenceOfOperation: Thermostat.ControlSequenceOfOperation.CoolingOnly,
                        systemMode: Thermostat.SystemMode.Cool,
                        occupiedCoolingSetpoint: 2600,
                    },
                }),
            );
            const { device } = ctx;
            const events = record(device.eventsOf(CoolingOnlyServer).setpointChange);

            await device.set({ thermostat: { occupiedCoolingSetpoint: 2500 } });

            expect(events).deep.equals([
                {
                    systemMode: Thermostat.SystemMode.Cool,
                    occupancy: undefined,
                    previousSetpoint: 2600,
                    currentSetpoint: 2500,
                },
            ]);
        });

        it("generates no event for an identical value", async () => {
            await using ctx = await online(fullThermostat());
            const { device } = ctx;
            const events = record(device.eventsOf(FullServer).setpointChange);

            await device.set({ thermostat: { occupiedHeatingSetpoint: 2000 } });

            expect(events.length).equals(0);
        });

        it("leaves out the Occupancy field without the Occupancy feature", async () => {
            await using ctx = await online(basicThermostat());
            const { device } = ctx;
            const events = record(device.eventsOf(BasicServer).setpointChange);

            await device.set({ thermostat: { occupiedHeatingSetpoint: 2100 } });

            expect(events.length).equals(1);
            expect(events[0].systemMode).equals(Thermostat.SystemMode.Heat);
            expect(events[0].occupancy).undefined;
            expect(events[0].currentSetpoint).equals(2100);
        });

        it("generates one event per setpoint changed by SetpointRaiseLower, including one pushed by the deadband", async () => {
            await using ctx = await online(
                basicThermostat({ occupiedHeatingSetpoint: 2000, occupiedCoolingSetpoint: 2025 }),
            );
            const { device } = ctx;
            const events = record(device.eventsOf(BasicServer).setpointChange);

            await MockTime.resolve(
                device.act(agent =>
                    agent.get(BasicServer).setpointRaiseLower({
                        mode: Thermostat.SetpointRaiseLowerMode.Heat,
                        amount: 60,
                    }),
                ),
                { macrotasks: true },
            );

            expect(events.map(({ systemMode, currentSetpoint }) => [systemMode, currentSetpoint])).deep.equals([
                [Thermostat.SystemMode.Cool, 2850],
                [Thermostat.SystemMode.Heat, 2600],
            ]);
        });
    });

    describe("ActivePresetChange", () => {
        async function withPresets() {
            const ctx = await online(
                fullThermostat({
                    presets: [
                        newPreset({ presetHandle: new Uint8Array(16).fill(1) }),
                        newPreset({
                            presetHandle: new Uint8Array(16).fill(2),
                            presetScenario: Thermostat.PresetScenario.Unoccupied,
                            heatingSetpoint: 2100,
                            coolingSetpoint: 2500,
                        }),
                    ],
                }),
            );
            const { device } = ctx;
            const handles = device.state.thermostat.persistedPresets!.map(preset => preset.presetHandle!);
            const activate = (presetHandle: Bytes | null) =>
                MockTime.resolve(
                    ctx.node.online({ command: true }, agent =>
                        device.agentFor(agent.context).get(FullServer).setActivePresetRequest({ presetHandle }),
                    ),
                    { macrotasks: true },
                );
            return { ctx, device, handles, activate };
        }

        it("generates one event per change of the active preset", async () => {
            const { ctx, device, handles, activate } = await withPresets();
            await using _ctx = ctx;
            const events = record(device.eventsOf(FullServer).activePresetChange);

            await activate(handles[0]);
            await activate(handles[1]);

            expect(events.length).equals(2);
            expect(events[0].previousPresetHandle).equals(null);
            expect(events[0].currentPresetHandle).deep.equals(handles[0]);
            expect(events[1].previousPresetHandle).deep.equals(handles[0]);
            expect(events[1].currentPresetHandle).deep.equals(handles[1]);
        });

        it("generates one event plus the SetpointChange events when the preset changes the setpoints", async () => {
            const { ctx, device, handles, activate } = await withPresets();
            await using _ctx = ctx;
            const presetEvents = record(device.eventsOf(FullServer).activePresetChange);
            const setpointEvents = record(device.eventsOf(FullServer).setpointChange);

            await activate(handles[1]);

            expect(presetEvents).deep.equals([{ previousPresetHandle: null, currentPresetHandle: handles[1] }]);
            expect(
                setpointEvents.map(({ systemMode, previousSetpoint, currentSetpoint }) => [
                    systemMode,
                    previousSetpoint,
                    currentSetpoint,
                ]),
            ).deep.members([
                [Thermostat.SystemMode.Heat, 2000, 2100],
                [Thermostat.SystemMode.Cool, 2600, 2500],
            ]);
        });

        it("generates no event when the handle stays", async () => {
            const { ctx, device, handles, activate } = await withPresets();
            await using _ctx = ctx;
            await activate(handles[0]);
            const events = record(device.eventsOf(FullServer).activePresetChange);

            await activate(handles[0]);

            expect(events.length).equals(0);
        });

        it("generates an event when initialization clears a handle that matches no preset", async () => {
            const staleHandle = new Uint8Array(16).fill(9);
            await using ctx = await online(
                fullThermostat({
                    presets: [newPreset({ presetHandle: new Uint8Array(16).fill(1) })],
                    activePresetHandle: staleHandle,
                }),
            );
            const { device } = ctx;
            const activePresetChangeId = Thermostat.events.activePresetChange.id;

            const payloads = new Array<unknown>();
            for await (const occurrence of device.env.get(OccurrenceManager).get()) {
                if (occurrence.clusterId === Thermostat.id && occurrence.eventId === activePresetChangeId) {
                    payloads.push(occurrence.payload);
                }
            }

            expect(device.state.thermostat.activePresetHandle).equals(null);
            expect(payloads).deep.equals([{ previousPresetHandle: staleHandle, currentPresetHandle: null }]);
        });

        it("generates an event when the application sets the handle", async () => {
            const { ctx, device, handles } = await withPresets();
            await using _ctx = ctx;
            const events = record(device.eventsOf(FullServer).activePresetChange);

            await device.set({ thermostat: { activePresetHandle: handles[1] } });

            expect(events.length).equals(1);
            expect(events[0].currentPresetHandle).deep.equals(handles[1]);
        });
    });

    describe("ActiveScheduleChange", () => {
        it("generates one event per change of the active schedule", async () => {
            await using ctx = await online(fullThermostat());
            const { device } = ctx;
            await MockTime.resolve(device.set({ thermostat: { schedules: [newSchedule()] } }), { macrotasks: true });
            const handle = device.state.thermostat.persistedSchedules![0].scheduleHandle!;
            const events = record(device.eventsOf(FullServer).activeScheduleChange);

            await device.set({ thermostat: { activeScheduleHandle: handle } });
            await device.set({ thermostat: { activeScheduleHandle: handle } });

            expect(events.length).equals(1);
            expect(events[0].previousScheduleHandle).equals(null);
            expect(events[0].currentScheduleHandle).deep.equals(handle);
        });
    });

    describe("LocalTemperatureChange", () => {
        it("reports the first measurement at startup", async () => {
            const device = basicThermostat({ externalMeasuredIndoorTemperature: 2000 });
            await using node = await MockServerNode.createOnline(MockServerNode.RootEndpoint, {
                device,
                online: false,
            });
            const events = record(device.eventsOf(BasicServer).localTemperatureChange);

            await node.start();
            await settle();

            expect(events).deep.equals([{ currentLocalTemperature: 2000 }]);
        });

        it("refuses to start with a threshold that is not greater than 0", async () => {
            for (const localTemperatureChangeThreshold of [0, -1, Number.NaN, Number.POSITIVE_INFINITY]) {
                const error = await MockServerNode.createOnline(MockServerNode.RootEndpoint, {
                    device: basicThermostat({ localTemperatureChangeThreshold }),
                }).then(
                    () => undefined,
                    (e: unknown) => e,
                );
                const messages = implementationErrorMessages(error);
                expect(messages.length).equals(1);
                expect(messages[0]).contains(
                    `is ${localTemperatureChangeThreshold} but must be a finite number greater than 0`,
                );
            }
        });

        it("refuses a threshold that is not greater than 0 when it is set", async () => {
            await using ctx = await online(basicThermostat());
            const { device } = ctx;

            for (const localTemperatureChangeThreshold of [0, -1, Number.NaN, Number.POSITIVE_INFINITY]) {
                await expect(device.set({ thermostat: { localTemperatureChangeThreshold } })).rejectedWith(
                    ImplementationError,
                    `is ${localTemperatureChangeThreshold} but must be a finite number greater than 0`,
                );
            }
            expect(device.state.thermostat.localTemperatureChangeThreshold).equals(50);

            await device.set({ thermostat: { localTemperatureChangeThreshold: 200 } });
            expect(device.state.thermostat.localTemperatureChangeThreshold).equals(200);
        });

        it("reports the change from null to a value", async () => {
            await using ctx = await online(basicThermostat());
            const { device } = ctx;
            const events = record(device.eventsOf(BasicServer).localTemperatureChange);

            await setTemperature(device, 2000);

            expect(events).deep.equals([{ currentLocalTemperature: 2000 }]);
        });

        it("reports a change of at least the threshold and no smaller one", async () => {
            await using ctx = await online(basicThermostat());
            const { device } = ctx;
            await setTemperature(device, 2000);
            await MockTime.advance(Seconds(61));
            const events = record(device.eventsOf(BasicServer).localTemperatureChange);

            await setTemperature(device, 2049);
            await MockTime.advance(Seconds(61));
            expect(events.length).equals(0);

            await setTemperature(device, 2050);
            expect(events).deep.equals([{ currentLocalTemperature: 2050 }]);
        });

        it("measures the change against the last reported value", async () => {
            await using ctx = await online(basicThermostat());
            const { device } = ctx;
            await setTemperature(device, 2000);
            await MockTime.advance(Seconds(61));
            const events = record(device.eventsOf(BasicServer).localTemperatureChange);

            await setTemperature(device, 2030);
            await setTemperature(device, 2060);

            expect(events).deep.equals([{ currentLocalTemperature: 2060 }]);
        });

        it("uses the configured threshold", async () => {
            await using ctx = await online(basicThermostat({ localTemperatureChangeThreshold: 200 }));
            const { device } = ctx;
            await setTemperature(device, 2000);
            await MockTime.advance(Seconds(61));
            const events = record(device.eventsOf(BasicServer).localTemperatureChange);

            await setTemperature(device, 2150);
            expect(events.length).equals(0);

            await setTemperature(device, 2200);
            expect(events.length).equals(1);
        });

        it("treats the configured temperature as already reported", async () => {
            await using ctx = await online(basicThermostat({ localTemperature: 2000 }));
            const { device } = ctx;
            const events = record(device.eventsOf(BasicServer).localTemperatureChange);

            await setTemperature(device, 2020);

            expect(events.length).equals(0);
        });

        it("reports the change from a value to null", async () => {
            await using ctx = await online(basicThermostat());
            const { device } = ctx;
            await setTemperature(device, 2000);
            await MockTime.advance(Seconds(61));
            const events = record(device.eventsOf(BasicServer).localTemperatureChange);

            await setTemperature(device, null);

            expect(events).deep.equals([{ currentLocalTemperature: null }]);
        });

        it("reports the changes from and to null regardless of the threshold", async () => {
            await using ctx = await online(basicThermostat({ localTemperatureChangeThreshold: 10000 }));
            const { device } = ctx;
            const events = record(device.eventsOf(BasicServer).localTemperatureChange);

            await setTemperature(device, 10);
            await MockTime.advance(Seconds(61));
            await setTemperature(device, null);

            expect(events).deep.equals([{ currentLocalTemperature: 10 }, { currentLocalTemperature: null }]);
        });

        it("reports no change from a reported null to null", async () => {
            await using ctx = await online(basicThermostat({ localTemperature: 2000 }));
            const { device } = ctx;
            const events = record(device.eventsOf(BasicServer).localTemperatureChange);
            await setTemperature(device, null);
            await MockTime.advance(Seconds(10));

            await setTemperature(device, 2000);
            await setTemperature(device, null);
            await MockTime.advance(Seconds(120));
            await settle();

            expect(events).deep.equals([{ currentLocalTemperature: null }]);
        });

        it("reports a second significant change after the 60 second window with the value of that time", async () => {
            await using ctx = await online(basicThermostat());
            const { device } = ctx;
            const events = record(device.eventsOf(BasicServer).localTemperatureChange);

            await setTemperature(device, 2000);
            await MockTime.advance(Seconds(10));
            await setTemperature(device, 2100);
            expect(events.length).equals(1);

            await MockTime.advance(Seconds(10));
            await setTemperature(device, 2200);
            expect(events.length).equals(1);
            expect(MockTime.timerCountFor(REPORT_TIMER)).equals(1);

            await MockTime.advance(Seconds(39));
            expect(events.length).equals(1);

            await MockTime.advance(Seconds(1));
            await settle();
            expect(events).deep.equals([{ currentLocalTemperature: 2000 }, { currentLocalTemperature: 2200 }]);
        });

        it("waits for the end of the window when the timer expires early", async () => {
            await using ctx = await online(basicThermostat());
            const { device } = ctx;
            const events = record(device.eventsOf(BasicServer).localTemperatureChange);
            await setTemperature(device, 2000);
            await MockTime.advance(Seconds(10));

            const getTimer = Time.default.getTimer.bind(Time.default);
            Time.default.getTimer = (name, duration, callback) => {
                if (name !== REPORT_TIMER) {
                    return getTimer(name, duration, callback);
                }
                Time.default.getTimer = getTimer;
                return getTimer(name, Millis(duration - 1), callback);
            };
            try {
                await setTemperature(device, 2100);
            } finally {
                Time.default.getTimer = getTimer;
            }

            await MockTime.advance(Seconds(50) - 1);
            await settle();
            expect(events.length).equals(1);
            expect(MockTime.timerCountFor(REPORT_TIMER)).equals(1);

            await MockTime.advance(1);
            await settle();
            expect(events).deep.equals([{ currentLocalTemperature: 2000 }, { currentLocalTemperature: 2100 }]);
        });

        it("reports at once when exactly 60 seconds passed since the last report", async () => {
            await using ctx = await online(basicThermostat());
            const { device } = ctx;
            const events = record(device.eventsOf(BasicServer).localTemperatureChange);
            await setTemperature(device, 2000);
            await MockTime.advance(Seconds(60));

            await setTemperature(device, 2100);

            expect(events).deep.equals([{ currentLocalTemperature: 2000 }, { currentLocalTemperature: 2100 }]);
        });

        it("drops the deferred report when a raised threshold makes the change not significant", async () => {
            await using ctx = await online(basicThermostat());
            const { device } = ctx;
            const events = record(device.eventsOf(BasicServer).localTemperatureChange);
            await setTemperature(device, 2000);
            await MockTime.advance(Seconds(10));
            await setTemperature(device, 2100);

            await device.set({ thermostat: { localTemperatureChangeThreshold: 200 } });
            await MockTime.advance(Seconds(120));
            await settle();

            expect(events).deep.equals([{ currentLocalTemperature: 2000 }]);
        });

        it("drops the deferred report when the value moves back inside the window", async () => {
            await using ctx = await online(basicThermostat());
            const { device } = ctx;
            const events = record(device.eventsOf(BasicServer).localTemperatureChange);
            await setTemperature(device, 2000);
            await MockTime.advance(Seconds(10));

            await setTemperature(device, 2100);
            await setTemperature(device, 2000);
            expect(MockTime.timerCountFor(REPORT_TIMER)).equals(0);
            await MockTime.advance(Seconds(120));

            expect(events).deep.equals([{ currentLocalTemperature: 2000 }]);
        });

        it("defers the change to null until the window ends", async () => {
            await using ctx = await online(basicThermostat());
            const { device } = ctx;
            const events = record(device.eventsOf(BasicServer).localTemperatureChange);
            await setTemperature(device, 2000);
            await MockTime.advance(Seconds(10));

            await setTemperature(device, null);
            expect(events.length).equals(1);

            await MockTime.advance(Seconds(50));
            await settle();
            expect(events).deep.equals([{ currentLocalTemperature: 2000 }, { currentLocalTemperature: null }]);
        });

        it("generates no event after the node closed", async () => {
            const ctx = await online(basicThermostat());
            const { node, device } = ctx;
            const events = record(device.eventsOf(BasicServer).localTemperatureChange);
            await setTemperature(device, 2000);
            await MockTime.advance(Seconds(10));
            const timersBefore = new Set(Time.timers);
            await setTemperature(device, 2100);
            const pendingReportTimers = [...Time.timers].filter(timer => !timersBefore.has(timer));
            expect(pendingReportTimers.length).greaterThan(0);

            await node.close();
            await MockTime.advance(Seconds(120));
            await settle();

            expect(events.length).equals(1);
            expect(pendingReportTimers.filter(timer => timer.isRunning)).deep.equals([]);
        });
    });

    describe("event availability", () => {
        it("has no events for features that are not selected", async () => {
            await using ctx = await online(basicThermostat());
            const events = ctx.device.eventsOf(BasicServer);

            expect(events.systemModeChange).not.undefined;
            expect(events.localTemperatureChange).not.undefined;
            expect(events.setpointChange).not.undefined;
            expect(events.runningStateChange).not.undefined;
            expect(events.runningModeChange).not.undefined;
            expect("occupancyChange" in events).false;
            expect("activePresetChange" in events).false;
            expect("activeScheduleChange" in events).false;
        });

        it("has no LocalTemperatureChange with LocalTemperatureNotExposed", async () => {
            await using ctx = await online(
                new Endpoint(LocalTemperatureHiddenThermostat, { id: "thermostat", number: 1, thermostat: CONFIG }),
            );
            const events = ctx.device.eventsOf(LocalTemperatureHiddenServer);

            expect(events.systemModeChange).not.undefined;
            expect("localTemperatureChange" in events).false;
        });

        const CHANGES = {
            thermostat: {
                systemMode: Thermostat.SystemMode.Heat,
                occupiedHeatingSetpoint: 2100,
                localTemperature: 2000,
            },
        };

        it("generates nothing and does not fail when the events are not enabled", async () => {
            await using ctx = await online(
                new Endpoint(NotEnabledThermostat, { id: "thermostat", number: 1, thermostat: CONFIG }),
            );
            const { device } = ctx;
            const events = device.eventsOf(NotEnabledServer);
            using log = captureLog(LogLevel.WARN);

            await device.set(CHANGES);
            await device.set({
                thermostat: {
                    thermostatRunningMode: Thermostat.ThermostatRunningMode.Heat,
                    thermostatRunningState: { heat: true },
                },
            });
            await settle();

            expect(events.systemModeChange).undefined;
            expect(events.setpointChange).undefined;
            expect(events.localTemperatureChange).undefined;
            expect(events.runningModeChange).undefined;
            expect(events.runningStateChange).undefined;
            expect(device.state.thermostat.systemMode).equals(Thermostat.SystemMode.Heat);
            expect(device.state.thermostat.thermostatRunningMode).equals(Thermostat.ThermostatRunningMode.Heat);
            expect(log.messages).deep.equals([]);
            expectCaptures(log);
        });

        it("generates nothing and does not fail without the Events feature", async () => {
            await using ctx = await online(
                new Endpoint(NoEventsThermostat, { id: "thermostat", number: 1, thermostat: CONFIG }),
            );
            const { device } = ctx;
            const events = device.eventsOf(NoEventsServer);
            using log = captureLog(LogLevel.WARN);

            await device.set(CHANGES);
            await MockTime.advance(Seconds(120));
            await settle();

            expect("systemModeChange" in events).false;
            expect("setpointChange" in events).false;
            expect(device.state.thermostat.occupiedHeatingSetpoint).equals(2100);
            expect(log.messages).deep.equals([]);
            expectCaptures(log);
        });
    });
});

describe("Thermostat events without the thermostat-events forward feature", () => {
    before(() => MockTime.init());

    it("refuses to start", async function () {
        if (Specification.ENABLE_FORWARD_MATTER_FEATURES) {
            this.skip();
        }

        const error = await MockServerNode.createOnline(undefined, { device: basicThermostat() }).then(
            () => undefined,
            (e: unknown) => e,
        );

        const messages = implementationErrorMessages(error);
        expect(messages.length).equals(1);
        expect(messages[0]).contains('"thermostat-events" forward feature');
    });
});

function implementationErrorMessages(error: unknown) {
    expect(error).instanceOf(AggregateError);
    const errors = error instanceof AggregateError ? error.errors : [];
    return errors
        .map((e: unknown) => (e instanceof Error ? e.cause : undefined))
        .filter(cause => cause instanceof ImplementationError)
        .map(cause => cause.message);
}
