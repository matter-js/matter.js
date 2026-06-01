/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { BasicSet, MapOfIndexedSet } from "#util/Set.js";

interface Item {
    id: number;
    name: string;
}

describe("BasicSet", () => {
    describe("basic operations", () => {
        it("adds, tests and counts members", () => {
            const set = new BasicSet<number>(1, 2);

            expect(set.size).equal(2);
            expect(set.has(1)).equal(true);
            expect(set.has(3)).equal(false);
        });

        it("ignores duplicate additions", () => {
            const set = new BasicSet<number>();
            set.add(1);
            set.add(1);

            expect(set.size).equal(1);
        });

        it("deletes and clears", () => {
            const set = new BasicSet<number>(1, 2, 3);

            expect(set.delete(2)).equal(true);
            expect(set.delete(99)).equal(false);
            expect([...set]).members([1, 3]);

            set.clear();
            expect(set.size).equal(0);
        });

        it("supports map, find and filter", () => {
            const set = new BasicSet<number>(1, 2, 3);

            expect(set.map(n => n * 2).sort()).deep.equal([2, 4, 6]);
            expect(set.find(n => n === 2)).equal(2);
            expect(set.filter(n => n > 1).sort()).deep.equal([2, 3]);
        });
    });

    describe("observables", () => {
        it("emits added and deleted", () => {
            const set = new BasicSet<number>();
            const added = new Array<number>();
            const deleted = new Array<number>();
            set.added.on(n => {
                added.push(n);
            });
            set.deleted.on(n => {
                deleted.push(n);
            });

            set.add(1);
            set.delete(1);

            expect(added).deep.equal([1]);
            expect(deleted).deep.equal([1]);
        });

        it("tracks emptiness", () => {
            const set = new BasicSet<number>();
            const empties = new Array<boolean>();
            set.empty.on(value => {
                empties.push(value);
            });

            set.add(1);
            set.delete(1);

            expect(set.empty.value).equal(true);
            expect(empties).deep.equal([false, true]);
        });
    });

    describe("indexing", () => {
        it("looks up by field", () => {
            const a = { id: 1, name: "a" };
            const set = new BasicSet<Item>(a, { id: 2, name: "b" });

            expect(set.get("id", 1)).equal(a);
            expect(set.get("name", "b")?.id).equal(2);
            expect(set.get("id", 99)).undefined;
        });

        it("deletes by field/value", () => {
            const set = new BasicSet<Item>({ id: 1, name: "a" }, { id: 2, name: "b" });

            expect(set.delete("id", 1)).equal(true);
            expect(set.get("id", 1)).undefined;
            expect(set.size).equal(1);
        });
    });

    describe("mapOf", () => {
        it("adapts the set to a Map keyed by a field", () => {
            const set = new BasicSet<Item>({ id: 1, name: "a" });
            const map = set.mapOf("id");

            expect(map.get(1)?.name).equal("a");
            expect(map.has(1)).equal(true);
            expect(map.size).equal(1);
        });

        it("inserts via the map", () => {
            const set = new BasicSet<Item>();
            const map = set.mapOf("id");

            map.set(1, { id: 1, name: "a" });

            expect(set.get("id", 1)?.name).equal("a");
        });

        it("rejects a key that mismatches the value field", () => {
            const set = new BasicSet<Item>();
            const map = set.mapOf("id");

            expect(() => map.set(2, { id: 1, name: "a" })).throws(MapOfIndexedSet.KeyValueMismatchError);
        });
    });

    describe("MapOfIndexedSet", () => {
        it("getOrInsertComputed only computes when absent", () => {
            const set = new BasicSet<Item>({ id: 1, name: "a" });
            const map = new MapOfIndexedSet<Item, BasicSet<Item>, "id">(set, "id");

            let computed = 0;
            const existing = map.getOrInsertComputed(1, () => {
                computed++;
                return { id: 1, name: "x" };
            });
            expect(existing.name).equal("a");
            expect(computed).equal(0);

            map.getOrInsertComputed(2, () => {
                computed++;
                return { id: 2, name: "b" };
            });
            expect(computed).equal(1);
            expect(set.get("id", 2)?.name).equal("b");
        });

        it("getOrInsert returns existing or inserts", () => {
            const set = new BasicSet<Item>();
            const map = new MapOfIndexedSet<Item, BasicSet<Item>, "id">(set, "id");

            expect(map.getOrInsert(1, { id: 1, name: "a" }).name).equal("a");
            expect(map.getOrInsert(1, { id: 1, name: "b" }).name).equal("a");
        });
    });
});
