/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { ReconcilerBehavior } from "#ReconcilerBehavior.js";
import { TaskManagerBehavior } from "#task/TaskManagerBehavior.js";
import { TaskPhase } from "#task/types.js";
import { Environment } from "@matter/general";
import { ClientNode, itemMapKey, ServerNode } from "@matter/node";
import { MockServerNode } from "@matter/node/testing";
import { FakePeer, SyntheticTask } from "./helpers.js";

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
}

const RootEndpoint = MockServerNode.RootEndpoint.with(TestTaskManager);

async function makeNode(environment: Environment) {
    return MockServerNode.create(RootEndpoint, { environment, id: "tm-test" });
}

async function awaitState(node: ServerNode, id: string, ...states: string[]): Promise<void> {
    for (let i = 0; i < 10_000; i++) {
        const state = await node.act(a => a.get(TestTaskManager).state.tasks[id]?.state);
        if (state !== undefined && states.includes(state)) return;
        await MockTime.advance(1);
    }
    throw new Error(`Task ${id} did not reach state ${states.join("|")}`);
}

async function awaitPhase(node: ServerNode, id: string, phaseIndex: number): Promise<void> {
    for (let i = 0; i < 10_000; i++) {
        const p = await node.act(a => a.get(TestTaskManager).state.tasks[id]);
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
            const persisted = node1.stateOf(TestTaskManager).tasks["synthetic:resume"];
            expect(["running", "parked"]).contains(persisted.state);
            expect(persisted.phaseIndex).equals(1);
            await node1.close();

            // Recreate the node with the same environment + id. The type is not registered until the app does so;
            // register() must trigger resume of the persisted, non-terminal task.
            const node2 = await makeNode(environment);
            const beforeRegister = node2.stateOf(TestTaskManager).tasks["synthetic:resume"].state;
            expect(["running", "parked"]).contains(beforeRegister);

            // Re-attach the in-memory peer and let the device "have" the item so the resumed gate can pass.
            const peer2 = new FakePeer("rp");
            peer2.markHas("groupMembership", "1");
            TestTaskManager.peers.set("rp", peer2);
            TestTaskManager.reconcilerPeer = peer2;

            await node2.act(a => a.get(TestTaskManager).register("synthetic", SyntheticTask));
            await awaitState(node2, "synthetic:resume", "completed");
            const status = await node2.act(a => a.get(TestTaskManager).get("synthetic:resume")?.status);
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
            expect(node1.stateOf(TestTaskManager).tasks["synthetic:parked"].state).equals("parked");
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

        it("does not resume terminal tasks", async () => {
            const environment = new Environment("test");
            SyntheticTask.phasesByTag["done"] = [{ name: "noop", run: async () => {} }];
            const node1 = await makeNode(environment);
            await node1.act(a => a.get(TestTaskManager).register("synthetic", SyntheticTask));
            await node1.act(a => a.get(TestTaskManager).run("synthetic", { tag: "done" }));
            await awaitState(node1, "synthetic:done", "completed");
            await node1.close();

            const node2 = await makeNode(environment);
            await node2.act(a => a.get(TestTaskManager).register("synthetic", SyntheticTask));
            const live = await node2.act(a => a.get(TestTaskManager).tasks.length);
            expect(live).equals(0);
            await node2.close();
        });
    });

    describe("cancel", () => {
        it("reverts created items in reverse order and ends cancelled", async () => {
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

            const cancelDone = node.act(a => a.get(TestTaskManager).cancel("synthetic:cancel"));
            await MockTime.resolve(cancelDone);

            // Items are removed in REVERSE add order (B added last → reverted first).
            expect(peer.removeOrder).deep.equals([
                itemMapKey("groupMembership", "B"),
                itemMapKey("groupMembership", "A"),
            ]);
            expect(peer.items[itemMapKey("groupMembership", "A")]).equals(undefined);
            expect(peer.items[itemMapKey("groupMembership", "B")]).equals(undefined);
            const status = await node.act(a => a.get(TestTaskManager).get("synthetic:cancel")?.status);
            expect(status?.state).equals("cancelled");
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

            const cancelDone = node.act(a => a.get(TestTaskManager).cancel("synthetic:inflight"));
            await MockTime.resolve(cancelDone);

            const status = await node.act(a => a.get(TestTaskManager).get("synthetic:inflight")?.status);
            expect(status?.state).equals("cancelled");
            await node.close();
        });
    });
});
