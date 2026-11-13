/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { Behavior } from "#behavior/Behavior.js";
import { ActionContext } from "#behavior/context/ActionContext.js";
import { ThermostatClient, ThermostatServer } from "#behaviors/thermostat";
import { TimeSynchronizationServer } from "#behaviors/time-synchronization";
import { ThermostatDevice } from "#devices/thermostat";
import { Endpoint } from "#endpoint/index.js";
import {
    Bytes,
    Environment,
    ImplementationError,
    LogLevel,
    Millis,
    Minutes,
    MockStorageService,
    Seconds,
    StorageService,
    Time,
} from "@matter/general";
import { captureLog, interaction, MockServerNode, MockSite, subscribedPeer } from "@matter/node/testing";
import {
    ClusterId,
    CommandId,
    EndpointNumber,
    Status,
    StatusResponse,
    TlvInvokeResponseData,
    TlvOfModel,
    TypeFromSchema,
} from "@matter/types";
import { Thermostat } from "@matter/types/clusters/thermostat";
import { newPreset } from "./preset-helpers.js";

const SuggestionsServer = ThermostatServer.with("Heating", "Cooling", "AutoMode", "Presets", "ThermostatSuggestions");

const TIMER = "Thermostat suggestion";

const PRESET_A = new Uint8Array(16).fill(1);
const PRESET_B = new Uint8Array(16).fill(2);
const UNKNOWN_PRESET = new Uint8Array(16).fill(9);

/** Preset A matches the configured setpoints; activating preset B moves them. */
function presets() {
    return [
        newPreset({ presetHandle: PRESET_A }),
        newPreset({
            presetHandle: PRESET_B,
            presetScenario: Thermostat.PresetScenario.Unoccupied,
            heatingSetpoint: 2100,
            coolingSetpoint: 2500,
        }),
    ];
}

function config(thermostat: Record<string, unknown> = {}) {
    return {
        controlSequenceOfOperation: Thermostat.ControlSequenceOfOperation.CoolingAndHeating,
        systemMode: Thermostat.SystemMode.Auto,
        occupiedHeatingSetpoint: 2000,
        occupiedCoolingSetpoint: 2600,
        minSetpointDeadBand: 25,
        temperatureSetpointHold: Thermostat.TemperatureSetpointHold.SetpointHoldOff,
        numberOfPresets: 5,
        presetTypes: [
            { presetScenario: Thermostat.PresetScenario.Occupied, numberOfPresets: 5, presetTypeFeatures: {} },
            { presetScenario: Thermostat.PresetScenario.Unoccupied, numberOfPresets: 5, presetTypeFeatures: {} },
        ],
        activePresetHandle: null,
        presets: presets(),
        ...thermostat,
    };
}

async function online(
    thermostat: Record<string, unknown> = {},
    server: Behavior.Type = SuggestionsServer,
    root = MockServerNode.RootEndpoint,
    environment?: Environment,
) {
    const device = new Endpoint(ThermostatDevice.with(server), {
        id: "thermostat",
        number: 1,
        thermostat: config(thermostat),
    });
    const restartable = environment === undefined ? {} : { id: "suggestions-node", environment };
    const node = await MockServerNode.createOnline(root, { device, ...restartable });
    await settle();

    // An async wrapper, so a refusal arrives as a rejection like it does for a client
    const command = async <R>(actor: (server: InstanceType<typeof SuggestionsServer>) => R) =>
        MockTime.resolve(
            node.online({ command: true }, agent => actor(device.agentFor(agent.context).get(SuggestionsServer))),
            { macrotasks: true },
        );

    return {
        node,
        device,
        state: () => device.stateOf(SuggestionsServer),
        add: (request: Partial<Thermostat.AddThermostatSuggestionRequest> & { presetHandle: Bytes }) =>
            command(server =>
                server.addThermostatSuggestion({ effectiveTime: null, expirationInMinutes: 30, ...request }),
            ),
        remove: (uniqueId: number) => command(server => server.removeThermostatSuggestion({ uniqueId })),
        reevaluate: () => command(server => server.reevaluateThermostatSuggestions()),
        activate: (presetHandle: Bytes) => command(server => server.setActivePresetRequest({ presetHandle })),
        set: (values: Record<string, unknown>) =>
            MockTime.resolve(device.setStateOf(SuggestionsServer, values), { macrotasks: true }),
        [Symbol.asyncDispose]: () => node.close(),
    };
}

/** Reactions and timers of a behavior run asynchronously */
function settle() {
    return MockTime.resolve(Promise.resolve(), { macrotasks: true });
}

/** The names of the bits set in a ThermostatSuggestionNotFollowingReason value */
function reasonsIn(reason: Thermostat.ThermostatSuggestionNotFollowingReason | null) {
    return reason === null ? null : Object.entries(reason).flatMap(([name, set]) => (set ? [name] : []));
}

/** An entry as stored before a restart, current for the next 30 minutes */
function storedSuggestion(uniqueId: number, presetHandle = PRESET_A) {
    const now = nowS();
    return { uniqueId, presetHandle, effectiveTime: now, expirationTime: now + 1800 };
}

function nowS() {
    return Math.floor(Time.nowMs / 1000);
}

/** Whether the time is synchronized, for servers that replace the default */
let synchronized = true;

class ClockServer extends SuggestionsServer {
    override hasSynchronizedTime() {
        return synchronized;
    }
}

