/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { ActionContext } from "#behavior/context/ActionContext.js";
import { LocalActorContext } from "#behavior/context/server/LocalActorContext.js";
import { Datasource } from "#behavior/state/managed/Datasource.js";
import { Internal } from "#behavior/state/managed/Internal.js";
import { RootSupervisor } from "#behavior/supervision/RootSupervisor.js";
import { MaybePromise, MockCrypto } from "@matter/general";
import {
    ClusterModel,
    DataModelPath,
    FeatureMap,
    FeatureSet,
    FieldElement,
    FieldModel,
    FieldValue,
} from "@matter/model";
import { ConstraintError, Val } from "@matter/protocol";
import { EndpointNumber, FabricIndex, NodeId } from "@matter/types";
import { MockExchange } from "../../../../node/mock-exchange.js";
import { aclEndpoint, TestStruct } from "./value-utils.js";

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

        function rawValuesOf(ref: Val.Struct) {
            return (ref as unknown as Internal.Collection)[Internal.reference].value as Val.Struct;
        }

        // An id-keyed container never falls back to the property-name slot.  A mandatory member (conformance
        // evaluated against the mirror's supported features) still reads a value -- synthesized from the schema,
        // not from the property-name slot.  An optional member reads undefined either way.
        it("reads a mandatory member as its datatype default and an optional member as undefined, when reported only under its property name", async () => {
            const struct = TestStruct(
                {
                    prim: { id: 0, type: "uint8", conformance: "M" },
                    opt: { id: 1, type: "uint8", conformance: "O" },
                    sub: {
                        id: 2,
                        type: "struct",
                        conformance: "M",
                        children: [FieldElement({ name: "foo", id: 0, type: "string" })],
                    },
                },
                { prim: 5, opt: 5, sub: { foo: "bar" } },
                "id",
            );

            await struct.online(TestContext(), ref => {
                expect(ref.prim).equals(0);
                expect(ref.opt).undefined;
                // "foo" is a string with no explicit conformance (optional), so it contributes nothing to the
                // recursively-synthesized default
                expect(ref.sub).deep.equals({});
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
                expect(ref.sub).deep.equals({ req: 0 });
            });
        });

        it("synthesizes a fresh value per read, so consumer mutation cannot corrupt later reads", async () => {
            const struct = TestStruct(
                {
                    arr: {
                        id: 0,
                        type: "list",
                        conformance: "M",
                        children: [FieldElement({ name: "entry", type: "string" })],
                    },
                },
                {},
                "id",
            );

            await struct.online(TestContext(), ref => {
                const first = ref.arr as Val.List;
                expect(first).deep.equals([]);

                first.push("x");

                expect(ref.arr).deep.equals([]);
            });
        });

        it("does not synthesize a default for an absent mandatory member of a name-keyed container", async () => {
            const struct = TestStruct({ prim: { id: 0, type: "uint8", conformance: "M" } });

            await struct.online(TestContext(), ref => {
                expect(ref.prim).undefined;
            });
        });

        it("does not compute a referenced default for an optional unreported member of an id-keyed container", async () => {
            const struct = TestStruct(referencedDefaultFields("O"), { 1: { foo: "bar" } }, "id");

            await struct.online(TestContext(), ref => {
                expect(ref.mirror).undefined;
            });
        });

        it("computes a referenced default for a mandatory unreported member of an id-keyed container", async () => {
            const struct = TestStruct(referencedDefaultFields("M"), { 1: { foo: "bar" } }, "id");

            await struct.online(TestContext(), ref => {
                expect(ref.mirror).deep.equals({ foo: "bar" });
            });
        });

        it("computes a referenced default for an absent member of a name-keyed container", async () => {
            const struct = TestStruct(referencedDefaultFields("O"), { src: { foo: "bar" } });

            await struct.online(TestContext(), ref => {
                expect(ref.mirror).deep.equals({ foo: "bar" });
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
});
