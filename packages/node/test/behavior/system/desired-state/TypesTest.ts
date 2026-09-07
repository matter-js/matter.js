/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { itemMapKey, newStatus } from "#behavior/system/desired-state/types.js";

describe("desired-state types", () => {
    it("newStatus stamps state and current time", () => {
        MockTime.reset(1000);
        const status = newStatus("pending");
        expect(status.state).equals("pending");
        expect(status.updateTimestamp).equals(1000);
        expect(status.failureCode).equals(undefined);
    });

    it("newStatus records a failure code", () => {
        const status = newStatus("commitFailed", 0x86);
        expect(status.state).equals("commitFailed");
        expect(status.failureCode).equals(0x86);
    });

    it("itemMapKey composes a unique key per kind+key", () => {
        expect(itemMapKey("acl", "5")).equals(itemMapKey("acl", "5"));
        expect(itemMapKey("acl", "5")).not.equals(itemMapKey("acl", "6"));
        expect(itemMapKey("acl", "5")).not.equals(itemMapKey("binding", "5"));
    });
});
