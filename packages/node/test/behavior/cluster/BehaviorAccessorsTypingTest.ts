/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

// Type-only regression tests for the typed behavior accessors on Endpoint, ClientNode and ServerNode:
//
//   * `commandsOf(BehaviorType)` — typed command invocation (incl. feature-gated narrowing)
//   * `stateOf(BehaviorType)`    — typed immutable state access
//   * `setStateOf(BehaviorType)` — typed patch-style state update
//   * `getStateOf(BehaviorType)` — typed read with optional selector arrays
//   * `maybeStateOf(BehaviorType)` — same as stateOf but returns undefined when behavior absent
//   * `eventsOf(BehaviorType)`   — typed event accessor
//   * `set(...)` / `get(...)`    — patch / read across all behaviors with narrowed shape
//
// Suites are split by node side so the audit surface for each direction is obvious:
//
//   * "server-side" — ServerNode and server-cluster endpoints (OnOffServer, ThermostatServer, …)
//   * "client-side" — ClientNode and client-cluster behaviors  (OperationalCredentialsClient, …)
//   * "string overloads" — common to both, returns untyped Val.Struct
//
// All assertions run at type-check time (`satisfies` / `@ts-expect-error`).  A regression makes
// `npm run build -w @matter/node` fail without invoking any runtime behavior.
//
// Builders are arrow functions whose bodies never execute; we only extract their `ReturnType`.

import { OnOffServer } from "#behaviors/on-off";
import { OperationalCredentialsClient } from "#behaviors/operational-credentials";
import { ThermostatServer } from "#behaviors/thermostat";
import { Endpoint } from "#endpoint/Endpoint.js";
import { SupportedBehaviors } from "#endpoint/properties/SupportedBehaviors.js";
import { MutableEndpoint } from "#endpoint/type/MutableEndpoint.js";
import { ClientNode } from "#node/ClientNode.js";
import { ServerNode } from "#node/ServerNode.js";
import { DeviceClassification } from "@matter/model";
import { DeviceTypeId, FabricIndex } from "@matter/types";
import { Thermostat } from "@matter/types/clusters/thermostat";

// ---- typed handles ----------------------------------------------------------------------------

declare const cnode: ClientNode;
declare const snode: ServerNode;
declare const endpoint: Endpoint;

// Server-side endpoint fixtures ------------------------------------------------------------------

const ThermostatEndpoint = MutableEndpoint({
    name: "ThermostatEndpoint",
    deviceType: DeviceTypeId(0x301),
    deviceRevision: 1,
    deviceClass: DeviceClassification.Simple,
    behaviors: SupportedBehaviors(ThermostatServer),
});

const ThermostatPresetsEndpoint = MutableEndpoint({
    name: "ThermostatPresetsEndpoint",
    deviceType: DeviceTypeId(0x301),
    deviceRevision: 1,
    deviceClass: DeviceClassification.Simple,
    behaviors: SupportedBehaviors(ThermostatServer.with(Thermostat.Feature.Presets)),
});

const OnOffSubEndpoint = MutableEndpoint({
    name: "OnOffSubEndpoint",
    deviceType: DeviceTypeId(0x100),
    deviceRevision: 1,
    deviceClass: DeviceClassification.Simple,
    behaviors: SupportedBehaviors(OnOffServer),
});

declare const thermostatEndpoint: Endpoint<typeof ThermostatEndpoint>;
declare const thermostatPresetsEndpoint: Endpoint<typeof ThermostatPresetsEndpoint>;
declare const onOffEndpoint: Endpoint<typeof OnOffSubEndpoint>;

