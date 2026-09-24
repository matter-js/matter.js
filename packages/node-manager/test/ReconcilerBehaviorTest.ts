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
import { ClientNode, ItemKind, ItemKindRegistry, itemMapKey, ManagedItem } from "@matter/node";
import { Status, StatusResponseError } from "@matter/types";

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
        // Mirrors DesiredStateBehavior: the generation is compared where the write happens, so a replacement
        // that landed while the action ran keeps its own status.
        async updateStatus(kind, key, itemState, code, ifGeneration) {
            const id = `${kind}:${key}`;
            const existing = state[id];
            if (existing === undefined || (ifGeneration !== undefined && existing.generation !== ifGeneration)) {
                return;
            }
            state[id] = { ...existing, status: { state: itemState, updateTimestamp: 0, failureCode: code } };
        },
        async dropItem(kind, key, ifGeneration) {
            const id = `${kind}:${key}`;
            const existing = state[id];
            if (existing === undefined || (ifGeneration !== undefined && existing.generation !== ifGeneration)) {
                return;
            }
            delete state[id];
        },
        currentItem(kind, key) {
            return state[`${kind}:${key}`];
        },
    };
}

function pendingItem(kind: string, key: string): ManagedItem {
    return {
        kind,
        key,
        intent: {},
        mode: "converge",
        status: { state: "pending", updateTimestamp: 0 },
        outstanding: "apply",
        generation: 1,
    };
}

function itemWithState(
    kind: string,
    key: string,
    state: ManagedItem["status"]["state"],
    code?: number,
    outstanding: ManagedItem["outstanding"] = "apply",
): ManagedItem {
    return {
        kind,
        key,
        intent: {},
        mode: "converge",
        status: { state, updateTimestamp: 0, failureCode: code },
        outstanding,
        generation: 1,
    };
}

