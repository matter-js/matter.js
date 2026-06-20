/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

// 2a-1 boundary: this proves the engine executor + decision wiring against a synthetic ItemKind, using the
// standalone executeActions function with a pure in-memory ReconcileTarget. Full per-peer trigger wiring
// against a live sustained subscription (reachability checks, subscriptionStatusChanged,
// softwareVersionChanged, sweep timer, ReconcilerBehavior.reconcile on a ClientNode) is proven by Plan
// 2a-2's single-peer commissioning harness.

import { executeActions, ReconcileTarget } from "#reconcile/executeActions.js";
import { planActions } from "#reconcile/planActions.js";
import { ClientNode, ItemKind, ItemKindRegistry, ManagedItem } from "@matter/node";

// ---------------------------------------------------------------------------
// Synthetic ItemKind for executor tests.
// Accepts ClientNode but ignores the node argument so tests work without a commissioned peer.
// ---------------------------------------------------------------------------

class FakeKind implements ItemKind {
    readonly kind = "fake";
    readonly priority = 50;
    readonly applied = new Array<string>();
    readonly removed = new Array<string>();
    failOn?: string;

    async apply(_node: ClientNode, item: ManagedItem) {
        if (this.failOn === item.key) {
            throw Object.assign(new Error("fail"), { code: 0x82 }); // Status.Busy
        }
        this.applied.push(item.key);
    }

    async remove(_node: ClientNode, item: ManagedItem) {
        this.removed.push(item.key);
    }

    recoverable(code: number) {
        return code === 0x82 || code === 0x94; // Busy or Timeout
    }
}

// ---------------------------------------------------------------------------
// Minimal in-memory ReconcileTarget — no Endpoint or ServerNode needed.
// ---------------------------------------------------------------------------

// Executor never dereferences the node; FakeKind ignores it. Stub avoids commissioning a real peer (covered in 2a-2).
const STUB_NODE = {} as ClientNode;

function makeTarget(items: Record<string, ManagedItem> = {}): ReconcileTarget & { items: Record<string, ManagedItem> } {
    const state = { ...items };
    return {
        node: STUB_NODE,
        items: state,
        async updateStatus(kind, key, itemState, code) {
            const id = `${kind}:${key}`;
            const existing = state[id];
            if (existing !== undefined) {
                state[id] = { ...existing, status: { state: itemState, updateTimestamp: 0, failureCode: code } };
            }
        },
        async dropItem(kind, key) {
            delete state[`${kind}:${key}`];
        },
    };
}

function pendingItem(kind: string, key: string): ManagedItem {
    return { kind, key, intent: {}, mode: "converge", status: { state: "pending", updateTimestamp: 0 } };
}

function itemWithState(kind: string, key: string, state: ManagedItem["status"]["state"], code?: number): ManagedItem {
    return { kind, key, intent: {}, mode: "converge", status: { state, updateTimestamp: 0, failureCode: code } };
}

