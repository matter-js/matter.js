/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { itemMapKey } from "#behavior/system/desired-state/types.js";

describe("itemMapKey", () => {
    it("produces a stable key for a kind/key pair", () => {
        expect(itemMapKey("acl", "k1")).equals(itemMapKey("acl", "k1"));
    });

    it("does not collide when the key contains the separator-prone characters", () => {
        expect(itemMapKey("acl", "a:b")).not.equals(itemMapKey("acl:a", "b"));
        expect(itemMapKey("binding", "1:a")).not.equals(itemMapKey("binding", "1\\:a"));
    });

    it("distinguishes kind from key", () => {
        expect(itemMapKey("a", "b")).not.equals(itemMapKey("b", "a"));
    });
});