describe("Thermostat suggestions", () => {
    before(() => {
        MockTime.init();
        // The default hasSynchronizedTime trusts the host clock only from 2025 on
        expect(Time.nowMs).at.least(Date.UTC(2025, 0, 1));
    });

    beforeEach(() => {
        synchronized = true;
    });

    describe("AddThermostatSuggestion", () => {
        it("adds the entry, makes it current and follows it", async () => {
            await using ctx = await online();
            const effectiveTime = nowS();

            const { uniqueId } = await ctx.add({ presetHandle: PRESET_B, effectiveTime, expirationInMinutes: 30 });

            const entry = { uniqueId, presetHandle: PRESET_B, effectiveTime, expirationTime: effectiveTime + 30 * 60 };
            const state = ctx.state();
            expect(state.thermostatSuggestions).deep.equals([entry]);
            expect(state.currentThermostatSuggestion).deep.equals(entry);
            expect(state.thermostatSuggestionNotFollowingReason).equals(null);
            expect(state.activePresetHandle).deep.equals(PRESET_B);
            expect(state.occupiedHeatingSetpoint).equals(2100);
            expect(state.occupiedCoolingSetpoint).equals(2500);
        });

        it("uses the current time when EffectiveTime is null", async () => {
            await using ctx = await online();
            const now = nowS();

            await ctx.add({ presetHandle: PRESET_A, effectiveTime: null, expirationInMinutes: 45 });

            const [entry] = ctx.state().thermostatSuggestions;
            expect(entry.effectiveTime).equals(now);
            expect(entry.expirationTime).equals(now + 45 * 60);
        });

        it("refuses without synchronized time with INVALID_IN_STATE", async () => {
            await using ctx = await online({}, ClockServer);
            synchronized = false;

            await expect(ctx.add({ presetHandle: PRESET_A })).rejectedWith(StatusResponse.InvalidInStateError);
            expect(ctx.state().thermostatSuggestions).deep.equals([]);
        });

        it("checks synchronized time before the preset", async () => {
            await using ctx = await online({}, ClockServer);
            synchronized = false;

            await expect(ctx.add({ presetHandle: UNKNOWN_PRESET })).rejectedWith(StatusResponse.InvalidInStateError);
        });

        it("refuses an unknown preset with NOT_FOUND", async () => {
            await using ctx = await online();

            await expect(ctx.add({ presetHandle: UNKNOWN_PRESET })).rejectedWith(StatusResponse.NotFoundError);
            expect(ctx.state().thermostatSuggestions).deep.equals([]);
        });

        it("refuses when the list is full with RESOURCE_EXHAUSTED, after the preset check", async () => {
            await using ctx = await online();
            for (let i = 0; i < 5; i++) {
                await ctx.add({ presetHandle: PRESET_A });
            }

            await expect(ctx.add({ presetHandle: UNKNOWN_PRESET })).rejectedWith(StatusResponse.NotFoundError);
            await expect(ctx.add({ presetHandle: PRESET_A })).rejectedWith(StatusResponse.ResourceExhaustedError);
            expect(ctx.state().thermostatSuggestions.length).equals(5);
        });

        it("checks the list size before the EffectiveTime", async () => {
            await using ctx = await online();
            for (let i = 0; i < 5; i++) {
                await ctx.add({ presetHandle: PRESET_A });
            }

            await expect(
                ctx.add({ presetHandle: PRESET_A, effectiveTime: nowS() + Seconds.of(Minutes(25 * 60)) }),
            ).rejectedWith(StatusResponse.ResourceExhaustedError);
        });

        it("refuses an EffectiveTime more than 24 hours ahead with INVALID_COMMAND", async () => {
            await using ctx = await online();

            await expect(ctx.add({ presetHandle: PRESET_A, effectiveTime: nowS() + 24 * 3600 + 1 })).rejectedWith(
                StatusResponse.InvalidCommandError,
            );
            expect(ctx.state().thermostatSuggestions).deep.equals([]);
        });

        it("accepts an EffectiveTime exactly 24 hours ahead, which is not current yet", async () => {
            await using ctx = await online();

            await ctx.add({ presetHandle: PRESET_B, effectiveTime: nowS() + 24 * 3600 });

            expect(ctx.state().thermostatSuggestions.length).equals(1);
            expect(ctx.state().currentThermostatSuggestion).equals(null);
            expect(ctx.state().activePresetHandle).equals(null);
        });

        it("checks the field constraints before synchronized time", async () => {
            await using ctx = await online({}, ClockServer);
            synchronized = false;
            const fabric = await ctx.node.addFabric();
            const command = Thermostat.schema.commands.require("AddThermostatSuggestion");

            let response: TypeFromSchema<typeof TlvInvokeResponseData> | undefined;
            await interaction.invoke(
                ctx.node,
                fabric,
                {
                    commandPath: {
                        endpointId: EndpointNumber(1),
                        clusterId: ClusterId(Thermostat.id),
                        commandId: CommandId(command.id),
                    },
                    commandFields: TlvOfModel(command).encodeTlv({
                        presetHandle: PRESET_A,
                        effectiveTime: null,
                        expirationInMinutes: 29,
                    }),
                },
                r => {
                    response = r;
                },
            );

            expect(response?.status?.status.status).equals(Status.ConstraintError);
        });
    });

    describe("UniqueID", () => {
        it("issues distinct values and does not reuse a removed one at once", async () => {
            await using ctx = await online();

            const first = await ctx.add({ presetHandle: PRESET_A });
            const second = await ctx.add({ presetHandle: PRESET_A });
            await ctx.remove(second.uniqueId);
            const third = await ctx.add({ presetHandle: PRESET_A });

            expect(new Set([first.uniqueId, second.uniqueId, third.uniqueId]).size).equals(3);
        });

        it("continues after the highest stored value", async () => {
            await using ctx = await online({ thermostatSuggestions: [storedSuggestion(10)] });

            const { uniqueId } = await ctx.add({ presetHandle: PRESET_A });

            expect(uniqueId).equals(11);
        });

        it("wraps after 255 and skips values in use", async () => {
            await using ctx = await online({ thermostatSuggestions: [storedSuggestion(0), storedSuggestion(255)] });

            const { uniqueId } = await ctx.add({ presetHandle: PRESET_A });

            expect(uniqueId).equals(1);
        });
    });

    describe("RemoveThermostatSuggestion", () => {
        it("removes the entry", async () => {
            await using ctx = await online();
            const first = await ctx.add({ presetHandle: PRESET_A, effectiveTime: nowS() + 600 });
            const second = await ctx.add({ presetHandle: PRESET_B, effectiveTime: nowS() + 600 });

            await ctx.remove(first.uniqueId);

            expect(ctx.state().thermostatSuggestions.map(({ uniqueId }) => uniqueId)).deep.equals([second.uniqueId]);
        });

        it("refuses an unknown UniqueID with NOT_FOUND", async () => {
            await using ctx = await online();
            const { uniqueId } = await ctx.add({ presetHandle: PRESET_A });

            await expect(ctx.remove((uniqueId + 1) % 256)).rejectedWith(StatusResponse.NotFoundError);
            expect(ctx.state().thermostatSuggestions.length).equals(1);
        });

        it("clears the current suggestion and keeps the active preset when the current one goes", async () => {
            await using ctx = await online();
            const { uniqueId } = await ctx.add({ presetHandle: PRESET_B });

            await ctx.remove(uniqueId);

            expect(ctx.state().currentThermostatSuggestion).equals(null);
            expect(ctx.state().thermostatSuggestionNotFollowingReason).equals(null);
            expect(ctx.state().activePresetHandle).deep.equals(PRESET_B);
        });

        it("makes the remaining effective entry current", async () => {
            await using ctx = await online();
            const first = await ctx.add({ presetHandle: PRESET_A, effectiveTime: nowS() - 10 });
            const second = await ctx.add({ presetHandle: PRESET_B });

            await ctx.remove(first.uniqueId);

            expect(ctx.state().currentThermostatSuggestion?.uniqueId).equals(second.uniqueId);
            expect(ctx.state().activePresetHandle).deep.equals(PRESET_B);
        });
    });

    describe("selection", () => {
        it("chooses the entry with the earliest EffectiveTime", async () => {
            await using ctx = await online();
            await ctx.add({ presetHandle: PRESET_A, effectiveTime: nowS() - 5 });
            const earlier = await ctx.add({ presetHandle: PRESET_B, effectiveTime: nowS() - 60 });

            expect(ctx.state().currentThermostatSuggestion?.uniqueId).equals(earlier.uniqueId);
            expect(ctx.state().activePresetHandle).deep.equals(PRESET_B);
        });

        it("chooses the first entry of those with the same EffectiveTime", async () => {
            await using ctx = await online();
            const effectiveTime = nowS();
            const first = await ctx.add({ presetHandle: PRESET_A, effectiveTime });
            await ctx.add({ presetHandle: PRESET_B, effectiveTime });

            expect(ctx.state().currentThermostatSuggestion?.uniqueId).equals(first.uniqueId);
        });

        it("follows no suggestion and reports ConflictingSuggestions when the selection finds none", async () => {
            class ConflictServer extends SuggestionsServer {
                override selectThermostatSuggestion() {
                    return undefined;
                }
            }
            await using ctx = await online({}, ConflictServer);

            await ctx.add({ presetHandle: PRESET_B });

            expect(ctx.state().thermostatSuggestions.length).equals(1);
            expect(ctx.state().currentThermostatSuggestion).equals(null);
            expect(reasonsIn(ctx.state().thermostatSuggestionNotFollowingReason)).deep.equals([
                "conflictingSuggestions",
            ]);
            expect(ctx.state().activePresetHandle).equals(null);
        });

        it("reports the reasons an application returns and does not follow", async () => {
            class DemandResponseServer extends SuggestionsServer {
                override suggestionNotFollowingReason() {
                    return { demandResponseEvent: true };
                }
            }
            await using ctx = await online({}, DemandResponseServer);

            const { uniqueId } = await ctx.add({ presetHandle: PRESET_B });

            expect(ctx.state().currentThermostatSuggestion?.uniqueId).equals(uniqueId);
            expect(reasonsIn(ctx.state().thermostatSuggestionNotFollowingReason)).deep.equals(["demandResponseEvent"]);
            expect(ctx.state().activePresetHandle).equals(null);
        });
    });

    describe("timer", () => {
        it("makes an entry current when its EffectiveTime arrives", async () => {
            await using ctx = await online();
            const { uniqueId } = await ctx.add({ presetHandle: PRESET_B, effectiveTime: nowS() + 600 });
            expect(ctx.state().currentThermostatSuggestion).equals(null);

            await MockTime.advance(Seconds(599));
            expect(ctx.state().currentThermostatSuggestion).equals(null);

            await MockTime.advance(Seconds(1));
            await settle();
            expect(ctx.state().currentThermostatSuggestion?.uniqueId).equals(uniqueId);
            expect(ctx.state().activePresetHandle).deep.equals(PRESET_B);
        });

        it("removes the current entry when it expires and clears the current suggestion", async () => {
            await using ctx = await online();
            await ctx.add({ presetHandle: PRESET_B, expirationInMinutes: 30 });

            await MockTime.advance(Minutes(30));
            await settle();

            expect(ctx.state().thermostatSuggestions).deep.equals([]);
            expect(ctx.state().currentThermostatSuggestion).equals(null);
            expect(ctx.state().thermostatSuggestionNotFollowingReason).equals(null);
            expect(ctx.state().activePresetHandle).deep.equals(PRESET_B);
            expect(MockTime.timerCountFor(TIMER)).equals(0);
        });

        it("runs until the earliest time of all entries, not only of the current one", async () => {
            await using ctx = await online();
            const current = await ctx.add({ presetHandle: PRESET_A, expirationInMinutes: 60 });
            await ctx.add({ presetHandle: PRESET_B, effectiveTime: nowS() + 300, expirationInMinutes: 30 });

            await MockTime.advance(Minutes(35));
            await settle();

            expect(ctx.state().thermostatSuggestions.map(({ uniqueId }) => uniqueId)).deep.equals([current.uniqueId]);
            expect(ctx.state().currentThermostatSuggestion?.uniqueId).equals(current.uniqueId);
        });

        it("stops when the node closes", async () => {
            const ctx = await online();
            await ctx.add({ presetHandle: PRESET_A });
            expect(MockTime.timerCountFor(TIMER)).equals(1);

            await ctx.node.close();

            expect(MockTime.timerCountFor(TIMER)).equals(0);
        });

        it("keeps the timer of the stored entries when a removal rolls back", async () => {
            await using ctx = await online();
            const first = await ctx.add({ presetHandle: PRESET_B, effectiveTime: nowS() + 600 });
            await ctx.add({ presetHandle: PRESET_A, effectiveTime: nowS() + 1200 });

            await expect(
                MockTime.resolve(
                    ctx.node.online({ command: true }, async agent => {
                        ctx.device
                            .agentFor(agent.context)
                            .get(SuggestionsServer)
                            .removeThermostatSuggestion({ uniqueId: first.uniqueId });
                        throw new ImplementationError("roll back the removal");
                    }),
                    { macrotasks: true },
                ),
            ).rejectedWith(ImplementationError);
            await settle();
            expect(ctx.state().thermostatSuggestions.length).equals(2);

            await MockTime.advance(Seconds(600));
            await settle();

            expect(ctx.state().currentThermostatSuggestion?.uniqueId).equals(first.uniqueId);
            expect(ctx.state().activePresetHandle).deep.equals(PRESET_B);
        });

        it("restarts when following throws on the timer", async () => {
            let refuse = false;
            class RefusingServer extends SuggestionsServer {
                override handleSetActivePresetRequest(request: Thermostat.SetActivePresetRequest) {
                    if (refuse) {
                        throw new ImplementationError("refuse to follow");
                    }
                    return super.handleSetActivePresetRequest(request);
                }
            }
            await using ctx = await online({}, RefusingServer);
            const { uniqueId } = await ctx.add({ presetHandle: PRESET_B, effectiveTime: nowS() + 600 });
            await ctx.add({ presetHandle: PRESET_A, effectiveTime: nowS() + 1200 });

            refuse = true;
            await MockTime.advance(Seconds(600));
            await settle();
            expect(ctx.state().currentThermostatSuggestion).equals(null);
            expect(MockTime.timerCountFor(TIMER)).equals(1);

            refuse = false;
            await MockTime.advance(Seconds(600));
            await settle();
            expect(ctx.state().currentThermostatSuggestion?.uniqueId).equals(uniqueId);
            expect(ctx.state().activePresetHandle).deep.equals(PRESET_B);
        });

        it("makes an entry current whose EffectiveTime passes while a re-evaluation rolls back", async () => {
            await using ctx = await online();
            const { uniqueId } = await ctx.add({ presetHandle: PRESET_B, effectiveTime: nowS() + 600 });

            // The wall clock passes the EffectiveTime while the monotonic timer of that entry is still ahead
            const step = Seconds(600);
            try {
                await expect(
                    MockTime.resolve(
                        ctx.node.online({ command: true }, async agent => {
                            ctx.device.agentFor(agent.context).get(SuggestionsServer).reevaluateThermostatSuggestions();
                            MockTime.stepWallClock(step);
                            throw new ImplementationError("roll back the re-evaluation");
                        }),
                        { macrotasks: true },
                    ),
                ).rejectedWith(ImplementationError);
                await MockTime.advance(0);
                await settle();

                expect(ctx.state().currentThermostatSuggestion?.uniqueId).equals(uniqueId);
                expect(ctx.state().activePresetHandle).deep.equals(PRESET_B);
            } finally {
                MockTime.stepWallClock(0 - step);
            }
        });

        it("uses whole seconds when the wall clock is between two seconds", async () => {
            await using ctx = await online();
            await MockTime.advance(Millis(500));
            const now = nowS();

            await ctx.add({ presetHandle: PRESET_B, effectiveTime: null, expirationInMinutes: 30 });

            const [entry] = ctx.state().thermostatSuggestions;
            expect(entry.effectiveTime).equals(now);
            expect(ctx.state().currentThermostatSuggestion?.uniqueId).equals(entry.uniqueId);
            expect(MockTime.timerCountFor(TIMER)).equals(1);

            await MockTime.advance(Minutes(30) - 501);
            await settle();
            expect(ctx.state().thermostatSuggestions.length).equals(1);

            await MockTime.advance(1);
            await settle();
            expect(ctx.state().thermostatSuggestions).deep.equals([]);
        });
    });

    describe("time synchronization", () => {
        it("clears the current suggestion while the time is not synchronized", async () => {
            await using ctx = await online({}, ClockServer);
            const { uniqueId } = await ctx.add({ presetHandle: PRESET_B });

            synchronized = false;
            await ctx.reevaluate();

            expect(ctx.state().currentThermostatSuggestion).equals(null);
            expect(ctx.state().thermostatSuggestionNotFollowingReason).equals(null);
            expect(ctx.state().thermostatSuggestions.length).equals(1);
            expect(MockTime.timerCountFor(TIMER)).equals(0);

            synchronized = true;
            await ctx.reevaluate();

            expect(ctx.state().currentThermostatSuggestion?.uniqueId).equals(uniqueId);
        });

        it("does not trust a host clock before 2025", async () => {
            await using ctx = await online();
            const offset = Date.UTC(2024, 6, 1) - Time.nowMs;
            MockTime.stepWallClock(offset);
            try {
                await expect(ctx.add({ presetHandle: PRESET_A })).rejectedWith(StatusResponse.InvalidInStateError);
            } finally {
                MockTime.stepWallClock(-offset);
            }
        });

        it("uses the UTCTime of a TimeSynchronization cluster on the node", async () => {
            await using ctx = await online(
                {},
                SuggestionsServer,
                MockServerNode.RootEndpoint.with(TimeSynchronizationServer),
            );
            const root = ctx.node;
            const setUtcTime = (utcTime: number | null) =>
                MockTime.resolve(root.setStateOf(TimeSynchronizationServer, { utcTime }), { macrotasks: true });

            await expect(ctx.add({ presetHandle: PRESET_B })).rejectedWith(StatusResponse.InvalidInStateError);

            await setUtcTime(Time.nowMs * 1000);
            const { uniqueId } = await ctx.add({ presetHandle: PRESET_B });
            expect(ctx.state().currentThermostatSuggestion?.uniqueId).equals(uniqueId);

            await setUtcTime(null);
            expect(ctx.state().currentThermostatSuggestion).equals(null);

            await setUtcTime(Time.nowMs * 1000);
            expect(ctx.state().currentThermostatSuggestion?.uniqueId).equals(uniqueId);

            // A clock step leaves the monotonic timer behind; setting the new time re-evaluates
            const step = Minutes(31);
            MockTime.stepWallClock(step);
            try {
                await setUtcTime(Time.nowMs * 1000);
                expect(ctx.state().thermostatSuggestions).deep.equals([]);
            } finally {
                MockTime.stepWallClock(0 - step);
            }
        });
    });

    describe("following", () => {
        it("re-evaluates when the application writes ThermostatSuggestions", async () => {
            await using ctx = await online();
            const now = nowS();
            const entry = { uniqueId: 7, presetHandle: PRESET_B, effectiveTime: now, expirationTime: now + 1800 };

            await ctx.set({ thermostatSuggestions: [entry] });

            expect(ctx.state().currentThermostatSuggestion).deep.equals(entry);
            expect(ctx.state().activePresetHandle).deep.equals(PRESET_B);
        });

        it("keeps adjusted setpoints while the suggestion's preset stays active", async () => {
            await using ctx = await online();
            await ctx.add({ presetHandle: PRESET_B });
            await MockTime.resolve(
                ctx.node.online({ command: true }, agent =>
                    ctx.device
                        .agentFor(agent.context)
                        .get(SuggestionsServer)
                        .setpointRaiseLower({ mode: Thermostat.SetpointRaiseLowerMode.Heat, amount: 5 }),
                ),
                { macrotasks: true },
            );
            expect(ctx.state().occupiedHeatingSetpoint).equals(2150);

            await ctx.add({ presetHandle: PRESET_A, effectiveTime: nowS() + 600 });

            expect(ctx.state().activePresetHandle).deep.equals(PRESET_B);
            expect(ctx.state().occupiedHeatingSetpoint).equals(2150);
        });

        it("activates the preset through an application's handleSetActivePresetRequest", async () => {
            const activated = new Array<Bytes | null>();
            class RecordingServer extends SuggestionsServer {
                override handleSetActivePresetRequest(request: Thermostat.SetActivePresetRequest) {
                    activated.push(request.presetHandle);
                    return super.handleSetActivePresetRequest(request);
                }
            }
            await using ctx = await online({}, RecordingServer);

            await ctx.add({ presetHandle: PRESET_B });

            expect(activated).deep.equals([PRESET_B]);
            expect(ctx.state().activePresetHandle).deep.equals(PRESET_B);
            expect(ctx.state().occupiedHeatingSetpoint).equals(2100);
        });

        it("re-evaluates once for AddThermostatSuggestion", async () => {
            let selections = 0;
            class CountingServer extends SuggestionsServer {
                override selectThermostatSuggestion(candidates: Thermostat.ThermostatSuggestion[]) {
                    selections++;
                    return super.selectThermostatSuggestion(candidates);
                }
            }
            await using ctx = await online({}, CountingServer);

            await ctx.add({ presetHandle: PRESET_B });
            await settle();

            expect(selections).equals(1);
        });

        it("cannot re-evaluate without the ThermostatSuggestions feature", async () => {
            const PresetsServer = ThermostatServer.with("Heating", "Cooling", "AutoMode", "Presets");
            await using ctx = await online({}, PresetsServer);

            await expect(
                ctx.device.act(async agent => agent.get(PresetsServer).reevaluateThermostatSuggestions()),
            ).rejectedWith(ImplementationError);
        });
    });

    describe("manual override", () => {
        /** Follows a suggestion for preset B, then a client activates preset A */
        async function overridden(ctx: Awaited<ReturnType<typeof online>>) {
            const followed = await ctx.add({ presetHandle: PRESET_B });
            expect(ctx.state().activePresetHandle).deep.equals(PRESET_B);
            await ctx.activate(PRESET_A);
            await settle();
            return followed;
        }

        it("stops following when a client activates another preset and keeps that preset", async () => {
            await using ctx = await online();
            const { uniqueId } = await overridden(ctx);

            expect(ctx.state().currentThermostatSuggestion?.uniqueId).equals(uniqueId);
            expect(reasonsIn(ctx.state().thermostatSuggestionNotFollowingReason)).deep.equals([]);
            expect(ctx.state().activePresetHandle).deep.equals(PRESET_A);

            await ctx.add({ presetHandle: PRESET_B, effectiveTime: nowS() + 600 });
            await ctx.reevaluate();
            await settle();

            expect(ctx.state().currentThermostatSuggestion?.uniqueId).equals(uniqueId);
            expect(reasonsIn(ctx.state().thermostatSuggestionNotFollowingReason)).deep.equals([]);
            expect(ctx.state().activePresetHandle).deep.equals(PRESET_A);
        });

        it("stops following when the application activates another preset", async () => {
            await using ctx = await online();
            await ctx.add({ presetHandle: PRESET_B });

            await MockTime.resolve(
                ctx.device.act(agent =>
                    agent.get(SuggestionsServer).setActivePresetRequest({ presetHandle: PRESET_A }),
                ),
                { macrotasks: true },
            );
            await settle();

            expect(reasonsIn(ctx.state().thermostatSuggestionNotFollowingReason)).deep.equals([]);
            expect(ctx.state().activePresetHandle).deep.equals(PRESET_A);
        });

        it("stops following when a setpoint write leaves the preset", async () => {
            await using ctx = await online();
            await ctx.add({ presetHandle: PRESET_B });

            await ctx.set({ occupiedHeatingSetpoint: 2050 });
            await settle();

            expect(reasonsIn(ctx.state().thermostatSuggestionNotFollowingReason)).deep.equals([]);
            expect(ctx.state().activePresetHandle).equals(null);
            expect(ctx.state().occupiedHeatingSetpoint).equals(2050);
        });

        it("follows again when another entry becomes current and when the overridden entry returns", async () => {
            await using ctx = await online();
            const followed = await overridden(ctx);

            const earlier = await ctx.add({ presetHandle: PRESET_A, effectiveTime: nowS() - 60 });
            await settle();
            expect(ctx.state().currentThermostatSuggestion?.uniqueId).equals(earlier.uniqueId);
            expect(ctx.state().thermostatSuggestionNotFollowingReason).equals(null);

            await ctx.remove(earlier.uniqueId);
            await settle();
            expect(ctx.state().currentThermostatSuggestion?.uniqueId).equals(followed.uniqueId);
            expect(ctx.state().thermostatSuggestionNotFollowingReason).equals(null);
            expect(ctx.state().activePresetHandle).deep.equals(PRESET_B);
        });

        it("follows the next entry when the overridden entry expires", async () => {
            await using ctx = await online();
            await overridden(ctx);
            const next = await ctx.add({
                presetHandle: PRESET_B,
                effectiveTime: nowS() + 600,
                expirationInMinutes: 60,
            });

            await MockTime.advance(Minutes(30));
            await settle();

            expect(ctx.state().currentThermostatSuggestion?.uniqueId).equals(next.uniqueId);
            expect(ctx.state().thermostatSuggestionNotFollowingReason).equals(null);
            expect(ctx.state().activePresetHandle).deep.equals(PRESET_B);
        });

        it("follows a new entry after the overridden entry is removed", async () => {
            await using ctx = await online();
            const followed = await overridden(ctx);

            await ctx.remove(followed.uniqueId);
            await settle();
            expect(ctx.state().currentThermostatSuggestion).equals(null);
            expect(ctx.state().thermostatSuggestionNotFollowingReason).equals(null);
            expect(ctx.state().activePresetHandle).deep.equals(PRESET_A);

            await ctx.add({ presetHandle: PRESET_B });
            expect(ctx.state().activePresetHandle).deep.equals(PRESET_B);
        });

        it("reports OngoingHold during a hold and keeps the override after it", async () => {
            await using ctx = await online();
            await overridden(ctx);

            await ctx.set({ temperatureSetpointHold: Thermostat.TemperatureSetpointHold.SetpointHoldOn });
            expect(reasonsIn(ctx.state().thermostatSuggestionNotFollowingReason)).deep.equals(["ongoingHold"]);

            await ctx.set({ temperatureSetpointHold: Thermostat.TemperatureSetpointHold.SetpointHoldOff });
            expect(reasonsIn(ctx.state().thermostatSuggestionNotFollowingReason)).deep.equals([]);
            expect(ctx.state().activePresetHandle).deep.equals(PRESET_A);
        });

        it("is an override when a client activates another preset during a hold", async () => {
            await using ctx = await online();
            await ctx.set({ temperatureSetpointHold: Thermostat.TemperatureSetpointHold.SetpointHoldOn });
            await ctx.add({ presetHandle: PRESET_B });
            expect(ctx.state().activePresetHandle).equals(null);
            await ctx.activate(PRESET_A);
            await settle();
            expect(reasonsIn(ctx.state().thermostatSuggestionNotFollowingReason)).deep.equals(["ongoingHold"]);

            await ctx.set({ temperatureSetpointHold: Thermostat.TemperatureSetpointHold.SetpointHoldOff });

            expect(reasonsIn(ctx.state().thermostatSuggestionNotFollowingReason)).deep.equals([]);
            expect(ctx.state().activePresetHandle).deep.equals(PRESET_A);
        });

        it("is no override when a setpoint write during a hold leaves the preset", async () => {
            await using ctx = await online();
            await ctx.add({ presetHandle: PRESET_B });
            await ctx.set({ temperatureSetpointHold: Thermostat.TemperatureSetpointHold.SetpointHoldOn });
            await ctx.set({ occupiedHeatingSetpoint: 2050 });
            await settle();
            expect(ctx.state().activePresetHandle).equals(null);
            expect(ctx.state().overriddenSuggestionId).equals(undefined);

            await ctx.set({ temperatureSetpointHold: Thermostat.TemperatureSetpointHold.SetpointHoldOff });

            expect(ctx.state().thermostatSuggestionNotFollowingReason).equals(null);
            expect(ctx.state().activePresetHandle).deep.equals(PRESET_B);
            expect(ctx.state().occupiedHeatingSetpoint).equals(2100);
        });

        // Characterization: the hold check leaves an existing override as it is
        it("keeps an override when a setpoint write during a hold leaves the overriding preset", async () => {
            await using ctx = await online();
            const { uniqueId } = await overridden(ctx);
            await ctx.set({ temperatureSetpointHold: Thermostat.TemperatureSetpointHold.SetpointHoldOn });
            await ctx.set({ occupiedHeatingSetpoint: 2050 });
            await settle();

            await ctx.set({ temperatureSetpointHold: Thermostat.TemperatureSetpointHold.SetpointHoldOff });

            expect(ctx.state().overriddenSuggestionId).equals(uniqueId);
            expect(reasonsIn(ctx.state().thermostatSuggestionNotFollowingReason)).deep.equals([]);
            expect(ctx.state().activePresetHandle).equals(null);
            expect(ctx.state().occupiedHeatingSetpoint).equals(2050);
        });

        it("is no override when a setpoint write leaves the preset while the application reports OngoingHold", async () => {
            let held = false;
            class ApplicationHoldServer extends SuggestionsServer {
                override suggestionNotFollowingReason() {
                    return held ? { ongoingHold: true } : null;
                }
            }
            await using ctx = await online({}, ApplicationHoldServer);
            await ctx.add({ presetHandle: PRESET_B });
            held = true;
            await ctx.reevaluate();
            expect(reasonsIn(ctx.state().thermostatSuggestionNotFollowingReason)).deep.equals(["ongoingHold"]);

            await ctx.set({ occupiedHeatingSetpoint: 2050 });
            await settle();
            expect(ctx.state().activePresetHandle).equals(null);
            expect(ctx.state().overriddenSuggestionId).equals(undefined);

            held = false;
            await ctx.reevaluate();
            expect(ctx.state().thermostatSuggestionNotFollowingReason).equals(null);
            expect(ctx.state().activePresetHandle).deep.equals(PRESET_B);
        });

        it("ends during a hold when a setpoint write leaves the overriding preset and the suggestion's preset follows in the same transaction", async () => {
            await using ctx = await online();
            await overridden(ctx);
            await ctx.set({ temperatureSetpointHold: Thermostat.TemperatureSetpointHold.SetpointHoldOn });

            const activateSuggestionPreset = (_value: number, _old: number, context: ActionContext) => {
                const server = ctx.device.agentFor(context).get(SuggestionsServer);
                if (server.state.activePresetHandle === null) {
                    server.setActivePresetRequest({ presetHandle: PRESET_B });
                }
            };
            const changing = ctx.device.eventsOf(SuggestionsServer).occupiedHeatingSetpoint$Changing;
            changing.on(activateSuggestionPreset);
            try {
                await ctx.set({ occupiedHeatingSetpoint: 2050 });
            } finally {
                changing.off(activateSuggestionPreset);
            }
            await settle();
            expect(ctx.state().activePresetHandle).deep.equals(PRESET_B);
            expect(ctx.state().overriddenSuggestionId).equals(undefined);

            await ctx.set({ temperatureSetpointHold: Thermostat.TemperatureSetpointHold.SetpointHoldOff });

            expect(ctx.state().thermostatSuggestionNotFollowingReason).equals(null);
        });

        it("ends when a client activates the suggestion's preset again, so later changes are followed", async () => {
            await using ctx = await online();
            await overridden(ctx);

            await ctx.activate(PRESET_B);
            await settle();
            expect(ctx.state().thermostatSuggestionNotFollowingReason).equals(null);
            await ctx.reevaluate();
            expect(ctx.state().thermostatSuggestionNotFollowingReason).equals(null);

            const earlier = await ctx.add({ presetHandle: PRESET_A, effectiveTime: nowS() - 60 });
            await settle();
            expect(ctx.state().currentThermostatSuggestion?.uniqueId).equals(earlier.uniqueId);
            expect(ctx.state().activePresetHandle).deep.equals(PRESET_A);

            await ctx.remove(earlier.uniqueId);
            await ctx.activate(PRESET_A);
            await settle();
            expect(reasonsIn(ctx.state().thermostatSuggestionNotFollowingReason)).deep.equals([]);
        });

        for (const order of ["hold first", "setpoint first"]) {
            const holdOffAndSetpoint = (setpoint: number) => {
                const hold = { temperatureSetpointHold: Thermostat.TemperatureSetpointHold.SetpointHoldOff };
                const write = { occupiedHeatingSetpoint: setpoint };
                return order === "hold first" ? { ...hold, ...write } : { ...write, ...hold };
            };

            it(`is an override when the transaction that ends a hold of the followed preset writes a setpoint, ${order}`, async () => {
                await using ctx = await online();
                const { uniqueId } = await ctx.add({ presetHandle: PRESET_B });
                await ctx.set({ temperatureSetpointHold: Thermostat.TemperatureSetpointHold.SetpointHoldOn });

                await ctx.set(holdOffAndSetpoint(2050));
                await settle();

                expect(ctx.state().overriddenSuggestionId).equals(uniqueId);
                expect(reasonsIn(ctx.state().thermostatSuggestionNotFollowingReason)).deep.equals([]);
                expect(ctx.state().activePresetHandle).equals(null);
                expect(ctx.state().occupiedHeatingSetpoint).equals(2050);
            });

            it(`is an override when the transaction that ends a hold without an active preset writes a setpoint, ${order}`, async () => {
                await using ctx = await online();
                await ctx.set({ temperatureSetpointHold: Thermostat.TemperatureSetpointHold.SetpointHoldOn });
                const { uniqueId } = await ctx.add({ presetHandle: PRESET_B });
                expect(ctx.state().activePresetHandle).equals(null);

                await ctx.set(holdOffAndSetpoint(2050));
                await settle();

                expect(ctx.state().overriddenSuggestionId).equals(uniqueId);
                expect(reasonsIn(ctx.state().thermostatSuggestionNotFollowingReason)).deep.equals([]);
                expect(ctx.state().activePresetHandle).equals(null);
                expect(ctx.state().occupiedHeatingSetpoint).equals(2050);
            });
        }

        it("ends when the suggestion's preset returns while the time is not synchronized", async () => {
            await using ctx = await online({}, ClockServer);
            const { uniqueId } = await overridden(ctx);
            synchronized = false;
            await ctx.reevaluate();
            expect(ctx.state().currentThermostatSuggestion).equals(null);
            expect(ctx.state().overriddenSuggestionId).equals(uniqueId);

            await ctx.activate(PRESET_B);
            await settle();
            expect(ctx.state().overriddenSuggestionId).equals(undefined);

            synchronized = true;
            await ctx.reevaluate();
            expect(ctx.state().currentThermostatSuggestion?.uniqueId).equals(uniqueId);
            expect(ctx.state().thermostatSuggestionNotFollowingReason).equals(null);
        });

        it("ends during a hold when a client activates the suggestion's preset again", async () => {
            await using ctx = await online();
            await overridden(ctx);
            await ctx.set({ temperatureSetpointHold: Thermostat.TemperatureSetpointHold.SetpointHoldOn });

            await ctx.activate(PRESET_B);
            await settle();
            expect(reasonsIn(ctx.state().thermostatSuggestionNotFollowingReason)).deep.equals(["ongoingHold"]);

            await ctx.set({ temperatureSetpointHold: Thermostat.TemperatureSetpointHold.SetpointHoldOff });

            expect(ctx.state().thermostatSuggestionNotFollowingReason).equals(null);
            expect(ctx.state().activePresetHandle).deep.equals(PRESET_B);
        });
    });

    describe("manual override across a restart", () => {
        function storage() {
            const environment = new Environment("test");
            environment.set(StorageService, new MockStorageService(environment));
            return environment;
        }

        /** Follows a suggestion for preset B that expires in 30 minutes, then a client activates preset A */
        async function overriddenBeforeRestart(environment: Environment, next?: { effectiveTime: number }) {
            await using ctx = await online({}, SuggestionsServer, MockServerNode.RootEndpoint, environment);
            const followed = await ctx.add({ presetHandle: PRESET_B });
            if (next !== undefined) {
                await ctx.add({ presetHandle: PRESET_B, expirationInMinutes: 60, ...next });
            }
            await ctx.activate(PRESET_A);
            await settle();
            expect(ctx.state().overriddenSuggestionId).equals(followed.uniqueId);
            return followed;
        }

        it("stays in effect when its entry is still current", async () => {
            const environment = storage();
            const { uniqueId } = await overriddenBeforeRestart(environment);

            await using ctx = await online({}, SuggestionsServer, MockServerNode.RootEndpoint, environment);

            expect(ctx.state().currentThermostatSuggestion?.uniqueId).equals(uniqueId);
            expect(ctx.state().overriddenSuggestionId).equals(uniqueId);
            expect(reasonsIn(ctx.state().thermostatSuggestionNotFollowingReason)).deep.equals([]);
            expect(ctx.state().activePresetHandle).deep.equals(PRESET_A);
            expect(ctx.state().occupiedHeatingSetpoint).equals(2000);
        });

        it("ends when another entry became current", async () => {
            const environment = storage();
            const followed = await overriddenBeforeRestart(environment, { effectiveTime: nowS() + 600 });

            await MockTime.advance(Minutes(31));
            await using ctx = await online({}, SuggestionsServer, MockServerNode.RootEndpoint, environment);

            expect(ctx.state().currentThermostatSuggestion?.uniqueId).not.equals(followed.uniqueId);
            expect(ctx.state().currentThermostatSuggestion).not.equals(null);
            expect(ctx.state().overriddenSuggestionId).equals(undefined);
            expect(ctx.state().thermostatSuggestionNotFollowingReason).equals(null);
            expect(ctx.state().activePresetHandle).deep.equals(PRESET_B);
        });

        it("stays in effect while the time is not synchronized after the restart", async () => {
            const environment = storage();
            const root = MockServerNode.RootEndpoint.with(TimeSynchronizationServer);
            const setUtcTime = (ctx: Awaited<ReturnType<typeof online>>) =>
                MockTime.resolve(ctx.node.setStateOf(TimeSynchronizationServer, { utcTime: Time.nowMs * 1000 }), {
                    macrotasks: true,
                });

            let uniqueId: number;
            {
                await using ctx = await online({}, SuggestionsServer, root, environment);
                await setUtcTime(ctx);
                ({ uniqueId } = await ctx.add({ presetHandle: PRESET_B }));
                await ctx.activate(PRESET_A);
                await settle();
            }

            await using ctx = await online({}, SuggestionsServer, root, environment);
            expect(ctx.state().currentThermostatSuggestion).equals(null);
            expect(ctx.state().overriddenSuggestionId).equals(uniqueId);

            await setUtcTime(ctx);

            expect(ctx.state().currentThermostatSuggestion?.uniqueId).equals(uniqueId);
            expect(reasonsIn(ctx.state().thermostatSuggestionNotFollowingReason)).deep.equals([]);
            expect(ctx.state().activePresetHandle).deep.equals(PRESET_A);
        });

        it("ends when no entry is current any more and keeps the active preset", async () => {
            const environment = storage();
            await overriddenBeforeRestart(environment);

            await MockTime.advance(Minutes(31));
            await using ctx = await online({}, SuggestionsServer, MockServerNode.RootEndpoint, environment);

            expect(ctx.state().currentThermostatSuggestion).equals(null);
            expect(ctx.state().overriddenSuggestionId).equals(undefined);
            expect(ctx.state().activePresetHandle).deep.equals(PRESET_A);
        });
    });

    describe("setpoint hold", () => {
        it("does not follow during a hold and follows once the hold ends", async () => {
            await using ctx = await online();
            await ctx.set({ temperatureSetpointHold: Thermostat.TemperatureSetpointHold.SetpointHoldOn });

            const { uniqueId } = await ctx.add({ presetHandle: PRESET_B });

            expect(ctx.state().currentThermostatSuggestion?.uniqueId).equals(uniqueId);
            expect(reasonsIn(ctx.state().thermostatSuggestionNotFollowingReason)).deep.equals(["ongoingHold"]);
            expect(ctx.state().activePresetHandle).equals(null);

            await ctx.set({ temperatureSetpointHold: Thermostat.TemperatureSetpointHold.SetpointHoldOff });

            expect(ctx.state().thermostatSuggestionNotFollowingReason).equals(null);
            expect(ctx.state().activePresetHandle).deep.equals(PRESET_B);
            expect(ctx.state().occupiedHeatingSetpoint).equals(2100);
        });

        it("stops following when a hold starts and keeps the active preset", async () => {
            await using ctx = await online();
            await ctx.add({ presetHandle: PRESET_B });

            await ctx.set({ temperatureSetpointHold: Thermostat.TemperatureSetpointHold.SetpointHoldOn });

            expect(reasonsIn(ctx.state().thermostatSuggestionNotFollowingReason)).deep.equals(["ongoingHold"]);
            expect(ctx.state().activePresetHandle).deep.equals(PRESET_B);
        });
    });

    describe("presets", () => {
        it("removes the current suggestion and the entries of a removed preset", async () => {
            await using ctx = await online({ activePresetHandle: PRESET_A });
            await ctx.set({ temperatureSetpointHold: Thermostat.TemperatureSetpointHold.SetpointHoldOn });
            await ctx.add({ presetHandle: PRESET_B });
            await ctx.add({ presetHandle: PRESET_B, effectiveTime: nowS() + 600 });
            expect(ctx.state().currentThermostatSuggestion?.presetHandle).deep.equals(PRESET_B);
            expect(ctx.state().thermostatSuggestions.length).equals(2);

            await ctx.set({ presets: [presets()[0]] });

            expect(ctx.state().thermostatSuggestions).deep.equals([]);
            expect(ctx.state().currentThermostatSuggestion).equals(null);
            expect(ctx.state().thermostatSuggestionNotFollowingReason).equals(null);
            expect(ctx.state().activePresetHandle).deep.equals(PRESET_A);
        });

        it("removes the entries of a removed preset and keeps the current suggestion", async () => {
            await using ctx = await online();
            const current = await ctx.add({ presetHandle: PRESET_A });
            await ctx.add({ presetHandle: PRESET_B, effectiveTime: nowS() + 600 });

            await ctx.set({ presets: [presets()[0]] });

            expect(ctx.state().thermostatSuggestions.map(({ uniqueId }) => uniqueId)).deep.equals([current.uniqueId]);
            expect(ctx.state().currentThermostatSuggestion?.uniqueId).equals(current.uniqueId);
        });

        it("removes the entries and the current suggestion in the transaction that removes the preset", async () => {
            await using ctx = await online({ activePresetHandle: PRESET_A });
            await ctx.set({ temperatureSetpointHold: Thermostat.TemperatureSetpointHold.SetpointHoldOn });
            await ctx.add({ presetHandle: PRESET_B });
            const queued = await ctx.add({ presetHandle: PRESET_A, effectiveTime: nowS() + 600 });

            const committed = new Array<{ uniqueIds: number[]; current: number | undefined }>();
            ctx.device.eventsOf(SuggestionsServer).persistedPresets$Changed.on(() => {
                const state = ctx.device.stateOf(SuggestionsServer);
                committed.push({
                    uniqueIds: state.thermostatSuggestions.map(({ uniqueId }) => uniqueId),
                    current: state.currentThermostatSuggestion?.uniqueId,
                });
            });
            await ctx.set({ presets: [presets()[0]] });

            expect(committed).deep.equals([{ uniqueIds: [queued.uniqueId], current: undefined }]);
        });

        it("keeps the entries when the removal of the preset rolls back", async () => {
            await using ctx = await online();
            await ctx.add({ presetHandle: PRESET_A });
            await ctx.add({ presetHandle: PRESET_B, effectiveTime: nowS() + 600 });

            const refuse = () => {
                throw new ImplementationError("refuse the presets after the thermostat handled them");
            };
            const presetsChanging = ctx.device.eventsOf(SuggestionsServer).persistedPresets$Changing;
            presetsChanging.on(refuse);
            try {
                await expect(ctx.set({ presets: [presets()[0]] })).rejectedWith(ImplementationError);
            } finally {
                presetsChanging.off(refuse);
            }

            expect(ctx.state().thermostatSuggestions.length).equals(2);
            expect(ctx.state().persistedPresets?.length).equals(2);
        });

        it("keeps the entries when the removal is refused", async () => {
            await using ctx = await online();
            await ctx.add({ presetHandle: PRESET_B });

            await expect(ctx.set({ presets: [presets()[0]] })).rejectedWith(StatusResponse.InvalidInStateError);

            expect(ctx.state().thermostatSuggestions.length).equals(1);
            expect(ctx.state().currentThermostatSuggestion?.presetHandle).deep.equals(PRESET_B);
        });

        it("re-evaluates when a preset changes", async () => {
            class WarmPresetServer extends SuggestionsServer {
                override suggestionNotFollowingReason(suggestion: Thermostat.ThermostatSuggestion) {
                    const preset = this.state.persistedPresets?.find(
                        ({ presetHandle }) =>
                            presetHandle !== null && Bytes.areEqual(presetHandle, suggestion.presetHandle),
                    );
                    return (preset?.heatingSetpoint ?? 0) > 2200 ? { preCoolingOrPreHeating: true } : null;
                }
            }
            await using ctx = await online({}, WarmPresetServer);
            await ctx.add({ presetHandle: PRESET_B });
            expect(ctx.state().thermostatSuggestionNotFollowingReason).equals(null);

            const [a, b] = presets();
            await ctx.set({ presets: [a, { ...b, heatingSetpoint: 2300 }] });

            expect(reasonsIn(ctx.state().thermostatSuggestionNotFollowingReason)).deep.equals([
                "preCoolingOrPreHeating",
            ]);
        });
    });

    describe("startup", () => {
        /** Presets that are stored already, so the start does not store them and react to that */
        function restarted(thermostatSuggestions: Thermostat.ThermostatSuggestion[]) {
            return { presets: undefined, persistedPresets: presets(), thermostatSuggestions };
        }

        it("removes stored entries that name no preset", async () => {
            using log = captureLog(LogLevel.NOTICE);
            await using ctx = await online(restarted([storedSuggestion(1), storedSuggestion(2, UNKNOWN_PRESET)]));

            expect(ctx.state().thermostatSuggestions.map(({ uniqueId }) => uniqueId)).deep.equals([1]);
            expect(ctx.state().currentThermostatSuggestion?.uniqueId).equals(1);
            expect(log.messages.filter(message => message.includes("that name no preset")).length).equals(1);
        });

        it("removes stored entries that expired", async () => {
            const now = nowS();
            await using ctx = await online(
                restarted([
                    { uniqueId: 1, presetHandle: PRESET_A, effectiveTime: now - 3600, expirationTime: now - 1 },
                ]),
            );

            expect(ctx.state().thermostatSuggestions).deep.equals([]);
            expect(ctx.state().currentThermostatSuggestion).equals(null);
        });

        it("raises MaxThermostatSuggestions to cover the stored entries", async () => {
            using log = captureLog(LogLevel.NOTICE);
            const stored = [1, 2, 3, 4, 5, 6, 7].map(uniqueId => storedSuggestion(uniqueId));
            await using ctx = await online({ ...restarted(stored), maxThermostatSuggestions: 5 });

            expect(ctx.state().maxThermostatSuggestions).equals(7);
            expect(ctx.state().thermostatSuggestions.length).equals(7);
            expect(
                log.messages.filter(message => message.includes("raising MaxThermostatSuggestions to 7")).length,
            ).equals(1);
        });

        it("sets up the endpoint when it is added to a node that is online", async () => {
            await using node = await MockServerNode.createOnline(MockServerNode.RootEndpoint, { device: undefined });
            const device = await node.add(
                new Endpoint(ThermostatDevice.with(SuggestionsServer), {
                    id: "thermostat",
                    number: 1,
                    thermostat: config({
                        ...restarted([storedSuggestion(1, PRESET_B)]),
                        externalMeasuredIndoorTemperature: 2150,
                    }),
                }),
            );
            await settle();

            const state = device.stateOf(SuggestionsServer);
            expect(state.currentThermostatSuggestion?.uniqueId).equals(1);
            expect(state.activePresetHandle).deep.equals(PRESET_B);
            expect(state.localTemperature).equals(2150);
            expect(MockTime.timerCountFor(TIMER)).equals(1);
        });
    });

    describe("MaxThermostatSuggestions", () => {
        it("defaults to 5", async () => {
            await using ctx = await online();

            expect(ctx.state().maxThermostatSuggestions).equals(5);
        });

        it("accepts as many entries as configured", async () => {
            await using ctx = await online({ maxThermostatSuggestions: 7 });
            for (let i = 0; i < 7; i++) {
                await ctx.add({ presetHandle: PRESET_A });
            }

            await expect(ctx.add({ presetHandle: PRESET_A })).rejectedWith(StatusResponse.ResourceExhaustedError);
        });

        it("refuses to start with fewer than 5", async () => {
            const error = await online({ maxThermostatSuggestions: 4 }).then(
                () => undefined,
                (e: unknown) => e,
            );

            expect(error).instanceOf(AggregateError);
            const causes =
                error instanceof AggregateError
                    ? error.errors.map((e: unknown) => (e instanceof Error ? e.cause : undefined))
                    : [];
            expect(
                causes.filter(cause => cause instanceof ImplementationError).map(cause => cause.message),
            ).deep.equals(["MaxThermostatSuggestions of node0.thermostat is 4 but must be at least 5"]);
        });
    });

    describe("preset activation", () => {
        it("keeps a preset the application activates", async () => {
            await using ctx = await online();

            await MockTime.resolve(
                ctx.device.act(agent =>
                    agent.get(SuggestionsServer).setActivePresetRequest({ presetHandle: PRESET_B }),
                ),
                { macrotasks: true },
            );

            expect(ctx.state().activePresetHandle).deep.equals(PRESET_B);
            expect(ctx.state().occupiedHeatingSetpoint).equals(2100);
            expect(ctx.state().occupiedCoolingSetpoint).equals(2500);
        });

        it("leaves the preset on a setpoint write after the activation committed", async () => {
            await using ctx = await online();

            await MockTime.resolve(
                ctx.device.act(async agent => {
                    agent.get(SuggestionsServer).setActivePresetRequest({ presetHandle: PRESET_B });
                    await agent.context.transaction.commit();
                    agent.get(SuggestionsServer).state.occupiedHeatingSetpoint = 2050;
                }),
                { macrotasks: true },
            );

            expect(ctx.state().activePresetHandle).equals(null);
        });

        it("still leaves the preset on a later setpoint write", async () => {
            await using ctx = await online();
            await MockTime.resolve(
                ctx.device.act(agent =>
                    agent.get(SuggestionsServer).setActivePresetRequest({ presetHandle: PRESET_B }),
                ),
                { macrotasks: true },
            );

            await ctx.set({ occupiedHeatingSetpoint: 2050 });

            expect(ctx.state().activePresetHandle).equals(null);
        });

        it("keeps the preset when a limit change moves the setpoint", async () => {
            await using ctx = await online();
            await ctx.add({ presetHandle: PRESET_B });
            expect(ctx.state().occupiedHeatingSetpoint).equals(2100);

            await ctx.set({ maxHeatSetpointLimit: 2050 });
            await settle();

            expect(ctx.state().occupiedHeatingSetpoint).equals(2050);
            expect(ctx.state().activePresetHandle).deep.equals(PRESET_B);
            expect(ctx.state().overriddenSuggestionId).equals(undefined);
            expect(ctx.state().thermostatSuggestionNotFollowingReason).equals(null);
        });

        it("follows when the transaction that adds the entry moves the setpoint to keep a limit", async () => {
            await using ctx = await online({ occupiedHeatingSetpoint: 2100 });
            const now = nowS();
            const entry = { uniqueId: 7, presetHandle: PRESET_B, effectiveTime: now, expirationTime: now + 1800 };

            await ctx.set({ maxHeatSetpointLimit: 2050, thermostatSuggestions: [entry] });
            await settle();

            expect(ctx.state().overriddenSuggestionId).equals(undefined);
            expect(ctx.state().activePresetHandle).deep.equals(PRESET_B);
            expect(ctx.state().occupiedHeatingSetpoint).equals(2050);
        });

        it("follows the entry that becomes current after another one in the same transaction", async () => {
            await using ctx = await online();

            await MockTime.resolve(
                ctx.node.online({ command: true }, async agent => {
                    const server = ctx.device.agentFor(agent.context).get(SuggestionsServer);
                    const { uniqueId } = await server.addThermostatSuggestion({
                        presetHandle: PRESET_B,
                        effectiveTime: null,
                        expirationInMinutes: 30,
                    });
                    server.removeThermostatSuggestion({ uniqueId });
                    server.addThermostatSuggestion({
                        presetHandle: PRESET_A,
                        effectiveTime: null,
                        expirationInMinutes: 30,
                    });
                }),
                { macrotasks: true },
            );
            await settle();

            expect(ctx.state().overriddenSuggestionId).equals(undefined);
            expect(ctx.state().activePresetHandle).deep.equals(PRESET_A);
        });

        describe("with the Occupancy feature", () => {
            const OccupancyServer = ThermostatServer.with("Heating", "Cooling", "AutoMode", "Presets", "Occupancy");

            async function occupancyOnline(occupied: boolean) {
                const device = new Endpoint(ThermostatDevice.with(OccupancyServer), {
                    id: "thermostat",
                    number: 1,
                    thermostat: config({
                        activePresetHandle: PRESET_A,
                        unoccupiedHeatingSetpoint: 1800,
                        unoccupiedCoolingSetpoint: 2800,
                        externallyMeasuredOccupancy: occupied,
                    }),
                });
                const node = await MockServerNode.createOnline(MockServerNode.RootEndpoint, { device });
                await settle();
                return {
                    state: () => device.stateOf(OccupancyServer),
                    set: (values: Record<string, unknown>) =>
                        MockTime.resolve(device.setStateOf(OccupancyServer, values), { macrotasks: true }),
                    [Symbol.asyncDispose]: () => node.close(),
                };
            }

            for (const occupied of [true, false]) {
                const [active, inactive] = occupied
                    ? (["occupiedHeatingSetpoint", "unoccupiedHeatingSetpoint"] as const)
                    : (["unoccupiedHeatingSetpoint", "occupiedHeatingSetpoint"] as const);

                it(`keeps the preset on a write of ${inactive} and leaves it on a write of ${active}`, async () => {
                    await using ctx = await occupancyOnline(occupied);
                    expect(ctx.state().occupancy?.occupied).equals(occupied);

                    await ctx.set({ [inactive]: 1900 });
                    expect(ctx.state().activePresetHandle).deep.equals(PRESET_A);

                    await ctx.set({ [active]: 1900 });
                    expect(ctx.state().activePresetHandle).equals(null);
                });
            }
        });
    });

    describe("through a controller", () => {
        it("follows once a client ends the hold and drops entries of a preset an atomic write removes", async () => {
            const site = new MockSite();
            await using _site = site;
            const deviceEp = new Endpoint(ThermostatDevice.with(SuggestionsServer), {
                id: "thermostat",
                number: 1,
                thermostat: config({ activePresetHandle: PRESET_A }),
            });
            const { controller } = await site.addCommissionedPair({
                device: { type: MockServerNode.RootEndpoint, device: deviceEp },
            });
            const ep1 = (await subscribedPeer(controller, "peer1")).parts.get("ep1")!;
            const device = () => deviceEp.stateOf(SuggestionsServer);
            const writeHold = (temperatureSetpointHold: Thermostat.TemperatureSetpointHold) =>
                MockTime.resolve(
                    ep1.act(agent => {
                        agent.get(ThermostatClient).state.temperatureSetpointHold = temperatureSetpointHold;
                    }),
                    { macrotasks: true },
                );
            const commands = ep1.commandsOf(ThermostatClient);

            await writeHold(Thermostat.TemperatureSetpointHold.SetpointHoldOn);
            await MockTime.resolve(
                commands.addThermostatSuggestion({
                    presetHandle: PRESET_B,
                    effectiveTime: null,
                    expirationInMinutes: 30,
                }),
            );
            expect(reasonsIn(device().thermostatSuggestionNotFollowingReason)).deep.equals(["ongoingHold"]);
            expect(device().activePresetHandle).deep.equals(PRESET_A);

            await writeHold(Thermostat.TemperatureSetpointHold.SetpointHoldOff);
            expect(device().thermostatSuggestionNotFollowingReason).equals(null);
            expect(device().activePresetHandle).deep.equals(PRESET_B);
            expect(device().occupiedHeatingSetpoint).equals(2100);

            await MockTime.resolve(
                commands.addThermostatSuggestion({
                    presetHandle: PRESET_A,
                    effectiveTime: nowS() + 600,
                    expirationInMinutes: 30,
                }),
            );
            expect(device().thermostatSuggestions.length).equals(2);

            const atomic = (requestType: Thermostat.RequestType, timeout?: number) =>
                MockTime.resolve(
                    commands.atomicRequest({
                        requestType,
                        attributeRequests: [Thermostat.attributes.presets.id],
                        timeout,
                    }),
                    { macrotasks: true },
                );
            await atomic(Thermostat.RequestType.BeginWrite, 5000);
            await MockTime.resolve(
                ep1.act(agent => {
                    agent.get(ThermostatClient).state.presets = [presets()[1]];
                }),
            );
            expect((await atomic(Thermostat.RequestType.CommitWrite)).statusCode).equals(Status.Success);

            expect(device().thermostatSuggestions.map(({ presetHandle }) => presetHandle)).deep.equals([PRESET_B]);
            expect(device().currentThermostatSuggestion?.presetHandle).deep.equals(PRESET_B);
        });
    });

    describe("manual override through a controller", () => {
        it("stops following after a client SetActivePresetRequest and after a client setpoint write", async () => {
            const site = new MockSite();
            await using _site = site;
            const deviceEp = new Endpoint(ThermostatDevice.with(SuggestionsServer), {
                id: "thermostat",
                number: 1,
                thermostat: config(),
            });
            const { controller } = await site.addCommissionedPair({
                device: { type: MockServerNode.RootEndpoint, device: deviceEp },
            });
            const ep1 = (await subscribedPeer(controller, "peer1")).parts.get("ep1")!;
            const device = () => deviceEp.stateOf(SuggestionsServer);
            const commands = ep1.commandsOf(ThermostatClient);
            const add = async (presetHandle: Bytes) => {
                const response = await MockTime.resolve(
                    commands.addThermostatSuggestion({ presetHandle, effectiveTime: null, expirationInMinutes: 30 }),
                );
                await settle();
                return response;
            };

            const { uniqueId } = await add(PRESET_B);
            expect(device().activePresetHandle).deep.equals(PRESET_B);
            await MockTime.resolve(commands.setActivePresetRequest({ presetHandle: PRESET_A }), { macrotasks: true });
            await settle();
            expect(reasonsIn(device().thermostatSuggestionNotFollowingReason)).deep.equals([]);
            expect(device().activePresetHandle).deep.equals(PRESET_A);

            await MockTime.resolve(commands.removeThermostatSuggestion({ uniqueId }));
            await add(PRESET_B);
            expect(device().thermostatSuggestionNotFollowingReason).equals(null);
            expect(device().activePresetHandle).deep.equals(PRESET_B);
            await MockTime.resolve(
                ep1.act(agent => {
                    agent.get(ThermostatClient).state.occupiedHeatingSetpoint = 2050;
                }),
                { macrotasks: true },
            );
            await settle();
            expect(device().activePresetHandle).equals(null);
            expect(reasonsIn(device().thermostatSuggestionNotFollowingReason)).deep.equals([]);
        });

        // Characterization: each attribute of a Write commits on its own and the client sends the setpoint first, so
        // the setpoint write belongs to the hold and the hold ends in a later transaction
        it("follows when one client Write writes a setpoint and ends the hold", async () => {
            const site = new MockSite();
            await using _site = site;
            const deviceEp = new Endpoint(ThermostatDevice.with(SuggestionsServer), {
                id: "thermostat",
                number: 1,
                thermostat: config({ temperatureSetpointHold: Thermostat.TemperatureSetpointHold.SetpointHoldOn }),
            });
            const { controller } = await site.addCommissionedPair({
                device: { type: MockServerNode.RootEndpoint, device: deviceEp },
            });
            const ep1 = (await subscribedPeer(controller, "peer1")).parts.get("ep1")!;
            const device = () => deviceEp.stateOf(SuggestionsServer);
            await MockTime.resolve(
                ep1.commandsOf(ThermostatClient).addThermostatSuggestion({
                    presetHandle: PRESET_B,
                    effectiveTime: null,
                    expirationInMinutes: 30,
                }),
            );
            await settle();

            await MockTime.resolve(
                ep1.act(agent => {
                    const { state } = agent.get(ThermostatClient);
                    state.temperatureSetpointHold = Thermostat.TemperatureSetpointHold.SetpointHoldOff;
                    state.occupiedHeatingSetpoint = 2050;
                }),
                { macrotasks: true },
            );
            await settle();

            expect(device().overriddenSuggestionId).equals(undefined);
            expect(device().activePresetHandle).deep.equals(PRESET_B);
            expect(device().occupiedHeatingSetpoint).equals(2100);
        });
    });

    describe("ActivePresetChange", () => {
        MockForwardFeatures.enable("thermostat-events");

        it("is generated when the thermostat follows a suggestion", async () => {
            const EventsServer = SuggestionsServer.with(
                "Heating",
                "Cooling",
                "AutoMode",
                "Presets",
                "ThermostatSuggestions",
                "Events",
            ).enable({ events: { activePresetChange: true } });
            await using ctx = await online({}, EventsServer);
            const events = new Array<Thermostat.ActivePresetChangeEvent>();
            ctx.device.eventsOf(EventsServer).activePresetChange?.on(payload => {
                events.push(payload);
            });

            await ctx.add({ presetHandle: PRESET_B, effectiveTime: nowS() + 60 });
            await MockTime.advance(Seconds(60));
            await settle();

            expect(events).deep.equals([{ previousPresetHandle: null, currentPresetHandle: PRESET_B }]);
        });
    });
});
