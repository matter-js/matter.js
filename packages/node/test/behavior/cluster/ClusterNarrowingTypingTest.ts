/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { OperationalStateServer } from "#behaviors/operational-state";
import { SwitchServer } from "#behaviors/switch";
import { ThermostatServer } from "#behaviors/thermostat";
import { Endpoint } from "#endpoint/Endpoint.js";
import { SupportedBehaviors } from "#endpoint/properties/SupportedBehaviors.js";
import { MutableEndpoint } from "#endpoint/type/MutableEndpoint.js";
import { DeviceClassification } from "@matter/model";
import { DeviceTypeId } from "@matter/types";
import { Switch } from "@matter/types/clusters/switch";
import { Thermostat } from "@matter/types/clusters/thermostat";

// Regression tests for narrowing via `.for(Namespace)` and `.with(...features)` on a cluster behavior.
//
// Matter-bridge (and any downstream consumer using the typed overloads) expects:
//
//   * `endpoint.eventsOf(SwitchServer)` — feature-gated events absent
//   * `endpoint.stateOf(SwitchServer)`  — feature-gated attributes absent, custom state retained
//   * `.with(feature)`                  — only that feature's events / attrs become visible
//   * `.with(...).enable({ ... })`      — enabled events/attrs become mandatory (no `?`)
//
// These assertions run at type-check time (`satisfies` / `@ts-expect-error`).  A regression causes
// `npm run build -w @matter/node` to fail — no runtime behavior is invoked.
//
// Builders are arrow functions whose bodies never execute; we only extract their `ReturnType`.

const endpoint = {} as Endpoint;

// ---- eventsOf ----------------------------------------------------------------------------------

const _eventsBare = () => endpoint.eventsOf(SwitchServer);
const _eventsWithMomentary = () => endpoint.eventsOf(SwitchServer.with(Switch.Feature.MomentarySwitch));
const _eventsWithLatching = () => endpoint.eventsOf(SwitchServer.with(Switch.Feature.LatchingSwitch));
const _eventsEnabled = () =>
    endpoint.eventsOf(
        SwitchServer.with(
            Switch.Feature.MomentarySwitch,
            Switch.Feature.MomentarySwitchRelease,
            Switch.Feature.MomentarySwitchLongPress,
            Switch.Feature.MomentarySwitchMultiPress,
        ).enable({
            events: {
                initialPress: true,
                longPress: true,
                shortRelease: true,
                longRelease: true,
                multiPressOngoing: true,
                multiPressComplete: true,
            },
        }),
    );

type EventsBare = ReturnType<typeof _eventsBare>;
type EventsWithMomentary = ReturnType<typeof _eventsWithMomentary>;
type EventsWithLatching = ReturnType<typeof _eventsWithLatching>;
type EventsEnabled = ReturnType<typeof _eventsEnabled>;

// ---- stateOf -----------------------------------------------------------------------------------

const _stateBare = () => endpoint.stateOf(SwitchServer);
const _stateWithMultiPress = () => endpoint.stateOf(SwitchServer.with(Switch.Feature.MomentarySwitchMultiPress));
const _stateEnabledAttr = () =>
    endpoint.stateOf(
        SwitchServer.with(Switch.Feature.MomentarySwitchMultiPress).enable({
            attributes: { multiPressMax: true },
        }),
    );

type StateBare = ReturnType<typeof _stateBare>;
type StateWithMultiPress = ReturnType<typeof _stateWithMultiPress>;
type StateEnabledAttr = ReturnType<typeof _stateEnabledAttr>;

// ---- attribute change observables (xxx$Changing / xxx$Changed) ---------------------------------

const _obsBare = () => endpoint.eventsOf(SwitchServer);
const _obsWithMultiPress = () => endpoint.eventsOf(SwitchServer.with(Switch.Feature.MomentarySwitchMultiPress));
const _obsEnabledAttr = () =>
    endpoint.eventsOf(
        SwitchServer.with(Switch.Feature.MomentarySwitchMultiPress).enable({
            attributes: { multiPressMax: true },
        }),
    );

