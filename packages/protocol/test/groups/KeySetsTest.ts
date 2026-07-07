/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { KeySets, type OperationalKeySet } from "#groups/KeySets.js";
import { ImplementationError, MatterFlowError, Time } from "@matter/general";

const HOUR_US = 60 * 60 * 1000 * 1000;

/** Build a 3-slot key set whose slots carry distinct session ids 100/101/102 and the given epoch start times (µs). */
function threeKeySet(
    groupKeySetId: number,
    startTimes0Us: number,
    startTimes1Us: number,
    startTimes2Us: number,
): OperationalKeySet {
    return keySet(groupKeySetId, {
        operationalEpochKey0: Uint8Array.from({ length: 16 }, () => 0),
        groupSessionId0: 100,
        epochStartTime0: startTimes0Us,
        operationalEpochKey1: Uint8Array.from({ length: 16 }, () => 1),
        groupSessionId1: 101,
        epochStartTime1: startTimes1Us,
        operationalEpochKey2: Uint8Array.from({ length: 16 }, () => 2),
        groupSessionId2: 102,
        epochStartTime2: startTimes2Us,
    } as Partial<OperationalKeySet>);
}

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

        it("returns the newest non-future key when a future-dated key is installed", () => {
            const nowUs = Time.nowUs * 1000;
            const sets = new KeySets<OperationalKeySet>();
            sets.add(threeKeySet(5, nowUs - 2 * HOUR_US, nowUs - HOUR_US, nowUs + HOUR_US));

            expect(sets.currentKeyForId(5).sessionId).equal(101);
        });

        it("returns the newest key when all keys are in the past", () => {
            const nowUs = Time.nowUs * 1000;
            const sets = new KeySets<OperationalKeySet>();
            sets.add(threeKeySet(5, nowUs - 3 * HOUR_US, nowUs - 2 * HOUR_US, nowUs - HOUR_US));

            expect(sets.currentKeyForId(5).sessionId).equal(102);
        });

        it("throws when every key is in the future", () => {
            const nowUs = Time.nowUs * 1000;
            const sets = new KeySets<OperationalKeySet>();
            sets.add(threeKeySet(5, nowUs + HOUR_US, nowUs + 2 * HOUR_US, nowUs + 3 * HOUR_US));

            expect(() => sets.currentKeyForId(5)).throws(ImplementationError, "not in the future");
        });

        it("returns the second-newest key for the IPK key set (§4.14.2.6)", () => {
            const nowUs = Time.nowUs * 1000;
            const sets = new KeySets<OperationalKeySet>();
            sets.add(threeKeySet(0, nowUs - 3 * HOUR_US, nowUs - 2 * HOUR_US, nowUs - HOUR_US));

            expect(sets.currentKeyForId(0).sessionId).equal(101);
        });
    });

    describe("containsOperationalKey", () => {
        it("returns false for an unknown key set", () => {
            expect(new KeySets<OperationalKeySet>().containsOperationalKey(5, new Uint8Array(16))).equal(false);
        });

        it("matches an operational key present in the key set", () => {
            const key = Uint8Array.from({ length: 16 }, (_, i) => i);
            const sets = new KeySets<OperationalKeySet>();
            sets.add(keySet(1, { operationalEpochKey0: key }));

            expect(sets.containsOperationalKey(1, Uint8Array.from(key))).equal(true);
        });

        it("does not match a key absent from the key set", () => {
            const sets = new KeySets<OperationalKeySet>();
            sets.add(keySet(1, { operationalEpochKey0: Uint8Array.from({ length: 16 }, () => 1) }));

            expect(
                sets.containsOperationalKey(
                    1,
                    Uint8Array.from({ length: 16 }, () => 2),
                ),
            ).equal(false);
        });

        it("matches keys stored in a secondary slot", () => {
            const key = Uint8Array.from({ length: 16 }, () => 7);
            const sets = new KeySets<OperationalKeySet>();
            sets.add(keySet(1, { operationalEpochKey1: key, groupSessionId1: 101, epochStartTime1: 1_000 }));

            expect(sets.containsOperationalKey(1, Uint8Array.from(key))).equal(true);
        });

        it("matches across key sets that share identical key material (session id collision)", () => {
            const key = Uint8Array.from({ length: 16 }, (_, i) => i);
            const sets = new KeySets<OperationalKeySet>();
            sets.add(keySet(0x01a3, { operationalEpochKey0: key }));
            sets.add(keySet(0x01a4, { operationalEpochKey0: Uint8Array.from(key) }));

            expect(sets.containsOperationalKey(0x01a3, Uint8Array.from(key))).equal(true);
            expect(sets.containsOperationalKey(0x01a4, Uint8Array.from(key))).equal(true);
        });
    });
});
