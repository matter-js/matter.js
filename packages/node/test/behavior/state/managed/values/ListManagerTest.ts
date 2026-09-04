/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { ActionContext } from "#behavior/context/ActionContext.js";
import { LocalActorContext } from "#behavior/context/server/LocalActorContext.js";
import { MaybePromise } from "@matter/general";
import { MockExchange } from "@matter/node/testing";
import { ConformanceError, Val } from "@matter/protocol";
import { FabricIndex, NodeId } from "@matter/types";
import { TestStruct, aclEndpoint, listOf, structOf } from "./value-utils.js";

export type ValueList = { value: number }[];
export type ValueSubList = { value: number[] }[];

export interface TwoLists {
    cx1: ActionContext;
    cx2: ActionContext;
    list1: ValueList;
    list2: ValueList;
    subList1: ValueSubList;
    subList2: ValueSubList;
}

/**
 * A fabric-scoped list whose entry spells its index with the FabricIndex seed field, which states mandatory
 * conformance.  The manager supplies the index, so a caller that omits it must still be accepted.
 */
export async function testMandatoryFabricIndex(
    actor: (list: ValueList, ref: Val.Struct) => MaybePromise,
    defaults: Val.Struct = { list: [] },
) {
    const struct = TestStruct(
        {
            list: listOf(
                structOf({
                    fabricIndex: "FabricIndex",
                    value: "uint8",
                }),
                { access: "F" },
            ),
        },
        defaults,
    );

    const cx = {
        fabricFiltered: true,
        exchange: new MockExchange({ fabricIndex: FabricIndex(1), nodeId: NodeId(1) }),
        node: aclEndpoint(),
    };

    return struct.online2(cx, cx, async ({ cx1, ref1 }) => {
        await actor(ref1.list as ValueList, ref1);
        await cx1.transaction.commit();
    });
}

export async function testFabricScoped(actor: (struct: TestStruct, lists: TwoLists) => MaybePromise) {
    const struct = TestStruct(
        {
            list: listOf(
                structOf({
                    fabricIndex: "fabric-idx",
                    value: "uint8",
                }),
                { access: "F" },
            ),
            subList: listOf(
                structOf({
                    fabricIndex: "fabric-idx",
                    value: listOf("uint8"),
                }),
                { access: "F" },
            ),
        },
        {
            list: [],
            subList: [],
        },
    );

    const cx1 = {
        fabricFiltered: true,
        exchange: new MockExchange({ fabricIndex: FabricIndex(1), nodeId: NodeId(1) }),
        node: aclEndpoint(),
    };

    const cx2 = {
        fabricFiltered: true,
        exchange: new MockExchange({ fabricIndex: FabricIndex(2), nodeId: NodeId(2) }),
        node: aclEndpoint(),
    };

    return struct.online2(cx1, cx2, async ({ cx1, cx2, ref1, ref2 }) => {
        const list1 = ref1.list as ValueList;
        const list2 = ref2.list as ValueList;

        list1[0] = { value: 1 };
        await cx1.transaction.commit();
        list2[0] = { value: 2 };
        await cx2.transaction.commit();
        list1[1] = { value: 3 };
        await cx1.transaction.commit();
        list2[1] = { value: 4 };
        await cx2.transaction.commit();

        const subList1 = ref1.subList as ValueSubList;
        const subList2 = ref2.subList as ValueSubList;
        subList1[0] = { value: [11, 12] };
        await cx1.transaction.commit();
        subList2[0] = { value: [13, 14] };
        await cx2.transaction.commit();

        await actor(struct, { cx1, cx2, list1, list2, subList1, subList2 });
    });
}

