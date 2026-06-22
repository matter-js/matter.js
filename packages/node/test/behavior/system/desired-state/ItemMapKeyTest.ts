/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { itemMapKey } from "#behavior/system/desired-state/types.js";

describe("itemMapKey", () => {
    it("leaves simple keys unchanged", () => {
        expect(itemMapKey("acl", "k1")).equals("acl:k1");
    });

    it("does not collide when the key contains a colon", () => {
        expect(itemMapKey("acl", "a:b")).not.equals(itemMapKey("acl:a", "b"));
    });

    it("does not collide when a part contains a backslash", () => {
        expect(itemMapKey("binding", "1:a")).not.equals(itemMapKey("binding", "1\\:a"));
    });
});
