/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { ActionContext } from "#behavior/context/ActionContext.js";
import { LocalActorContext } from "#behavior/context/server/LocalActorContext.js";
import { Datasource } from "#behavior/state/managed/Datasource.js";
import { RootSupervisor } from "#behavior/supervision/RootSupervisor.js";
import { MaybePromise, MockCrypto } from "@matter/general";
import { ClusterModel, DataModelPath, FeatureMap, FeatureSet, FieldElement } from "@matter/model";
import { ConstraintError, Val } from "@matter/protocol";
import { EndpointNumber, FabricIndex, NodeId } from "@matter/types";
import { MockExchange } from "../../../../node/mock-exchange.js";
import { aclEndpoint, fieldOf, TestStruct } from "./value-utils.js";

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
        const INITIAL = { prim: "hi", nested: { foo: "bar" }, list: ["one"] };

        // The "0" slot is the attribute ID a client mirror stores its values under; the value itself is name-keyed
        function testIdKeyed(
            actor: (vars: {
                struct: TestStruct;
                cx: ActionContext;
                ref: Val.Struct;
                substruct: Val.Struct;
            }) => MaybePromise,
        ) {
            const struct = TestStruct(
                {
                    substruct: {
                        id: 0,
                        type: "struct",
                        children: [
                            fieldOf("prim", { id: 0, type: "string" }),
                            fieldOf("nested", {
                                id: 1,
                                type: "struct",
                                children: [FieldElement({ name: "foo", id: 0, type: "string" })],
                            }),
                            fieldOf("list", {
                                id: 2,
                                type: "list",
                                children: [FieldElement({ name: "entry", type: "string" })],
                            }),
                        ],
                    },
                },
                { 0: INITIAL },
                "id",
            );

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

                await cx.transaction.commit();

                expect(struct.notifies).deep.equals([
                    {
                        index: "substruct",
                        oldValue: INITIAL,
                        newValue: { prim: "changed", nested: { foo: "changed too" }, list: ["one"] },
                    },
                ]);
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
