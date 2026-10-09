/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { TaskManagerBehavior } from "#task/TaskManagerBehavior.js";
import { Environment, InternalError } from "@matter/general";
import { CapacityInfo, ItemKind, ServerNode } from "@matter/node";
import { MockServerNode } from "@matter/node/testing";
import { testAddress, TestTaskManagerBase } from "./helpers.js";
import { FakePeer, isTerminalState, kindOf, recordFor, requireRecordFor, SyntheticTask } from "./helpers.js";

class TestTaskManager extends TestTaskManagerBase {
    // Own property, not inherited: the framework decorates each class with `Object.hasOwn(type, "schema")`, so
    // a subclass that only inherits one falls back to an inferred schema, which drops the nonvolatile
    // qualities the run table needs.
    static override readonly schema = TaskManagerBehavior.schema;
}

const RootEndpoint = MockServerNode.RootEndpoint.with(TestTaskManager);

async function awaitState(node: ServerNode, id: string, ...states: string[]): Promise<void> {
    for (let i = 0; i < 10_000; i++) {
        const state = await node.act(a => recordFor(a.get(TestTaskManager).state.runs, id)?.state);
        if (state !== undefined && states.includes(state)) {
            const settled =
                !isTerminalState(state) ||
                (await node.act(a => !a.get(TestTaskManager).tasks.some(t => t.status.slotKey === id)));
            if (settled) return;
        }
        await MockTime.advance(1);
    }
    throw new Error(`Task ${id} did not reach state ${states.join("|")}`);
}

/**
 * A peer whose "cap" kind has the given capacity snapshot, as a reconciler refresh would have left it.
 *
 * The kind's own `capacity` throws: admission reads the snapshot and never the device, so a read would fail the
 * test rather than pass it silently.
 */
