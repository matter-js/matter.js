/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { DuplicateItemKindError, UnknownItemKindError } from "#behavior/system/desired-state/errors.js";
import { ItemKind, ItemKindRegistry } from "#behavior/system/desired-state/ItemKind.js";
import { ImplementationError } from "@matter/general";

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

    it("registers a kind that declares both watches and satisfiedBy", () => {
        const registry = new ItemKindRegistry();
        const kind: ItemKind = {
            ...fakeKind("acl", 50),
            watches: () => [],
            satisfiedBy: () => true,
            verify: async () => true,
        };
        registry.register(kind);
        expect(registry.get("acl")).equals(kind);
    });

    it("rejects a kind that only declares watches", () => {
        const registry = new ItemKindRegistry();
        const kind: ItemKind = { ...fakeKind("acl", 50), watches: () => [], verify: async () => true };
        expect(() => registry.register(kind)).throws(
            ImplementationError,
            /^Item kind "acl" declares watches but not satisfiedBy$/,
        );
        expect(registry.get("acl")).equals(undefined);
    });

    it("rejects a kind that declares watches and satisfiedBy but not verify", () => {
        const registry = new ItemKindRegistry();
        const kind: ItemKind = { ...fakeKind("acl", 50), watches: () => [], satisfiedBy: () => true };
        expect(() => registry.register(kind)).throws(
            ImplementationError,
            /^Item kind "acl" declares watches and satisfiedBy but not verify, so no drift it reports could be read$/,
        );
        expect(registry.get("acl")).equals(undefined);
    });

    it("rejects a kind that only declares satisfiedBy", () => {
        const registry = new ItemKindRegistry();
        const kind: ItemKind = { ...fakeKind("acl", 50), satisfiedBy: () => true, verify: async () => true };
        expect(() => registry.register(kind)).throws(
            ImplementationError,
            /^Item kind "acl" declares satisfiedBy but not watches$/,
        );
        expect(registry.get("acl")).equals(undefined);
    });
});
