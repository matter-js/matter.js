/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { ReconcilerBehavior } from "#ReconcilerBehavior.js";
import { TaskConflictError } from "#task/errors.js";
import { TaskManagerBehavior } from "#task/TaskManagerBehavior.js";
import { TaskPhase } from "#task/types.js";
import { RunId } from "#task/types.js";
import { Environment } from "@matter/general";
import { ClientNode, itemMapKey, ServerNode } from "@matter/node";
import { MockServerNode } from "@matter/node/testing";
import {
    cancelSlot,
    FakePeer,
    recordFor,
    requireRecordFor,
    requireStatusOfSlot,
    revertRecordOf,
    revertSlotOf,
    statusOfSlot,
    SyntheticTask,
} from "./helpers.js";

/**
 * TaskManager subclass that resolves peers + reconciler from an in-memory table so cancel-revert and gate
 * phases can be exercised without a commissioned fabric. The single shared FakePeer doubles as reconciler.
 */
class TestTaskManager extends TaskManagerBehavior {
    static override readonly schema = TaskManagerBehavior.schema;
    static peers = new Map<string, FakePeer>();
    static reconcilerPeer?: FakePeer;
    protected override resolvePeerNode(peerId: string): ClientNode | undefined {
        return TestTaskManager.peers.get(peerId)?.asNode();
    }
    protected override taskReconciler(): ReconcilerBehavior {
        return TestTaskManager.reconcilerPeer as unknown as ReconcilerBehavior;
    }

    /** True while a drive of `id` owns this id's gate and driving entries. */
    isDriven(runId: RunId): boolean {
        return this.internal.driving.has(runId) && this.internal.gates.has(runId);
    }
}

const RootEndpoint = MockServerNode.RootEndpoint.with(TestTaskManager);

async function makeNode(environment: Environment) {
    return MockServerNode.create(RootEndpoint, { environment, id: "tm-test" });
}

async function awaitState(node: ServerNode, id: string, ...states: string[]): Promise<void> {
    for (let i = 0; i < 10_000; i++) {
        const state = await node.act(a => recordFor(a.get(TestTaskManager).state.runs, id)?.state);
        if (state !== undefined && states.includes(state)) {
            const settled =
                !(["completed", "failed", "cancelled"] as string[]).includes(state) ||
                (await node.act(a => !a.get(TestTaskManager).tasks.some(t => t.status.slotKey === id)));
            if (settled) return;
        }
        await MockTime.advance(1);
    }
    throw new Error(`Task ${id} did not reach state ${states.join("|")}`);
}

async function awaitPhase(node: ServerNode, id: string, phaseIndex: number): Promise<void> {
    for (let i = 0; i < 10_000; i++) {
        const p = await node.act(a => recordFor(a.get(TestTaskManager).state.runs, id));
        if (p !== undefined && p.phaseIndex >= phaseIndex && (p.state === "running" || p.state === "parked")) return;
        await MockTime.advance(1);
    }
    throw new Error(`Task ${id} did not reach phase ${phaseIndex}`);
}

/** A phase that sets an intent then gates on it committing, using the manager-provided context. */
function gatePhase(peerId: string, kind: string, key: string): TaskPhase {
    return {
        name: "gate",
        run: async ctx => {
            const peer = ctx.resolvePeer(peerId);
            await ctx.setIntent(peer, kind, key, {});
            await ctx.awaitCommitted([{ peer, kind, key }]);
        },
    };
}

