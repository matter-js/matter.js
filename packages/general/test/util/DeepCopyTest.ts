/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { deepCopy } from "#util/DeepCopy.js";

describe("DeepCopy", () => {
    it("should return a new object, not the reference", () => {
        const obj = { a: 1 };
        const copiedObj = deepCopy(obj);
        expect(copiedObj).to.not.equal(obj);
    });

    it("should correctly copy primitive values", () => {
        const value = "test";
        const copiedValue = deepCopy(value);
        expect(copiedValue).to.equal(value);
    });

    it("should correctly copy array values", () => {
        const arr = [1, 2, 3];
        const copiedArr = deepCopy(arr);
        expect(copiedArr).to.deep.equal(arr);
        expect(copiedArr).to.not.equal(arr);
    });

    it("should correctly copy object values", () => {
        const obj = { a: 1, b: 2, c: 3 };
        const copiedObj = deepCopy(obj);
        expect(copiedObj).to.deep.equal(obj);
        expect(copiedObj).to.not.equal(obj);
    });

    it("should correctly copy nested structures", () => {
        const nested = { a: { b: { c: 1 } } };
        const copiedNested = deepCopy(nested);
        expect(copiedNested).to.deep.equal(nested);
        expect(copiedNested).to.not.equal(nested);
    });

    it("should correctly copy arrays of objects", () => {
        const arr = [{ a: 1 }, { b: 2 }, { c: 3 }];
        const copiedArr = deepCopy(arr);
        expect(copiedArr).to.deep.equal(arr);
        expect(copiedArr).to.not.equal(arr);

        // Check that each object in the array was deeply copied
        for (let i = 0; i < arr.length; i++) {
            expect(copiedArr[i]).to.deep.equal(arr[i]);
            expect(copiedArr[i]).to.not.equal(arr[i]);
        }
    });

    it("should correctly copy Set values", () => {
        const set = new Set([1, 2, 3]);
        const copiedSet = deepCopy(set);
        expect(copiedSet).to.be.instanceOf(Set);
        expect([...copiedSet]).to.deep.equal([...set]);
        expect(copiedSet).to.not.equal(set);
    });

    it("should deeply copy the members of a Set", () => {
        const member = { a: 1 };
        const set = new Set([member]);
        const copiedSet = deepCopy(set);
        const copiedMember = [...copiedSet][0];
        expect(copiedMember).to.deep.equal(member);
        expect(copiedMember).to.not.equal(member);
    });

    it("should correctly copy Map values", () => {
        const map = new Map<string, { v: number }>([
            ["a", { v: 1 }],
            ["b", { v: 2 }],
        ]);
        const copiedMap = deepCopy(map);
        expect(copiedMap).to.be.instanceOf(Map);
        expect([...copiedMap]).to.deep.equal([...map]);
        expect(copiedMap).to.not.equal(map);
        expect(copiedMap.get("a")).to.not.equal(map.get("a"));
    });
});
