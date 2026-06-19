/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { assertCapacity, CapacityCache } from "#behavior/system/desired-state/capacity.js";
import {
    AclCapacityExceededError,
    CapacityExceededError,
    GroupKeyCapacityExceededError,
} from "#behavior/system/desired-state/errors.js";

describe("assertCapacity", () => {
    const cache: CapacityCache = {
        acl: { limit: 4, used: 3 },
        groupKey: { limit: 2, used: 2 },
        unknownKindMapped: { limit: 5, used: 0 },
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
