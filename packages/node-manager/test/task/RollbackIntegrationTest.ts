/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { ReconcilerBehavior } from "#ReconcilerBehavior.js";
import { TaskFailedError } from "#task/errors.js";
import { TaskManagerBehavior } from "#task/TaskManagerBehavior.js";
import { Environment } from "@matter/general";
import { ClientNode, itemMapKey, ServerNode } from "@matter/node";
import { MockServerNode } from "@matter/node/testing";
import {
    FakePeer,
    recordFor,
    requireRecordFor,
    revertRecordOf,
    revertRecordsOf,
    revertSlotOf,
    SyntheticTask,
} from "./helpers.js";

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
        await node.act(a => a.get(TestTaskManager).register(SyntheticTask));
        await node.act(a => a.get(TestTaskManager).run(SyntheticTask, { tag: "boom" }));

        await awaitState(node, "synthetic:boom", "failed");
        const original = requireRecordFor(node.stateOf(TestTaskManager).runs, "synthetic:boom");
        expect(original.revertRunId).equals(
            revertRecordOf(node.stateOf(TestTaskManager).runs, "synthetic:boom")?.runId,
        );

        await awaitState(
            node,
            (await node.act(a => revertSlotOf(a.get(TestTaskManager).state.runs, "synthetic:boom")))!,
            "completed",
        );
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
        await node.act(a => a.get(TestTaskManager).register(SyntheticTask));

        // The revert's forward work (awaitGate -> verify-reconcile over its deletePending intent) rejects.
        const realReconcile = peer.reconcile.bind(peer);
        peer.reconcile = async (n, options) => {
            if (Object.values(peer.items).some(i => i.status.state === "deletePending")) {
                throw new TaskFailedError("revert boom");
            }
            return realReconcile(n, options);
        };

        await node.act(a => a.get(TestTaskManager).run(SyntheticTask, { tag: "boom2" }));

        await awaitState(node, "synthetic:boom2", "failed");
        const original = requireRecordFor(node.stateOf(TestTaskManager).runs, "synthetic:boom2");
        expect(original.revertRunId).equals(
            revertRecordOf(node.stateOf(TestTaskManager).runs, "synthetic:boom2")?.runId,
        );

        await awaitState(
            node,
            (await node.act(a => revertSlotOf(a.get(TestTaskManager).state.runs, "synthetic:boom2")))!,
            "failed",
        );
        // No rollback of the rollback: asserted against the failed rollback's own run, since a key built from
        // the original's slot is unreachable under per-run identity and would make this check dead.
        const failedRevert = requireRecordFor(node.stateOf(TestTaskManager).runs, `revert:${original.runId}`);
        expect(revertRecordsOf(node.stateOf(TestTaskManager).runs, failedRevert.slotKey)).length(0);
        await node.close();
    });
});
