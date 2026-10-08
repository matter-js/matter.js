/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { DriftBudget } from "#reconcile/DriftBudget.js";
import { Minutes } from "@matter/general";
import { ManagedItem } from "@matter/node";

function item(key: string, generation = 1): ManagedItem {
    return {
        kind: "acl",
        key,
        intent: {},
        mode: "maintain",
        status: { state: "committed", updateTimestamp: 0 },
        outstanding: "apply",
        generation,
    };
}

describe("DriftBudget", () => {
    before(() => {
        MockTime.init();
    });

    function budget(count = 3) {
        return new DriftBudget(() => ({ count, window: Minutes(10) }));
    }

    it("has budget until count re-applies are spent within the window", () => {
        const b = budget();
        const i = item("1");
        for (let n = 0; n < 3; n++) {
            expect(b.left(i)).equals(true);
            b.spend(i);
        }
        expect(b.left(i)).equals(false);
    });

    it("tracks items separately", () => {
        const b = budget(1);
        b.spend(item("1"));
        expect(b.left(item("2"))).equals(true);
    });

    it("regains budget when the oldest spend leaves the window", async () => {
        const b = budget();
        const i = item("1");
        b.spend(i);
        await MockTime.advance(Minutes(1));
        b.spend(i);
        b.spend(i);
        expect(b.left(i)).equals(false);
        await MockTime.advance(Minutes(9));
        expect(b.left(i)).equals(true);
        b.spend(i);
        expect(b.left(i)).equals(false);
    });

    it("treats another generation as empty", () => {
        const b = budget(1);
        b.spend(item("1", 1));
        expect(b.left(item("1", 1))).equals(false);
        expect(b.left(item("1", 2))).equals(true);
        expect(b.spent(item("1", 2))).equals(0);
    });

    it("does not carry a spend over a generation change", () => {
        const b = budget(2);
        b.spend(item("1", 1));
        b.spend(item("1", 2));
        expect(b.left(item("1", 2))).equals(true);
    });

    it("reset clears the item", () => {
        const b = budget(1);
        const i = item("1");
        b.spend(i);
        b.reset(i);
        expect(b.left(i)).equals(true);
        expect(b.spent(i)).equals(0);
    });

    it("counts the spends within the window", async () => {
        const b = budget();
        const i = item("1");
        expect(b.spent(i)).equals(0);
        b.spend(i);
        await MockTime.advance(Minutes(5));
        b.spend(i);
        expect(b.spent(i)).equals(2);
        await MockTime.advance(Minutes(5));
        expect(b.spent(i)).equals(1);
    });

    it("reads the budget on every call", () => {
        let count = 1;
        const b = new DriftBudget(() => ({ count, window: Minutes(10) }));
        const i = item("1");
        b.spend(i);
        expect(b.left(i)).equals(false);
        count = 2;
        expect(b.left(i)).equals(true);
    });
});
