/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

// Type-only regression tests for the legacy `Endpoint` accessor surface in this package. The methods are
// thin wrappers around the modern `@matter/node` Endpoint - this file pins the wrapper signatures so a
// drift between the two layers fails compilation here rather than at downstream callers.
//
// Coverage:
//   * stateOf / maybeStateOf      — typed + string overloads
//   * setStateOf                  — typed + string overloads
//   * commandsOf                  — typed + string overloads
//   * eventsOf                    — typed + string overloads
//   * featuresOf / maybeFeaturesOf — typed + string overloads
//   * get / getStateOf            — selector + string-id overloads delegated from the client endpoint
//
// Assertions are checked at compile time (`satisfies` + `@ts-expect-error`); the runtime body of the
// `it` block never executes.

import { Endpoint } from "#device/Endpoint.js";
import { OnOffClient } from "@matter/node/behaviors/on-off";
import { OperationalCredentialsClient } from "@matter/node/behaviors/operational-credentials";
import { FabricIndex } from "@matter/types";

declare const ep: Endpoint;

describe("Legacy Endpoint get type helpers", () => {
    it("stateOf — typed overload preserves the cluster state shape", () => {
        const _state = () => ep.stateOf(OperationalCredentialsClient);
        type S = ReturnType<typeof _state>;
        ({}) as S satisfies { currentFabricIndex: FabricIndex };
        void _state;
    });

    it("stateOf — string overload returns an untyped record", () => {
        const _state = () => ep.stateOf("operationalCredentials");
        type S = ReturnType<typeof _state>;
        ({}) as S satisfies Record<string, unknown>;
        void _state;
    });

    it("maybeStateOf — typed overload widens to undefined", () => {
        const _state = () => ep.maybeStateOf(OperationalCredentialsClient);
        type S = ReturnType<typeof _state>;
        ({}) as S satisfies { currentFabricIndex: FabricIndex } | undefined;
        void _state;
    });

    it("maybeStateOf — string overload returns Val.Struct | undefined", () => {
        const _state = () => ep.maybeStateOf("operationalCredentials");
        type S = ReturnType<typeof _state>;
        ({}) as S satisfies Record<string, unknown> | undefined;
        void _state;
    });

    it("setStateOf — typed overload accepts a typed patch", () => {
        const _set = () => ep.setStateOf(OperationalCredentialsClient, { currentFabricIndex: FabricIndex(1) });
        type R = ReturnType<typeof _set>;
        void ({} as R satisfies Promise<void>);
        void _set;
    });

    it("setStateOf — string overload accepts a Val.Struct", () => {
        const _set = () => ep.setStateOf("operationalCredentials", { currentFabricIndex: FabricIndex(1) });
        type R = ReturnType<typeof _set>;
        void ({} as R satisfies Promise<void>);
        void _set;
    });

    it("setStateOf — typed overload rejects keys not in the cluster state", () => {
        // @ts-expect-error `bogus` is not a key of OperationalCredentials state
        const _err = () => ep.setStateOf(OperationalCredentialsClient, { bogus: true });
        void _err;
    });

    it("commandsOf — typed overload exposes typed cluster commands", () => {
        const _call = () => ep.commandsOf(OperationalCredentialsClient).removeFabric({ fabricIndex: FabricIndex(1) });
        type R = ReturnType<typeof _call>;
        void ({} as R satisfies Promise<unknown>);
        void _call;
    });

    it("commandsOf — string overload returns an untyped command record", () => {
        const _commands = () => ep.commandsOf("operationalCredentials");
        type R = ReturnType<typeof _commands>;
        ({}) as R satisfies Record<string, unknown>;
        void _commands;
    });

    it("eventsOf — typed overload exposes typed events", () => {
        const _events = () => ep.eventsOf(OperationalCredentialsClient);
        type E = ReturnType<typeof _events>;
        "currentFabricIndex$Changed" satisfies keyof E;
        void _events;
    });

    it("eventsOf — string overload returns an untyped record", () => {
        const _events = () => ep.eventsOf("operationalCredentials");
        type E = ReturnType<typeof _events>;
        ({}) as E satisfies Record<string, unknown>;
        void _events;
    });

    it("featuresOf — typed overload preserves the cluster's feature flag type", () => {
        const _features = () => ep.featuresOf(OnOffClient);
        type F = ReturnType<typeof _features>;
        // `lighting` is one of OnOff's named feature flags.
        ({}) as F satisfies { lighting: boolean };
        void _features;
    });

    it("featuresOf — string overload returns Record<string, boolean>", () => {
        const _features = () => ep.featuresOf("onOff");
        type F = ReturnType<typeof _features>;
        ({}) as F satisfies Record<string, boolean>;
        void _features;
    });

    it("maybeFeaturesOf — typed overload widens to undefined", () => {
        const _features = () => ep.maybeFeaturesOf(OnOffClient);
        type F = ReturnType<typeof _features>;
        ({}) as F satisfies { lighting: boolean } | undefined;
        void _features;
    });

    it("maybeFeaturesOf — string overload returns Record<string, boolean> | undefined", () => {
        const _features = () => ep.maybeFeaturesOf("onOff");
        type F = ReturnType<typeof _features>;
        ({}) as F satisfies Record<string, boolean> | undefined;
        void _features;
    });

    it("globalsOf — typed overload narrows featureMap to the cluster's feature flag type", () => {
        const _globals = () => ep.globalsOf(OnOffClient);
        type G = ReturnType<typeof _globals>;
        ({}) as G satisfies { clusterRevision: number; featureMap: { lighting: boolean } };
        void _globals;
    });

    it("globalsOf — string overload returns the unnarrowed GlobalAttributeState", () => {
        const _globals = () => ep.globalsOf("onOff");
        type G = ReturnType<typeof _globals>;
        ({}) as G satisfies { clusterRevision: number };
        void _globals;
    });

    it("maybeGlobalsOf — typed overload widens to undefined", () => {
        const _globals = () => ep.maybeGlobalsOf(OnOffClient);
        type G = ReturnType<typeof _globals>;
        ({}) as G satisfies { clusterRevision: number; featureMap: { lighting: boolean } } | undefined;
        void _globals;
    });

    it("maybeGlobalsOf — string overload returns GlobalAttributeState | undefined", () => {
        const _globals = () => ep.maybeGlobalsOf("onOff");
        type G = ReturnType<typeof _globals>;
        ({}) as G satisfies { clusterRevision: number } | undefined;
        void _globals;
    });

    it("get — returns a Promise via the underlying client endpoint", () => {
        const _read = () => ep.get();
        type R = ReturnType<typeof _read>;
        void ({} as R satisfies Promise<unknown>);
        void _read;
    });

    it("getStateOf — typed full-state overload returns the cluster state", () => {
        const _read = () => ep.getStateOf(OperationalCredentialsClient);
        type R = Awaited<ReturnType<typeof _read>>;
        ({}) as R satisfies { currentFabricIndex: FabricIndex };
        void _read;
    });

    it("getStateOf — typed key-list overload returns a partial slice", () => {
        const _read = () => ep.getStateOf(OperationalCredentialsClient, ["currentFabricIndex"] as const);
        type R = Awaited<ReturnType<typeof _read>>;
        ({}) as R satisfies { readonly currentFabricIndex?: FabricIndex };
        void _read;
    });

    it("getStateOf — string overload returns Val.Struct", () => {
        const _read = () => ep.getStateOf("operationalCredentials");
        type R = Awaited<ReturnType<typeof _read>>;
        ({}) as R satisfies Record<string, unknown>;
        void _read;
    });

    it("rejects calls with non-string / non-Behavior arguments", () => {
        // @ts-expect-error number is not a valid behavior identifier
        const _e1 = () => ep.stateOf(42);
        // @ts-expect-error number is not a valid behavior identifier
        const _e2 = () => ep.maybeStateOf(42);
        // @ts-expect-error number is not a valid behavior identifier
        const _e3 = () => ep.eventsOf(42);
        // @ts-expect-error number is not a valid behavior identifier
        const _e4 = () => ep.featuresOf(42);
        // @ts-expect-error number is not a valid behavior identifier
        const _e5 = () => ep.maybeFeaturesOf(42);
        // @ts-expect-error number is not a valid behavior identifier
        const _e6 = () => ep.globalsOf(42);
        // @ts-expect-error number is not a valid behavior identifier
        const _e7 = () => ep.maybeGlobalsOf(42);
        void [_e1, _e2, _e3, _e4, _e5, _e6, _e7];
    });
});
