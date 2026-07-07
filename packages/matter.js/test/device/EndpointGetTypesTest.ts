/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { Endpoint } from "#device/Endpoint.js";
import type { Immutable, Observable } from "@matter/general";
import { Behavior, ClusterBehavior, Commands, type GlobalAttributeState } from "@matter/node";
import type { Val } from "@matter/protocol";

type FakeState = { value: number; label: string };
type FakeBehaviorType = Behavior.Type & { readonly State: new () => FakeState; readonly id: "fake" };

type FakeFeatures = { lighting: boolean; offOnly: boolean };
type FakeClusterBehaviorType = ClusterBehavior.Type & {
    readonly features: FakeFeatures;
    readonly id: "fakeCluster";
};

type _AssertEqual<A, B> = (<T>() => T extends A ? 1 : 0) extends <T>() => T extends B ? 1 : 0 ? true : false;

describe("Legacy Endpoint get type helpers", () => {
    it("compiles correctly (parity with modern Endpoint, types validated at compile time)", () => {
        // The body never executes at runtime; the boolean cast defeats the
        // unreachable-code check so the type assertions still get checked.
        if ((false as boolean) === true) {
            const ep = null as unknown as Endpoint;
            const fakeBeh = null as unknown as FakeBehaviorType;
            const fakeCluster = null as unknown as FakeClusterBehaviorType;

            // stateOf(string) → Immutable<Val.Struct>
            const _stateString: Immutable<Val.Struct> = ep.stateOf("anyId");
            const _stateStringExact: _AssertEqual<typeof _stateString, Immutable<Val.Struct>> = true;
            void _stateString;
            void _stateStringExact;

            // stateOf<T>(T) → Immutable<Behavior.StateOf<T>>
            const _stateTyped = ep.stateOf(fakeBeh);
            const _stateTypedExact: _AssertEqual<typeof _stateTyped, Immutable<FakeState>> = true;
            void _stateTyped;
            void _stateTypedExact;

            // maybeStateOf(string) → Immutable<Val.Struct> | undefined
            const _maybeString = ep.maybeStateOf("anyId");
            const _maybeStringExact: _AssertEqual<typeof _maybeString, Immutable<Val.Struct> | undefined> = true;
            void _maybeString;
            void _maybeStringExact;

            // maybeStateOf<T>(T) → Immutable<Behavior.StateOf<T>> | undefined
            const _maybeTyped = ep.maybeStateOf(fakeBeh);
            const _maybeTypedExact: _AssertEqual<typeof _maybeTyped, Immutable<FakeState> | undefined> = true;
            void _maybeTyped;
            void _maybeTypedExact;

            // commandsOf<T>(T) → Commands.OfBehavior<T>
            const _commandsTyped = ep.commandsOf(fakeBeh);
            const _commandsTypedExact: _AssertEqual<
                typeof _commandsTyped,
                Commands.OfBehavior<FakeBehaviorType>
            > = true;
            void _commandsTyped;
            void _commandsTypedExact;

            // eventsOf(string) → Immutable<Record<string, Observable | undefined>>
            const _eventsString = ep.eventsOf("anyId");
            const _eventsStringExact: _AssertEqual<
                typeof _eventsString,
                Immutable<Record<string, Observable | undefined>>
            > = true;
            void _eventsString;
            void _eventsStringExact;

            // eventsOf<T>(T) → Behavior.EventsOf<T>
            const _eventsTyped = ep.eventsOf(fakeBeh);
            const _eventsTypedExact: _AssertEqual<typeof _eventsTyped, Behavior.EventsOf<FakeBehaviorType>> = true;
            void _eventsTyped;
            void _eventsTypedExact;

            // setStateOf(string, Val.Struct) → Promise<void>
            const _setString: Promise<void> = ep.setStateOf("anyId", { foo: 1 });
            void _setString;

            // setStateOf<T>(T, Behavior.PatchStateOf<T>) → Promise<void>
            const _setTyped: Promise<void> = ep.setStateOf(fakeBeh, { value: 2 });
            void _setTyped;

            // commandsOf(string) → Record<string, Commands.Command>
            const _commandsString = ep.commandsOf("anyId");
            const _commandsStringExact: _AssertEqual<typeof _commandsString, Record<string, Commands.Command>> = true;
            void _commandsString;
            void _commandsStringExact;

            // featuresOf(string) → Immutable<Record<string, boolean>>
            const _featuresString = ep.featuresOf("anyId");
            const _featuresStringExact: _AssertEqual<typeof _featuresString, Immutable<Record<string, boolean>>> = true;
            void _featuresString;
            void _featuresStringExact;

            // featuresOf<T>(T) → T["features"]
            const _featuresTyped: FakeFeatures = ep.featuresOf(fakeCluster);
            void _featuresTyped;

            // maybeFeaturesOf(string) → Immutable<Record<string, boolean>> | undefined
            const _maybeFeaturesString = ep.maybeFeaturesOf("anyId");
            const _maybeFeaturesStringExact: _AssertEqual<
                typeof _maybeFeaturesString,
                Immutable<Record<string, boolean>> | undefined
            > = true;
            void _maybeFeaturesString;
            void _maybeFeaturesStringExact;

            // maybeFeaturesOf<T>(T) → T["features"] | undefined
            const _maybeFeaturesTyped: FakeFeatures | undefined = ep.maybeFeaturesOf(fakeCluster);
            void _maybeFeaturesTyped;

            // globalsOf(string) → Immutable<GlobalAttributeState>
            const _globalsString: Immutable<GlobalAttributeState> = ep.globalsOf("anyId");
            void _globalsString;

            // globalsOf<T>(T) → narrowed featureMap
            const _globalsTyped = ep.globalsOf(fakeCluster);
            const _globalsTypedFeatureMap: FakeFeatures = _globalsTyped.featureMap;
            const _globalsTypedRevision: number = _globalsTyped.clusterRevision;
            void _globalsTyped;
            void _globalsTypedFeatureMap;
            void _globalsTypedRevision;

            // maybeGlobalsOf(string) → Immutable<GlobalAttributeState> | undefined
            const _maybeGlobalsString: Immutable<GlobalAttributeState> | undefined = ep.maybeGlobalsOf("anyId");
            void _maybeGlobalsString;

            // maybeGlobalsOf<T>(T) → narrowed featureMap | undefined
            const _maybeGlobalsTyped = ep.maybeGlobalsOf(fakeCluster);
            const _maybeGlobalsTypedFM: FakeFeatures | undefined = _maybeGlobalsTyped?.featureMap;
            void _maybeGlobalsTyped;
            void _maybeGlobalsTypedFM;

            // get() → Promise<unknown>
            const _getResult: Promise<unknown> = ep.get();
            void _getResult;

            // getStateOf<T>(T) → Promise<Behavior.StateOf<T>>
            const _getStateTyped: Promise<FakeState> = ep.getStateOf(fakeBeh);
            void _getStateTyped;

            // getStateOf<T>(T, key-list) → Promise<{ readonly [P in K]?: ... }>
            const _getStatePartial = ep.getStateOf(fakeBeh, ["value"] as const);
            const _getStatePartialExact: _AssertEqual<
                typeof _getStatePartial,
                Promise<{ readonly value?: number }>
            > = true;
            void _getStatePartial;
            void _getStatePartialExact;

            // getStateOf(string) → Promise<Val.Struct>
            const _getStateString: Promise<Val.Struct> = ep.getStateOf("anyId");
            void _getStateString;

            // Negative cases — must fail to type-check.

            // @ts-expect-error - number is not a valid behavior type or id
            ep.stateOf(42);

            // @ts-expect-error - number is not a valid behavior type or id
            ep.maybeStateOf(42);

            // @ts-expect-error - number is not a valid behavior type or id
            ep.eventsOf(42);

            // @ts-expect-error - patch shape must match FakeState (value: number)
            void ep.setStateOf(fakeBeh, { value: "not a number" });

            // @ts-expect-error - unknown attribute on typed patch
            void ep.setStateOf(fakeBeh, { missing: 1 });

            // @ts-expect-error - number is not a valid behavior type or id
            ep.featuresOf(42);

            // @ts-expect-error - number is not a valid behavior type or id
            ep.maybeFeaturesOf(42);

            // @ts-expect-error - number is not a valid behavior type or id
            ep.globalsOf(42);

            // @ts-expect-error - number is not a valid behavior type or id
            ep.maybeGlobalsOf(42);
        }
    });
});