function deletePendingItem(kind: string, key: string): ManagedItem {
    return {
        kind,
        key,
        intent: {},
        mode: "converge",
        status: { state: "deletePending", updateTimestamp: 0 },
        outstanding: "remove",
        generation: 1,
    };
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

    it("unrecoverable commitFailed → left in place without calling apply", async () => {
        const fake = new FakeKind();
        const registry = new ItemKindRegistry();
        registry.register(fake);

        const id = "fake:dropme";
        const target = makeTarget({ [id]: itemWithState("fake", "dropme", "commitFailed", 0x01) });

        const planned = planActions(Object.values(target.items), { verify: false, recoverable: () => false });
        await executeActions(target, planned, registry);

        expect(fake.applied).deep.equals([]);
        // Kept, still saying why: absence is reserved for work that is done.
        expect(target.items[id]?.status.state).equals("commitFailed");
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

    it("verify re-applies a drifted committed item in the same pass", async () => {
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
            outstanding: "apply",
            generation: 1,
        };
        const target = makeTarget({ [id]: drifted });

        const planned = planActions(Object.values(target.items), {
            verify: true,
            verifyResult: { driftedKeys: new Set([itemMapKey("fake", "drift1")]) },
            recoverable: () => false,
        });
        await executeActions(target, planned, registry);

        expect(fake.applied).deep.equals(["drift1"]);
        expect(target.items[id]?.status.state).equals("committed");
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

describe("executeActions (failure paths)", () => {
    it("records a failed removal instead of forgetting the item", async () => {
        class UnremovableKind extends FakeKind {
            override async remove() {
                throw Object.assign(new Error("device said no"), { code: 0x87 });
            }
        }
        const kind = new UnremovableKind();
        const registry = new ItemKindRegistry();
        registry.register(kind);

        const id = "fake:gone";
        const target = makeTarget({ [id]: itemWithState("fake", "gone", "deletePending") });
        const planned = planActions(Object.values(target.items), { verify: false, recoverable: () => false });
        await executeActions(target, planned, registry);

        // Still there, carrying why: dropping it would claim the device no longer holds what it does.
        expect(target.items[id]?.status.state).equals("commitFailed");
        expect(target.items[id]?.status.failureCode).equals(0x87);
    });

    it("counts a removal the device says it never had as done", async () => {
        class AbsentKind extends FakeKind {
            override async remove() {
                throw new StatusResponseError("nothing to remove", Status.NotFound);
            }
        }
        const registry = new ItemKindRegistry();
        registry.register(new AbsentKind());

        const id = "fake:ghost";
        const target = makeTarget({ [id]: deletePendingItem("fake", "ghost") });
        await executeActions(
            target,
            planActions(Object.values(target.items), { verify: false, recoverable: () => false }),
            registry,
        );

        // The rule is the executor's, so a kind added later cannot forget it and report a failure for work
        // that is already done. Gone from desired state is the one thing that says the work is done.
        expect(target.items[id]).equals(undefined);
    });

    it("fails an item whose kind nothing registered, rather than reporting it applied", async () => {
        const registry = new ItemKindRegistry();
        const id = "ghost:k1";
        const target = makeTarget({ [id]: pendingItem("ghost", "k1") });
        const planned = planActions(Object.values(target.items), { verify: false, recoverable: () => false });
        await executeActions(target, planned, registry);

        expect(target.items[id]?.status.state).equals("commitFailed");
    });

    it("leaves a replacement alone when the action it ran for is finished with", async () => {
        const registry = new ItemKindRegistry();
        registry.register(new FakeKind());

        const id = "fake:raced";
        const target = makeTarget({ [id]: pendingItem("fake", "raced") });
        const write = target.updateStatus.bind(target);
        target.updateStatus = async (kind, key, itemState, code, ifGeneration) => {
            // The replacement lands after the executor last looked and before this write commits — the window
            // a check outside the write cannot close, because the two are different transactions.
            target.items[id] = { ...pendingItem("fake", "raced"), generation: 2 };
            await write(kind, key, itemState, code, ifGeneration);
        };

        const planned = planActions([pendingItem("fake", "raced")], { verify: false, recoverable: () => false });
        await executeActions(target, planned, registry);

        // The replacement is still waiting for its own apply. Marking it committed would tell a task the intent
        // it set is on the device when nothing has written it.
        expect(target.items[id]?.status.state).equals("pending");
        expect(target.items[id]?.generation).equals(2);
    });

    it("finishes a removal that is retried after a recoverable failure", async () => {
        const kind = new FakeKind();
        const registry = new ItemKindRegistry();
        registry.register(kind);

        // What the engine left behind when the device answered Busy: the removal still outstanding, the state
        // carrying why. A retry has to recognize this item as the one it planned for.
        const id = "fake:retried";
        const target = makeTarget({ [id]: itemWithState("fake", "retried", "commitFailed", 0x82, "remove") });
        const planned = planActions(Object.values(target.items), {
            verify: false,
            recoverable: item => item.status.failureCode === 0x82,
        });
        expect(planned[0].action).equals("remove");
        await executeActions(target, planned, registry);

        expect(kind.removed).deep.equals(["retried"]);
        // Absence is what a waiting task reads as "removed", so a removal the device accepted must reach it.
        expect(target.items[id]).equals(undefined);
    });

    it("fails a removal whose kind nothing registered, rather than reporting the device clean", async () => {
        const registry = new ItemKindRegistry();
        const id = "ghost:k1";
        const target = makeTarget({ [id]: deletePendingItem("ghost", "k1") });
        await executeActions(
            target,
            planActions(Object.values(target.items), { verify: false, recoverable: () => false }),
            registry,
        );

        // No registered kind means nothing asked the device, so nothing was removed. Dropping the item would
        // say the removal is done while the device still holds what it names.
        expect(target.items[id]?.status.state).equals("commitFailed");
        expect(target.items[id]?.outstanding).equals("remove");
    });

    it("keeps an item it gave up on, holding the status that says why", async () => {
        const kind = new FakeKind();
        const registry = new ItemKindRegistry();
        registry.register(kind);

        const id = "fake:refused";
        const target = makeTarget({ [id]: itemWithState("fake", "refused", "commitFailed", 0x85) });
        const planned = planActions(Object.values(target.items), { verify: false, recoverable: () => false });
        expect(planned[0].action).equals("abandon");
        await executeActions(target, planned, registry);

        // Still there, and still saying what happened. Deleting it would put the device out of desired
        // state's sight and make the failure look like a removal that worked — here, and after a restart,
        // where this record is all there is.
        expect(target.items[id]?.status.state).equals("commitFailed");
        expect(target.items[id]?.status.failureCode).equals(0x85);
    });

    it("leaves a removal it gave up on in place, rather than reporting the device clean", async () => {
        const registry = new ItemKindRegistry();
        registry.register(new FakeKind());

        const id = "fake:stuck";
        const target = makeTarget({
            [id]: itemWithState("fake", "stuck", "commitFailed", 0x85, "remove"),
        });
        await executeActions(
            target,
            planActions(Object.values(target.items), { verify: false, recoverable: () => false }),
            registry,
        );

        // Absence is what a waiting task reads as "removed", so an unremovable item may never become absent.
        expect(target.items[id]).not.equals(undefined);
        expect(target.items[id]?.outstanding).equals("remove");
    });
});
