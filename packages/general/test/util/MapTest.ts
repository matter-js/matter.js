/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { BasicMap } from "#util/Map.js";

describe("BasicMap", () => {
    it("behaves as a Map", () => {
        const map = new BasicMap<string, number>();
        map.set("a", 1);

        expect(map.get("a")).equal(1);
        expect(map.has("a")).equal(true);
        expect(map.size).equal(1);
    });

    it("emits added for a new key", () => {
        const map = new BasicMap<string, number>();
        const events = new Array<[string, number]>();
        map.added.on((key, value) => {
            events.push([key, value]);
        });

        map.set("a", 1);

        expect(events).deep.equal([["a", 1]]);
    });

    it("emits changed with the previous value", () => {
        const map = new BasicMap<string, number>();
        map.set("a", 1);
        const events = new Array<[string, number, number]>();
        map.changed.on((key, value, old) => {
            events.push([key, value, old]);
        });

        map.set("a", 2);

        expect(events).deep.equal([["a", 2, 1]]);
    });

    it("does not emit when the value is unchanged", () => {
        const map = new BasicMap<string, number>();
        map.set("a", 1);
        let emitted = false;
        map.changed.on(() => {
            emitted = true;
        });

        map.set("a", 1);

        expect(emitted).equal(false);
    });

    it("emits deleted with the removed value", () => {
        const map = new BasicMap<string, number>();
        map.set("a", 1);
        const events = new Array<[string, number]>();
        map.deleted.on((key, value) => {
            events.push([key, value]);
        });

        map.delete("a");

        expect(events).deep.equal([["a", 1]]);
    });

    it("emits deleted for every entry on clear", () => {
        const map = new BasicMap<string, number>();
        map.set("a", 1);
        map.set("b", 2);
        const events = new Array<[string, number]>();
        map.deleted.on((key, value) => {
            events.push([key, value]);
        });

        map.clear();

        expect(events).deep.equal([
            ["a", 1],
            ["b", 2],
        ]);
        expect(map.size).equal(0);
    });
});