describe("ListManager", () => {
    it("basic get/set with primitive datatype", async () => {
        const struct = TestStruct({ list: listOf("string") }, { list: [] });

        await struct.online(
            {
                exchange: new MockExchange({ fabricIndex: FabricIndex(1), nodeId: NodeId(1) }),
                node: aclEndpoint(),
            },
            async ref => {
                const list = ref.list as string[];

                list[0] = "hi";
                list[1] = "there";
                list[0] = "HI";

                expect(list[0]).equals("HI");
                expect(list[1]).equals("there");
                expect(list.length).equals(2);
            },
        );

        struct.expect({ list: ["HI", "there"] });
        expect(struct.notifies).deep.equals([{ index: "list", oldValue: [], newValue: ["HI", "there"] }]);
    });

    it("basic get/set with struct", async () => {
        const struct = TestStruct(
            {
                list: listOf(
                    structOf({
                        value1: "string",
                        value2: "uint8",
                    }),
                ),
            },
            { list: [] },
        );

        await struct.online(
            {
                exchange: new MockExchange({ fabricIndex: FabricIndex(1), nodeId: NodeId(1) }),
                node: aclEndpoint(),
            },
            async ref => {
                const list = ref.list as { value1: string; value2: number }[];

                list.push({ value1: "hi", value2: 1 });

                expect(list[0]).deep.equals({ value1: "hi", value2: 1 });
                expect(list.length).equals(1);
            },
        );

        struct.expect({ list: [{ value1: "hi", value2: 1 }] });
        expect(struct.notifies).deep.equals([{ index: "list", oldValue: [], newValue: [{ value1: "hi", value2: 1 }] }]);
    });

    it("basic array functions", async () => {
        const struct = TestStruct({ list: listOf("string") }, { list: [] });

        await struct.online(
            {
                exchange: new MockExchange({ fabricIndex: FabricIndex(1), nodeId: NodeId(1) }),
                node: aclEndpoint(),
            },
            async (ref, cx) => {
                const list = ref.list as string[];

                list[0] = "hi";
                list.push("there");
                list.splice(0, 1, "HI");
                list.unshift("hey");

                expect(list[0]).equals("hey");
                expect(list[1]).equals("HI");
                expect(list[2]).equals("there");

                await cx.transaction.commit();
                struct.expect({ list: ["hey", "HI", "there"] });

                expect(list.length).equals(3);

                expect(list.pop()).equals("there");
                expect(list.shift()).equals("hey");
                expect(list.length).equals(1);
            },
        );

        struct.expect({ list: ["HI"] });
        expect(struct.notifies).deep.equals([
            { index: "list", oldValue: [], newValue: ["hey", "HI", "there"] },
            { index: "list", oldValue: ["hey", "HI", "there"], newValue: ["HI"] },
        ]);
    });

    it("basic array iteration", async () => {
        const struct = TestStruct({ list: listOf("string") }, { list: [] });

        await struct.online(
            {
                exchange: new MockExchange({ fabricIndex: FabricIndex(1), nodeId: NodeId(1) }),
                node: aclEndpoint(),
            },
            async ref => {
                const list = ref.list as string[];

                ((list[0] = "hi"), (list[1] = "there"));
                list[2] = "aaaaand goodbye";

                const list2 = Array<string>();

                for (const value of list) {
                    list2.push(value);
                }

                expect(list2).deep.equals(["hi", "there", "aaaaand goodbye"]);
            },
        );
    });

    it("fabric-scoped get/set", async () => {
        await testFabricScoped(async (struct, { cx1, cx2, list1, list2, subList1, subList2 }) => {
            struct.expect({
                list: [
                    { fabricIndex: 1, value: 1 },
                    { fabricIndex: 2, value: 2 },
                    { fabricIndex: 1, value: 3 },
                    { fabricIndex: 2, value: 4 },
                ],
                subList: [
                    { fabricIndex: 1, value: [11, 12] },
                    { fabricIndex: 2, value: [13, 14] },
                ],
            });

            expect(list1[0]).deep.equals({ fabricIndex: 1, value: 1 });
            expect(list2[0]).deep.equals({ fabricIndex: 2, value: 2 });
            expect(list1[1]).deep.equals({ fabricIndex: 1, value: 3 });
            expect(list2[1]).deep.equals({ fabricIndex: 2, value: 4 });

            expect(subList1[0]).deep.equals({ fabricIndex: 1, value: [11, 12] });
            expect(subList2[0]).deep.equals({ fabricIndex: 2, value: [13, 14] });

            list1[0] = { value: 5 };
            subList1[0] = { value: [15, 16] };
            await cx1.transaction.commit();
            list2[1] = { value: 6 };
            subList2[1] = { value: [17, 18] };
            await cx2.transaction.commit();

            expect(list1[0]).deep.equals({ fabricIndex: 1, value: 5 });
            expect(subList1[0]).deep.equals({ fabricIndex: 1, value: [15, 16] });
            expect(list2[1]).deep.equals({ fabricIndex: 2, value: 6 });
            expect(subList2[1]).deep.equals({ fabricIndex: 2, value: [17, 18] });

            struct.expect({
                list: [
                    { fabricIndex: 1, value: 5 },
                    { fabricIndex: 2, value: 2 },
                    { fabricIndex: 1, value: 3 },
                    { fabricIndex: 2, value: 6 },
                ],
                subList: [
                    { fabricIndex: 1, value: [15, 16] },
                    { fabricIndex: 2, value: [13, 14] },
                    { fabricIndex: 2, value: [17, 18] },
                ],
            });

            list1[1].value = 7;
            await cx1.transaction.commit();
            subList2[0].value = [19];
            await cx2.transaction.commit();

            struct.expect({
                list: [
                    { fabricIndex: 1, value: 5 },
                    { fabricIndex: 2, value: 2 },
                    { fabricIndex: 1, value: 7 },
                    { fabricIndex: 2, value: 6 },
                ],
                subList: [
                    { fabricIndex: 1, value: [15, 16] },
                    { fabricIndex: 2, value: [19] },
                    { fabricIndex: 2, value: [17, 18] },
                ],
            });

            expect(list1.length).equals(2);
            expect(list2.length).equals(2);
            expect(subList1.length).equals(1);
            expect(subList2.length).equals(2);
        });
    });

    it("fabric-scoped basic array methods", async () => {
        await testFabricScoped(async (struct, { cx1, cx2, list1, list2 }) => {
            list1.push({ value: 5 });
            await cx1.transaction.commit();
            list2.push({ value: 6 });
            await cx2.transaction.commit();

            struct.expect({
                list: [
                    { fabricIndex: 1, value: 1 },
                    { fabricIndex: 2, value: 2 },
                    { fabricIndex: 1, value: 3 },
                    { fabricIndex: 2, value: 4 },
                    { fabricIndex: 1, value: 5 },
                    { fabricIndex: 2, value: 6 },
                ],
                subList: [
                    { fabricIndex: 1, value: [11, 12] },
                    { fabricIndex: 2, value: [13, 14] },
                ],
            });

            list1.splice(1, 1); // removes element value 3
            await cx1.transaction.commit();
            list2.splice(1, 1); // removes element value 4
            await cx2.transaction.commit();

            struct.expect({
                list: [
                    { fabricIndex: 1, value: 1 },
                    { fabricIndex: 2, value: 2 },
                    { fabricIndex: 1, value: 5 },
                    { fabricIndex: 2, value: 6 },
                ],
                subList: [
                    { fabricIndex: 1, value: [11, 12] },
                    { fabricIndex: 2, value: [13, 14] },
                ],
            });

            list1.pop(); // removes element value 5
            await cx1.transaction.commit();
            list2.shift(); // removes element value 2
            await cx2.transaction.commit();

            struct.expect({
                list: [
                    { fabricIndex: 1, value: 1 },
                    { fabricIndex: 2, value: 6 },
                ],
                subList: [
                    { fabricIndex: 1, value: [11, 12] },
                    { fabricIndex: 2, value: [13, 14] },
                ],
            });

            list1.unshift({ value: 7 });
            await cx1.transaction.commit();
            list2.push({ value: 8 });
            await cx2.transaction.commit();

            struct.expect({
                list: [
                    { fabricIndex: 1, value: 7 },
                    { fabricIndex: 2, value: 6 },
                    { fabricIndex: 1, value: 1 },
                    { fabricIndex: 2, value: 8 },
                ],
                subList: [
                    { fabricIndex: 1, value: [11, 12] },
                    { fabricIndex: 2, value: [13, 14] },
                ],
            });

            /* TODO these two cases are buggy!! In fact when values are swapped around it seems that the value is set
                but the "managed reference" is the same so as soon as the first value is set on the entry of the second
                (even after reading that before) it breaks
            list1.reverse();
            await cx1.transaction.commit();
            list2.reverse();
            await cx2.transaction.commit();

            struct.expect({
                list: [
                    { fabricIndex: 1, value: 1 },
                    { fabricIndex: 2, value: 8 },
                    { fabricIndex: 1, value: 7 }, // Test fails: value 1
                    { fabricIndex: 2, value: 6 }, // test fails: value 8
                ],
            });

            list1.sort((a, b) => a.value - b.value);
            await cx1.transaction.commit();
            list2.sort((a, b) => a.value - b.value);
            await cx2.transaction.commit();

            struct.expect({
                list: [
                    { fabricIndex: 1, value: 1 },
                    { fabricIndex: 2, value: 6 },
                    { fabricIndex: 1, value: 7 }, // test fails value 1
                    { fabricIndex: 2, value: 8 },
                ],
            });*/

            list1.length = 0;
            await cx1.transaction.commit();

            struct.expect({
                list: [
                    { fabricIndex: 2, value: 6 },
                    { fabricIndex: 2, value: 8 },
                ],
                subList: [
                    { fabricIndex: 1, value: [11, 12] },
                    { fabricIndex: 2, value: [13, 14] },
                ],
            });

            list2.length = 0;
            await cx2.transaction.commit();

            struct.expect({
                list: [],
                subList: [
                    { fabricIndex: 1, value: [11, 12] },
                    { fabricIndex: 2, value: [13, 14] },
                ],
            });
        });
    });

    it("fabric scoped array iteration", async () => {
        await testFabricScoped(async (_struct, { cx1, cx2, list1, list2 }) => {
            list1.push({ value: 5 });
            await cx1.transaction.commit();
            list2.push({ value: 6 });
            await cx2.transaction.commit();

            list1.push({ value: 7 });
            await cx1.transaction.commit();
            list2.push({ value: 8 });
            await cx2.transaction.commit();

            const list1b = [] as typeof list1;
            for (const value of list1) {
                list1b.push(value);
            }

            expect(list1b).deep.equals([
                { fabricIndex: 1, value: 1 },
                { fabricIndex: 1, value: 3 },
                { fabricIndex: 1, value: 5 },
                { fabricIndex: 1, value: 7 },
            ]);
        });
    });

    describe("list that is not fabric-scoped", () => {
        // The same write paths as the fabric-scoped cases, where nothing completes an entry on the caller's behalf
        async function testPlainList(
            actor: (list: ValueList, ref: Val.Struct) => MaybePromise,
            defaults: Val.Struct = { list: [] },
        ) {
            const struct = TestStruct({ list: listOf(structOf({ value: "uint8" })) }, defaults);

            await struct.online(
                {
                    exchange: new MockExchange({ fabricIndex: FabricIndex(1), nodeId: NodeId(1) }),
                    node: aclEndpoint(),
                },
                async ref => {
                    await actor(ref.list as ValueList, ref);
                },
            );

            return struct;
        }

        it("accepts an entry assigned by index", async () => {
            const struct = await testPlainList(list => {
                list[0] = { value: 1 };
            });

            struct.expect({ list: [{ value: 1 }] });
        });

        it("accepts a whole list assigned to a member that had none", async () => {
            const struct = await testPlainList((_list, ref) => {
                ref.list = [{ value: 2 }];
            }, {});

            struct.expect({ list: [{ value: 2 }] });
        });

        it("rejects an invalid entry assigned by index", async () => {
            const struct = await testPlainList(list => {
                expect(() => (list[0] = { value: 99999 })).throw();
            });

            struct.expect({ list: [] });
        });

        it("leaves a member that had no list absent when an entry is rejected", async () => {
            const struct = await testPlainList((_list, ref) => {
                expect(() => (ref.list = [{ value: 99999 }])).throw();
                expect(ref.list).undefined;
            }, {});

            expect(struct.fields.list).undefined;
        });

        it("supplies no fabric for an entry that omits a mandatory fabricIndex", async () => {
            const struct = TestStruct(
                { list: listOf(structOf({ fabricIndex: "FabricIndex", value: "uint8" })) },
                { list: [] },
            );

            await struct.online(
                {
                    exchange: new MockExchange({ fabricIndex: FabricIndex(1), nodeId: NodeId(1) }),
                    node: aclEndpoint(),
                },
                ref => {
                    expect(() => ((ref.list as ValueList)[0] = { value: 1 })).throw(ConformanceError);
                },
            );
        });
    });

    describe("entry with mandatory fabricIndex", () => {
        it("accepts an entry assigned by index", async () => {
            await testMandatoryFabricIndex(list => {
                list[0] = { value: 1 };
            });
        });

        it("accepts an entry appended with push", async () => {
            await testMandatoryFabricIndex(list => {
                list.push({ value: 2 });
            });
        });

        it("accepts a whole list assigned over an existing one", async () => {
            await testMandatoryFabricIndex((list, ref) => {
                list[0] = { value: 1 };
                ref.list = [{ value: 2 }, { value: 3 }];
            });
        });

        it("accepts a whole list assigned to a member that had none", async () => {
            await testMandatoryFabricIndex((_list, ref) => {
                ref.list = [{ value: 4 }];
                expect(ref.list).deep.equals([{ fabricIndex: 1, value: 4 }]);
            }, {});
        });

        it("leaves a member that had no list absent when an entry is rejected", async () => {
            await testMandatoryFabricIndex((_list, ref) => {
                expect(() => (ref.list = [{ value: 99999 }])).throw();
                expect(ref.list).undefined;
            }, {});
        });

        // A behavior populating a fabric-scoped attribute at startup has no session, so nothing supplies the fabric
        it("refuses an entry stored with no session to supply the fabric", async () => {
            const struct = TestStruct(
                { list: listOf(structOf({ fabricIndex: "FabricIndex", value: "uint8" }), { access: "F" }) },
                {},
            );

            await LocalActorContext.act("test", async cx => {
                const ref = struct.reference(cx);
                expect(() => (ref.list = [{ value: 1 }])).throw(ConformanceError);
                expect(ref.list).undefined;
            });

            expect(struct.fields.list).undefined;
        });

        it("supplies the accessing fabric for an entry that omits it", async () => {
            await testMandatoryFabricIndex(list => {
                list[0] = { value: 3 };
                expect(list[0]).deep.equals({ fabricIndex: 1, value: 3 });
            });
        });
    });
});
