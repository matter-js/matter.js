/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { KeySets, type OperationalKeySet } from "#groups/KeySets.js";
import { MatterFlowError } from "@matter/general";

function keySet(groupKeySetId: number, overrides: Partial<OperationalKeySet> = {}): OperationalKeySet {
    return {
        groupKeySetId,
        operationalEpochKey0: new Uint8Array(16),
        groupSessionId0: 100,
        epochStartTime0: 1_000,
        operationalEpochKey1: null,
        groupSessionId1: null,
        epochStartTime1: null,
        operationalEpochKey2: null,
        groupSessionId2: null,
        epochStartTime2: null,
        ...overrides,
    } as unknown as OperationalKeySet;
}

describe("KeySets", () => {
    describe("forId / add", () => {
        it("retrieves a key set by id", () => {
            const sets = new KeySets<OperationalKeySet>();
            const set = keySet(0);
            sets.add(set);

            expect(sets.forId(0)).equal(set);
            expect(sets.forId(99)).undefined;
        });

        it("replaces an existing key set with the same id", () => {
            const sets = new KeySets<OperationalKeySet>();
            sets.add(keySet(0));
            const replacement = keySet(0);
            sets.add(replacement);

            expect(sets.forId(0)).equal(replacement);
            expect(sets.size).equal(1);
        });
    });

    describe("allKeysForId", () => {
        it("throws for an unknown key set", () => {
            expect(() => new KeySets<OperationalKeySet>().allKeysForId(5)).throws(MatterFlowError, "not found");
        });

        it("returns the operational keys present", () => {
            const sets = new KeySets<OperationalKeySet>();
            sets.add(keySet(0));

            const keys = sets.allKeysForId(0);

            expect(keys).length(1);
            expect(keys[0].sessionId).equal(100);
        });
    });

    describe("currentKeyForId", () => {
        it("returns the only key for the default key set", () => {
            const sets = new KeySets<OperationalKeySet>();
            sets.add(keySet(0));

            expect(sets.currentKeyForId(0).sessionId).equal(100);
        });
    });
});
