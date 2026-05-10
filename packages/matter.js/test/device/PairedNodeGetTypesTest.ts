/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { PairedNode } from "#device/PairedNode.js";
import type { Immutable, Observable } from "@matter/general";
import { Behavior, Commands } from "@matter/node";
import type { Val } from "@matter/protocol";

type FakeState = { value: number; label: string };
type FakeBehaviorType = Behavior.Type & { readonly State: new () => FakeState; readonly id: "fake" };

type _AssertEqual<A, B> = (<T>() => T extends A ? 1 : 0) extends <T>() => T extends B ? 1 : 0 ? true : false;

describe("Legacy PairedNode get type helpers", () => {
    it("compiles correctly (parity with modern Endpoint, types validated at compile time)", () => {
        if ((false as boolean) === true) {
            const node = null as unknown as PairedNode;
            const fakeBeh = null as unknown as FakeBehaviorType;

            // stateOf(string) → Immutable<Val.Struct>
            const _stateString = node.stateOf("anyId");
            const _stateStringExact: _AssertEqual<typeof _stateString, Immutable<Val.Struct>> = true;
            void _stateString;
            void _stateStringExact;

            // stateOf<T>(T) → Immutable<Behavior.StateOf<T>>
            const _stateTyped = node.stateOf(fakeBeh);
            const _stateTypedExact: _AssertEqual<typeof _stateTyped, Immutable<FakeState>> = true;
            void _stateTyped;
            void _stateTypedExact;

            // maybeStateOf(string) → Immutable<Val.Struct> | undefined
            const _maybeString = node.maybeStateOf("anyId");
            const _maybeStringExact: _AssertEqual<typeof _maybeString, Immutable<Val.Struct> | undefined> = true;
            void _maybeString;
            void _maybeStringExact;

            // maybeStateOf<T>(T) → Immutable<Behavior.StateOf<T>> | undefined
            const _maybeTyped = node.maybeStateOf(fakeBeh);
            const _maybeTypedExact: _AssertEqual<typeof _maybeTyped, Immutable<FakeState> | undefined> = true;
            void _maybeTyped;
            void _maybeTypedExact;

            // commandsOf<T>(T) → Commands.OfBehavior<T>
            const _commandsTyped = node.commandsOf(fakeBeh);
            const _commandsTypedExact: _AssertEqual<
                typeof _commandsTyped,
                Commands.OfBehavior<FakeBehaviorType>
            > = true;
            void _commandsTyped;
            void _commandsTypedExact;

            // eventsOf(string) → Immutable<Record<string, Observable | undefined>>
            const _eventsString = node.eventsOf("anyId");
            const _eventsStringExact: _AssertEqual<
                typeof _eventsString,
                Immutable<Record<string, Observable | undefined>>
            > = true;
            void _eventsString;
            void _eventsStringExact;

            // eventsOf<T>(T) → Behavior.EventsOf<T>
            const _eventsTyped = node.eventsOf(fakeBeh);
            const _eventsTypedExact: _AssertEqual<typeof _eventsTyped, Behavior.EventsOf<FakeBehaviorType>> = true;
            void _eventsTyped;
            void _eventsTypedExact;

            // PairedNode.events is the lifecycle bus (not behavior events).
            // Asserts the conflict the team accepted: same-name field with different shape.
            const _lifecycleEvents = node.events;
            const _lifecycleIsBus: _AssertEqual<typeof _lifecycleEvents, PairedNode.Events> = true;
            void _lifecycleEvents;
            void _lifecycleIsBus;

            // Negative cases — must fail to type-check.

            // @ts-expect-error - number is not a valid behavior type or id
            node.stateOf(42);

            // @ts-expect-error - number is not a valid behavior type or id
            node.maybeStateOf(42);

            // @ts-expect-error - number is not a valid behavior type or id
            node.eventsOf(42);
        }
    });
});
