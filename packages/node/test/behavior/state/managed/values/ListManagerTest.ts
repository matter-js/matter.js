/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { ActionContext } from "#behavior/context/ActionContext.js";
import { LocalActorContext } from "#behavior/context/server/LocalActorContext.js";
import { MaybePromise } from "@matter/general";
import { MockExchange } from "@matter/node/testing";
import { ConformanceError, ExpiredReferenceError, PhantomReferenceError, Val, WriteError } from "@matter/protocol";
import { FabricIndex, NodeId } from "@matter/types";
import { TestCluster, TestStruct, aclEndpoint, fieldOf, listOf, rawValuesOf, structOf } from "./value-utils.js";

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

    it("does not filter a list in a fabric-sensitive struct field", async () => {
        const struct = TestStruct(
            { targets: listOf(structOf({ cluster: "uint32" }), { access: "RW S" }) },
            { targets: [{ cluster: 6 }, { cluster: 8 }] },
        );

        await struct.online(
            {
                fabricFiltered: true,
                exchange: new MockExchange({ fabricIndex: FabricIndex(1), nodeId: NodeId(1) }),
                node: aclEndpoint(),
            },
            async (ref, cx) => {
                expect([...(ref.targets as { cluster: number }[])]).deep.equals([{ cluster: 6 }, { cluster: 8 }]);

                ref.targets = [{ cluster: 9 }];
                await cx.transaction.commit();
                expect(rawValuesOf(struct.fields).targets).deep.equals([{ cluster: 9 }]);
            },
        );
    });

    it("masks another fabric's sensitive field in the entries a sort comparator receives", async () => {
        const struct = TestStruct(
            {
                list: listOf(structOf({ FabricIndex: "fabric-idx", secret: { type: "uint8", access: "RW S" } }), {
                    access: "RW",
                }),
            },
            {
                list: [
                    { fabricIndex: 2, secret: 7 },
                    { fabricIndex: 1, secret: 3 },
                ],
            },
        );

        await struct.online(
            {
                fabricFiltered: false,
                exchange: new MockExchange({ fabricIndex: FabricIndex(1), nodeId: NodeId(1) }),
                node: aclEndpoint(),
            },
            ref => {
                const secrets = new Set<number | undefined>();
                (ref.list as { fabricIndex: number; secret?: number }[]).sort((a, b) => {
                    secrets.add(a.secret);
                    secrets.add(b.secret);
                    return a.fabricIndex - b.fabricIndex;
                });
                expect([...secrets].sort()).deep.equals([3, undefined]);
            },
        );
    });

    describe("fabric-sensitive list attribute", () => {
        function sensitiveList() {
            return TestCluster(
                {
                    list: {
                        type: "list",
                        access: "RW S",
                        children: [fieldOf("entry", structOf({ fabricIndex: "fabric-idx", value: "uint8" }))],
                    },
                },
                {
                    list: [
                        { fabricIndex: 1, value: 1 },
                        { fabricIndex: 2, value: 2 },
                        { fabricIndex: 1, value: 3 },
                    ],
                },
            );
        }

        function contextFor(index: number, options: { fabricFiltered?: boolean; command?: boolean }) {
            return {
                ...options,
                exchange: new MockExchange({ fabricIndex: FabricIndex(index), nodeId: NodeId(index) }),
                node: aclEndpoint(),
            };
        }

        for (const fabricFiltered of [false, true]) {
            it(`returns only the accessing fabric's entries on a read with fabricFiltered ${fabricFiltered}`, async () => {
                await sensitiveList().online2(
                    contextFor(1, { fabricFiltered }),
                    contextFor(2, { fabricFiltered }),
                    ({ ref1, ref2 }) => {
                        expect([...(ref1.list as ValueList)]).deep.equals([
                            { fabricIndex: 1, value: 1 },
                            { fabricIndex: 1, value: 3 },
                        ]);
                        expect([...(ref2.list as ValueList)]).deep.equals([{ fabricIndex: 2, value: 2 }]);
                    },
                );
            });
        }

        it("returns all entries to a command handler", async () => {
            await sensitiveList().online(contextFor(1, { command: true }), ref => {
                expect((ref.list as ValueList).length).equals(3);
            });
        });

        it("keeps other fabrics' entries when a write context replaces the list", async () => {
            const struct = sensitiveList();
            await struct.online(contextFor(1, { fabricFiltered: true }), async (ref, cx) => {
                ref.list = (ref.list as ValueList).filter(({ value }) => value !== 1);
                await cx.transaction.commit();

                const stored = [...(rawValuesOf(struct.fields).list as ValueList)];
                expect(stored.sort((a, b) => a.value - b.value)).deep.equals([
                    { fabricIndex: 2, value: 2 },
                    { fabricIndex: 1, value: 3 },
                ]);
            });
        });
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

            list1.reverse();
            await cx1.transaction.commit();
            list2.reverse();
            await cx2.transaction.commit();

            struct.expect({
                list: [
                    { fabricIndex: 1, value: 1 },
                    { fabricIndex: 2, value: 8 },
                    { fabricIndex: 1, value: 7 },
                    { fabricIndex: 2, value: 6 },
                ],
                subList: [
                    { fabricIndex: 1, value: [11, 12] },
                    { fabricIndex: 2, value: [13, 14] },
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
                    { fabricIndex: 1, value: 7 },
                    { fabricIndex: 2, value: 8 },
                ],
                subList: [
                    { fabricIndex: 1, value: [11, 12] },
                    { fabricIndex: 2, value: [13, 14] },
                ],
            });

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

    describe("fabric-filtered entry removal", () => {
        it("leaves the committed list unchanged on rollback", async () => {
            await testFabricScoped(async (struct, { cx1, list1 }) => {
                Reflect.deleteProperty(list1, 1);
                await cx1.transaction.rollback();

                expect(struct.fields.list).deep.equals([
                    { fabricIndex: 1, value: 1 },
                    { fabricIndex: 2, value: 2 },
                    { fabricIndex: 1, value: 3 },
                    { fabricIndex: 2, value: 4 },
                ]);
            });
        });

        it("reports the change when an entry of a fabric-filtered list is deleted", async () => {
            await testFabricScoped(async (struct, { cx1, list1 }) => {
                struct.notifies.length = 0;

                Reflect.deleteProperty(list1, 0);
                await cx1.transaction.commit();

                expect(struct.notifies.map(({ index }) => index)).deep.equals(["list"]);
                expect(struct.fields.list).deep.equals([
                    { fabricIndex: 1, value: 3 },
                    { fabricIndex: 2, value: 2 },
                    { fabricIndex: 2, value: 4 },
                ]);
            });
        });

        it("rolls back a nested write to an entry that moved up after a delete", async () => {
            await testFabricScoped(async (struct, { cx1, list1 }) => {
                Reflect.deleteProperty(list1, 0);
                list1[0].value = 99;
                await cx1.transaction.rollback();

                expect(struct.fields.list).deep.equals([
                    { fabricIndex: 1, value: 1 },
                    { fabricIndex: 2, value: 2 },
                    { fabricIndex: 1, value: 3 },
                    { fabricIndex: 2, value: 4 },
                ]);
            });
        });

        it("leaves the caller's entry unchanged when it is pushed", async () => {
            await testFabricScoped(async (_struct, { list1 }) => {
                const entry = { value: 5 };
                list1.push(entry);
                expect(entry).deep.equals({ value: 5 });
            });
        });

        it("leaves the caller's entry unchanged when it is assigned to an index", async () => {
            await testFabricScoped(async (_struct, { list1 }) => {
                const entry = { value: 5 };
                const index = list1.length;
                list1[index] = entry;
                expect(entry).deep.equals({ value: 5 });
                expect(list1[index]).deep.equals({ fabricIndex: 1, value: 5 });
            });
        });

        it("iterates a fabric-filtered list that changes during the iteration", async () => {
            await testFabricScoped(async (_struct, { list1 }) => {
                const seen = new Array<number>();
                for (const entry of list1) {
                    seen.push(entry.value);
                    list1.shift();
                }
                expect(seen).deep.equals([1]);
            });
        });

        it("reports the change when pop() removes an entry from a fabric-filtered list", async () => {
            await testFabricScoped(async (struct, { cx1, list1 }) => {
                struct.notifies.length = 0;

                list1.pop();
                await cx1.transaction.commit();

                expect(struct.notifies.map(({ index }) => index)).deep.equals(["list"]);
                struct.expect({
                    list: [
                        { fabricIndex: 1, value: 1 },
                        { fabricIndex: 2, value: 2 },
                        { fabricIndex: 2, value: 4 },
                    ],
                    subList: [
                        { fabricIndex: 1, value: [11, 12] },
                        { fabricIndex: 2, value: [13, 14] },
                    ],
                });
            });
        });
    });

    describe("write bounds", () => {
        it("treats a key that is not a canonical number as no index", async () => {
            const struct = TestStruct({ list: listOf("uint8") }, { list: [1, 2] });

            await LocalActorContext.act("test", cx => {
                const list = struct.reference(cx).list as number[];
                expect(Reflect.get(list, "1.5")).undefined;
                expect(Reflect.has(list, "1.5")).false;
                expect(Reflect.get(list, "01")).undefined;
            });
        });

        async function writePlainList(defaults: Val.List, actor: (list: number[]) => void) {
            const struct = TestStruct({ list: listOf("uint8") }, { list: defaults });
            await LocalActorContext.act("test", cx => actor(struct.reference(cx).list as number[]));
            return struct;
        }

        it("refuses a write that would leave a gap", async () => {
            const struct = await writePlainList([1], list => {
                expect(() => (list[2] = 3)).throws(WriteError);
            });

            struct.expect({ list: [1] });
        });

        it("refuses a write beyond the maximum index with a write error", async () => {
            await writePlainList(new Array<number>(65536).fill(0), list => {
                expect(() => (list[65536] = 1)).throws(WriteError);
            });
        });

        it("refuses a length that is not a non-negative integer", async () => {
            const struct = await writePlainList([1, 2], list => {
                for (const length of [-1, 1.5, Number.NaN]) {
                    expect(() => (list.length = length)).throws(WriteError);
                }
            });

            struct.expect({ list: [1, 2] });
        });

        it("refuses to grow the list through its length", async () => {
            const struct = await writePlainList([1], list => {
                expect(() => (list.length = 3)).throws(WriteError);
            });

            struct.expect({ list: [1] });
        });

        it("refuses an entry without a value", async () => {
            const struct = await writePlainList([1, 2], list => {
                expect(() => Reflect.set(list, 0, undefined)).throws(WriteError);
            });

            struct.expect({ list: [1, 2] });
        });

        it("ignores a delete beyond the end and refuses one other than the last", async () => {
            const struct = await writePlainList([1, 2, 3], list => {
                expect(() => Reflect.deleteProperty(list, 1)).throws(WriteError);
                expect(Reflect.deleteProperty(list, 5)).true;
                expect(list.pop()).equals(3);
            });

            struct.expect({ list: [1, 2] });
        });

        it("refuses an insert beyond the maximum length and leaves the list unchanged", async () => {
            const struct = await writePlainList(new Array<number>(65536).fill(0), list => {
                expect(() => list.unshift(1)).throws(WriteError);
                expect(list[0]).equals(0);
            });

            expect(struct.fields.list).length(65536);
        });

        it("ignores a delete beyond the end of a fabric-filtered list", async () => {
            await testFabricScoped(async (struct, { cx1, list1 }) => {
                struct.notifies.length = 0;

                expect(Reflect.deleteProperty(list1, 5)).true;
                await cx1.transaction.commit();

                expect(struct.notifies).length(0);
                expect(struct.fields.list).length(4);
            });
        });

        it("refuses to delete from a fabric-filtered list without write access", async () => {
            const struct = TestStruct(
                { list: listOf(structOf({ fabricIndex: "fabric-idx", value: "uint8" }), { access: "R F" }) },
                { list: [{ fabricIndex: 1, value: 1 }] },
            );

            await struct.online(
                {
                    fabricFiltered: true,
                    exchange: new MockExchange({ fabricIndex: FabricIndex(1), nodeId: NodeId(1) }),
                    node: aclEndpoint(),
                },
                ref => {
                    expect(() => Reflect.deleteProperty(ref.list as ValueList, 0)).throws("Permission denied");
                    expect(Reflect.deleteProperty(ref.list as ValueList, 5)).true;
                },
            );

            struct.expect({ list: [{ fabricIndex: 1, value: 1 }] });
        });

        it("refuses an entry of a fabric-filtered list that is not an object", async () => {
            await testFabricScoped(async (_struct, { list1 }) => {
                expect(() => Reflect.set(list1, 0, 5)).throws(WriteError);
                expect(() => Reflect.apply(Array.prototype.push, list1, [5])).throws(WriteError);
                expect(() => Reflect.apply(list1.splice, list1, [0, 0, 5])).throws(WriteError);
            });
        });

        it("refuses to grow a fabric-filtered list through its length", async () => {
            await testFabricScoped(async (struct, { cx1, list1 }) => {
                expect(() => (list1.length = 5)).throws(WriteError);
                await cx1.transaction.commit();

                expect(struct.fields.list).length(4);
            });
        });
    });

    describe("insert", () => {
        async function insertPlain(actor: (list: number[]) => void) {
            const struct = TestStruct({ list: listOf("uint8") }, { list: [1, 2, 3] });
            await LocalActorContext.act("test", cx => actor(struct.reference(cx).list as number[]));
            return struct;
        }

        it("inserts several entries at the front", async () => {
            const struct = await insertPlain(list => {
                expect(list.unshift(8, 9)).equals(5);
            });

            struct.expect({ list: [8, 9, 1, 2, 3] });
        });

        it("inserts several entries in the middle", async () => {
            const struct = await insertPlain(list => {
                expect(list.splice(1, 0, 7, 8, 9)).deep.equals([]);
            });

            struct.expect({ list: [1, 7, 8, 9, 2, 3] });
        });

        it("replaces one entry with two", async () => {
            const struct = await insertPlain(list => {
                expect(list.splice(1, 1, 7, 8)).deep.equals([2]);
            });

            struct.expect({ list: [1, 7, 8, 3] });
        });

        it("removes every entry from the start index when no count is given", async () => {
            const struct = await insertPlain(list => {
                expect(list.splice(1)).deep.equals([2, 3]);
            });

            struct.expect({ list: [1] });
        });

        it("inserts several structs at the front", async () => {
            const struct = TestStruct(
                { list: listOf(structOf({ value: "uint8" })) },
                { list: [{ value: 1 }, { value: 2 }] },
            );

            await LocalActorContext.act("test", cx => {
                const list = struct.reference(cx).list as { value: number }[];
                list.unshift({ value: 8 }, { value: 9 });
                expect(list.map(({ value }) => value)).deep.equals([8, 9, 1, 2]);
            });

            struct.expect({ list: [{ value: 8 }, { value: 9 }, { value: 1 }, { value: 2 }] });
        });

        it("leaves the entries before the insert point untouched", async () => {
            const struct = TestStruct(
                { list: listOf(structOf({ value: "uint8" })) },
                { list: [{ value: 1 }, { value: 2 }] },
            );

            await LocalActorContext.act("test", cx => {
                const list = struct.reference(cx).list as { value: number }[];
                list[0].value = 5;
                const first = rawValuesOf(list)[0];

                list.splice(1, 0, { value: 8 }, { value: 9 });

                expect(rawValuesOf(list)[0]).equals(first);
            });

            struct.expect({ list: [{ value: 5 }, { value: 8 }, { value: 9 }, { value: 2 }] });
        });

        it("leaves the list unchanged when a pushed entry is rejected", async () => {
            const struct = await insertPlain(list => {
                expect(() => list.push(4, 300)).throws();
                expect([...list]).deep.equals([1, 2, 3]);
            });

            struct.expect({ list: [1, 2, 3] });
        });

        it("leaves the list unchanged when an inserted entry is rejected", async () => {
            const struct = await insertPlain(list => {
                expect(() => list.unshift(0, 300)).throws();
                expect([...list]).deep.equals([1, 2, 3]);
            });

            struct.expect({ list: [1, 2, 3] });
        });

        it("sorts a list of structs", async () => {
            const struct = TestStruct(
                { list: listOf(structOf({ value: "uint8" })) },
                { list: [{ value: 3 }, { value: 1 }, { value: 2 }] },
            );

            await LocalActorContext.act("test", cx => {
                const list = struct.reference(cx).list as { value: number }[];
                expect(list.sort((a, b) => a.value - b.value)).equals(list);
            });

            struct.expect({ list: [{ value: 1 }, { value: 2 }, { value: 3 }] });
        });

        it("reverses a list of structs", async () => {
            const struct = TestStruct(
                { list: listOf(structOf({ value: "uint8" })) },
                { list: [{ value: 1 }, { value: 2 }] },
            );

            await LocalActorContext.act("test", cx => {
                (struct.reference(cx).list as { value: number }[]).reverse();
            });

            struct.expect({ list: [{ value: 2 }, { value: 1 }] });
        });

        it("inserts into a fabric-filtered list that holds an entry without a fabric", async () => {
            const struct = TestStruct(
                { list: listOf(structOf({ fabricIndex: "fabric-idx", value: "uint8" }), { access: "F" }) },
                { list: [{ value: 1 }, { fabricIndex: 1, value: 2 }] },
            );

            await struct.online(
                {
                    fabricFiltered: true,
                    exchange: new MockExchange({ fabricIndex: FabricIndex(1), nodeId: NodeId(1) }),
                    node: aclEndpoint(),
                },
                ref => {
                    (ref.list as ValueList).unshift({ value: 5 });
                },
            );

            expect(struct.fields.list).deep.equals([
                { fabricIndex: 1, value: 5 },
                { fabricIndex: undefined, value: 1 },
                { fabricIndex: 1, value: 2 },
            ]);
        });

        it("returns a removed entry that is a list as a read-only view", async () => {
            const struct = TestStruct(
                { list: listOf(listOf(structOf({ value: "uint8" }))) },
                { list: [[{ value: 1 }], [{ value: 2 }]] },
            );

            await LocalActorContext.act("test", cx => {
                const list = struct.reference(cx).list as { value: number }[][];
                const removed = list.pop()!;
                expect(removed[0].value).equals(2);
                expect(() => (removed[0].value = 7)).throws(ExpiredReferenceError);
            });

            struct.expect({ list: [[{ value: 1 }]] });
        });

        it("returns removed entries as read-only views", async () => {
            const struct = TestStruct(
                { list: listOf(structOf({ value: "uint8" })) },
                { list: [{ value: 1 }, { value: 2 }] },
            );

            await LocalActorContext.act("test", async cx => {
                const list = struct.reference(cx).list as { value: number }[];
                const [removed] = list.splice(0, 1);
                expect(removed.value).equals(1);
                expect(() => (removed.value = 7)).throws(ExpiredReferenceError);
                await cx.transaction.rollback();
            });

            struct.expect({ list: [{ value: 1 }, { value: 2 }] });
        });

        it("returns the removed entry from pop() and shift()", async () => {
            const struct = TestStruct(
                { list: listOf(structOf({ value: "uint8" })) },
                { list: [{ value: 1 }, { value: 2 }, { value: 3 }] },
            );

            await LocalActorContext.act("test", cx => {
                const list = struct.reference(cx).list as { value: number }[];
                expect(list.shift()).deep.equals({ value: 1 });
                expect(list.pop()).deep.equals({ value: 3 });
            });

            struct.expect({ list: [{ value: 2 }] });
        });

        it("resolves field names for entries stored by tag number", async () => {
            const struct = TestStruct(
                { list: listOf(structOf({ value: { type: "uint8", id: 1 } })) },
                { list: [{ 1: 3 }, { 1: 1 }, { 1: 2 }] },
            );

            await LocalActorContext.act("test", cx => {
                const list = struct.reference(cx).list as { value: number }[];
                list.sort((a, b) => a.value - b.value);
                expect(list.pop()?.value).equals(3);
            });

            expect(rawValuesOf(struct.fields).list).deep.equals([{ 1: 1 }, { 1: 2 }]);
        });

        it("stores a separate copy when copyWithin() duplicates an entry the transaction changed", async () => {
            const struct = TestStruct(
                { list: listOf(structOf({ value: "uint8" })) },
                { list: [{ value: 1 }, { value: 2 }] },
            );

            await LocalActorContext.act("test", cx => {
                const list = struct.reference(cx).list as { value: number }[];
                list[0].value = 5;
                list.copyWithin(1, 0);
                list[1].value = 9;
            });

            struct.expect({ list: [{ value: 5 }, { value: 9 }] });
        });

        it("clones an entry again for a nested write after a commit", async () => {
            const struct = TestStruct({ list: listOf(structOf({ value: "uint8" })) }, { list: [{ value: 1 }] });

            await LocalActorContext.act("test", async cx => {
                const list = struct.reference(cx).list as { value: number }[];
                list[0].value = 5;
                await cx.transaction.commit();
                list[0].value = 9;
                await cx.transaction.rollback();
            });

            struct.expect({ list: [{ value: 5 }] });
        });

        it("refuses a change a sort comparator makes to an entry", async () => {
            const struct = TestStruct(
                { list: listOf(structOf({ value: "uint8" })) },
                { list: [{ value: 2 }, { value: 1 }] },
            );

            await LocalActorContext.act("test", cx => {
                const list = struct.reference(cx).list as { value: number }[];
                expect(() =>
                    list.sort(a => {
                        a.value = 9;
                        return 0;
                    }),
                ).throws(ExpiredReferenceError);
            });

            struct.expect({ list: [{ value: 2 }, { value: 1 }] });
        });

        it("sorts a list in default order without a comparator", async () => {
            const struct = TestStruct({ list: listOf("uint8") }, { list: [10, 9, 1] });

            await LocalActorContext.act("test", cx => {
                (struct.reference(cx).list as number[]).sort();
            });

            struct.expect({ list: [1, 10, 9] });
        });

        it("passes a sort comparator one copy per entry", async () => {
            const struct = TestStruct(
                { list: listOf(structOf({ value: "uint8" })) },
                { list: [{ value: 3 }, { value: 1 }, { value: 2 }] },
            );

            const seen = new Set<unknown>();
            await LocalActorContext.act("test", cx => {
                const list = struct.reference(cx).list as { value: number }[];
                list.sort((a, b) => {
                    seen.add(a);
                    seen.add(b);
                    return a.value - b.value;
                });
            });

            expect(seen.size).equals(3);
            struct.expect({ list: [{ value: 1 }, { value: 2 }, { value: 3 }] });
        });

        it("stores a separate copy for an entry that copyWithin() duplicates", async () => {
            const struct = TestStruct(
                { list: listOf(structOf({ value: "uint8" })) },
                { list: [{ value: 1 }, { value: 2 }] },
            );

            await LocalActorContext.act("test", cx => {
                const list = struct.reference(cx).list as { value: number }[];
                list.copyWithin(1, 0);
                list[1].value = 5;
            });

            struct.expect({ list: [{ value: 1 }, { value: 5 }] });
        });

        it("leaves the list unchanged when a splice inserts an entry without a value", async () => {
            const struct = TestStruct({ list: listOf("uint8") }, { list: [1, 2, 3] });

            await LocalActorContext.act("test", cx => {
                const list = struct.reference(cx).list as (number | undefined)[];
                expect(() => list.splice(0, 1, 5, undefined)).throws(WriteError);
                expect([...list]).deep.equals([1, 2, 3]);
            });

            struct.expect({ list: [1, 2, 3] });
        });

        it("refuses list edits without write access", async () => {
            const struct = TestStruct({ list: listOf("uint8", { access: "R V" }) }, { list: [1, 2] });

            await struct.online(
                {
                    exchange: new MockExchange({ fabricIndex: FabricIndex(1), nodeId: NodeId(1) }),
                    node: aclEndpoint(),
                },
                ref => {
                    const list = ref.list as number[];
                    expect(() => list.splice(0)).throws("Permission denied");
                    expect(() => (list.length = 0)).throws("Permission denied");
                    expect(() => (list[0] = 300)).throws("Permission denied");
                },
            );

            struct.expect({ list: [1, 2] });
        });

        it("rolls back a nested write to an entry that a list method moved", async () => {
            const struct = TestStruct(
                { list: listOf(structOf({ value: "uint8" })) },
                { list: [{ value: 1 }, { value: 2 }, { value: 3 }] },
            );

            await LocalActorContext.act("test", async cx => {
                const list = struct.reference(cx).list as { value: number }[];
                list.reverse();
                list[0].value = 99;
                list.shift();
                list[0].value = 98;
                await cx.transaction.rollback();
            });

            struct.expect({ list: [{ value: 1 }, { value: 2 }, { value: 3 }] });
        });

        it("rolls back a nested write to an entry moved within a fabric-filtered list", async () => {
            await testFabricScoped(async (struct, { cx1, list1 }) => {
                list1.reverse();
                list1[0].value = 99;
                await cx1.transaction.rollback();

                expect(struct.fields.list).deep.equals([
                    { fabricIndex: 1, value: 1 },
                    { fabricIndex: 2, value: 2 },
                    { fabricIndex: 1, value: 3 },
                    { fabricIndex: 2, value: 4 },
                ]);
            });
        });

        it("iterates managed entries of a fabric-filtered list", async () => {
            await testFabricScoped(async (struct, { cx1, list1 }) => {
                for (const entry of list1) {
                    entry.value = 9;
                }
                await cx1.transaction.rollback();

                expect(struct.fields.list).deep.equals([
                    { fabricIndex: 1, value: 1 },
                    { fabricIndex: 2, value: 2 },
                    { fabricIndex: 1, value: 3 },
                    { fabricIndex: 2, value: 4 },
                ]);
            });
        });

        it("inserts several entries into a fabric-filtered list", async () => {
            await testFabricScoped(async (struct, { cx1, list1 }) => {
                list1.unshift({ value: 5 }, { value: 6 });
                await cx1.transaction.commit();

                expect(struct.fields.list).deep.equals([
                    { fabricIndex: 1, value: 5 },
                    { fabricIndex: 2, value: 2 },
                    { fabricIndex: 1, value: 6 },
                    { fabricIndex: 2, value: 4 },
                    { fabricIndex: 1, value: 1 },
                    { fabricIndex: 1, value: 3 },
                ]);
            });
        });
    });

    describe("held entry reference", () => {
        const entries = () =>
            TestStruct(
                { list: listOf(structOf({ value: "uint8" })) },
                { list: [{ value: 1 }, { value: 2 }, { value: 3 }] },
            );

        it("expires when a list method moves its entry", async () => {
            const struct = entries();

            await LocalActorContext.act("test", cx => {
                const list = struct.reference(cx).list as { value: number }[];
                const held = list[0];
                list.reverse();

                expect(held.value).equals(1);
                expect(() => (held.value = 7)).throws(ExpiredReferenceError);
                expect(list[0].value).equals(3);
                expect(list[2].value).equals(1);
            });

            struct.expect({ list: [{ value: 3 }, { value: 2 }, { value: 1 }] });
        });

        it("stays live when a list method leaves its entry in place", async () => {
            const struct = entries();

            await LocalActorContext.act("test", cx => {
                const list = struct.reference(cx).list as { value: number }[];
                const held = list[0];
                list.splice(2, 1);
                held.value = 7;
            });

            struct.expect({ list: [{ value: 7 }, { value: 2 }] });
        });

        it("does not serve the entry a later push puts at the index of its removed entry", async () => {
            const struct = entries();

            await LocalActorContext.act("test", cx => {
                const list = struct.reference(cx).list as { value: number }[];
                const held = list[2];
                list.pop();
                list.push({ value: 9 });

                expect(held.value).equals(3);
                expect(() => (held.value = 7)).throws(ExpiredReferenceError);
                list[2].value = 8;
            });

            struct.expect({ list: [{ value: 1 }, { value: 2 }, { value: 8 }] });
        });

        it("expires when setting the length removes its entry", async () => {
            const struct = entries();

            await LocalActorContext.act("test", cx => {
                const list = struct.reference(cx).list as { value: number }[];
                const held = list[1];
                list.length = 1;
                list.push({ value: 9 });

                expect(held.value).equals(2);
                expect(() => (held.value = 7)).throws(ExpiredReferenceError);
            });

            struct.expect({ list: [{ value: 1 }, { value: 9 }] });
        });

        it("stays expired after the transaction that moved its entry rolls back", async () => {
            const struct = entries();

            await LocalActorContext.act("test", async cx => {
                const list = struct.reference(cx).list as { value: number }[];
                const held = list[0];
                list.reverse();
                await cx.transaction.rollback();

                expect(() => (held.value = 7)).throws(ExpiredReferenceError);
                list[0].value = 8;
            });

            struct.expect({ list: [{ value: 8 }, { value: 2 }, { value: 3 }] });
        });

        it("refuses a write below an entry a list method moved", async () => {
            await testFabricScoped(async (_struct, { subList1 }) => {
                subList1.push({ value: [15] });
                const held = subList1[0].value;
                subList1.reverse();

                expect(() => held.push(99)).throws(ExpiredReferenceError);
            });
        });

        it("expires when an entry is assigned to its index", async () => {
            const struct = entries();

            await LocalActorContext.act("test", cx => {
                const list = struct.reference(cx).list as { value: number }[];
                const held = list[0];
                list[0] = { value: 5 };

                expect(held.value).equals(1);
                expect(() => (held.value = 7)).throws(ExpiredReferenceError);
                expect(list[0].value).equals(5);
            });
        });

        it("expires when the whole list is assigned", async () => {
            const struct = entries();

            await LocalActorContext.act("test", cx => {
                const state = struct.reference(cx) as { list: { value: number }[] };
                const held = state.list[1];
                state.list = state.list.filter(entry => entry.value !== 1);

                expect(held.value).equals(2);
                expect(() => (held.value = 7)).throws(ExpiredReferenceError);
                state.list[1].value = 8;
            });

            struct.expect({ list: [{ value: 2 }, { value: 8 }] });
        });

        it("stays live at the source slot of copyWithin and expires at the overwritten slot", async () => {
            const struct = entries();

            await LocalActorContext.act("test", cx => {
                const list = struct.reference(cx).list as { value: number }[];
                const overwritten = list[0];
                const source = list[1];
                list.copyWithin(0, 1, 2);

                source.value = 7;
                expect(() => (overwritten.value = 9)).throws(ExpiredReferenceError);
                list[0].value = 5;
            });

            struct.expect({ list: [{ value: 5 }, { value: 7 }, { value: 3 }] });
        });

        it("stays live after a rollback of its own write", async () => {
            const struct = entries();

            await LocalActorContext.act("test", async cx => {
                const list = struct.reference(cx).list as { value: number }[];
                const held = list[0];
                held.value = 7;
                await cx.transaction.commit();
                held.value = 8;
                await cx.transaction.rollback();

                expect(held.value).equals(7);
                held.value = 9;
            });

            struct.expect({ list: [{ value: 9 }, { value: 2 }, { value: 3 }] });
        });

        it("does not serve the entry a push puts at its index after a rollback removed its entry", async () => {
            const struct = entries();

            await LocalActorContext.act("test", async cx => {
                const list = struct.reference(cx).list as { value: number }[];
                list.push({ value: 4 });
                const held = list[3];
                await cx.transaction.rollback();
                list.push({ value: 5 });

                expect(() => (held.value = 7)).throws(ExpiredReferenceError);
            });

            struct.expect({ list: [{ value: 1 }, { value: 2 }, { value: 3 }, { value: 5 }] });
        });

        it("follows its index after another transaction reorders the list", async () => {
            const struct = entries();
            const cx = {
                exchange: new MockExchange({ fabricIndex: FabricIndex(1), nodeId: NodeId(1) }),
                node: aclEndpoint(),
            };

            await struct.online2(cx, cx, async ({ cx2, ref1, ref2 }) => {
                const held = (ref1.list as ValueList)[0];
                (ref2.list as ValueList).reverse();
                await cx2.transaction.commit();

                expect(held.value).equals(3);
                held.value = 9;
                expect((ref1.list as ValueList)[0].value).equals(9);
            });
        });

        it("stays live after a rollback of its own write that followed another transaction's commit", async () => {
            const struct = entries();
            const cx = {
                exchange: new MockExchange({ fabricIndex: FabricIndex(1), nodeId: NodeId(1) }),
                node: aclEndpoint(),
            };

            await struct.online2(cx, cx, async ({ cx1, cx2, ref1, ref2 }) => {
                const held = (ref1.list as ValueList)[0];
                (ref2.list as ValueList).reverse();
                await cx2.transaction.commit();
                held.value = 9;
                await cx1.transaction.rollback();

                expect(held.value).equals(3);
                held.value = 8;
                expect((ref1.list as ValueList)[0].value).equals(8);
            });
        });

        it("expires when its own reorder puts back the entry another transaction's commit moved away", async () => {
            const struct = entries();
            const cx = {
                exchange: new MockExchange({ fabricIndex: FabricIndex(1), nodeId: NodeId(1) }),
                node: aclEndpoint(),
            };

            await struct.online2(cx, cx, async ({ cx2, ref1, ref2 }) => {
                const held = (ref1.list as ValueList)[0];
                (ref2.list as ValueList).reverse();
                await cx2.transaction.commit();
                (ref1.list as ValueList).reverse();

                expect(() => (held.value = 7)).throws(ExpiredReferenceError);
            });
        });

        it("expires when its own reorder puts back its committed copy that another transaction moved away", async () => {
            const struct = entries();
            const cx = {
                exchange: new MockExchange({ fabricIndex: FabricIndex(1), nodeId: NodeId(1) }),
                node: aclEndpoint(),
            };

            await struct.online2(cx, cx, async ({ cx1, cx2, ref1, ref2 }) => {
                const held = (ref1.list as ValueList)[0];
                held.value = 7;
                await cx1.transaction.commit();
                (ref2.list as ValueList).reverse();
                await cx2.transaction.commit();

                expect(held.value).equals(3);
                (ref1.list as ValueList).reverse();
                expect(() => (held.value = 8)).throws(ExpiredReferenceError);
            });
        });

        it("stays absent, not expired, after another transaction removes its entry", async () => {
            const struct = entries();
            const cx = {
                exchange: new MockExchange({ fabricIndex: FabricIndex(1), nodeId: NodeId(1) }),
                node: aclEndpoint(),
            };

            await struct.online2(cx, cx, async ({ cx2, ref1, ref2 }) => {
                const held = (ref1.list as ValueList)[2];
                (ref2.list as ValueList).pop();
                await cx2.transaction.commit();
                (ref1.list as ValueList)[0].value = 5;

                expect(() => (held.value = 7)).throws(PhantomReferenceError);
            });
        });

        it("expires on a fabric-filtered list when its entry is deleted", async () => {
            await testFabricScoped(async (_struct, { list1 }) => {
                const held = list1[0];
                Reflect.deleteProperty(list1, 0);

                expect(held.value).equals(1);
                expect(() => (held.value = 7)).throws(ExpiredReferenceError);
            });
        });

        it("reads an entry through its property descriptor as a managed entry", async () => {
            const struct = entries();

            await LocalActorContext.act("test", async cx => {
                const list = struct.reference(cx).list as { value: number }[];
                const entry = Object.getOwnPropertyDescriptor(list, 0)?.value as { value: number };

                expect(entry).equals(list[0]);
                entry.value = 250;
                await cx.transaction.rollback();
            });

            struct.expect({ list: [{ value: 1 }, { value: 2 }, { value: 3 }] });
        });

        it("reports no descriptor beyond the visible length of a fabric-filtered list", async () => {
            await testFabricScoped(async (_struct, { list1 }) => {
                expect(Object.getOwnPropertyDescriptor(list1, 0)?.value).equals(list1[0]);
                expect(Object.getOwnPropertyDescriptor(list1, 2)).undefined;
                expect(Object.getOwnPropertyDescriptor(list1, "length")?.value).equals(2);
            });
        });
    });
});