describe("Task lifecycle", () => {
    before(() => MockTime.init());

    describe("resume", () => {
        it("register-triggered resume re-drives a non-terminal task to completion", async () => {
            const environment = new Environment("test");
            const peer = new FakePeer("rp");
            TestTaskManager.peers.set("rp", peer);
            TestTaskManager.reconcilerPeer = peer;
            SyntheticTask.phasesByTag["resume"] = [
                { name: "noop", run: async () => {} },
                gatePhase("rp", "groupMembership", "1"),
            ];

            const node1 = await makeNode(environment);
            await node1.act(a => a.get(TestTaskManager).register("synthetic", SyntheticTask));
            await node1.act(a => a.get(TestTaskManager).run("synthetic", { tag: "resume" }));

            // Phase 0 completes, then phase 1 gates (device does not "have" the item yet) and suspends.
            await awaitPhase(node1, "synthetic:resume", 1);
            const persisted = requireRecordFor(node1.stateOf(TestTaskManager).runs, "synthetic:resume");
            expect(["running", "parked"]).contains(persisted.state);
            expect(persisted.phaseIndex).equals(1);
            await node1.close();

            // Recreate the node with the same environment + id. The type is not registered until the app does so;
            // register() must trigger resume of the persisted, non-terminal task.
            const node2 = await makeNode(environment);
            const beforeRegister = requireRecordFor(node2.stateOf(TestTaskManager).runs, "synthetic:resume").state;
            expect(["running", "parked"]).contains(beforeRegister);

            // Re-attach the in-memory peer and let the device "have" the item so the resumed gate can pass.
            const peer2 = new FakePeer("rp");
            peer2.markHas("groupMembership", "1");
            TestTaskManager.peers.set("rp", peer2);
            TestTaskManager.reconcilerPeer = peer2;

            await node2.act(a => a.get(TestTaskManager).register("synthetic", SyntheticTask));
            await awaitState(node2, "synthetic:resume", "completed");
            const status = await node2.act(a => statusOfSlot(a.get(TestTaskManager), "synthetic:resume"));
            expect(status?.state).equals("completed");
            await node2.close();
        });

        it("resumes a task persisted in the parked state once its peer is reachable", async () => {
            const environment = new Environment("test");
            const peer = new FakePeer("pp");
            peer.setReachable(false);
            TestTaskManager.peers.set("pp", peer);
            TestTaskManager.reconcilerPeer = peer;
            SyntheticTask.phasesByTag["parked"] = [gatePhase("pp", "groupMembership", "1")];

            const node1 = await makeNode(environment);
            await node1.act(a => a.get(TestTaskManager).register("synthetic", SyntheticTask));
            await node1.act(a => a.get(TestTaskManager).run("synthetic", { tag: "parked" }));
            await awaitState(node1, "synthetic:parked", "parked");
            expect(requireRecordFor(node1.stateOf(TestTaskManager).runs, "synthetic:parked").state).equals("parked");
            await node1.close();

            const node2 = await makeNode(environment);
            const peer2 = new FakePeer("pp");
            peer2.markHas("groupMembership", "1");
            TestTaskManager.peers.set("pp", peer2);
            TestTaskManager.reconcilerPeer = peer2;

            await node2.act(a => a.get(TestTaskManager).register("synthetic", SyntheticTask));
            await awaitState(node2, "synthetic:parked", "completed");
            await node2.close();
        });

        it("still answers to its caller's external id after a restart", async () => {
            const environment = new Environment("test");
            const peer = new FakePeer("xp");
            peer.setReachable(false);
            TestTaskManager.peers.set("xp", peer);
            TestTaskManager.reconcilerPeer = peer;
            SyntheticTask.phasesByTag["alias"] = [gatePhase("xp", "groupMembership", "1")];

            const node1 = await makeNode(environment);
            await node1.act(a => a.get(TestTaskManager).register("synthetic", SyntheticTask));
            await node1.act(a => a.get(TestTaskManager).run("synthetic", { tag: "alias" }, { externalId: "owner" }));
            await awaitState(node1, "synthetic:alias", "parked");
            expect(requireRecordFor(node1.stateOf(TestTaskManager).runs, "synthetic:alias").externalId).equals("owner");
            await node1.close();

            const node2 = await makeNode(environment);
            await node2.act(a => a.get(TestTaskManager).register("synthetic", SyntheticTask));
            expect(await node2.act(a => a.get(TestTaskManager).forExternalId("owner")?.status.slotKey)).equals(
                "synthetic:alias",
            );
            await node2.close();
        });
    });

    describe("device rejection", () => {
        it("fails the task and rolls back when a parked gate sees the reconciler drop a rejected intent", async () => {
            const environment = new Environment("test");
            const peer = new FakePeer("rj");
            peer.markHas("groupMembership", "OK");
            TestTaskManager.peers.set("rj", peer);
            TestTaskManager.reconcilerPeer = peer;

            SyntheticTask.phasesByTag["reject"] = [
                {
                    name: "create",
                    run: async ctx => {
                        const node = ctx.resolvePeer("rj");
                        await ctx.setIntent(node, "groupMembership", "OK", {});
                        await ctx.setIntent(node, "groupMembership", "R", {});
                        await ctx.awaitCommitted([
                            { peer: node, kind: "groupMembership", key: "OK" },
                            { peer: node, kind: "groupMembership", key: "R" },
                        ]);
                    },
                },
            ];

            const node = await makeNode(environment);
            await node.act(a => a.get(TestTaskManager).register("synthetic", SyntheticTask));
            await node.act(a => a.get(TestTaskManager).run("synthetic", { tag: "reject" }));

            // The gate parks on its observers: OK commits, R stays pending.
            for (let i = 0; i < 10_000 && !peer.itemRemoved.isObserved; i++) {
                await MockTime.advance(1);
            }
            expect(peer.items[itemMapKey("groupMembership", "OK")]?.status.state).equals("committed");
            expect(peer.items[itemMapKey("groupMembership", "R")]?.status.state).equals("pending");

            // The device rejects R unrecoverably, and a reconcile pass this gate did not drive drops it.
            peer.markRejects("groupMembership", "R");
            await peer.reconcile(peer.asNode(), { verify: true });

            await awaitState(node, "synthetic:reject", "failed");
            const status = await node.act(a => statusOfSlot(a.get(TestTaskManager), "synthetic:reject"));
            expect(status?.error).contains("groupMembership:R");
            expect(status?.revertRunId).equals(
                revertRecordOf(node.stateOf(TestTaskManager).runs, "synthetic:reject")?.runId,
            );

            await awaitState(
                node,
                (await node.act(a => revertSlotOf(a.get(TestTaskManager).state.runs, "synthetic:reject")))!,
                "completed",
            );
            expect(peer.items[itemMapKey("groupMembership", "OK")]).equals(undefined);
            await node.close();
        });
    });

    describe("cancel", () => {
        it("cancelling a completed task spawns a revert that removes items in reverse order", async () => {
            const environment = new Environment("test");
            const peer = new FakePeer("cp");
            TestTaskManager.peers.set("cp", peer);
            TestTaskManager.reconcilerPeer = peer;
            peer.markHas("groupMembership", "A");
            peer.markHas("groupMembership", "B");

            SyntheticTask.phasesByTag["cancel"] = [
                {
                    name: "create",
                    run: async ctx => {
                        const node = ctx.resolvePeer("cp");
                        await ctx.setIntent(node, "groupMembership", "A", {});
                        await ctx.setIntent(node, "groupMembership", "B", {});
                    },
                },
            ];

            const node = await makeNode(environment);
            await node.act(a => a.get(TestTaskManager).register("synthetic", SyntheticTask));
            await node.act(a => a.get(TestTaskManager).run("synthetic", { tag: "cancel" }));
            await awaitState(node, "synthetic:cancel", "completed");

            const handle = await node.act(a => cancelSlot(a.get(TestTaskManager), "synthetic:cancel"));
            expect(handle?.status.revertOf).equals(
                requireStatusOfSlot(await node.act(a => a.get(TestTaskManager)), "synthetic:cancel").runId,
            );
            await awaitState(
                node,
                (await node.act(a => revertSlotOf(a.get(TestTaskManager).state.runs, "synthetic:cancel")))!,
                "completed",
            );

            // Items are removed in REVERSE add order (B added last → reverted first).
            expect(peer.removeOrder).deep.equals([
                itemMapKey("groupMembership", "B"),
                itemMapKey("groupMembership", "A"),
            ]);
            expect(peer.items[itemMapKey("groupMembership", "A")]).equals(undefined);
            expect(peer.items[itemMapKey("groupMembership", "B")]).equals(undefined);
            // Cancelling an already-completed task spawns the revert but leaves the original's truthful state.
            const status = await node.act(a => statusOfSlot(a.get(TestTaskManager), "synthetic:cancel"));
            expect(status?.state).equals("completed");
            expect(status?.revertRunId).equals(handle?.runId);
            await node.close();
        });

        it("refuses a re-run while the rollback of a previous run is in flight", async () => {
            const environment = new Environment("test");
            const peer = new FakePeer("rr");
            TestTaskManager.peers.set("rr", peer);
            TestTaskManager.reconcilerPeer = peer;
            peer.markHas("groupMembership", "1");

            SyntheticTask.phasesByTag["rerun"] = [gatePhase("rr", "groupMembership", "1")];

            const node = await makeNode(environment);
            await node.act(a => a.get(TestTaskManager).register("synthetic", SyntheticTask));
            await node.act(a => a.get(TestTaskManager).run("synthetic", { tag: "rerun" }));
            await awaitState(node, "synthetic:rerun", "completed");

            // The peer goes away, so the rollback parks instead of finishing.
            peer.setReachable(false);
            const revert = await node.act(a => cancelSlot(a.get(TestTaskManager), "synthetic:rerun"));
            expect(revert?.status.slotKey).equals(
                `revert:${requireStatusOfSlot(await node.act(a => a.get(TestTaskManager)), "synthetic:rerun").runId}`,
            );
            await awaitState(
                node,
                (await node.act(a => revertSlotOf(a.get(TestTaskManager).state.runs, "synthetic:rerun")))!,
                "parked",
                "running",
            );

            // Re-running now would re-apply exactly the intents the rollback is removing.
            await expect(
                (async () => node.act(a => a.get(TestTaskManager).run("synthetic", { tag: "rerun" })))(),
            ).rejectedWith(TaskConflictError);

            peer.setReachable(true);
            await awaitState(
                node,
                (await node.act(a => revertSlotOf(a.get(TestTaskManager).state.runs, "synthetic:rerun")))!,
                "completed",
            );
            await node.close();
        });

        it("cancels through the external id its caller ran the task under", async () => {
            const environment = new Environment("test");
            const peer = new FakePeer("ac");
            TestTaskManager.peers.set("ac", peer);
            TestTaskManager.reconcilerPeer = peer;
            // The device never "has" the item, so the gate is still in flight when the cancel arrives.

            SyntheticTask.phasesByTag["aliascancel"] = [gatePhase("ac", "groupMembership", "X")];

            const node = await makeNode(environment);
            await node.act(a => a.get(TestTaskManager).register("synthetic", SyntheticTask));
            await node.act(a =>
                a.get(TestTaskManager).run("synthetic", { tag: "aliascancel" }, { externalId: "owner" }),
            );
            for (let i = 0; i < 10_000 && peer.items[itemMapKey("groupMembership", "X")] === undefined; i++) {
                await MockTime.advance(1);
            }

            // The caller's own id must reach its work, all the way to rolling it back. Resolving it first is
            // the contract: the caller sees which run its name names before acting on it.
            const handle = await node.act(a => {
                const manager = a.get(TestTaskManager);
                return manager.cancel(manager.forExternalId("owner")!.runId);
            });
            expect(handle?.status.revertOf).equals(
                requireStatusOfSlot(await node.act(a => a.get(TestTaskManager)), "synthetic:aliascancel").runId,
            );
            const status = await node.act(a => a.get(TestTaskManager).forExternalId("owner")?.status);
            expect(status?.state).equals("cancelled");

            await awaitState(
                node,
                (await node.act(a => revertSlotOf(a.get(TestTaskManager).state.runs, "synthetic:aliascancel")))!,
                "completed",
            );
            expect(peer.items[itemMapKey("groupMembership", "X")]).equals(undefined);
            await node.close();
        });

        it("cancelling an in-flight gate stops the task cleanly as cancelled (not failed)", async () => {
            const environment = new Environment("test");
            const peer = new FakePeer("ip");
            TestTaskManager.peers.set("ip", peer);
            TestTaskManager.reconcilerPeer = peer;
            // Device never "has" the item, so the forward gate would park forever absent a cancel.

            SyntheticTask.phasesByTag["inflight"] = [gatePhase("ip", "groupMembership", "X")];

            const node = await makeNode(environment);
            await node.act(a => a.get(TestTaskManager).register("synthetic", SyntheticTask));
            await node.act(a => a.get(TestTaskManager).run("synthetic", { tag: "inflight" }));
            // Wait until the gate phase has set its intent: the gate is now in-flight and parked on observers.
            for (let i = 0; i < 10_000 && peer.items[itemMapKey("groupMembership", "X")] === undefined; i++) {
                await MockTime.advance(1);
            }
            expect(peer.items[itemMapKey("groupMembership", "X")]?.status.state).equals("pending");

            const handle = await node.act(a => cancelSlot(a.get(TestTaskManager), "synthetic:inflight"));
            expect(handle?.status.revertOf).equals(
                requireStatusOfSlot(await node.act(a => a.get(TestTaskManager)), "synthetic:inflight").runId,
            );

            const status = await node.act(a => statusOfSlot(a.get(TestTaskManager), "synthetic:inflight"));
            expect(status?.state).equals("cancelled");
            expect(status?.error).equals(undefined);

            await awaitState(
                node,
                (await node.act(a => revertSlotOf(a.get(TestTaskManager).state.runs, "synthetic:inflight")))!,
                "completed",
            );
            expect(peer.items[itemMapKey("groupMembership", "X")]).equals(undefined);
            await node.close();
        });
    });
});
