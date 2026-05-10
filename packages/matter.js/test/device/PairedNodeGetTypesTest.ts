/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

// Type-only regression tests for the legacy `PairedNode` accessor surface in this package. The methods
// are thin wrappers around the modern `@matter/node` ClientNode root endpoint - this file pins the
// wrapper signatures so a drift between the two layers fails compilation here rather than at downstream
// callers.

import { PairedNode } from "#device/PairedNode.js";
import { OnOffClient } from "@matter/node/behaviors/on-off";
import { OperationalCredentialsClient } from "@matter/node/behaviors/operational-credentials";
import { FabricIndex } from "@matter/types";

declare const node: PairedNode;

describe("Legacy PairedNode get type helpers", () => {
    it("stateOf — typed overload preserves the cluster state shape", () => {
        const _state = () => node.stateOf(OperationalCredentialsClient);
        type S = ReturnType<typeof _state>;
        ({}) as S satisfies { currentFabricIndex: FabricIndex };
        void _state;
    });

    it("stateOf — string overload returns an untyped record", () => {
        const _state = () => node.stateOf("operationalCredentials");
        type S = ReturnType<typeof _state>;
        ({}) as S satisfies Record<string, unknown>;
        void _state;
    });

    it("maybeStateOf — typed overload widens to undefined", () => {
        const _state = () => node.maybeStateOf(OperationalCredentialsClient);
        type S = ReturnType<typeof _state>;
        ({}) as S satisfies { currentFabricIndex: FabricIndex } | undefined;
        void _state;
    });

    it("maybeStateOf — string overload returns Val.Struct | undefined", () => {
        const _state = () => node.maybeStateOf("operationalCredentials");
        type S = ReturnType<typeof _state>;
        ({}) as S satisfies Record<string, unknown> | undefined;
        void _state;
    });

    it("commandsOf — typed overload exposes typed cluster commands", () => {
        const _call = () => node.commandsOf(OperationalCredentialsClient).removeFabric({ fabricIndex: FabricIndex(1) });
        type R = ReturnType<typeof _call>;
        void ({} as R satisfies Promise<unknown>);
        void _call;
    });

    it("commandsOf — string overload returns an untyped command record", () => {
        const _commands = () => node.commandsOf("operationalCredentials");
        type R = ReturnType<typeof _commands>;
        ({}) as R satisfies Record<string, unknown>;
        void _commands;
    });

    it("eventsOf — typed overload exposes typed events", () => {
        const _events = () => node.eventsOf(OperationalCredentialsClient);
        type E = ReturnType<typeof _events>;
        "currentFabricIndex$Changed" satisfies keyof E;
        void _events;
    });

    it("eventsOf — string overload returns an untyped record", () => {
        const _events = () => node.eventsOf("operationalCredentials");
        type E = ReturnType<typeof _events>;
        ({}) as E satisfies Record<string, unknown>;
        void _events;
    });

    it("featuresOf — typed overload preserves the cluster's feature flag type", () => {
        const _features = () => node.featuresOf(OnOffClient);
        type F = ReturnType<typeof _features>;
        ({}) as F satisfies { lighting: boolean };
        void _features;
    });

    it("featuresOf — string overload returns Record<string, boolean>", () => {
        const _features = () => node.featuresOf("onOff");
        type F = ReturnType<typeof _features>;
        ({}) as F satisfies Record<string, boolean>;
        void _features;
    });

    it("maybeFeaturesOf — typed overload widens to undefined", () => {
        const _features = () => node.maybeFeaturesOf(OnOffClient);
        type F = ReturnType<typeof _features>;
        ({}) as F satisfies { lighting: boolean } | undefined;
        void _features;
    });

    it("maybeFeaturesOf — string overload returns Record<string, boolean> | undefined", () => {
        const _features = () => node.maybeFeaturesOf("onOff");
        type F = ReturnType<typeof _features>;
        ({}) as F satisfies Record<string, boolean> | undefined;
        void _features;
    });

    it("globalsOf — typed overload narrows featureMap to the cluster's feature flag type", () => {
        const _globals = () => node.globalsOf(OnOffClient);
        type G = ReturnType<typeof _globals>;
        ({}) as G satisfies { clusterRevision: number; featureMap: { lighting: boolean } };
        void _globals;
    });

    it("globalsOf — string overload returns the unnarrowed GlobalAttributeState", () => {
        const _globals = () => node.globalsOf("onOff");
        type G = ReturnType<typeof _globals>;
        ({}) as G satisfies { clusterRevision: number };
        void _globals;
    });

    it("maybeGlobalsOf — typed overload widens to undefined", () => {
        const _globals = () => node.maybeGlobalsOf(OnOffClient);
        type G = ReturnType<typeof _globals>;
        ({}) as G satisfies { clusterRevision: number; featureMap: { lighting: boolean } } | undefined;
        void _globals;
    });

    it("maybeGlobalsOf — string overload returns GlobalAttributeState | undefined", () => {
        const _globals = () => node.maybeGlobalsOf("onOff");
        type G = ReturnType<typeof _globals>;
        ({}) as G satisfies { clusterRevision: number } | undefined;
        void _globals;
    });

    it("get — returns a Promise via the underlying client node", () => {
        const _read = () => node.get();
        type R = ReturnType<typeof _read>;
        void ({} as R satisfies Promise<unknown>);
        void _read;
    });

    it("getStateOf — typed full-state overload returns the cluster state", () => {
        const _read = () => node.getStateOf(OperationalCredentialsClient);
        type R = Awaited<ReturnType<typeof _read>>;
        ({}) as R satisfies { currentFabricIndex: FabricIndex };
        void _read;
    });

    it("getStateOf — typed key-list overload returns a partial slice", () => {
        const _read = () => node.getStateOf(OperationalCredentialsClient, ["currentFabricIndex"] as const);
        type R = Awaited<ReturnType<typeof _read>>;
        ({}) as R satisfies { readonly currentFabricIndex?: FabricIndex };
        void _read;
    });

    it("getStateOf — string overload returns Val.Struct", () => {
        const _read = () => node.getStateOf("operationalCredentials");
        type R = Awaited<ReturnType<typeof _read>>;
        ({}) as R satisfies Record<string, unknown>;
        void _read;
    });

    it("rejects calls with non-string / non-Behavior arguments", () => {
        // @ts-expect-error number is not a valid behavior identifier
        const _e1 = () => node.stateOf(42);
        // @ts-expect-error number is not a valid behavior identifier
        const _e2 = () => node.maybeStateOf(42);
        // @ts-expect-error number is not a valid behavior identifier
        const _e3 = () => node.eventsOf(42);
        // @ts-expect-error number is not a valid behavior identifier
        const _e4 = () => node.featuresOf(42);
        // @ts-expect-error number is not a valid behavior identifier
        const _e5 = () => node.maybeFeaturesOf(42);
        // @ts-expect-error number is not a valid behavior identifier
        const _e6 = () => node.globalsOf(42);
        // @ts-expect-error number is not a valid behavior identifier
        const _e7 = () => node.maybeGlobalsOf(42);
        void [_e1, _e2, _e3, _e4, _e5, _e6, _e7];
    });
});
