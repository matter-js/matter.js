/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { Endpoint } from "#device/Endpoint.js";
import type { Immutable, Observable } from "@matter/general";
import { Behavior, Commands } from "@matter/node";
import type { Val } from "@matter/protocol";

type FakeState = { value: number; label: string };
type FakeBehaviorType = Behavior.Type & { readonly State: new () => FakeState; readonly id: "fake" };

type _AssertEqual<A, B> = (<T>() => T extends A ? 1 : 0) extends <T>() => T extends B ? 1 : 0 ? true : false;

describe("Legacy Endpoint get type helpers", () => {
    it("compiles correctly (parity with modern Endpoint, types validated at compile time)", () => {
        // The body never executes at runtime; the boolean cast defeats the
        // unreachable-code check so the type assertions still get checked.
        if ((false as boolean) === true) {
            const ep = null as unknown as Endpoint;
            const fakeBeh = null as unknown as FakeBehaviorType;

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

            // Negative cases — must fail to type-check.

            // @ts-expect-error - number is not a valid behavior type or id
            ep.stateOf(42);

            // @ts-expect-error - number is not a valid behavior type or id
            ep.maybeStateOf(42);

            // @ts-expect-error - number is not a valid behavior type or id
            ep.eventsOf(42);

            // @ts-expect-error - patch shape must match FakeState (value: number)
            ep.setStateOf(fakeBeh, { value: "not a number" });

            // @ts-expect-error - unknown attribute on typed patch
            ep.setStateOf(fakeBeh, { missing: 1 });
        }
    });
});
