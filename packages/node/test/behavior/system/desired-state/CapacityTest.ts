/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { assertCanAddItems, assertCapacity, CapacityCache } from "#behavior/system/desired-state/capacity.js";
import {
    AclCapacityExceededError,
    CapacityExceededError,
    GroupCapacityExceededError,
    GroupKeyCapacityExceededError,
} from "#behavior/system/desired-state/errors.js";
import { itemMapKey, ManagedItem } from "#behavior/system/desired-state/types.js";

describe("assertCapacity", () => {
    const cache: CapacityCache = {
        acl: { limit: 4, used: 3 },
        groupKey: { limit: 2, used: 2 },
        groupKeyMap: { limit: 4, used: 4 },
    };

    it("permits an add that stays within the limit", () => {
        expect(() => assertCapacity("acl", cache, 1)).not.throws();
    });

    it("throws the ACL-specific error when the add would exceed the limit", () => {
        expect(() => assertCapacity("acl", cache, 2)).throws(AclCapacityExceededError);
    });

    it("throws the group-key-specific error at a full limit", () => {
        expect(() => assertCapacity("groupKey", cache, 1)).throws(GroupKeyCapacityExceededError);
    });

    it("throws the group-specific error when the add would exceed the limit", () => {
        expect(() => assertCapacity("groupKeyMap", cache, 1)).throws(GroupCapacityExceededError);
    });

    it("throws the generic error for a kind with no specific subclass", () => {
        const full: CapacityCache = { binding: { limit: 1, used: 1 } };
        let thrown: unknown;
        try {
            assertCapacity("binding", full, 1);
        } catch (e) {
            thrown = e;
        }
        expect(thrown).instanceOf(CapacityExceededError);
        expect(thrown).not.instanceOf(AclCapacityExceededError);
    });

    it("is a no-op when the kind's capacity is unknown", () => {
        expect(() => assertCapacity("neverSeen", cache, 100)).not.throws();
    });
});

describe("assertCanAddItems", () => {
    function held(kind: string, key: string): Record<string, ManagedItem> {
        return {
            [itemMapKey(kind, key)]: {
                kind,
                key,
                intent: {},
                mode: "converge",
                status: { state: "committed", updateTimestamp: 0 },
                outstanding: "apply",
                generation: 1,
            },
        };
    }

    it("counts only keys desired state does not hold yet", () => {
        const state = { items: held("acl", "a"), capacities: { acl: { limit: 2, used: 1 } } };
        expect(() => assertCanAddItems(state, "acl", ["a", "b"])).not.throws();
        expect(() => assertCanAddItems(state, "acl", ["b", "c"])).throws(AclCapacityExceededError);
    });

    it("counts a key named twice once", () => {
        const state = { items: {}, capacities: { acl: { limit: 2, used: 1 } } };
        expect(() => assertCanAddItems(state, "acl", ["b", "b"])).not.throws();
    });

    it("refuses nothing while the kind has no snapshot", () => {
        expect(() => assertCanAddItems({ items: {}, capacities: {} }, "acl", ["a", "b", "c"])).not.throws();
    });
});
