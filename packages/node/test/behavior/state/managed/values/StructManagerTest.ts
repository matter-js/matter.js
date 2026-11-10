/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { ActionContext } from "#behavior/context/ActionContext.js";
import { LocalActorContext } from "#behavior/context/server/LocalActorContext.js";
import { Datasource } from "#behavior/state/managed/Datasource.js";
import { UncachedValueError } from "#behavior/state/managed/errors.js";
import { RootSupervisor } from "#behavior/supervision/RootSupervisor.js";
import { ImplementationError, isObject, MaybePromise, MockCrypto } from "@matter/general";
import {
    ClusterModel,
    DataModelPath,
    FeatureMap,
    FeatureSet,
    FieldElement,
    FieldModel,
    FieldValue,
    Model,
} from "@matter/model";
import { MockExchange } from "@matter/node/testing";
import { ConformanceError, ConstraintError, PhantomReferenceError, Val } from "@matter/protocol";
import { EndpointNumber, FabricIndex, NodeId, Status } from "@matter/types";
import { aclEndpoint, listOf, rawValuesOf, structOf, TestStruct } from "./value-utils.js";

function listIn(value: unknown) {
    if (!Array.isArray(value)) {
        expect.fail(`${value} is not a list`);
    }
    return value;
}

function structIn(value: unknown) {
    if (!isObject(value)) {
        expect.fail(`${value} is not a struct`);
    }
    return value;
}

export type Nested = {
    substruct: {
        foo: string;
    };
};

function TestContext() {
    return {
        exchange: new MockExchange({ fabricIndex: FabricIndex(1), nodeId: NodeId(1) }),
        node: aclEndpoint(),
    };
}

function testNested(
    actor: (vars: { struct: TestStruct; cx: ActionContext; ref: Nested }) => MaybePromise,
): MaybePromise {
    const struct = TestStruct(
        {
            substruct: {
                type: "struct",

                children: [FieldElement({ name: "foo", type: "string" })],
            },
        },
        {
            substruct: {
                foo: "bar",
            },
        },
    );

    return struct.online(TestContext(), (ref, cx) => {
        return actor({ struct, cx, ref: ref as Nested });
    });
}

/**
 * Schrödinger's cat cannot in fact be both alive and dead as that's just silly.
 */
const SchrödingersCat = new ClusterModel({
    id: 0xdeadbeef,
    name: "SchrödingersCat",
    children: [
        FeatureMap.extend({
            children: [{ tag: "field", name: "LF", description: "Life", constraint: "0" }],
        }),
        { tag: "field", name: "Alive", type: "bool", constraint: "true", conformance: "[LF]" },
        { tag: "field", name: "Alive", type: "bool", constraint: "false", conformance: "[!LF]" },
    ],
});

/**
 * A state class that supplies properties dynamically, as several server cluster implementations do.
 */
class DynamicState {
    [Val.properties]() {
        return {};
    }
}

class SchrödingersCatsState {
    alive?: boolean;
}

async function testDuality(life: boolean, actor: (struct: { alive?: boolean }) => void) {
    const schema = SchrödingersCat.clone();
    if (life) {
        schema.supportedFeatures = new FeatureSet("LF");
    }

    const supervisor = RootSupervisor.for(schema);

    const datasource = Datasource({
        entropy: MockCrypto(),
        type: SchrödingersCatsState,
        supervisor,
        location: { endpoint: EndpointNumber(1), path: new DataModelPath(0) },
    });

    await LocalActorContext.act("test", cx => {
        actor(datasource.reference(cx));
    });
}