type ObsBare = ReturnType<typeof _obsBare>;
type ObsWithMultiPress = ReturnType<typeof _obsWithMultiPress>;
type ObsEnabledAttr = ReturnType<typeof _obsEnabledAttr>;

// ---- commandsOf --------------------------------------------------------------------------------

const _commandsBare = () => endpoint.commandsOf(ThermostatServer);
const _commandsWithSchedule = () =>
    endpoint.commandsOf(ThermostatServer.with(Thermostat.Feature.MatterScheduleConfiguration));
const _commandsWithPresets = () => endpoint.commandsOf(ThermostatServer.with(Thermostat.Feature.Presets));

type CommandsBare = ReturnType<typeof _commandsBare>;
type CommandsWithSchedule = ReturnType<typeof _commandsWithSchedule>;
type CommandsWithPresets = ReturnType<typeof _commandsWithPresets>;

// ---- .alter({ optional: false }) flips optional -> mandatory -----------------------------------

// OperationalState has `countdownTime?: number | null` (optional attr) and
// `operationCompletion?: OperationCompletionEvent` (optional event) in BaseAttributes / BaseEvents.
// Both are always applicable (base component, no feature gating) — perfect `.alter()` targets.

const _stateOpsBare = () => endpoint.stateOf(OperationalStateServer);
const _stateOpsAltered = () =>
    endpoint.stateOf(OperationalStateServer.alter({ attributes: { countdownTime: { optional: false } } }));
const _eventsOpsBare = () => endpoint.eventsOf(OperationalStateServer);
const _eventsOpsAltered = () =>
    endpoint.eventsOf(OperationalStateServer.alter({ events: { operationCompletion: { optional: false } } }));

type StateOpsBare = ReturnType<typeof _stateOpsBare>;
type StateOpsAltered = ReturnType<typeof _stateOpsAltered>;
type EventsOpsBare = ReturnType<typeof _eventsOpsBare>;
type EventsOpsAltered = ReturnType<typeof _eventsOpsAltered>;

// ---- endpoint.set() patch-shape narrowing ------------------------------------------------------

const BareSwitchEndpoint = MutableEndpoint({
    name: "BareSwitchEndpoint",
    deviceType: DeviceTypeId(0xf),
    deviceRevision: 3,
    deviceClass: DeviceClassification.Simple,
    behaviors: SupportedBehaviors(SwitchServer),
});
const MsmSwitchEndpoint = MutableEndpoint({
    name: "MsmSwitchEndpoint",
    deviceType: DeviceTypeId(0xf),
    deviceRevision: 3,
    deviceClass: DeviceClassification.Simple,
    behaviors: SupportedBehaviors(SwitchServer.with(Switch.Feature.MomentarySwitchMultiPress)),
});

declare const bareSwitchEndpoint: Endpoint<typeof BareSwitchEndpoint>;
declare const msmSwitchEndpoint: Endpoint<typeof MsmSwitchEndpoint>;

