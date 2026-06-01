/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import type { Fabric } from "#fabric/Fabric.js";
import { Groups } from "#groups/Groups.js";
import type { KeySets, OperationalKeySet } from "#groups/KeySets.js";
import { FabricId, GroupId } from "@matter/types";

function groups() {
    const fabric = { fabricId: FabricId(0x1122334455667788n) } as Fabric;
    const keySets = {} as unknown as KeySets<OperationalKeySet>;
    return new Groups(fabric, keySets);
}

describe("Groups", () => {
    describe("multicastAddress", () => {
        it("derives a stable per-group multicast address for the fabric", () => {
            const g = groups();

            expect(g.multicastAddress(GroupId(5))).equal("ff35:40:fd11:2233:4455:6677:8800:5");
            expect(g.multicastAddress(GroupId(5))).equal(g.multicastAddress(GroupId(5)));
        });

        it("rejects an invalid group id", () => {
            expect(() => groups().multicastAddress(GroupId(0))).throws();
        });
    });

    describe("idMap", () => {
        it("applies additions from a replacement map", () => {
            const g = groups();

            g.idMap = new Map([
                [GroupId(1), 10],
                [GroupId(2), 20],
            ]);

            expect(g.idMap.get(GroupId(1))).equal(10);
            expect(g.idMap.get(GroupId(2))).equal(20);
        });

        it("removes entries absent from a replacement map", () => {
            const g = groups();
            g.idMap = new Map([
                [GroupId(1), 10],
                [GroupId(2), 20],
            ]);

            g.idMap = new Map([[GroupId(1), 10]]);

            expect(g.idMap.get(GroupId(1))).equal(10);
            expect(g.idMap.get(GroupId(2))).undefined;
        });
    });
});
