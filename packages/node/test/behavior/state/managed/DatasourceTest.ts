/**
 * @license
 * Copyright 2022-2025 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { ActionContext } from "#behavior/context/ActionContext.js";
import { LocalActorContext } from "#behavior/context/server/LocalActorContext.js";
import { Datasource } from "#behavior/state/managed/Datasource.js";
import { StateType } from "#behavior/state/StateType.js";
import { BehaviorSupervisor } from "#behavior/supervision/BehaviorSupervisor.js";
import { RootSupervisor } from "#behavior/supervision/RootSupervisor.js";
import { ValueSupervisor } from "#behavior/supervision/ValueSupervisor.js";
import { AsyncObservable, MaybePromise, MockCrypto, Observable, UnsettledStateError } from "#general";
import { DataModelPath, DatatypeModel, FieldElement, FieldModel } from "#model";
import { Val } from "#protocol";
import { EndpointNumber } from "#types";

class MyState {
    foo = "bar";
}

const supervisor = BehaviorSupervisor({ id: "myState", State: MyState });
const persistentSupervisor = BehaviorSupervisor({
    id: "myState",
    State: MyState,

    schema: new DatatypeModel({
        name: "MyState",
        type: "struct",

        children: [FieldElement({ name: "foo", type: "string", quality: "N" })],
    }),
});

function createStore(initialValues: Val.Struct = {}): Datasource.Store & { sets: Val.Struct[] } {
    return {
        initialValues: {
            ...initialValues,
        },

        async set(_transaction, values) {
            this.sets.push(values);
        },

        sets: [],
    };
}

function createDatasource<const T extends StateType = typeof MyState>(
    options: Partial<Datasource.Options<T>> = {},
): Datasource<T> {
    return Datasource({
        crypto: MockCrypto(),
        location: {
            endpoint: EndpointNumber(1),
            path: DataModelPath("TestDatasource"),
        },
        type: (options.type ?? MyState) as T,
        supervisor,
        ...options,
    });
}

async function withReference<R, const T extends StateType>(
    datasource: Datasource<T>,
    actor: (params: { context: ActionContext; state: InstanceType<T> }) => MaybePromise<R>,
) {
    return LocalActorContext.act("test-datasource", context =>
        actor({
            context,
            state: datasource.reference(context),
        }),
    );
}

async function withDatasourceAndReference<R, const T extends StateType = typeof MyState>(
    options: Partial<Datasource.Options<T>> = {},
    actor: (params: { context: ActionContext; state: InstanceType<T>; ds: Datasource<T> }) => MaybePromise<R>,
) {
    const ds = createDatasource(options);
    return await withReference(ds, ({ context, state }) => actor({ context, state, ds }));
}

describe("Datasource", () => {
    it("reference is a MyState", async () => {
        await withDatasourceAndReference({}, ({ state }) => {
            state satisfies MyState;
            expect(state.foo).equals("bar");
        });
    });

    it("caches state implementations", async () => {
        const constructor1 = await withDatasourceAndReference({}, ({ state }) => state.constructor);
        const constructor2 = await withDatasourceAndReference({}, ({ state }) => state.constructor);

        expect(constructor1).equals(constructor2);
    });

    it("sets and gets with proper isolation", async () => {
        await withDatasourceAndReference({}, async ({ ds, state, context }) => {
            state.foo = "BAR";
            expect(state.foo).equals("BAR");

            await withReference(ds, async ({ state: state2, context: context2 }) => {
                expect(state2.foo).equals("bar");

                await context.transaction.commit();

                expect(state2.foo).equals("BAR");
                await context2.transaction.rollback();
                expect(state2.foo).equals("BAR");

                await withReference(ds, async ({ state: state3 }) => {
                    expect(state3.foo).equals("BAR");
                });
            });
        });
    });

    it("handles rejection well", async () => {
        class State {
            get foo() {
                return "foo";
            }

            set foo(value) {
                if (value === "foo") {
                    return;
                }
                throw new Error(`Bad value "${value}"`);
            }
        }

        const supervisor = BehaviorSupervisor({ id: "test", State });

        await withDatasourceAndReference({ type: State, supervisor }, ({ state }) => {
            expect(() => (state.foo = "bar")).throws(`Bad value "bar"`);
            expect(state.foo).equals("foo");
        });
    });

    it("handles dynamic properties", async () => {
        const dynamic = {
            foo: "hello",
        };
        class State {
            foo = "";

            [Val.properties](_endpoint: any, _session: ValueSupervisor.Session) {
                return dynamic;
            }
        }

        const supervisor = BehaviorSupervisor({ id: "test", State });

        await withDatasourceAndReference({ type: State, supervisor }, ({ state }) => {
            expect(state.foo).equals("hello");
            state.foo = "goodbye";
            expect(state.foo).equals("goodbye");
            expect(dynamic.foo).equals("goodbye");
        });
    });

    it("auto-commits changes after initial load", async () => {
        const store = createStore();
        await withDatasourceAndReference(
            {
                store,
                supervisor: persistentSupervisor,
            },

            // Just set foo, rely on auto-commit when we leave transaction context
            ({ state }) => (state.foo = "rab"),
        );

        expect(store.sets).deep.equals([
            {
                foo: "rab",
            },
        ]);
    });

    it("commits persistent changes subsequent to initialization", async () => {
        const store = createStore();
        const ds = createDatasource({
            store: store,
            supervisor: persistentSupervisor,
        });

        await withReference(ds, async ({ state, context }) => {
            await context.transaction.commit();
            expect(store.sets.length).equals(0);

            state.foo = "rab";
            await context.transaction.commit();

            expect(store.sets.length).equals(1);
            expect(store.sets[0]).deep.equals({ foo: "rab" });
        });

        await withReference(ds, async ({ state }) => {
            state.foo = "woof";

            // Auto-commit
        });

        expect(store.sets.length).equals(2);
        expect(store.sets[1]).deep.equals({ foo: "woof" });
    });

    describe("$Changing events", () => {
        it("trigger before transaction commit", async () => {
            const events = {
                foo$Changing: AsyncObservable<any>(),
            };

            let observed = false;

            const ds = createDatasource({ events });

            events.foo$Changing.on(async (newValue, oldValue) => {
                observed = true;

                expect(newValue).equals("!bar");
                expect(oldValue).equals("bar");

                // Ensure canonical value has not yet changed
                expect(ds.view.foo).equals("bar");
            });

            await withReference(ds, async ({ state }) => {
                state.foo = "!bar";
            });

            expect(ds.view.foo).equals("!bar");
            expect(observed).true;
        });

        it("handles mixed sync/async observers sequentially", async () => {
            const event = AsyncObservable<any>();

            const ds = createDatasource({ events: { foo$Changing: event } });

            const observations = Array<number>();

            event.on((_oldValue, _newValue, context) => {
                ds.reference(context).foo = "y";
                observations.push(1);
            });
            event.on(async () => {
                observations.push(2);
            });
            event.on(() => {
                observations.push(3);
            });
            event.on(async (_oldValue, _newValue, context) => {
                ds.reference(context).foo = "z";
                observations.push(4);
            });

            await withReference(ds, async ({ state }) => (state.foo = "x"));

            expect(ds.view.foo).equals("z");
            expect(observations).deep.equals([1, 2, 3, 4, 1, 2, 3, 4]);
        });

        it("allows 4 cascading mutation", async () => {
            const events = { foo$Changing: AsyncObservable<any>() };

            const ds = createDatasource({ events });

            events.foo$Changing.on((newValue, _oldValue, context) => {
                if (newValue.length < 4) {
                    ds.reference(context).foo = `${newValue}x`;
                }
            });

            await withReference(ds, async ({ state }) => (state.foo = "x"));

            expect(ds.view.foo).equals("xxxx");
        });

        async function assertRejects(
            type: new () => Error,
            message: string,
            observer: (ds: Datasource<typeof MyState>, ...args: any[]) => MaybePromise,
        ) {
            const events = { foo$Changing: AsyncObservable<any>() };

            const ds = createDatasource({ events });

            events.foo$Changing.on((...args: any[]) => observer(ds, ...args));

            await expect(withReference(ds, async ({ state }) => (state.foo = "x"))).eventually.rejectedWith(
                type,
                message,
            );

            expect(ds.view.foo).equals("bar");
        }

        it("disallows infinite cascading mutations", async () => {
            await assertRejects(
                UnsettledStateError,
                "State has not settled after 5 pre-commit cycles which likely indicates an infinite loop",
                async (ds, newValue, _oldValue, context) => {
                    ds.reference(context).foo = `${newValue}x`;
                },
            );
        });

        it("aborts on sync listener error", async () => {
            await assertRejects(Error, "oops", () => {
                throw new Error("oops");
            });
        });

        it("aborts on async listener error", async () => {
            await assertRejects(Error, "oops", async () => {
                throw new Error("oops");
            });
        });
    });

    describe("$Changed events", () => {
        it("trigger after transaction commit", async () => {
            const events = {
                foo$Changed: Observable<any>(),
            };

            let changed = false;
            const result = new Promise(resolve =>
                events.foo$Changed.on((...args: any[]) => {
                    changed = true;
                    resolve(args);
                }),
            );

            let actualContext: ActionContext | undefined;

            await withDatasourceAndReference({ events }, async ({ context, state }) => {
                actualContext = context;

                await context.transaction.commit();

                expect(changed).false;

                state.foo = "BAR";

                expect(changed).false;

                // Auto-commit
            });

            expect(changed).true;

            await expect(result).eventually.deep.equal(["BAR", "bar", actualContext]);
        });
    });

    describe("subfield events", () => {
        const Schema = new DatatypeModel({
            name: "StateWithSubfields",
            type: "struct",
            children: [
                new FieldModel({
                    name: "compound",
                    type: "struct",
                    children: [
                        new FieldModel({
                            name: "subfield",
                            type: "int8",
                        }),
                        new FieldModel({
                            name: "subfield2",
                            type: "bool",
                            conformance: "O",
                        }),
                    ],
                }),

                new FieldModel({
                    name: "name",
                    type: "string",
                }),
            ],
        });

        class Compound {
            subfield: number = 0;
            subfield2?: boolean;
        }

        class State {
            compound = new Compound();
            name = "Anonymous";
        }

        class Events {
            compound$Changing = Observable<[Compound, Compound], MaybePromise>();
            compound$Changed = Observable<[Compound, Compound], MaybePromise>();
            name$Changing = Observable<[string, string], MaybePromise>();
            name$Changed = Observable<[string, string], MaybePromise>();
        }

        type Result = { type: "changed" | "changing"; oldValue: Compound | string; newValue: Compound | string }[];

        async function test({
            setup,
            start,
            expected,
        }: {
            setup?: (events: Events, state: State) => void;
            start?: (state: State) => void;
            expected: Result;
        }) {
            const events = new Events();

            const output = [] as Result;

            if (!start) {
                start = state => {
                    state.compound.subfield = 1;
                };
            }

            await withDatasourceAndReference(
                {
                    type: State,
                    supervisor: RootSupervisor.for(Schema),
                    events: events as unknown as Datasource.Events,
                },

                ({ state }) => {
                    events.compound$Changing.on((newValue, oldValue) => {
                        output.push({ type: "changing", newValue: { ...newValue }, oldValue: { ...oldValue } });
                    });

                    events.compound$Changed.on((newValue, oldValue) => {
                        output.push({ type: "changed", newValue: { ...newValue }, oldValue: { ...oldValue } });
                    });

                    events.name$Changing.on((newValue, oldValue) => {
                        output.push({ type: "changing", newValue, oldValue });
                    });

                    events.name$Changed.on((newValue, oldValue) => {
                        output.push({ type: "changed", newValue, oldValue });
                    });

                    setup?.(events, state);
                    start(state);
                },
            );

            expect(output).deep.equals(expected);
        }

        it("trigger", async () => {
            await test({
                expected: [
                    {
                        type: "changing",
                        newValue: { subfield: 1, subfield2: undefined },
                        oldValue: { subfield: 0, subfield2: undefined },
                    },
                    {
                        type: "changed",
                        newValue: { subfield: 1, subfield2: undefined },
                        oldValue: { subfield: 0, subfield2: undefined },
                    },
                ],
            });
        });

        it("trigger as secondary change from different field", async () => {
            await test({
                setup(events, state) {
                    events.name$Changing.on(() => {
                        state.compound.subfield = 1;
                    });
                },

                start(state) {
                    state.name = "Fred";
                },

                expected: [
                    {
                        type: "changing",
                        newValue: "Fred",
                        oldValue: "Anonymous",
                    },
                    {
                        type: "changing",
                        newValue: { subfield: 1, subfield2: undefined },
                        oldValue: { subfield: 0, subfield2: undefined },
                    },
                    {
                        type: "changed",
                        newValue: { subfield: 1, subfield2: undefined },
                        oldValue: { subfield: 0, subfield2: undefined },
                    },
                    {
                        type: "changed",
                        newValue: "Fred",
                        oldValue: "Anonymous",
                    },
                ],
            });
        });

        it("trigger from second change to same subfield", async () => {
            await test({
                setup(events, state) {
                    events.compound$Changing.on(() => {
                        state.compound.subfield = 2;
                    });
                },

                expected: [
                    {
                        type: "changing",
                        newValue: { subfield: 1, subfield2: undefined },
                        oldValue: { subfield: 0, subfield2: undefined },
                    },
                    {
                        type: "changing",
                        newValue: { subfield: 2, subfield2: undefined },
                        oldValue: { subfield: 1, subfield2: undefined },
                    },
                    {
                        type: "changed",
                        newValue: { subfield: 2, subfield2: undefined },
                        oldValue: { subfield: 0, subfield2: undefined },
                    },
                ],
            });
        });

        it("trigger from second change on different subfield", async () => {
            await test({
                setup(events, state) {
                    events.compound$Changing.on(() => {
                        state.compound.subfield2 = true;
                    });
                },

                expected: [
                    {
                        type: "changing",
                        newValue: { subfield: 1, subfield2: undefined },
                        oldValue: { subfield: 0, subfield2: undefined },
                    },
                    {
                        type: "changing",
                        newValue: { subfield: 1, subfield2: true },
                        oldValue: { subfield: 1, subfield2: undefined },
                    },
                    {
                        type: "changed",
                        newValue: { subfield: 1, subfield2: true },
                        oldValue: { subfield: 0, subfield2: undefined },
                    },
                ],
            });
        });
    });

    describe("bitfield events", () => {
        const Schema = new DatatypeModel({
            name: "StateWithBitmap",
            type: "struct",
            children: [
                new FieldModel({
                    name: "bits",
                    type: "map8",
                    children: [
                        new FieldModel({
                            name: "flag",
                            constraint: "0",
                        }),
                        new FieldModel({
                            name: "field",
                            constraint: "1 to 3",
                        }),
                    ],
                }),
            ],
        });

        interface Bits {
            flag: boolean;
            field?: number;
        }

        class State {
            bits: Bits = {
                flag: false,
            };
        }

        class Events {
            bits$Changing = Observable<[Bits, Bits], MaybePromise>();
            bits$Changed = Observable<[Bits, Bits], MaybePromise>();
        }

        type Result = { type: "changed" | "changing"; oldValue: Bits; newValue: Bits }[];

        async function test({
            setup,
            start,
            expected,
        }: {
            setup?: (events: Events, state: State) => void;
            start?: (state: State) => void;
            expected: Result;
        }) {
            const events = new Events();

            const output = [] as Result;

            if (!start) {
                start = state => {
                    state.bits.flag = true;
                };
            }

            await withDatasourceAndReference(
                {
                    type: State,
                    supervisor: RootSupervisor.for(Schema),
                    events: events as unknown as Datasource.Events,
                },

                ({ state }) => {
                    events.bits$Changing.on((newValue, oldValue) => {
                        output.push({ type: "changing", newValue: { ...newValue }, oldValue: { ...oldValue } });
                    });

                    events.bits$Changed.on((newValue, oldValue) => {
                        output.push({ type: "changed", newValue: { ...newValue }, oldValue: { ...oldValue } });
                    });

                    setup?.(events, state);
                    start(state);
                },
            );

            expect(output).deep.equals(expected);
        }

        it("trigger on flag", async () => {
            await test({
                expected: [
                    {
                        type: "changing",
                        newValue: { flag: true, field: undefined },
                        oldValue: { flag: false },
                    },
                    {
                        type: "changed",
                        newValue: { flag: true },
                        oldValue: { flag: false },
                    },
                ],
            });
        });

        it("trigger on bitfield", async () => {
            await test({
                start(state) {
                    state.bits.field = 1;
                },

                expected: [
                    {
                        type: "changing",
                        newValue: { flag: false, field: 1 },
                        oldValue: { flag: false },
                    },
                    {
                        type: "changed",
                        newValue: { flag: false, field: 1 },
                        oldValue: { flag: false },
                    },
                ],
            });
        });

        it("trigger on bitfield in response to flag events", async () => {
            await test({
                setup(events, state) {
                    events.bits$Changing.on(() => {
                        switch (state.bits.field) {
                            case undefined:
                                state.bits.field = 1;
                                break;

                            case 2:
                                state.bits.field = 3;
                                break;
                        }
                    });

                    events.bits$Changed.on(() => {
                        if (state.bits.field === 1) {
                            state.bits.field = 2;
                        }
                    });
                },

                expected: [
                    {
                        type: "changing",
                        newValue: { flag: true, field: undefined },
                        oldValue: { flag: false },
                    },
                    {
                        type: "changing",
                        newValue: { flag: true, field: 1 },
                        oldValue: { flag: true },
                    },
                    {
                        type: "changed",
                        newValue: { flag: true, field: 1 },
                        oldValue: { flag: false },
                    },
                    {
                        type: "changing",
                        newValue: { flag: true, field: 2 },
                        oldValue: { flag: true, field: 1 },
                    },
                    {
                        type: "changing",
                        newValue: { flag: true, field: 3 },
                        oldValue: { flag: true, field: 2 },
                    },
                    {
                        type: "changed",
                        newValue: { flag: true, field: 3 },
                        oldValue: { flag: true, field: 1 },
                    },
                ],
            });
        });
    });
});