function capPeer(id: string, capacity?: CapacityInfo): FakePeer {
    const peer = new FakePeer(id);
    if (capacity !== undefined) {
        peer.capacities.cap = capacity;
    }
    peer.itemKind = (kind: string): ItemKind | undefined =>
        kind === "cap"
            ? {
                  kind: "cap",
                  priority: 0,
                  async apply() {},
                  async capacity(): Promise<CapacityInfo> {
                      throw new InternalError("admission read the device instead of the snapshot");
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
        SyntheticTask.plannedChangesByTag["over"] = [
            { peer: testAddress("p"), kind: kindOf("cap"), key: "x", intent: {} },
        ];
        SyntheticTask.phasesByTag["over"] = [{ name: "should-not-run", run: async () => void (ran = true) }];

        const node = await MockServerNode.create(RootEndpoint, { environment, id: "adm-over" });
        await node.act(a => a.get(TestTaskManager).register(SyntheticTask));
        await node.act(a => a.get(TestTaskManager).run(SyntheticTask, { tag: "over" }));

        await awaitState(node, "synthetic:over", "failed");
        const rec = requireRecordFor(node.stateOf(TestTaskManager).runs, "synthetic:over");
        expect(rec.error).contains("capacity");
        expect(rec.changeSet).deep.equals([]);
        expect(rec.rollbackRunId).equals(undefined);
        expect(ran).equals(false);
        await node.close();
    });

    it("refuses a planned change naming a kind the reconciler does not own", async () => {
        const environment = new Environment("test");
        // Resolves nothing, so the planned kind below is a name no reconciler owns.
        const peer = capPeer("p", { limit: 4, used: 0 });
        TestTaskManager.peers.set("p", peer);
        TestTaskManager.reconcilerPeer = peer;

        let ran = false;
        SyntheticTask.plannedChangesByTag["unowned"] = [
            { peer: testAddress("p"), kind: kindOf("not-registered"), key: "x", intent: {} },
        ];
        SyntheticTask.phasesByTag["unowned"] = [{ name: "should-not-run", run: async () => void (ran = true) }];

        const node = await MockServerNode.create(RootEndpoint, { environment, id: "adm-unowned" });
        await node.act(a => a.get(TestTaskManager).register(SyntheticTask));
        await node.act(a => a.get(TestTaskManager).run(SyntheticTask, { tag: "unowned" }));

        await awaitState(node, "synthetic:unowned", "failed");
        const rec = requireRecordFor(node.stateOf(TestTaskManager).runs, "synthetic:unowned");
        // Refused where the capacity question is asked, rather than at the first write of a run already
        // holding its target.
        expect(rec.error).contains('no item kind "not-registered" is registered');
        expect(rec.changeSet).deep.equals([]);
        expect(ran).equals(false);
        await node.close();
    });

    it("refuses a kind the reconciler does not own even while its peer is unreachable", async () => {
        const environment = new Environment("test");
        const peer = capPeer("p", { limit: 4, used: 0 });
        TestTaskManager.peers.set("p", peer);
        TestTaskManager.reconcilerPeer = peer;

        let ran = false;
        // An address no peer answers to, so admission cannot resolve a node for it.
        SyntheticTask.plannedChangesByTag["unowned-offline"] = [
            { peer: testAddress("absent"), kind: kindOf("not-registered"), key: "x", intent: {} },
        ];
        SyntheticTask.phasesByTag["unowned-offline"] = [{ name: "should-not-run", run: async () => void (ran = true) }];

        const node = await MockServerNode.create(RootEndpoint, { environment, id: "adm-unowned-offline" });
        await node.act(a => a.get(TestTaskManager).register(SyntheticTask));
        await node.act(a => a.get(TestTaskManager).run(SyntheticTask, { tag: "unowned-offline" }));

        await awaitState(node, "synthetic:unowned-offline", "failed");
        const rec = requireRecordFor(node.stateOf(TestTaskManager).runs, "synthetic:unowned-offline");
        // Whether the reconciler owns the name does not depend on the peer, so an unreachable peer may not
        // postpone the question to the first write of a run already holding its target.
        expect(rec.error).contains('no item kind "not-registered" is registered');
        expect(ran).equals(false);
        await node.close();
    });

    it("does not reject an excludeFromAdmission kind even at its capacity limit", async () => {
        const environment = new Environment("test");
        const peer = new FakePeer("p");
        // Mirrors membership: capacity is exhausted, but the kind opts out of admission (a coarser kind gates it).
        peer.capacities.member = { limit: 4, used: 4 };
        peer.itemKind = (kind: string): ItemKind | undefined =>
            kind === "member"
                ? { kind: "member", priority: 0, async apply() {}, excludeFromAdmission: true }
                : undefined;
        TestTaskManager.peers.set("p", peer);
        TestTaskManager.reconcilerPeer = peer;

        let ran = false;
        SyntheticTask.plannedChangesByTag["member"] = [
            { peer: testAddress("p"), kind: kindOf("member"), key: "1:2", intent: {} },
        ];
        SyntheticTask.phasesByTag["member"] = [{ name: "runs", run: async () => void (ran = true) }];

        const node = await MockServerNode.create(RootEndpoint, { environment, id: "adm-member" });
        await node.act(a => a.get(TestTaskManager).register(SyntheticTask));
        await node.act(a => a.get(TestTaskManager).run(SyntheticTask, { tag: "member" }));

        await awaitState(node, "synthetic:member", "completed");
        expect(ran).equals(true);
        await node.close();
    });

    it("admits a task while its peer has no capacity snapshot yet, leaving the device write as the gate", async () => {
        const environment = new Environment("test");
        const peer = capPeer("p");
        TestTaskManager.peers.set("p", peer);
        TestTaskManager.reconcilerPeer = peer;

        let ran = false;
        SyntheticTask.plannedChangesByTag["unrefreshed"] = [
            { peer: testAddress("p"), kind: kindOf("cap"), key: "x", intent: {} },
        ];
        SyntheticTask.phasesByTag["unrefreshed"] = [{ name: "runs", run: async () => void (ran = true) }];

        const node = await MockServerNode.create(RootEndpoint, { environment, id: "adm-unrefreshed" });
        await node.act(a => a.get(TestTaskManager).register(SyntheticTask));
        await node.act(a => a.get(TestTaskManager).run(SyntheticTask, { tag: "unrefreshed" }));

        await awaitState(node, "synthetic:unrefreshed", "completed");
        expect(ran).equals(true);
        await node.close();
    });

    it("admits a task that fits", async () => {
        const environment = new Environment("test");
        const peer = capPeer("p", { limit: 4, used: 1 });
        TestTaskManager.peers.set("p", peer);
        TestTaskManager.reconcilerPeer = peer;

        let ran = false;
        SyntheticTask.plannedChangesByTag["fits"] = [
            { peer: testAddress("p"), kind: kindOf("cap"), key: "x", intent: {} },
        ];
        SyntheticTask.phasesByTag["fits"] = [{ name: "runs", run: async () => void (ran = true) }];

        const node = await MockServerNode.create(RootEndpoint, { environment, id: "adm-fits" });
        await node.act(a => a.get(TestTaskManager).register(SyntheticTask));
        await node.act(a => a.get(TestTaskManager).run(SyntheticTask, { tag: "fits" }));

        await awaitState(node, "synthetic:fits", "completed");
        expect(ran).equals(true);
        await node.close();
    });
});