describe("Behavior accessors typing", () => {
    // ===========================================================================================
    // Server-side accessors — ServerNode and server-cluster endpoints
    // ===========================================================================================

    describe("server-side (ServerNode + server endpoints)", () => {
        describe("commandsOf", () => {
            it("invokes a parameter-less command (toggle) on a server endpoint", () => {
                const _call = () => onOffEndpoint.commandsOf(OnOffServer).toggle();
                type R = ReturnType<typeof _call>;
                void ({} as R satisfies Promise<unknown>);
                void _call;
            });

            it("invokes a base-component command (setpointRaiseLower) on a bare ThermostatServer endpoint", () => {
                const _call = () =>
                    thermostatEndpoint.commandsOf(ThermostatServer).setpointRaiseLower({
                        mode: Thermostat.SetpointRaiseLowerMode.Heat,
                        amount: 1,
                    });
                type R = ReturnType<typeof _call>;
                void ({} as R satisfies Promise<unknown>);
                void _call;
            });

            it("rejects an unknown command on bare ThermostatServer endpoint", () => {
                // setActivePresetRequest is gated on the Presets feature.  Without `.with(...)` the key must be absent.
                const _err = () =>
                    // @ts-expect-error setActivePresetRequest absent without Presets feature
                    thermostatEndpoint.commandsOf(ThermostatServer).setActivePresetRequest({ presetHandle: null });
                void _err;
            });

            it("exposes feature-gated commands via .with()", () => {
                const _call = () =>
                    thermostatPresetsEndpoint
                        .commandsOf(ThermostatServer.with(Thermostat.Feature.Presets))
                        .setActivePresetRequest({ presetHandle: null });
                type R = ReturnType<typeof _call>;
                void ({} as R satisfies Promise<unknown>);
                void _call;
            });

            it("rejects malformed input on a typed command", () => {
                const _err = () =>
                    onOffEndpoint.commandsOf(OnOffServer).on(
                        // @ts-expect-error `on` takes no input — passing arguments must be rejected
                        { not: "valid" },
                    );
                void _err;
            });

            it("accepts an optional context argument on every command (Command<...> shape)", () => {
                // A typed command always allows an optional `context` argument as the last parameter.  The exact
                // shape of the context is internal — we only assert the call typechecks with `undefined`.
                const _call = () => onOffEndpoint.commandsOf(OnOffServer).toggle(undefined, undefined);
                void _call;
            });
        });

        describe("stateOf / maybeStateOf", () => {
            it("returns the cluster state shape on a server endpoint", () => {
                const _state = () => onOffEndpoint.stateOf(OnOffServer);
                type S = ReturnType<typeof _state>;
                ({}) as S satisfies { onOff: boolean };
            });

            it("maybeStateOf widens to undefined", () => {
                const _state = () => onOffEndpoint.maybeStateOf(OnOffServer);
                type S = ReturnType<typeof _state>;
                ({}) as S satisfies { onOff: boolean } | undefined;
            });
        });

        describe("setStateOf", () => {
            it("accepts a partial patch shape that matches the cluster state", () => {
                const _set = () => onOffEndpoint.setStateOf(OnOffServer, { onOff: true });
                type R = ReturnType<typeof _set>;
                void ({} as R satisfies Promise<void>);
                void _set;
            });

            it("rejects keys that are not part of the cluster state", () => {
                // @ts-expect-error `bogus` is not a key of OnOff state
                const _err = () => onOffEndpoint.setStateOf(OnOffServer, { bogus: true });
                void _err;
            });

            it("rejects values whose type does not match the attribute", () => {
                // @ts-expect-error onOff is boolean, not number
                const _err = () => onOffEndpoint.setStateOf(OnOffServer, { onOff: 7 });
                void _err;
            });

            it("rejects feature-gated attributes when the feature is not selected", () => {
                // @ts-expect-error activePresetHandle is gated on the Presets feature
                const _err = () => thermostatEndpoint.setStateOf(ThermostatServer, { activePresetHandle: null });
                void _err;
            });
        });

        describe("getStateOf", () => {
            it("returns the full cluster state when no selector is provided", () => {
                const _read = () => onOffEndpoint.getStateOf(OnOffServer);
                type R = Awaited<ReturnType<typeof _read>>;
                ({}) as R satisfies { onOff: boolean };
            });

            it("returns a partial slice when a key-list selector is provided", () => {
                const _read = () => onOffEndpoint.getStateOf(OnOffServer, ["onOff"] as const);
                type R = Awaited<ReturnType<typeof _read>>;
                // Selector branch widens each requested key to `T | undefined`.
                ({}) as R satisfies { readonly onOff?: boolean };
            });

            it("rejects a selector containing keys that don't exist on the cluster state", () => {
                // @ts-expect-error `bogus` is not a key of OnOff state
                const _err = () => onOffEndpoint.getStateOf(OnOffServer, ["bogus"] as const);
                void _err;
            });
        });

        describe("eventsOf", () => {
            it("returns the event shape for a behavior on Endpoint", () => {
                const _events = () => onOffEndpoint.eventsOf(OnOffServer);
                // `onOff$Changing` / `onOff$Changed` are always present for base attributes.
                type E = ReturnType<typeof _events>;
                "onOff$Changing" satisfies keyof E;
                "onOff$Changed" satisfies keyof E;
            });
        });

        describe("multi-behavior set / get", () => {
            it("accepts a behavior-keyed patch shape", () => {
                const _set = () => onOffEndpoint.set({ onOff: { onOff: true } });
                type R = ReturnType<typeof _set>;
                void ({} as R satisfies Promise<void>);
                void _set;
            });

            it("rejects unknown behavior keys", () => {
                const _err = () =>
                    onOffEndpoint.set({
                        // @ts-expect-error endpoint does not declare a `thermostat` behavior
                        thermostat: { localTemperature: 1 },
                    });
                void _err;
            });

            it("get() returns the full state shape", () => {
                const _read = () => onOffEndpoint.get();
                type R = Awaited<ReturnType<typeof _read>>;
                ({}) as R satisfies { onOff: { onOff: boolean } };
            });

            it("get(behavior-included selector) returns a narrowed slice", () => {
                // Selector keys are behavior IDs.  `{ onOff: true }` means "include the whole onOff behavior".
                const _read = () => onOffEndpoint.get({ onOff: true } as const);
                type R = Awaited<ReturnType<typeof _read>>;
                ({}) as R satisfies { onOff?: { onOff?: boolean } };
            });

            it("get(per-behavior attribute selector) returns a narrowed slice", () => {
                // A behavior may also be selected by attribute key list.  Each requested attribute is widened to
                // `T | undefined` to reflect partial-state-on-failure semantics on client endpoints.
                const _read = () => onOffEndpoint.get({ onOff: ["onOff"] } as const);
                type R = Awaited<ReturnType<typeof _read>>;
                ({}) as R satisfies { onOff?: { onOff?: boolean } };
            });
        });

        describe("ServerNode root", () => {
            it("ServerNode.stateOf returns the cluster state shape", () => {
                // OperationalCredentialsClient is a complete-cluster type accepted by stateOf — used here to assert
                // that the typed root accessor preserves the shape across a real cluster definition.
                const _state = () => snode.stateOf(OperationalCredentialsClient);
                type S = ReturnType<typeof _state>;
                ({}) as S satisfies { currentFabricIndex: FabricIndex };
            });

            it("ServerNode.getStateOf returns a typed promise", () => {
                const _read = () => snode.getStateOf(OperationalCredentialsClient);
                type R = Awaited<ReturnType<typeof _read>>;
                ({}) as R satisfies { currentFabricIndex: FabricIndex };
            });
        });
    });

    // ===========================================================================================
    // Client-side accessors — ClientNode and client-cluster behaviors
    // ===========================================================================================

    describe("client-side (ClientNode + client behaviors)", () => {
        describe("commandsOf", () => {
            it("invokes a ClientNode command with the expected request type (user-reported pattern)", () => {
                // The exact shape reported as broken: `node.commandsOf(OperationalCredentialsClient).removeFabric(...)`.
                const _call = () =>
                    cnode.commandsOf(OperationalCredentialsClient).removeFabric({ fabricIndex: FabricIndex(1) });
                type R = ReturnType<typeof _call>;
                void ({} as R satisfies Promise<unknown>);
                void _call;
            });

            it("returns a Promise-typed function (Command<...> shape)", () => {
                const _call = () =>
                    cnode.commandsOf(OperationalCredentialsClient).removeFabric({ fabricIndex: FabricIndex(1) });
                type R = ReturnType<typeof _call>;
                void ({} as R satisfies Promise<unknown>);
            });
        });

        describe("stateOf / maybeStateOf", () => {
            it("returns the cluster state shape on ClientNode root", () => {
                // ClientNode root endpoint embeds CommissioningClient + NetworkClient — plain `stateOf(Behavior)`
                // works on any cluster behavior the peer advertises.
                const _state = () => cnode.stateOf(OperationalCredentialsClient);
                type S = ReturnType<typeof _state>;
                // OperationalCredentials always exposes `currentFabricIndex` (mandatory base attribute).
                ({}) as S satisfies { currentFabricIndex: FabricIndex };
            });

            it("maybeStateOf widens to undefined", () => {
                const _state = () => cnode.maybeStateOf(OperationalCredentialsClient);
                type S = ReturnType<typeof _state>;
                ({}) as S satisfies { currentFabricIndex: FabricIndex } | undefined;
            });
        });

        describe("setStateOf", () => {
            it("accepts a typed partial state on ClientNode", () => {
                const _set = () =>
                    cnode.setStateOf(OperationalCredentialsClient, { currentFabricIndex: FabricIndex(1) });
                type R = ReturnType<typeof _set>;
                void ({} as R satisfies Promise<void>);
            });

            it("rejects keys that are not part of the cluster state", () => {
                // @ts-expect-error `bogus` is not a key of OperationalCredentials state
                const _err = () => cnode.setStateOf(OperationalCredentialsClient, { bogus: true });
                void _err;
            });

            it("rejects values whose type does not match the attribute", () => {
                // @ts-expect-error currentFabricIndex is a FabricIndex brand, not a plain string
                const _err = () => cnode.setStateOf(OperationalCredentialsClient, { currentFabricIndex: "x" });
                void _err;
            });
        });

        describe("getStateOf", () => {
            it("returns the full cluster state when no selector is provided", () => {
                const _read = () => cnode.getStateOf(OperationalCredentialsClient);
                type R = Awaited<ReturnType<typeof _read>>;
                ({}) as R satisfies { currentFabricIndex: FabricIndex };
            });

            it("returns a partial slice when a key-list selector is provided", () => {
                const _read = () => cnode.getStateOf(OperationalCredentialsClient, ["currentFabricIndex"] as const);
                type R = Awaited<ReturnType<typeof _read>>;
                ({}) as R satisfies { readonly currentFabricIndex?: FabricIndex };
            });

            it("rejects a selector containing keys that don't exist on the cluster state", () => {
                // @ts-expect-error `bogus` is not a key of OperationalCredentials state
                const _err = () => cnode.getStateOf(OperationalCredentialsClient, ["bogus"] as const);
                void _err;
            });
        });

        describe("eventsOf", () => {
            it("returns the event shape on ClientNode root", () => {
                const _events = () => cnode.eventsOf(OperationalCredentialsClient);
                type E = ReturnType<typeof _events>;
                "currentFabricIndex$Changed" satisfies keyof E;
            });
        });
    });

    // ===========================================================================================
    // String overloads — common fallback shape (Val.Struct), independent of node side
    // ===========================================================================================

    describe("string overloads (untyped fallbacks)", () => {
        it("stateOf(string) returns Val.Struct (untyped record)", () => {
            const _state = () => endpoint.stateOf("descriptor");
            type S = ReturnType<typeof _state>;
            ({}) as S satisfies Record<string, unknown>;
        });

        it("setStateOf(string, ...) accepts Val.Struct", () => {
            const _set = () => endpoint.setStateOf("onOff", { onOff: true });
            type R = ReturnType<typeof _set>;
            void ({} as R satisfies Promise<void>);
            void _set;
        });

        it("getStateOf(string, ...) returns Val.Struct", () => {
            const _read = () => endpoint.getStateOf("onOff");
            type R = Awaited<ReturnType<typeof _read>>;
            ({}) as R satisfies Record<string, unknown>;
        });

        it("eventsOf(string) returns a record of Observable | undefined", () => {
            const _events = () => endpoint.eventsOf("onOff");
            type E = ReturnType<typeof _events>;
            ({}) as E satisfies Record<string, unknown>;
        });
    });
});
