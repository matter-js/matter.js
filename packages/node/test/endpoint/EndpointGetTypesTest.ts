/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import type { Behavior } from "#behavior/Behavior.js";
import type {
    BehaviorAt,
    BehaviorOf,
    BehaviorSelection,
    RawBehaviorSelection,
    StateSelector,
    StateSliceOf,
} from "#endpoint/Endpoint.js";
import type { EndpointType } from "#endpoint/type/EndpointType.js";
import type { Immutable } from "@matter/general";

type FakeState = { value: number; label: string };
type FakeBehaviorType = Behavior.Type & { readonly State: new () => FakeState; readonly id: "fake" };

// A minimal EndpointType shape for type-level testing
type TestEndpoint = EndpointType & { behaviors: { fake: FakeBehaviorType } };

describe("Endpoint get type helpers", () => {
    it("compiles correctly (types validated at compile time)", () => {
        // BehaviorOf resolves to a Behavior.Type union over behaviors
        type _BehOf = BehaviorOf<TestEndpoint>;
        const _checkBehOf: _BehOf = {} as FakeBehaviorType;
        void _checkBehOf;

        // BehaviorAt resolves to the specific behavior type at a key
        type _BehAt = BehaviorAt<TestEndpoint, "fake">;
        const _checkBehAt: _BehAt = {} as FakeBehaviorType;
        void _checkBehAt;

        // BehaviorSelection accepts `true`
        const _selTrue: BehaviorSelection<FakeBehaviorType> = true;
        void _selTrue;

        // BehaviorSelection accepts a readonly array of state keys
        const _selKeys: BehaviorSelection<FakeBehaviorType> = ["value"] as const;
        void _selKeys;

        // RawBehaviorSelection accepts `true`
        const _rawTrue: RawBehaviorSelection = true;
        void _rawTrue;

        // RawBehaviorSelection accepts a readonly string array
        const _rawArr: RawBehaviorSelection = ["value", "label"] as const;
        void _rawArr;

        // StateSelector accepts { fake: true }
        const _selectorTrue: StateSelector<TestEndpoint> = { fake: true };
        void _selectorTrue;

        // StateSelector accepts { fake: readonly (keyof State)[] }
        const _selectorKeys: StateSelector<TestEndpoint> = { fake: ["value"] as const };
        void _selectorKeys;

        // StateSelector accepts partial (no keys required)
        const _selectorEmpty: StateSelector<TestEndpoint> = {};
        void _selectorEmpty;

        // StateSelector rejects attribute keys that are not in the behavior's State for typed endpoints.
        // @ts-expect-error - "missing" is not a key of FakeState
        const _selectorBadKey: StateSelector<TestEndpoint> = { fake: ["missing"] as const };
        void _selectorBadKey;

        // StateSliceOf with { fake: true } produces a slice with full fake state
        type _TrueSlice = StateSliceOf<TestEndpoint, { fake: true }>;
        const _checkTrueSlice: _TrueSlice = {} as { fake: Immutable<Behavior.StateOf<FakeBehaviorType>> };
        void _checkTrueSlice;

        // StateSliceOf with key selection produces a Partial<Pick> slice (values may be absent)
        type _PickSlice = StateSliceOf<TestEndpoint, { fake: readonly ["value"] }>;
        const _checkPickSlice: _PickSlice = {} as {
            fake: Immutable<Partial<Pick<Behavior.StateOf<FakeBehaviorType>, "value">>>;
        };
        void _checkPickSlice;
    });
});
