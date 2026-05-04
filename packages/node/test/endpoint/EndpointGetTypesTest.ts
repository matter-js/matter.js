/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { Behavior } from "#behavior/Behavior.js";
import type {
    BehaviorAt,
    BehaviorOf,
    BehaviorSelection,
    Endpoint,
    RawBehaviorSelection,
    StateSelector,
    StateSliceOf,
} from "#endpoint/Endpoint.js";
import { SupportedBehaviors } from "#endpoint/properties/SupportedBehaviors.js";
import { EndpointType } from "#endpoint/type/EndpointType.js";
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

        // Fallback branch: unbound `T extends EndpointType` widens `keyof T["behaviors"]` to `string`
        // via the SupportedBehaviors index signature, so values must accept RawBehaviorSelection
        // (arbitrary string-keyed attribute lists) for backward compatibility with generic code.
        type _GenericValue = NonNullable<StateSelector<EndpointType>[string]>;
        type _AssertEqual<A, B> = (<T>() => T extends A ? 1 : 0) extends <T>() => T extends B ? 1 : 0 ? true : false;
        const _genericValueIsRaw: _AssertEqual<_GenericValue, RawBehaviorSelection> = true;
        void _genericValueIsRaw;
        const _genericSelector: StateSelector<EndpointType> = { someBehavior: ["arbitraryAttr"] as const };
        void _genericSelector;

        // Real factory path: exercise EndpointType(...) + SupportedBehaviors(...) + MapOf<>, not a
        // hand-built intersection. Catches regressions in EndpointType.For<T> / MapOf<T> that would
        // widen `keyof T["behaviors"]` back to `string` and silently drop the per-behavior tightening.
        class FactoryTestBehavior extends Behavior {
            static override readonly id = "factoryTest";
            static override readonly State = class FactoryTestState {
                value = 0;
                label = "";
            };
        }
        const FactoryTestEndpoint = EndpointType({
            name: "FactoryTest",
            deviceType: 0xfff1,
            deviceRevision: 1,
            behaviors: SupportedBehaviors(FactoryTestBehavior),
        });
        type _FactoryTestType = typeof FactoryTestEndpoint;

        // Behavior keys must remain narrow (literal "factoryTest"), not widened to `string`.
        type _FactoryKeys = keyof _FactoryTestType["behaviors"];
        const _factoryKeysNarrow: string extends _FactoryKeys ? false : true = true;
        void _factoryKeysNarrow;

        // Typed attribute key accepted on factory-built endpoint
        const _factoryGood: StateSelector<_FactoryTestType> = { factoryTest: ["value"] as const };
        void _factoryGood;

        // @ts-expect-error - "missing" is not a key of FactoryTestBehavior State
        const _factoryBad: StateSelector<_FactoryTestType> = { factoryTest: ["missing"] as const };
        void _factoryBad;

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

        // getStateOf overload return types — assert each overload resolves to the documented shape.
        // Wrapped in `if (false)` so runtime never executes; TypeScript still type-checks the body.
        if ((false as boolean) === true) {
            const _ep = null as unknown as Endpoint<TestEndpoint>;
            const _fakeBeh = null as unknown as FakeBehaviorType;

            // Overload 1: (B) and (B, true) → Promise<Behavior.StateOf<B>>
            const _stateOfNoSelector: Promise<Behavior.StateOf<FakeBehaviorType>> = _ep.getStateOf(_fakeBeh);
            void _stateOfNoSelector;
            const _stateOfTrue: Promise<Behavior.StateOf<FakeBehaviorType>> = _ep.getStateOf(_fakeBeh, true);
            void _stateOfTrue;

            // Overload 2: (B, K[]) → Promise<{ readonly [P in K]?: Behavior.StateOf<B>[P] }>.
            // Each selected key is optional because partial-state-on-failure may omit it.
            const _stateOfKeys = _ep.getStateOf(_fakeBeh, ["value"] as const);
            const _checkKeysAwait: Awaited<typeof _stateOfKeys> = {} as { readonly value?: number };
            void _checkKeysAwait;

            // Overload 2 must reject keys not in the behavior's State.
            // @ts-expect-error - "missing" is not a key of FakeState
            const _stateOfBadKey = _ep.getStateOf(_fakeBeh, ["missing"] as const);
            void _stateOfBadKey;

            // Overload 3: (string, readonly string[]) → Promise<Val.Struct>. Accepts arbitrary string keys.
            const _stateOfStringId = _ep.getStateOf("anyId", ["foo", "bar"]);
            void _stateOfStringId;
        }
    });
});