describe("Cluster narrowing typing", () => {
    describe("eventsOf narrowing via .for()", () => {
        it("hides feature-gated events on bare SwitchServer", () => {
            // @ts-expect-error initialPress is a MomentarySwitch-gated event
            ({}) as EventsBare satisfies { initialPress: unknown };
            // @ts-expect-error switchLatched is a LatchingSwitch-gated event
            ({}) as EventsBare satisfies { switchLatched: unknown };
            // @ts-expect-error longPress is a MomentarySwitchLongPress-gated event
            ({}) as EventsBare satisfies { longPress: unknown };
            // @ts-expect-error shortRelease is a MomentarySwitchRelease-gated event
            ({}) as EventsBare satisfies { shortRelease: unknown };
        });

        it("exposes MomentarySwitch events after .with(MomentarySwitch)", () => {
            // Presence: asserts initialPress is a key on the narrowed type.  A regression that drops the
            // key entirely would fail here (optional-shape `satisfies` alone doesn't prove presence).
            "initialPress" satisfies keyof EventsWithMomentary;
            ({}) as EventsWithMomentary satisfies { initialPress?: unknown };
            // @ts-expect-error switchLatched still absent without LatchingSwitch
            ({}) as EventsWithMomentary satisfies { switchLatched: unknown };
        });

        it("exposes LatchingSwitch events after .with(LatchingSwitch)", () => {
            "switchLatched" satisfies keyof EventsWithLatching;
            ({}) as EventsWithLatching satisfies { switchLatched?: unknown };
            // @ts-expect-error initialPress still absent without MomentarySwitch
            ({}) as EventsWithLatching satisfies { initialPress: unknown };
        });

        it("marks enabled events mandatory via .enable()", () => {
            // Mandatory (not optional) — no `?:` on the target shape.
            ({}) as EventsEnabled satisfies {
                initialPress: unknown;
                longPress: unknown;
                shortRelease: unknown;
                longRelease: unknown;
                multiPressOngoing: unknown;
                multiPressComplete: unknown;
            };
        });
    });

    describe("stateOf narrowing via .for()", () => {
        it("retains base-component attributes on bare SwitchServer", () => {
            ({}) as StateBare satisfies { numberOfPositions: number; currentPosition: number };
        });

        it("hides feature-gated attributes on bare SwitchServer", () => {
            // @ts-expect-error multiPressMax is a MomentarySwitchMultiPress-gated attribute
            ({}) as StateBare satisfies { multiPressMax: number };
        });

        it("retains custom server-side state (rawPosition, etc.)", () => {
            ({}) as StateBare satisfies {
                rawPosition: number;
                longPressDelay: unknown;
                multiPressDelay: unknown;
                momentaryNeutralPosition: number;
            };
        });

        it("exposes multiPressMax as optional after .with(MomentarySwitchMultiPress)", () => {
            "multiPressMax" satisfies keyof StateWithMultiPress;
            ({}) as StateWithMultiPress satisfies { multiPressMax?: number };
        });

        it("marks multiPressMax mandatory via .enable()", () => {
            ({}) as StateEnabledAttr satisfies { multiPressMax: number };
        });
    });

    describe("attribute change observables narrowing via .for()", () => {
        it("retains base-component attribute change observables on bare SwitchServer", () => {
            ({}) as ObsBare satisfies {
                numberOfPositions$Changing: unknown;
                numberOfPositions$Changed: unknown;
                currentPosition$Changing: unknown;
                currentPosition$Changed: unknown;
            };
        });

        it("hides feature-gated attribute change observables on bare SwitchServer", () => {
            // @ts-expect-error multiPressMax$Changing is gated on MomentarySwitchMultiPress
            ({}) as ObsBare satisfies { multiPressMax$Changing: unknown };
            // @ts-expect-error multiPressMax$Changed is gated on MomentarySwitchMultiPress
            ({}) as ObsBare satisfies { multiPressMax$Changed: unknown };
        });

        it("retains custom server-side change observables (rawPosition)", () => {
            ({}) as ObsBare satisfies {
                rawPosition$Changing: unknown;
                rawPosition$Changed: unknown;
            };
        });

        it("exposes multiPressMax$Changing/$Changed as optional after .with(MomentarySwitchMultiPress)", () => {
            "multiPressMax$Changing" satisfies keyof ObsWithMultiPress;
            "multiPressMax$Changed" satisfies keyof ObsWithMultiPress;
            ({}) as ObsWithMultiPress satisfies {
                multiPressMax$Changing?: unknown;
                multiPressMax$Changed?: unknown;
            };
        });

        it("marks multiPressMax$Changing/$Changed mandatory via .enable({ attributes: ... })", () => {
            ({}) as ObsEnabledAttr satisfies {
                multiPressMax$Changing: unknown;
                multiPressMax$Changed: unknown;
            };
        });
    });

    describe("commandsOf narrowing via .for()", () => {
        it("retains base-component commands on bare ThermostatServer", () => {
            ({}) as CommandsBare satisfies { setpointRaiseLower: unknown };
        });

        it("hides feature-gated commands on bare ThermostatServer", () => {
            // @ts-expect-error setActiveScheduleRequest is gated on MatterScheduleConfiguration
            ({}) as CommandsBare satisfies { setActiveScheduleRequest: unknown };
            // @ts-expect-error setActivePresetRequest is gated on Presets
            ({}) as CommandsBare satisfies { setActivePresetRequest: unknown };
            // @ts-expect-error atomicRequest is gated on Presets | MatterScheduleConfiguration
            ({}) as CommandsBare satisfies { atomicRequest: unknown };
        });

        it("exposes MatterScheduleConfiguration commands after .with(MatterScheduleConfiguration)", () => {
            ({}) as CommandsWithSchedule satisfies {
                setpointRaiseLower: unknown;
                setActiveScheduleRequest: unknown;
                atomicRequest: unknown;
            };
            // @ts-expect-error setActivePresetRequest still gated on Presets
            ({}) as CommandsWithSchedule satisfies { setActivePresetRequest: unknown };
        });

        it("exposes Presets commands after .with(Presets)", () => {
            ({}) as CommandsWithPresets satisfies {
                setpointRaiseLower: unknown;
                setActivePresetRequest: unknown;
                atomicRequest: unknown;
            };
            // @ts-expect-error setActiveScheduleRequest still gated on MatterScheduleConfiguration
            ({}) as CommandsWithPresets satisfies { setActiveScheduleRequest: unknown };
        });
    });

    describe(".alter({ optional: false }) flips optional to mandatory", () => {
        it("leaves countdownTime optional on bare OperationalStateServer", () => {
            // Presence first — optional-shape `satisfies` below would pass even if the key is absent.
            "countdownTime" satisfies keyof StateOpsBare;
            ({}) as StateOpsBare satisfies { countdownTime?: number | null };
            // @ts-expect-error countdownTime is optional on the base — must not be mandatory here
            ({}) as StateOpsBare satisfies { countdownTime: number | null };
        });

        it("makes countdownTime mandatory via .alter()", () => {
            ({}) as StateOpsAltered satisfies { countdownTime: number | null };
        });

        it("leaves operationCompletion optional on bare OperationalStateServer", () => {
            "operationCompletion" satisfies keyof EventsOpsBare;
            // @ts-expect-error operationCompletion is optional on the base — must not be mandatory here
            ({}) as EventsOpsBare satisfies { operationCompletion: unknown };
        });

        it("makes operationCompletion mandatory via .alter()", () => {
            ({}) as EventsOpsAltered satisfies { operationCompletion: unknown };
        });
    });

    describe("endpoint.set() patch-shape narrowing", () => {
        it("rejects feature-gated attributes on bare SwitchServer endpoint", () => {
            // Arrow bodies are type-checked but never invoked — `bareSwitchEndpoint` is `declare const`.
            const _ok = () => bareSwitchEndpoint.set({ switch: { numberOfPositions: 3 } });
            const _err = () =>
                bareSwitchEndpoint.set({
                    switch: {
                        // @ts-expect-error multiPressMax is not a valid patch key without MomentarySwitchMultiPress
                        multiPressMax: 3,
                    },
                });
            void _ok;
            void _err;
        });

        it("accepts feature-gated attributes after .with(MomentarySwitchMultiPress)", () => {
            const _msmOnly = () => msmSwitchEndpoint.set({ switch: { multiPressMax: 3 } });
            const _combined = () => msmSwitchEndpoint.set({ switch: { numberOfPositions: 3, multiPressMax: 3 } });
            void _msmOnly;
            void _combined;
        });
    });

    describe("Endpoint constructor InputStateOf narrowing", () => {
        it("rejects feature-gated attributes in options arg on bare SwitchServer endpoint", () => {
            // `new Endpoint(type, options?)` overload — options is BehaviorOptions<T>.
            // Overload resolution reports excess-property errors at the call site, so the
            // expect-error directive must sit immediately above the `new Endpoint(...)` invocation.
            const _baseOk = () => new Endpoint(BareSwitchEndpoint, { switch: { numberOfPositions: 3 } });
            const _featureErr = () =>
                // @ts-expect-error multiPressMax is absent from bare SwitchServer InputStateOf
                new Endpoint(BareSwitchEndpoint, { switch: { multiPressMax: 3 } });
            void _baseOk;
            void _featureErr;
        });

        it("rejects feature-gated attributes in single-arg Configuration on bare SwitchServer endpoint", () => {
            // `new Endpoint(config)` overload — config = Configuration<T> = Options<T> & { type: T }.
            const _baseOk = () => new Endpoint({ type: BareSwitchEndpoint, switch: { numberOfPositions: 3 } });
            const _featureErr = () =>
                // @ts-expect-error multiPressMax is absent from bare SwitchServer InputStateOf
                new Endpoint({ type: BareSwitchEndpoint, switch: { multiPressMax: 3 } });
            void _baseOk;
            void _featureErr;
        });

        it("accepts feature-gated attributes after .with(MomentarySwitchMultiPress)", () => {
            const _twoArg = () => new Endpoint(MsmSwitchEndpoint, { switch: { multiPressMax: 3 } });
            const _oneArg = () => new Endpoint({ type: MsmSwitchEndpoint, switch: { multiPressMax: 3 } });
            void _twoArg;
            void _oneArg;
        });
    });

    // Behavior subclasses extending a narrowed base must see `this.state` / `this.events` narrowed to the
    // currently-selected feature set.  These classes are declared but never instantiated — type-check only.
    describe("subclass this.state / this.events narrowing", () => {
        it("bare SwitchServer subclass hides feature-gated state and events", () => {
            class BareSwitchSubclass extends SwitchServer {
                override initialize() {
                    // Base-component members are always present.
                    const _np: number = this.state.numberOfPositions;
                    void _np;

                    // @ts-expect-error multiPressMax is absent on bare SwitchServer state
                    this.state.multiPressMax;
                    // @ts-expect-error multiPressMax$Changing is absent on bare SwitchServer events
                    this.events.multiPressMax$Changing;
                    // @ts-expect-error initialPress is absent without MomentarySwitch
                    this.events.initialPress;
                }
            }
            void BareSwitchSubclass;
        });

        it("SwitchServer.with(MomentarySwitchMultiPress) subclass exposes MSM state + change observables", () => {
            class MsmSwitchSubclass extends SwitchServer.with(Switch.Feature.MomentarySwitchMultiPress) {
                override initialize() {
                    // multiPressMax may be absent (optional) at runtime — type accepts number | undefined.
                    const _mpm: number | undefined = this.state.multiPressMax;
                    void _mpm;

                    const _changing = this.events.multiPressMax$Changing;
                    const _changed = this.events.multiPressMax$Changed;
                    void _changing;
                    void _changed;

                    // @ts-expect-error switchLatched still absent without LatchingSwitch
                    this.events.switchLatched;
                }
            }
            void MsmSwitchSubclass;
        });

        it("SwitchServer.with(MomentarySwitch) subclass exposes initialPress in reactors", () => {
            class MomentarySwitchSubclass extends SwitchServer.with(Switch.Feature.MomentarySwitch) {
                override initialize() {
                    const _obs = this.events.initialPress;
                    void _obs;

                    // @ts-expect-error longPress still absent without MomentarySwitchLongPress
                    this.events.longPress;
                }
            }
            void MomentarySwitchSubclass;
        });

        it("enabled-event subclass sees event as mandatory (no optional chaining needed)", () => {
            class EnabledMomentarySwitchSubclass extends SwitchServer.with(Switch.Feature.MomentarySwitch).enable({
                events: { initialPress: true },
            }) {
                override initialize() {
                    // Mandatory access — no `?.` needed.  A regression making initialPress optional would
                    // turn `.emit` into `.emit | undefined` and break the assignment below.
                    const emit: (...args: never[]) => unknown = this.events.initialPress.emit as unknown as (
                        ...args: never[]
                    ) => unknown;
                    void emit;
                }
            }
            void EnabledMomentarySwitchSubclass;
        });
    });
});