describe("StructManager", () => {
    it("deep equals according to mocha", async () => {
        // If this fails the rest of the tests are just going to be annoying
        await testNested(({ ref }) => {
            expect(ref.substruct).deep.equals({ foo: "bar" });
        });
    });

    it("applies nested defaults", async () => {
        await testNested(({ ref }) => {
            expect(typeof ref.substruct).equals("object");
            expect(ref.substruct.foo).equals("bar");
        });
    });

    it("accepts nested changes", async () => {
        await testNested(async ({ cx, struct, ref }) => {
            ref.substruct.foo = "rab";

            expect(ref.substruct.foo).equals("rab");

            await cx.transaction.commit();

            const substruct = struct.fields.substruct as Val.Struct;
            expect(typeof substruct).equals("object");
            expect(substruct.foo).equals("rab");
        });
    });

    it("notifies on nested change", async () => {
        await testNested(async ({ cx, struct, ref }) => {
            ref.substruct.foo = "rab";

            expect(struct.notifies.length).equals(0);

            await cx.transaction.commit();

            expect(struct.notifies).deep.equal([
                { index: "substruct", oldValue: { foo: "bar" }, newValue: { foo: "rab" } },
            ]);
        });
    });

    it("accepts insert of mutated primitive array", async () => {
        const struct = TestStruct({
            array: {
                type: "list",

                children: [FieldElement({ name: "entry", type: "uint8" })],
            },
        });

        await struct.online(TestContext(), ref => {
            ref.array = [1, 2, 3];

            const array = ref.array as number[];
            expect(array).deep.equals([1, 2, 3]);

            array.push(4);

            ref.array = array;

            const array2 = ref.array;
            expect(array2).deep.equals([1, 2, 3, 4]);
        });
    });

    it("accepts insert of mutated object array", async () => {
        const struct = TestStruct({
            array: {
                type: "list",

                children: [
                    FieldElement({
                        name: "entry",
                        type: "struct",
                        children: [
                            FieldElement({ name: "num", type: "uint8" }),
                            FieldElement({ name: "str", type: "string" }),
                        ],
                    }),
                ],
            },
        });

        await struct.online(TestContext(), ref => {
            const input = [
                { num: 1, str: "foo" },
                { num: 2, str: "bar" },
            ];

            ref.array = [...input];
            let array = ref.array as { num: number; str: string }[];
            expect(array).deep.equals(input);

            array.push({ num: 3, str: "baz" });
            ref.array = array;

            array = ref.array as { num: number; str: string }[];
            expect(array).deep.equals([...input, { num: 3, str: "baz" }]);
        });
    });

    describe("id-keyed references", () => {
        const initialValue = () => ({ prim: "hi", nested: { foo: "bar" }, list: ["one"] });

        const SUBSTRUCT = {
            id: 0,
            type: "struct",
            children: [
                FieldElement({ name: "prim", id: 0, type: "string" }),
                FieldElement({
                    name: "nested",
                    id: 1,
                    type: "struct",
                    children: [FieldElement({ name: "foo", id: 0, type: "string" })],
                }),
                FieldElement({ name: "list", id: 2, type: "list" }, FieldElement({ name: "entry", type: "string" })),
            ],
        };

        function testIdKeyed(
            actor: (vars: {
                struct: TestStruct;
                cx: ActionContext;
                ref: Val.Struct;
                substruct: Val.Struct;
            }) => MaybePromise,
        ) {
            // The "0" slot is the attribute ID a client mirror stores values under; the value itself is name-keyed
            const struct = TestStruct({ substruct: SUBSTRUCT }, { 0: initialValue() }, "id");

            return struct.online(TestContext(), (ref, cx) =>
                actor({ struct, cx, ref, substruct: ref.substruct as Val.Struct }),
            );
        }

        it("reads members of a name-keyed value", async () => {
            await testIdKeyed(({ substruct }) => {
                expect(substruct.nested).deep.equals({ foo: "bar" });
                expect(substruct.list).deep.equals(["one"]);
            });
        });

        it("reads a member two levels below the id-keyed value", async () => {
            await testIdKeyed(({ substruct }) => {
                expect((substruct.nested as Val.Struct).foo).equals("bar");
            });
        });

        it("reuses the managed value for repeated reads", async () => {
            await testIdKeyed(({ ref }) => {
                expect(ref.substruct).equals(ref.substruct);
            });
        });

        it("keeps names as keys when writing nested members", async () => {
            await testIdKeyed(async ({ struct, cx, substruct }) => {
                substruct.prim = "changed";
                (substruct.nested as Val.Struct).foo = "changed too";
                (substruct.list as Val.List)[0] = "two";

                await cx.transaction.commit();

                expect(struct.notifies).deep.equals([
                    {
                        index: "substruct",
                        oldValue: initialValue(),
                        newValue: { prim: "changed", nested: { foo: "changed too" }, list: ["two"] },
                    },
                ]);
            });
        });

        // An id-keyed container never falls back to the property-name slot.  A mandatory member (conformance
        // evaluated against the mirror's supported features) still reads a value -- synthesized from the schema,
        // not from the property-name slot.  An optional member reads undefined either way.
        it("reads a mandatory member as its datatype default and an optional member as undefined, when reported only under its property name", async () => {
            const struct = TestStruct(
                {
                    prim: { id: 0, type: "uint8", conformance: "M" },
                    opt: { id: 1, type: "uint8", conformance: "O" },
                },
                { prim: 5, opt: 5 },
                "id",
            );

            await struct.online(TestContext(), ref => {
                expect(ref.prim).equals(0);
                expect(ref.opt).undefined;
            });
        });

        // The same name-slot-ignored contract applies to a struct-typed member: it synthesizes from the schema
        // rather than picking up the value reported under its property name.
        it("recursively synthesizes a mandatory struct member, not the value reported only under its property name", async () => {
            const struct = TestStruct(
                {
                    sub: {
                        id: 0,
                        type: "struct",
                        conformance: "M",
                        children: [FieldElement({ name: "foo", id: 0, type: "string" })],
                    },
                },
                { sub: { foo: "bar" } },
                "id",
            );

            await struct.online(TestContext(), ref => {
                expect(ref.sub).deep.equals({ foo: undefined });
            });
        });

        // A rejected write must roll back to the same value a read would have returned beforehand — not to
        // whatever the write-migration fallback found under the property name, or the rollback plants the seeded
        // default at the id slot and a later read wrongly reports the member as peer-reported.
        it("rolls back to the synthesized default, not a name-slot seeded default, when a rejected write is undone", async () => {
            const struct = TestStruct(
                { prim: { id: 0, type: "uint8", constraint: "0 to 10", conformance: "M" } },
                { prim: 5 },
                "id",
            );

            await struct.online(TestContext(), ref => {
                expect(ref.prim).equals(0);

                expect(() => (ref.prim = 99)).throws();

                expect(ref.prim).equals(0);
                expect(0 in rawValuesOf(ref)).false;
            });
        });

        // A fabric-scoped list the peer has not yet reported must write by direct assignment, not through the
        // managed-proxy merge path reserved for an established list: that path reads back through the property
        // getter, which for a mandatory list now returns the synthesized empty array rather than a container value.
        it("writes a fabric-scoped list the peer has not yet reported via direct assignment", async () => {
            const struct = TestStruct(
                {
                    acl: {
                        id: 0,
                        type: "list",
                        access: "RW F",
                        conformance: "M",
                        children: [FieldElement({ name: "entry", type: "string" })],
                    },
                },
                { acl: [] },
                "id",
            );

            await struct.online(TestContext(), ref => {
                expect(ref.acl).deep.equals([]);
                expect(() => (ref.acl = ["x"])).not.throws();
                expect(ref.acl).deep.equals(["x"]);
            });
        });

        describe("an unreported mandatory collection", () => {
            const unreportedFields = {
                list: {
                    id: 0,
                    type: "list",
                    conformance: "M",
                    children: [FieldElement({ name: "entry", type: "string" })],
                },
                sub: {
                    id: 1,
                    type: "struct",
                    conformance: "M",
                    children: [
                        FieldElement({ name: "foo", id: 0, type: "string" }),
                        FieldElement({
                            name: "inner",
                            id: 1,
                            type: "list",
                            conformance: "M",
                            children: [FieldElement({ name: "entry", type: "string" })],
                        }),
                    ],
                },
            };

            function unreported(values: Val.Struct = {}) {
                return TestStruct(unreportedFields, values, "id");
            }

            it("reads the same managed value on every read", async () => {
                const struct = unreported();

                await struct.online(TestContext(), ref => {
                    expect(ref.list).equals(ref.list);
                    expect(ref.sub).equals(ref.sub);
                });
            });

            it("keeps its default while another member changes", async () => {
                const struct = unreported();

                await struct.online(TestContext(), ref => {
                    const list = listIn(ref.list);
                    const before = rawValuesOf(list);

                    ref.sub = { foo: "bar", inner: [] };

                    expect(rawValuesOf(list)).equals(before);
                });
            });

            it("stores nothing and announces nothing when only read", async () => {
                const struct = unreported();

                await struct.online(TestContext(), async (ref, cx) => {
                    expect(ref.list).deep.equals([]);
                    expect(ref.sub).deep.equals({ foo: undefined, inner: [] });

                    await cx.transaction.commit();

                    expect(rawValuesOf(ref)).deep.equals({});
                });
                expect(struct.notifies).deep.equals([]);
            });

            it("refuses a list changed in place, storing and announcing nothing", async () => {
                const struct = unreported();

                await struct.online(TestContext(), async (ref, cx) => {
                    expect(() => listIn(ref.list).push("one"))
                        .throws(UncachedValueError)
                        .with.property("code", Status.InvalidInState);

                    await cx.transaction.commit();

                    expect(rawValuesOf(ref)).deep.equals({});
                    expect(ref.list).deep.equals([]);
                });
                expect(struct.notifies).deep.equals([]);
            });

            it("refuses a struct changed in place, storing and announcing nothing", async () => {
                const struct = unreported();

                await struct.online(TestContext(), async (ref, cx) => {
                    expect(() => (structIn(ref.sub).foo = "bar")).throws(UncachedValueError);

                    await cx.transaction.commit();

                    expect(rawValuesOf(ref)).deep.equals({});
                });
                expect(struct.notifies).deep.equals([]);
            });

            it("refuses a change of a container inside its default", async () => {
                const struct = unreported();

                await struct.online(TestContext(), ref => {
                    expect(() => listIn(structIn(ref.sub).inner).push("one")).throws(UncachedValueError);

                    expect(rawValuesOf(ref)).deep.equals({});
                    expect(ref.sub).deep.equals({ foo: undefined, inner: [] });
                });
            });

            it("reads its default after a rollback that follows a refused change", async () => {
                const struct = unreported();

                await struct.online(TestContext(), async (ref, cx) => {
                    const list = listIn(ref.list);
                    expect(() => list.push("one")).throws(UncachedValueError);

                    await cx.transaction.rollback();

                    expect(rawValuesOf(ref)).deep.equals({});
                    expect(ref.list).deep.equals([]);
                    expect(() => listIn(ref.list).push("two")).throws(UncachedValueError);
                });
            });

            it("refuses a change in place in each context that reads it", async () => {
                const struct = unreported();

                await struct.online2(TestContext(), TestContext(), ({ ref1, ref2 }) => {
                    const list1 = listIn(ref1.list);
                    const list2 = listIn(ref2.list);
                    expect(list1).not.equals(list2);

                    expect(() => list1.push("one")).throws(UncachedValueError);
                    expect(() => list2.push("two")).throws(UncachedValueError);

                    expect(rawValuesOf(ref1)).deep.equals({});
                    expect(rawValuesOf(ref2)).deep.equals({});
                });
            });

            it("accepts a complete value, which a held reference then serves", async () => {
                const struct = unreported();

                await struct.online(TestContext(), ref => {
                    const held = listIn(ref.list);

                    ref.list = ["one"];
                    held.push("two");

                    expect(held).deep.equals(["one", "two"]);
                    expect(rawValuesOf(ref)[0]).deep.equals(["one", "two"]);
                });
            });

            // Characterization: a value assigned whole is changed in place as before
            it("changes a value assigned whole in place, when read again", async () => {
                const struct = unreported();

                await struct.online(TestContext(), ref => {
                    ref.list = ["one"];
                    listIn(ref.list).push("two");
                    ref.sub = { foo: "bar", inner: [] };
                    structIn(ref.sub).foo = "baz";

                    expect(rawValuesOf(ref)).deep.equals({ 0: ["one", "two"], 1: { foo: "baz", inner: [] } });
                });
            });

            // Characterization: a nullable mandatory struct reads null as before
            it("reads null for a nullable struct", async () => {
                const struct = TestStruct(
                    {
                        sub: {
                            id: 0,
                            type: "struct",
                            conformance: "M",
                            quality: "X",
                            children: [FieldElement({ name: "foo", id: 0, type: "string" })],
                        },
                    },
                    {},
                    "id",
                );

                await struct.online(TestContext(), ref => {
                    expect(ref.sub).equals(null);
                });
            });

            // Characterization: a reported list is changed in place as before
            it("changes a reported list in place", async () => {
                const struct = unreported({ 0: ["one"] });

                await struct.online(TestContext(), ref => {
                    listIn(ref.list).push("two");

                    expect(rawValuesOf(ref)[0]).deep.equals(["one", "two"]);
                });
            });

            // Characterization: a reported struct and the list inside it are changed in place as before
            it("changes a field and a list inside a reported struct in place", async () => {
                const struct = unreported({ 1: { foo: "bar", inner: ["in"] } });

                await struct.online(TestContext(), ref => {
                    const sub = structIn(ref.sub);
                    sub.foo = "baz";
                    listIn(sub.inner).push("two");

                    expect(rawValuesOf(ref)[1]).deep.equals({ foo: "baz", inner: ["in", "two"] });
                });
            });

            describe("patched on a client node", () => {
                const entry = FieldElement({
                    name: "entry",
                    type: "struct",
                    children: [
                        FieldElement({ name: "foo", id: 0, type: "string" }),
                        FieldElement({ name: "bar", id: 1, type: "string", default: "dflt" }),
                    ],
                });
                const patchFields = {
                    list: { id: 0, type: "list", children: [entry] },
                    sub: {
                        id: 1,
                        type: "struct",
                        quality: "X",
                        children: [
                            FieldElement({ name: "foo", id: 0, type: "string" }),
                            FieldElement({ name: "bar", id: 1, type: "string", default: "dflt" }),
                            FieldElement({ name: "inner", id: 2, type: "list", children: [entry] }),
                        ],
                    },
                };
                const supervisor = RootSupervisor.for(withSupportedBar(new FieldModel(structOf(patchFields))));
                const members = supervisor.membersOf(supervisor.schema);
                const path = new DataModelPath("TestStruct");

                /** Marks each "bar" field supported, so the local defaults of its struct hold its default. */
                function withSupportedBar<T extends Model>(model: T): T {
                    for (const child of model.children) {
                        if (child.name === "bar") {
                            child.operationalIsSupported = true;
                        }
                        withSupportedBar(child);
                    }
                    return model;
                }

                function patch(changes: Val.Struct, ref: Val.Struct) {
                    supervisor.patch(changes, ref, path);
                }

                function patchSub(changes: Val.Struct, sub: Val) {
                    supervisor.get(members.require("sub")).patch(changes, structIn(sub), path.at("sub"));
                }

                function patchList(changes: Val.Struct, list: Val) {
                    supervisor.get(members.require("list")).patch(changes, listIn(list), path.at("list"));
                }

                function mirrored(values: Val.Struct = {}) {
                    return TestStruct(patchFields, values, { mirrorsRemote: true });
                }

                it("replaces a struct with the given one, without the fields it leaves out", async () => {
                    const struct = mirrored({ 1: { foo: "one", bar: "two", inner: [] } });

                    await struct.online(TestContext(), ref => {
                        patch({ sub: { foo: "three" } }, ref);

                        expect(rawValuesOf(ref)[1]).deep.equals({ foo: "three" });
                    });
                });

                it("assigns a struct to an absent member without local defaults", async () => {
                    const struct = mirrored();

                    await struct.online(TestContext(), ref => {
                        patch({ sub: { foo: "three" } }, ref);

                        expect(rawValuesOf(ref)[1]).deep.equals({ foo: "three" });
                    });
                });

                it("assigns a struct to a null member without local defaults", async () => {
                    const struct = mirrored({ 1: null });

                    await struct.online(TestContext(), ref => {
                        patch({ sub: { foo: "three" } }, ref);

                        expect(rawValuesOf(ref)[1]).deep.equals({ foo: "three" });
                    });
                });

                it("replaces a list without the entry fields the given entries leave out", async () => {
                    const struct = mirrored({ 0: [{ foo: "one", bar: "two" }] });

                    await struct.online(TestContext(), ref => {
                        patch({ list: [{ foo: "three" }] }, ref);

                        expect(rawValuesOf(ref)[0]).deep.equals([{ foo: "three" }]);
                    });
                });

                it("assigns a list to an absent member without entry defaults", async () => {
                    const struct = mirrored();

                    await struct.online(TestContext(), ref => {
                        patch({ list: [{ foo: "three" }] }, ref);

                        expect(rawValuesOf(ref)[0]).deep.equals([{ foo: "three" }]);
                    });
                });

                it("replaces a list inside a struct as part of the struct", async () => {
                    const struct = mirrored({ 1: { foo: "one", inner: [{ foo: "in", bar: "two" }] } });

                    await struct.online(TestContext(), ref => {
                        patch({ sub: { inner: [{ foo: "three" }] } }, ref);

                        expect(rawValuesOf(ref)[1]).deep.equals({ inner: [{ foo: "three" }] });
                    });
                });

                it("assigns a member of a cached struct whole when the patch targets the struct", async () => {
                    const struct = mirrored({ 1: { foo: "one", inner: [{ foo: "in", bar: "two" }] } });

                    await struct.online(TestContext(), ref => {
                        patchSub({ inner: [{ foo: "three" }] }, ref.sub);

                        expect(rawValuesOf(ref)[1]).deep.equals({ foo: "one", inner: [{ foo: "three" }] });
                    });
                });

                it("assigns an entry of a cached list whole when the patch targets the list", async () => {
                    const struct = mirrored({ 0: [{ foo: "one", bar: "two" }] });

                    await struct.online(TestContext(), ref => {
                        patchList({ 0: { foo: "three" } }, ref.list);

                        expect(rawValuesOf(ref)[0]).deep.equals([{ foo: "three" }]);
                    });
                });

                it("appends an entry by index without entry defaults when the patch targets the list", async () => {
                    const struct = mirrored({ 0: [{ foo: "one", bar: "two" }] });

                    await struct.online(TestContext(), ref => {
                        patchList({ 1: { foo: "x" } }, ref.list);

                        expect(rawValuesOf(ref)[0]).deep.equals([{ foo: "one", bar: "two" }, { foo: "x" }]);
                    });
                });

                it("refuses a list member given as an object, storing nothing", async () => {
                    const struct = mirrored({ 0: [{ foo: "one", bar: "two" }] });

                    await struct.online(TestContext(), ref => {
                        expect(() => patch({ list: { 0: { foo: "three" } } }, ref)).throws(
                            ImplementationError,
                            "a list is written whole, so give the complete list as an array",
                        );

                        expect(rawValuesOf(ref)[0]).deep.equals([{ foo: "one", bar: "two" }]);
                    });
                });

                // A patch inside an uncached value changes it in place, so it is refused
                it("refuses a patch that targets a struct the cache does not hold", async () => {
                    const struct = TestStruct(unreportedFields, {}, { mirrorsRemote: true });
                    const unreportedSupervisor = RootSupervisor.for(new FieldModel(structOf(unreportedFields)));
                    const sub = unreportedSupervisor.membersOf(unreportedSupervisor.schema).require("sub");

                    await struct.online(TestContext(), ref => {
                        expect(() =>
                            unreportedSupervisor.get(sub).patch({ foo: "bar" }, structIn(ref.sub), path.at("sub")),
                        ).throws(UncachedValueError);

                        expect(rawValuesOf(ref)).deep.equals({});
                    });
                });

                // Characterization: a local node merges a struct into its struct and a list into its list
                it("patches a struct and the entries of a list on a local node", async () => {
                    const struct = TestStruct(patchFields, {
                        list: [{ foo: "one", bar: "two" }],
                        sub: { foo: "one", bar: "two", inner: [] },
                    });

                    await struct.online(TestContext(), ref => {
                        patch({ list: [{ foo: "three" }], sub: { foo: "three" } }, ref);

                        expect(rawValuesOf(ref).list).deep.equals([{ foo: "three", bar: "two" }]);
                        expect(rawValuesOf(ref).sub).deep.equals({ foo: "three", bar: "two", inner: [] });
                    });
                });
            });

            it("refuses a change through a held reference after a rollback removed its member", async () => {
                const struct = unreported();

                await struct.online(TestContext(), async (ref, cx) => {
                    const held = listIn(ref.list);
                    ref.list = ["one"];
                    expect(held).deep.equals(["one"]);

                    await cx.transaction.rollback();

                    expect(held).deep.equals([]);
                    expect(() => held.push("two")).throws(UncachedValueError);
                    expect(rawValuesOf(ref)).deep.equals({});
                });
            });

            // Characterization: validation refuses to remove a mandatory member, so the held reference stays live
            it("keeps a held reference live when its member cannot be assigned undefined", async () => {
                const struct = unreported({ 0: ["one"] });

                await struct.online(TestContext(), ref => {
                    const held = listIn(ref.list);

                    expect(() => (ref.list = undefined)).throws(ConformanceError);
                    held.push("two");

                    expect(rawValuesOf(ref)[0]).deep.equals(["one", "two"]);
                });
            });
        });

        // A provisional element is not mandatory, so its default is not synthesized.
        it("does not synthesize a default for a provisional member", async () => {
            const struct = TestStruct({ prim: { id: 0, type: "uint8", conformance: "P, M" } }, {}, "id");

            await struct.online(TestContext(), ref => {
                expect(ref.prim).undefined;
            });
        });

        it("reads a mandatory string as empty and a mandatory enum as undefined when unreported", async () => {
            const struct = TestStruct(
                {
                    label: { id: 0, type: "string", conformance: "M" },
                    mode: { id: 1, type: "enum8", conformance: "M" },
                },
                {},
                "id",
            );

            await struct.online(TestContext(), ref => {
                expect(ref.label).equals("");
                // An enumeration's fallback is manufacturer-specific per the Data Model specification
                expect(ref.mode).undefined;
            });
        });

        it("reads a nullable mandatory member as null when unreported", async () => {
            const struct = TestStruct({ prim: { id: 0, type: "uint8", conformance: "M", quality: "X" } }, {}, "id");

            await struct.online(TestContext(), ref => {
                expect(ref.prim).null;
            });
        });

        it("reads a nullable mandatory struct as null even when a nested member carries a default", async () => {
            const struct = TestStruct(
                {
                    sub: {
                        id: 0,
                        type: "struct",
                        conformance: "M",
                        quality: "X",
                        children: [
                            FieldElement({ name: "req", id: 0, type: "uint8", conformance: "M" }),
                            FieldElement({ name: "opt", id: 1, type: "uint8", conformance: "O", default: 7 }),
                        ],
                    },
                },
                {},
                "id",
            );

            await struct.online(TestContext(), ref => {
                expect(ref.sub).null;
            });
        });

        it("resolves a referenced default for a mandatory unreported primitive", async () => {
            const struct = TestStruct(
                {
                    src: { id: 1, type: "uint8" },
                    mirror: { id: 2, type: "uint8", conformance: "M", default: FieldValue.Reference("src") },
                },
                { 1: 5 },
                "id",
            );

            await struct.online(TestContext(), ref => {
                expect(ref.mirror).equals(5);
            });
        });

        it("passes a referenced sibling's null through to a nullable member", async () => {
            const struct = TestStruct(
                {
                    src: { id: 1, type: "uint8", quality: "X" },
                    mirror: {
                        id: 2,
                        type: "uint8",
                        conformance: "M",
                        quality: "X",
                        default: FieldValue.Reference("src"),
                    },
                },
                { 1: null },
                "id",
            );

            await struct.online(TestContext(), ref => {
                expect(ref.mirror).null;
            });
        });

        it("substitutes the datatype default when a referenced sibling is null but the member is not nullable", async () => {
            const struct = TestStruct(
                {
                    src: { id: 1, type: "uint8", quality: "X" },
                    mirror: { id: 2, type: "uint8", conformance: "M", default: FieldValue.Reference("src") },
                },
                { 1: null },
                "id",
            );

            await struct.online(TestContext(), ref => {
                expect(ref.mirror).equals(0);
            });
        });

        it("recursively synthesizes a mandatory struct's mandatory members, omitting optional ones", async () => {
            const struct = TestStruct(
                {
                    sub: {
                        id: 0,
                        type: "struct",
                        conformance: "M",
                        children: [
                            FieldElement({ name: "req", id: 0, type: "uint8", conformance: "M" }),
                            FieldElement({ name: "opt", id: 1, type: "uint8", conformance: "O" }),
                        ],
                    },
                },
                {},
                "id",
            );

            await struct.online(TestContext(), ref => {
                expect(ref.sub).deep.equals({ req: 0, opt: undefined });
            });
        });

        it("refuses a change of an explicit struct default without changing the model's own default", async () => {
            const explicitDefault = { foo: "bar" };
            const struct = TestStruct(
                {
                    sub: {
                        id: 0,
                        type: "struct",
                        conformance: "M",
                        default: { type: FieldValue.properties, properties: explicitDefault },
                        children: [FieldElement({ name: "foo", id: 0, type: "string" })],
                    },
                },
                {},
                "id",
            );

            await struct.online(TestContext(), ref => {
                const first = structIn(ref.sub);
                expect(first).deep.equals({ foo: "bar" });

                expect(() => (first.foo = "mutated")).throws(UncachedValueError);

                expect(ref.sub).deep.equals({ foo: "bar" });
                expect(rawValuesOf(ref)).deep.equals({});
                expect(explicitDefault).deep.equals({ foo: "bar" });
            });
        });

        // Characterizes the server-side (name-keyed) path: synthesis is id-keyed-only, so a name-keyed container
        // never synthesizes regardless of conformance.
        it("does not synthesize a default for an absent mandatory member of a name-keyed container", async () => {
            const struct = TestStruct({ prim: { id: 0, type: "uint8", conformance: "M" } });

            await struct.online(TestContext(), ref => {
                expect(ref.prim).undefined;
            });
        });

        // Characterization: a name-keyed container has no default, as before
        it("does not synthesize a default through a held value of a mandatory member of a name-keyed container that a rollback removed", async () => {
            const struct = TestStruct({
                sub: {
                    id: 0,
                    type: "struct",
                    conformance: "M",
                    children: [FieldElement({ name: "foo", id: 0, type: "string" })],
                },
            });

            await struct.online(TestContext(), async (ref, cx) => {
                ref.sub = { foo: "bar" };
                const held = ref.sub as Val.Struct;
                expect(held.foo).equals("bar");

                await cx.transaction.rollback();

                expect(() => held.foo).throws(PhantomReferenceError);
            });
        });

        it("does not compute a referenced default for an optional unreported member of an id-keyed container", async () => {
            const struct = TestStruct(referencedDefaultFields("O"), { 1: { foo: "bar" } }, "id");

            await struct.online(TestContext(), ref => {
                expect(ref.mirror).undefined;
            });
        });

        // A default taken from a sibling is a copy made on first read
        it("computes a referenced default for a mandatory unreported member of an id-keyed container as a copy", async () => {
            const struct = TestStruct(referencedDefaultFields("M"), { 1: { foo: "bar" } }, "id");

            await struct.online(TestContext(), ref => {
                const mirror = structIn(ref.mirror);
                expect(mirror).deep.equals({ foo: "bar" });

                ref.src = { foo: "changed" };

                expect(mirror).deep.equals({ foo: "bar" });
                expect(() => (mirror.foo = "mutated")).throws(UncachedValueError);
                expect(ref.src).deep.equals({ foo: "changed" });
            });
        });

        it("keeps a referenced default when the transaction changes the source in place", async () => {
            const struct = TestStruct(referencedDefaultFields("M"), {}, "id");

            await struct.online(TestContext(), ref => {
                ref.src = { foo: "bar" };
                const mirror = structIn(ref.mirror);
                expect(mirror).deep.equals({ foo: "bar" });

                structIn(ref.src).foo = "changed";

                expect(mirror).deep.equals({ foo: "bar" });
            });
        });

        it("computes a referenced default for an absent member of a name-keyed container", async () => {
            const struct = TestStruct(referencedDefaultFields("O"), { src: { foo: "bar" } });

            await struct.online(TestContext(), ref => {
                expect(ref.mirror).deep.equals({ foo: "bar" });
            });
        });

        // Characterization: a name-keyed struct reads a referenced default from its parent as before
        it("computes a referenced default from a member of the parent struct", async () => {
            const struct = TestStruct(
                {
                    src: { id: 1, type: "struct", children: [FieldElement({ name: "foo", type: "string" })] },
                    sub: {
                        id: 2,
                        type: "struct",
                        children: [
                            FieldElement(
                                { name: "mirror", id: 0, type: "struct", default: FieldValue.Reference("src") },
                                FieldElement({ name: "foo", type: "string" }),
                            ),
                        ],
                    },
                },
                { src: { foo: "bar" }, sub: {} },
            );

            await struct.online(TestContext(), ref => {
                expect(structIn(ref.sub).mirror).deep.equals({ foo: "bar" });
            });
        });

        function referencedDefaultFields(mirrorConformance: string) {
            return {
                src: {
                    id: 1,
                    type: "struct",
                    children: [FieldElement({ name: "foo", type: "string" })],
                },
                mirror: {
                    id: 2,
                    type: "struct",
                    default: FieldValue.Reference("src"),
                    conformance: mirrorConformance,
                    children: [FieldElement({ name: "foo", type: "string" })],
                },
            };
        }

        // A report for a cluster or attribute the model cannot resolve decodes to TLV tag numbers, and that shape
        // persists.  A later model that does know the schema must still read those values.
        it("reads members of a value whose keys are TLV tag numbers", async () => {
            const struct = TestStruct({ substruct: SUBSTRUCT }, { 0: { 0: "hi", 1: { 0: "bar" }, 2: ["one"] } }, "id");

            await struct.online(TestContext(), ref => {
                const substruct = ref.substruct as Val.Struct;
                expect(substruct.prim).equals("hi");
                expect(substruct.nested).deep.equals({ foo: "bar" });
                expect(substruct.list).deep.equals(["one"]);
            });
        });

        it("reads members of a state class that supplies dynamic properties", async () => {
            const datasource = Datasource({
                entropy: MockCrypto(),
                type: DynamicState,
                supervisor: RootSupervisor.for(
                    new FieldModel(
                        FieldElement(
                            { name: "Struct", type: "struct" },
                            FieldElement({ name: "prim", id: 0, type: "string" }),
                            FieldElement(
                                { name: "sub", id: 1, type: "struct" },
                                FieldElement({ name: "foo", id: 0, type: "string" }),
                            ),
                        ),
                    ),
                ),
                location: { endpoint: EndpointNumber(1), path: new DataModelPath("DynamicState") },
                primaryKey: "id",
                store: { initialValues: { 0: "hi", 1: { foo: "bar" } }, set: async () => {} },
            });

            await LocalActorContext.act("test", cx => {
                const state = datasource.reference(cx) as unknown as Val.Struct;
                expect(state.prim).equals("hi");
                expect(state.sub).deep.equals({ foo: "bar" });
            });
        });

        describe("mandatory default synthesis under feature conformance", () => {
            const FeatureGated = new ClusterModel({
                id: 0xdeadbee2,
                name: "FeatureGated",
                children: [
                    FeatureMap.extend({
                        children: [{ tag: "field", name: "FT", description: "Feature", constraint: "0" }],
                    }),
                    { tag: "field", id: 1, name: "gated", type: "uint8", conformance: "FT" },
                ],
            });

            class FeatureGatedState {}

            async function testFeatureGated(featureOn: boolean, actor: (ref: Val.Struct) => MaybePromise) {
                const schema = FeatureGated.clone();
                if (featureOn) {
                    schema.supportedFeatures = new FeatureSet("FT");
                }

                const datasource = Datasource({
                    entropy: MockCrypto(),
                    type: FeatureGatedState,
                    supervisor: RootSupervisor.for(schema),
                    primaryKey: "id",
                    location: { endpoint: EndpointNumber(1), path: new DataModelPath(0) },
                });

                await LocalActorContext.act("test", cx => actor(datasource.reference(cx) as unknown as Val.Struct));
            }

            it("synthesizes a default when the gating feature is supported", async () => {
                await testFeatureGated(true, ref => {
                    expect(ref.gated).equals(0);
                });
            });

            it("reads undefined when the gating feature is not supported", async () => {
                await testFeatureGated(false, ref => {
                    expect(ref.gated).undefined;
                });
            });
        });

        // Mandatoriness is evaluated purely against the schema's supported features; a peer's AttributeList
        // (surfaced as Model#operationalIsSupported) must not move the outcome in either direction.
        describe("mandatory default synthesis ignores the peer's AttributeList", () => {
            class AttributeListOverrideState {}

            async function testAttributeListOverride(
                conformance: string,
                operationalIsSupported: boolean,
                actor: (ref: Val.Struct) => MaybePromise,
            ) {
                const schema = new FieldModel(structOf({ prim: { id: 0, type: "uint8", conformance } }));
                const [prim] = schema.children;
                prim.operationalIsSupported = operationalIsSupported;

                const datasource = Datasource({
                    entropy: MockCrypto(),
                    type: AttributeListOverrideState,
                    supervisor: RootSupervisor.for(schema),
                    primaryKey: "id",
                    location: { endpoint: EndpointNumber(1), path: new DataModelPath(0) },
                });

                await LocalActorContext.act("test", cx => actor(datasource.reference(cx) as unknown as Val.Struct));
            }

            it("reads undefined for an optional member even when the peer's AttributeList marks it supported", async () => {
                await testAttributeListOverride("O", true, ref => {
                    expect(ref.prim).undefined;
                });
            });

            it("synthesizes a default for a mandatory member even when the peer's AttributeList marks it unsupported", async () => {
                await testAttributeListOverride("M", false, ref => {
                    expect(ref.prim).equals(0);
                });
            });
        });
    });

    describe("dynamic containers with TLV-tag-keyed members", () => {
        // A name-keyed dynamic container (the default) whose members are stored under their element id, as when a
        // report for an unresolved schema decodes to TLV tag numbers. The collection getter must resolve such a
        // member the same way the primitive getter does.
        it("reads a collection member stored under its element id", async () => {
            const datasource = Datasource({
                entropy: MockCrypto(),
                type: DynamicState,
                supervisor: RootSupervisor.for(
                    new FieldModel(
                        FieldElement(
                            { name: "Struct", type: "struct" },
                            FieldElement(
                                { name: "sub", id: 1, type: "struct" },
                                FieldElement({ name: "foo", id: 0, type: "string" }),
                            ),
                        ),
                    ),
                ),
                location: { endpoint: EndpointNumber(1), path: new DataModelPath("DynamicState") },
                store: { initialValues: { 1: { foo: "bar" } }, set: async () => {} },
            });

            await LocalActorContext.act("test", cx => {
                const state = datasource.reference(cx) as unknown as Val.Struct;
                expect(state.sub).deep.equals({ foo: "bar" });
            });
        });
    });

    describe("dynamic member rollback", () => {
        // A rejected write to a member served by a Val.properties provider must restore the provider's previous
        // value — the container slot is absent for such members, so container-derived state would delete it
        it("restores a dynamic member's previous value when a write is rejected", async () => {
            class BackedDynamicState {
                backing: Val.Struct = { foo: "old" };

                [Val.properties]() {
                    return this.backing;
                }
            }

            const datasource = Datasource({
                entropy: MockCrypto(),
                type: BackedDynamicState,
                supervisor: RootSupervisor.for(
                    new FieldModel(
                        FieldElement(
                            { name: "Struct", type: "struct" },
                            FieldElement({ name: "foo", id: 0, type: "string", constraint: "max 4" }),
                        ),
                    ),
                ),
                location: { endpoint: EndpointNumber(1), path: new DataModelPath("BackedDynamicState") },
            });

            await LocalActorContext.act("test", cx => {
                const state = datasource.reference(cx) as unknown as Val.Struct;
                expect(state.foo).equals("old");

                expect(() => (state.foo = "too long")).throws();

                expect(state.foo).equals("old");
            });
        });
    });

    describe("conformance-based property variance", () => {
        it("uses correct model for disabled feature", async () => {
            await testDuality(false, struct => {
                struct.alive = false;

                expect(() => (struct.alive = true)).throws(ConstraintError);
            });
        });

        it("uses correct model for enabled feature", async () => {
            await testDuality(true, struct => {
                struct.alive = true;

                expect(() => (struct.alive = false)).throws(ConstraintError);
            });
        });
    });

    describe("assigned container", () => {
        type Entry = { value: number };
        type Lists = { a: Entry[]; b: Entry[] };

        function twoLists() {
            const entry = structOf({ value: "uint8" });
            return TestStruct({ a: listOf(entry), b: listOf(entry) }, { a: [{ value: 1 }], b: [] });
        }

        it("copies a list read from the same state", async () => {
            const struct = twoLists();

            await LocalActorContext.act("test", async cx => {
                const ref = struct.reference(cx) as Lists;
                ref.b = ref.a;
                ref.b.push({ value: 2 });
                ref.b[0].value = 3;
                expect(ref.a).deep.equals([{ value: 1 }]);
                await cx.transaction.rollback();
            });

            struct.expect({ a: [{ value: 1 }], b: [] });
        });

        it("copies a list read from the view", async () => {
            const struct = twoLists();

            await LocalActorContext.act("test", async cx => {
                const ref = struct.reference(cx) as Lists;
                ref.b = (struct.fields as Lists).a;
                ref.b[0].value = 3;
            });

            struct.expect({ a: [{ value: 1 }], b: [{ value: 3 }] });
        });

        it("copies a list entry read from the same list", async () => {
            const struct = twoLists();

            await LocalActorContext.act("test", async cx => {
                const ref = struct.reference(cx) as Lists;
                ref.a[1] = ref.a[0];
                ref.a[1].value = 3;
            });

            struct.expect({ a: [{ value: 1 }, { value: 3 }], b: [] });
        });

        it("copies a caller's list of structs", async () => {
            const struct = twoLists();
            const callerList = [{ value: 2 }];

            await LocalActorContext.act("test", async cx => {
                const ref = struct.reference(cx) as Lists;
                ref.b = callerList;
                ref.b[0].value = 3;
            });

            callerList.push({ value: 4 });

            expect(callerList).deep.equals([{ value: 2 }, { value: 4 }]);
            struct.expect({ a: [{ value: 1 }], b: [{ value: 3 }] });
        });

        it("copies a caller's struct", async () => {
            const struct = TestStruct({ member: structOf({ value: "uint8" }) }, { member: { value: 1 } });
            const callerStruct = { value: 2 };

            await LocalActorContext.act("test", async cx => {
                const ref = struct.reference(cx) as { member: { value: number } };
                ref.member = callerStruct;
                ref.member.value = 3;
            });

            expect(callerStruct).deep.equals({ value: 2 });
            struct.expect({ member: { value: 3 } });
        });

        it("copies a caller's nested struct", async () => {
            const struct = TestStruct(
                { member: structOf({ inner: structOf({ value: "uint8" }) }) },
                { member: { inner: { value: 1 } } },
            );
            const callerStruct = { inner: { value: 2 } };

            await LocalActorContext.act("test", async cx => {
                const ref = struct.reference(cx) as { member: { inner: { value: number } } };
                ref.member = callerStruct;
                ref.member.inner.value = 3;
            });

            expect(callerStruct).deep.equals({ inner: { value: 2 } });
            struct.expect({ member: { inner: { value: 3 } } });
        });

        it("keeps the symbol-keyed properties of a caller's struct", async () => {
            const struct = TestStruct({ member: structOf({ value: "uint8" }) }, { member: { value: 1 } });
            const marker = Symbol("marker");
            const callerStruct = { value: 2, [marker]: "kept" };

            await LocalActorContext.act("test", async cx => {
                const ref = struct.reference(cx) as { member: { value: number } };
                ref.member = callerStruct;
            });

            const stored = rawValuesOf(struct.fields).member;
            expect(stored).not.equals(callerStruct);
            expect(isObject(stored) && Reflect.get(stored, marker)).equals("kept");
        });

        it("copies a caller's list of primitives", async () => {
            const struct = TestStruct({ list: listOf("uint8") }, { list: [] });
            const callerList = [1];

            await LocalActorContext.act("test", async cx => {
                const ref = struct.reference(cx) as { list: number[] };
                ref.list = callerList;
                ref.list.push(2);
            });

            expect(callerList).deep.equals([1]);
            struct.expect({ list: [1, 2] });
        });
    });
});
