/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { ReconcilerBehavior } from "#ReconcilerBehavior.js";
import { TaskManagerBehavior } from "#task/TaskManagerBehavior.js";
import { RunId } from "#task/types.js";
import { ClientNode, ServerNode } from "@matter/node";
import { MockServerNode, MockSite } from "@matter/node/testing";
import { PeerAddress } from "@matter/protocol";
import { FakePeer, pumpUntil } from "./helpers.js";

class TestTaskManager extends TaskManagerBehavior {
    static override readonly schema = TaskManagerBehavior.schema;
    static peers = new Map<string, FakePeer>();
    static reconcilerPeer?: FakePeer;

    protected override resolvePeerNode(address: PeerAddress): ClientNode | undefined {
        return [...TestTaskManager.peers.values()].find(p => PeerAddress.is(p.address, address))?.asNode();
    }
    protected override taskReconciler(): ReconcilerBehavior {
        return TestTaskManager.reconcilerPeer as unknown as ReconcilerBehavior;
    }
}

const RootEndpoint = MockServerNode.RootEndpoint.with(TestTaskManager);

/** A stored, unfinished run of a built-in type — the case nothing registers again after a restart. */
function seedRollback(node: ServerNode) {
    return node.act(a => {
        a.get(TestTaskManager).state.runs = {
            "5": {
                runId: RunId(5),
                slotKey: "rollback:1",
                type: "rollback",
                params: { originalRunId: RunId(1), entries: [] },
                phaseIndex: 0,
                state: "running",
                wrote: false,
                changeSet: [],
                rollbackOf: RunId(1),
            },
        };
    });
}

/**
 * The startup resume pass, which nothing else covers.
 *
 * Every other restart test registers its own task type afterwards, and that registration resumes the records
 * of *that* type. A built-in type is registered during initialization instead, so nothing registers it again
 * and only the startup pass can drive its records — the case an application actually hits.
 *
 * It needs a node that goes online: the pass waits for that, and `MockServerNode.create` leaves a node
 * offline, so a test built on it would pass without proving anything.
 */
describe("the startup resume pass", () => {
    before(() => MockTime.init());

    it("resumes a built-in type's record when nothing registers it again", async () => {
        await using site = new MockSite();
        {
            const seed = await site.addNode(RootEndpoint, { id: "probe2", index: 1 });
            await seedRollback(seed);
            await MockTime.resolve(seed.close(), { macrotasks: true });
        }

        const node = await site.addNode(RootEndpoint, { id: "probe2", index: 1 });
        expect(node.lifecycle.isOnline).equals(true);
        await pumpUntil("the stored rollback finishes", async () =>
            node.act(a => a.get(TestTaskManager).get(RunId(5))?.status.state === "completed"),
        );
    });
});
