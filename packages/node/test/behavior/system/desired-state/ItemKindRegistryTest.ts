/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { ItemKind, ItemKindRegistry } from "#behavior/system/desired-state/ItemKind.js";
import { DuplicateItemKindError, UnknownItemKindError } from "#behavior/system/desired-state/errors.js";

function fakeKind(kind: string, priority: number): ItemKind {
    return {
        kind,
        priority,
        async apply() {},
    };
}

describe("ItemKindRegistry", () => {
    it("registers and retrieves a kind", () => {
        const registry = new ItemKindRegistry();
        const acl = fakeKind("acl", 50);
        registry.register(acl);
        expect(registry.get("acl")).equals(acl);
        expect(registry.require("acl")).equals(acl);
    });

    it("returns undefined for an unknown get and throws on require", () => {
        const registry = new ItemKindRegistry();
        expect(registry.get("nope")).equals(undefined);
        expect(() => registry.require("nope")).throws(UnknownItemKindError);
    });

    it("rejects duplicate registration", () => {
        const registry = new ItemKindRegistry();
        registry.register(fakeKind("acl", 50));
        expect(() => registry.register(fakeKind("acl", 99))).throws(DuplicateItemKindError);
    });

    it("lists kinds sorted by ascending priority", () => {
        const registry = new ItemKindRegistry();
        registry.register(fakeKind("acl", 50));
        registry.register(fakeKind("groupKey", 10));
        registry.register(fakeKind("binding", 30));
        expect(registry.all().map(k => k.kind)).deep.equals(["groupKey", "binding", "acl"]);
    });
});