function deletePendingItem(kind: string, key: string): ManagedItem {
    return { kind, key, intent: {}, mode: "converge", status: { state: "deletePending", updateTimestamp: 0 } };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("executeActions (executor)", () => {
    it("apply→committed for a pending item", async () => {
        const fake = new FakeKind();
        const registry = new ItemKindRegistry();
        registry.register(fake);

        const id = "fake:key1";
        const target = makeTarget({ [id]: pendingItem("fake", "key1") });

        const planned = planActions(Object.values(target.items), { verify: false, recoverable: () => false });
        await executeActions(target, planned, registry);

        expect(fake.applied).deep.equals(["key1"]);
        expect(target.items[id]?.status.state).equals("committed");
    });

    it("apply failure → commitFailed with code", async () => {
        const fake = new FakeKind();
        fake.failOn = "bad";
        const registry = new ItemKindRegistry();
        registry.register(fake);

        const id = "fake:bad";
        const target = makeTarget({ [id]: pendingItem("fake", "bad") });

        const planned = planActions(Object.values(target.items), { verify: false, recoverable: () => false });
        await executeActions(target, planned, registry);

        expect(fake.applied).deep.equals([]);
        expect(target.items[id]?.status.state).equals("commitFailed");
        expect(target.items[id]?.status.failureCode).equals(0x82);
    });

    it("deletePending → kind.remove called → item dropped", async () => {
        const fake = new FakeKind();
        const registry = new ItemKindRegistry();
        registry.register(fake);

        const id = "fake:rem1";
        const target = makeTarget({ [id]: deletePendingItem("fake", "rem1") });

        const planned = planActions(Object.values(target.items), { verify: false, recoverable: () => false });
        await executeActions(target, planned, registry);

        expect(fake.removed).deep.equals(["rem1"]);
        expect(target.items[id]).equals(undefined);
    });

    it("unrecoverable commitFailed → drop without calling apply", async () => {
        const fake = new FakeKind();
        const registry = new ItemKindRegistry();
        registry.register(fake);

        const id = "fake:dropme";
        const target = makeTarget({ [id]: itemWithState("fake", "dropme", "commitFailed", 0x01) });

        const planned = planActions(Object.values(target.items), { verify: false, recoverable: () => false });
        await executeActions(target, planned, registry);

        expect(fake.applied).deep.equals([]);
        expect(target.items[id]).equals(undefined);
    });

    it("recoverable commitFailed → retry → committed", async () => {
        const fake = new FakeKind();
        const registry = new ItemKindRegistry();
        registry.register(fake);

        const id = "fake:retry1";
        const target = makeTarget({ [id]: itemWithState("fake", "retry1", "commitFailed", 0x82) });

        const planned = planActions(Object.values(target.items), {
            verify: false,
            recoverable: item => fake.recoverable(item.status.failureCode ?? 0),
        });
        await executeActions(target, planned, registry);

        expect(fake.applied).deep.equals(["retry1"]);
        expect(target.items[id]?.status.state).equals("committed");
    });

    it("repend resets a drifted committed+maintain item to pending", async () => {
        const fake = new FakeKind();
        const registry = new ItemKindRegistry();
        registry.register(fake);

        const id = "fake:drift1";
        const drifted: ManagedItem = {
            kind: "fake",
            key: "drift1",
            intent: {},
            mode: "maintain",
            status: { state: "committed", updateTimestamp: 0 },
        };
        const target = makeTarget({ [id]: drifted });

        const planned = planActions(Object.values(target.items), {
            verify: true,
            verifyResult: { driftedKeys: new Set([id]) },
            recoverable: () => false,
        });
        await executeActions(target, planned, registry);

        expect(target.items[id]?.status.state).equals("pending");
    });

    it("skip leaves a committed item unchanged", async () => {
        const fake = new FakeKind();
        const registry = new ItemKindRegistry();
        registry.register(fake);

        const id = "fake:stable";
        const target = makeTarget({ [id]: itemWithState("fake", "stable", "committed") });

        const planned = planActions(Object.values(target.items), { verify: false, recoverable: () => false });
        await executeActions(target, planned, registry);

        expect(fake.applied).deep.equals([]);
        expect(target.items[id]?.status.state).equals("committed");
    });
});

describe("ItemKindRegistry", () => {
    it("registers and retrieves an ItemKind", () => {
        const registry = new ItemKindRegistry();
        const fake = new FakeKind();
        registry.register(fake);
        expect(registry.get("fake")).equals(fake);
    });

    it("throws on duplicate registration", () => {
        const registry = new ItemKindRegistry();
        registry.register(new FakeKind());
        expect(() => registry.register(new FakeKind())).throws();
    });

    it("require throws for unknown kind", () => {
        const registry = new ItemKindRegistry();
        expect(() => registry.require("unknown")).throws();
    });
});
