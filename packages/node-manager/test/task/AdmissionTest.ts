/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { ReconcilerBehavior } from "#ReconcilerBehavior.js";
import { TaskManagerBehavior } from "#task/TaskManagerBehavior.js";
import { Environment } from "@matter/general";
import { CapacityInfo, ClientNode, ItemKind, ServerNode } from "@matter/node";
import { MockServerNode } from "@matter/node/testing";
import { FakePeer, recordFor, requireRecordFor, SyntheticTask } from "./helpers.js";

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

/** A peer whose "cap" kind reports a fixed capacity, for admission tests. */
function capPeer(id: string, capacity: CapacityInfo): FakePeer {
    const peer = new FakePeer(id);
    peer.itemKind = (kind: string): ItemKind | undefined =>
        kind === "cap"
            ? {
                  kind: "cap",
                  priority: 0,
                  async apply() {},
                  async capacity() {
                      return capacity;
                  },
              }
            : undefined;
    return peer;
}

describe("capacity admission", () => {
    before(() => MockTime.init());

    it("rejects a task whose planned changes exceed capacity, before touching the node", async () => {
        const environment = new Environment("test");
        const peer = capPeer("p", { limit: 1, used: 1 });
        TestTaskManager.peers.set("p", peer);
        TestTaskManager.reconcilerPeer = peer;

        let ran = false;
        SyntheticTask.plannedChangesByTag["over"] = [{ peerId: "p", kind: "cap", key: "x", intent: {} }];
        SyntheticTask.phasesByTag["over"] = [{ name: "should-not-run", run: async () => void (ran = true) }];

        const node = await MockServerNode.create(RootEndpoint, { environment, id: "adm-over" });
        await node.act(a => a.get(TestTaskManager).register(SyntheticTask));
        await node.act(a => a.get(TestTaskManager).run(SyntheticTask, { tag: "over" }));

        await awaitState(node, "synthetic:over", "failed");
        const rec = requireRecordFor(node.stateOf(TestTaskManager).runs, "synthetic:over");
        expect(rec.error).contains("capacity");
        expect(rec.changeSet.length).equals(0);
        expect(rec.revertRunId).equals(undefined);
        expect(ran).equals(false);
        await node.close();
    });

    it("does not reject an excludeFromAdmission kind even at its capacity limit", async () => {
        const environment = new Environment("test");
        const peer = new FakePeer("p");
        // Mirrors membership: capacity is exhausted, but the kind opts out of admission (a coarser kind gates it).
        peer.itemKind = (kind: string): ItemKind | undefined =>
            kind === "member"
                ? {
                      kind: "member",
                      priority: 0,
                      async apply() {},
                      excludeFromAdmission: true,
                      async capacity() {
                          return { limit: 4, used: 4 };
                      },
                  }
                : undefined;
        TestTaskManager.peers.set("p", peer);
        TestTaskManager.reconcilerPeer = peer;

        let ran = false;
        SyntheticTask.plannedChangesByTag["member"] = [{ peerId: "p", kind: "member", key: "1:2", intent: {} }];
        SyntheticTask.phasesByTag["member"] = [{ name: "runs", run: async () => void (ran = true) }];

        const node = await MockServerNode.create(RootEndpoint, { environment, id: "adm-member" });
        await node.act(a => a.get(TestTaskManager).register(SyntheticTask));
        await node.act(a => a.get(TestTaskManager).run(SyntheticTask, { tag: "member" }));

        await awaitState(node, "synthetic:member", "completed");
        expect(ran).equals(true);
        await node.close();
    });

    it("admits a task that fits", async () => {
        const environment = new Environment("test");
        const peer = capPeer("p", { limit: 4, used: 1 });
        TestTaskManager.peers.set("p", peer);
        TestTaskManager.reconcilerPeer = peer;

        let ran = false;
        SyntheticTask.plannedChangesByTag["fits"] = [{ peerId: "p", kind: "cap", key: "x", intent: {} }];
        SyntheticTask.phasesByTag["fits"] = [{ name: "runs", run: async () => void (ran = true) }];

        const node = await MockServerNode.create(RootEndpoint, { environment, id: "adm-fits" });
        await node.act(a => a.get(TestTaskManager).register(SyntheticTask));
        await node.act(a => a.get(TestTaskManager).run(SyntheticTask, { tag: "fits" }));

        await awaitState(node, "synthetic:fits", "completed");
        expect(ran).equals(true);
        await node.close();
    });
});
