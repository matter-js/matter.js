/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { DerivedState, EmptyState, StateType } from "#behavior/state/StateType.js";

describe("StateType", () => {
    describe("EmptyState", () => {
        it("satisfies StateType", () => {
            EmptyState satisfies StateType;
        });
    });

    describe("DerivedState", () => {
        it("extends once", () => {
            const MyState = DerivedState({ values: { foo: "bar" } });
            const state = new MyState();
            expect(state.foo).equal("bar");
        });

        it("extends twice", () => {
            const MyState = DerivedState({
                base: DerivedState({ values: { foo: "bar" } }),
                values: { biz: "baz" },
            });
            const state = new MyState();
            expect(state.foo).equals("bar");
            expect(state.biz).equals("baz");
        });

        it("extends normal class", () => {
            class ManualState {
                foo = "bar";
            }
            const MyState = DerivedState({ base: ManualState, values: { biz: "baz" } });
            const state = new MyState();
            expect(state.foo).equals("bar");
            expect(state.biz).equals("baz");
        });

        it("supports privates and accessors", () => {
            class Manual {
                #foo = 4;

                get foo() {
                    return this.#foo;
                }

                set foo(value: number) {
                    this.#foo = value * 2;
                }
            }
            const Derived = DerivedState({ base: Manual, values: { foo: 8 } });

            expect(new Manual().foo).equals(4);
            expect(new Derived().foo).equals(16);
        });
    });
});
