/**
 * @license
 * Copyright 2022-2025 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { ActionContext } from "#behavior/context/ActionContext.js";
import { LocalActorContext } from "#behavior/context/server/LocalActorContext.js";
import { Datasource } from "#behavior/state/managed/Datasource.js";
import { RootSupervisor } from "#behavior/supervision/RootSupervisor.js";
import { MaybePromise, MockCrypto } from "#general";
import { ClusterModel, DataModelPath, FeatureMap, FeatureSet, FieldElement } from "#model";
import { ConstraintError, Val } from "#protocol";
import { EndpointNumber, FabricIndex, NodeId } from "#types";
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
        location: { endpoint: EndpointNumber(1), path: DataModelPath(0) },
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
