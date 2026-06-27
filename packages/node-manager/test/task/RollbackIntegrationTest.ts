/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { ReconcilerBehavior } from "#ReconcilerBehavior.js";
import { TaskManagerBehavior } from "#task/TaskManagerBehavior.js";
import { TaskFailedError } from "#task/errors.js";
import { Environment } from "@matter/general";
import { ClientNode, itemMapKey, ServerNode } from "@matter/node";
import { MockServerNode } from "@matter/node/testing";
import { FakePeer, SyntheticTask } from "./helpers.js";

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

async function awaitState(node: ServerNode, id: string, ...states: string[]): Promise<void> {
    for (let i = 0; i < 10_000; i++) {
        const state = await node.act(a => a.get(TestTaskManager).state.tasks[id]?.state);
        if (state !== undefined && states.includes(state)) return;
        await MockTime.advance(1);
    }
    throw new Error(`Task ${id} did not reach state ${states.join("|")}`);
}

describe("auto-rollback", () => {
    before(() => MockTime.init());

    it("hard failure spawns a linked revert task that removes the changeset", async () => {
        const environment = new Environment("test");
        const peer = new FakePeer("rp");
        peer.markHas("groupKey", "42");
        TestTaskManager.peers.set("rp", peer);
        TestTaskManager.reconcilerPeer = peer;
        SyntheticTask.phasesByTag["boom"] = [
            {
                name: "set-then-fail",
                run: async ctx => {
                    const p = ctx.resolvePeer("rp");
                    await ctx.setIntent(p, "groupKey", "42", { a: 1 });
                    throw new TaskFailedError("boom");
                },
            },
        ];

        const node = await MockServerNode.create(RootEndpoint, { environment, id: "rb" });
        await node.act(a => a.get(TestTaskManager).register("synthetic", SyntheticTask));
        await node.act(a => a.get(TestTaskManager).run("synthetic", { tag: "boom" }));

        await awaitState(node, "synthetic:boom", "failed");
        const original = node.stateOf(TestTaskManager).tasks["synthetic:boom"];
        expect(original.revertTaskId).equals("revert:synthetic:boom");

        await awaitState(node, "revert:synthetic:boom", "completed");
        expect(peer.items[itemMapKey("groupKey", "42")]).equals(undefined);
        await node.close();
    });

    it("does not spawn a revert-of-revert when the revert itself fails terminally", async () => {
        const environment = new Environment("test");
        const peer = new FakePeer("rp");
        TestTaskManager.peers.set("rp", peer);
        TestTaskManager.reconcilerPeer = peer;
        SyntheticTask.phasesByTag["boom2"] = [
            {
                name: "set-then-fail",
                run: async ctx => {
                    const p = ctx.resolvePeer("rp");
                    await ctx.setIntent(p, "groupKey", "99", { a: 1 });
                    throw new TaskFailedError("boom2");
                },
            },
        ];

        const node = await MockServerNode.create(RootEndpoint, { environment, id: "rb2" });
        await node.act(a => a.get(TestTaskManager).register("synthetic", SyntheticTask));

        // The revert's forward work (awaitGate -> verify-reconcile over its deletePending intent) rejects.
        const realReconcile = peer.reconcile.bind(peer);
        peer.reconcile = async (n, options) => {
            if (Object.values(peer.items).some(i => i.status.state === "deletePending")) {
                throw new TaskFailedError("revert boom");
            }
            return realReconcile(n, options);
        };

        await node.act(a => a.get(TestTaskManager).run("synthetic", { tag: "boom2" }));

        await awaitState(node, "synthetic:boom2", "failed");
        const original = node.stateOf(TestTaskManager).tasks["synthetic:boom2"];
        expect(original.revertTaskId).equals("revert:synthetic:boom2");

        await awaitState(node, "revert:synthetic:boom2", "failed");
        expect(node.stateOf(TestTaskManager).tasks["revert:revert:synthetic:boom2"]).equals(undefined);
        await node.close();
    });
});
