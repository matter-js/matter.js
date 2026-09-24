/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { TaskForeignFabricError } from "#task/errors.js";
import { TaskPersistence } from "#task/Task.js";
import { TaskManagerBehavior } from "#task/TaskManagerBehavior.js";
import { RetireSeq, RunId } from "#task/types.js";
import { Millis } from "@matter/general";
import { ServerNode } from "@matter/node";
import { MockServerNode, MockSite } from "@matter/node/testing";
import { FabricAuthority } from "@matter/protocol";
import { FabricId, NodeId } from "@matter/types";
import { GroupKeyManagement } from "@matter/types/clusters/group-key-management";
import { FakePeer, kindOf, pumpUntil, SyntheticTask, testAddress, TestTaskManagerBase } from "./helpers.js";

class TestTaskManager extends TestTaskManagerBase {
    static override readonly schema = TaskManagerBehavior.schema;
}

/** A controller that still holds every fabric a record names, whether or not it manages that fabric. */
class HoldingTaskManager extends TestTaskManagerBase {
    static override readonly schema = TaskManagerBehavior.schema;

    protected override fabricOnController() {
        return true;
    }
}

/** A controller whose one fabric a test removes while a run is being driven. */
class LosingTaskManager extends TestTaskManagerBase {
    static override readonly schema = TaskManagerBehavior.schema;
    static lost = false;

    protected override managedFabric() {
        return LosingTaskManager.lost ? undefined : super.managedFabric();
    }

    protected override fabricOnController() {
        return !LosingTaskManager.lost;
    }
}

const RootEndpoint = MockServerNode.RootEndpoint.with(TestTaskManager);
const LosingRoot = MockServerNode.RootEndpoint.with(LosingTaskManager);
const HoldingRoot = MockServerNode.RootEndpoint.with(HoldingTaskManager);

/**
 * A fabric the controller no longer holds. Its runs named peers at index 1, the index the managed fixture
 * fabric has now — the shape a controller that reused the index of a removed fabric leaves behind.
 */
const GONE = "7";

const PEER = "p";

function addNodeToGroup(runId: number, overrides: Partial<TaskPersistence>): TaskPersistence {
    const peer = testAddress(PEER);
    return {
        runId: RunId(runId),
        slotKey: `addNodeToGroup:${runId}`,
        type: "addNodeToGroup",
        params: {
            peer,
            endpoint: 1,
            groupId: 1,
            groupKeySetId: 1,
            groupKeySecurityPolicy: GroupKeyManagement.GroupKeySecurityPolicy.TrustFirst,
            epochKey0: new Uint8Array(16).fill(7),
            epochStartTime0: 1_000_000_000_000_000n,
        },
        phaseIndex: 0,
        state: "running",
        wrote: true,
        fabric: GONE,
        changeSet: [{ peer, kind: "groupKeyMap", key: "1" }],
        ...overrides,
    };
}

function rollbackOf(runId: number, originalRunId: number, overrides: Partial<TaskPersistence>): TaskPersistence {
    return {
        runId: RunId(runId),
        slotKey: `rollback:${originalRunId}`,
        type: "rollback",
        params: {
            originalRunId: RunId(originalRunId),
            entries: [{ peer: testAddress(PEER), kind: "groupKeyMap", key: "1" }],
        },
        phaseIndex: 0,
        state: "running",
        wrote: false,
        fabric: GONE,
        changeSet: [],
        rollbackOf: RunId(originalRunId),
        ...overrides,
    };
}

async function startWith<T extends typeof TestTaskManagerBase>(
    site: MockSite,
    root: typeof RootEndpoint | typeof HoldingRoot,
    manager: T,
    id: string,
    runs: TaskPersistence[],
): Promise<ServerNode> {
    const seed = await site.addNode(root, { id, index: 1 });
    await seed.act(a => {
        a.get(manager).state.runs = Object.fromEntries(runs.map(run => [String(run.runId), run]));
    });
    await MockTime.resolve(seed.close(), { macrotasks: true });
    return site.addNode(root, { id, index: 1 });
}

function stored(node: ServerNode, runId: number) {
    return node.act(a => a.get(TestTaskManager).state.runs[String(runId)]);
}

/**
 * The runs of a fabric that left the controller.
 *
 * Nothing on that fabric can be reached again, so its runs end and nothing of theirs is kept for an undo. The
 * addresses they recorded carry only a fabric index, which a controller reuses — so each case here names peers
 * at the index the managed fabric holds now, and a run that was driven or undone would reach its devices.
 */
describe("runs of a fabric that left the controller", () => {
    before(() => MockTime.init());

    let peer: FakePeer;

    beforeEach(() => {
        peer = new FakePeer(PEER);
        for (const manager of [TestTaskManager, HoldingTaskManager]) {
            manager.peers.set(PEER, peer);
            manager.reconcilerPeer = peer;
        }
    });

    afterEach(() => {
        for (const manager of [TestTaskManager, HoldingTaskManager]) {
            manager.peers.clear();
            manager.reconcilerPeer = undefined;
        }
    });

    it("ends an unfinished run without driving it against the fabric managed now", async () => {
        await using site = new MockSite();
        const node = await startWith(site, RootEndpoint, TestTaskManager, "gone-run", [addNodeToGroup(1, {})]);

        await pumpUntil("the run ends", async () =>
            node.act(a => a.get(TestTaskManager).get(RunId(1))?.status.state === "failed"),
        );
        const status = await node.act(a => a.get(TestTaskManager).get(RunId(1))!.status);
        expect(status.error).match(/fabric it acts on \(7\) left this controller/);
        expect(status.rollbackRunId).equals(undefined);
        expect((await stored(node, 1)).changeSet).deep.equals([]);
        expect(await node.act(a => a.get(TestTaskManager).tasks.length)).equals(0);

        // Neither driven nor undone: the peer answering to its address belongs to another fabric.
        expect(peer.items).deep.equals({});
        expect(peer.removeOrder).deep.equals([]);
        await MockTime.resolve(node.close(), { macrotasks: true });
    });

    it("abandons an unfinished rollback instead of replaying it, and spends its original's priors", async () => {
        await using site = new MockSite();
        const node = await startWith(site, RootEndpoint, TestTaskManager, "gone-rollback", [
            addNodeToGroup(1, {
                state: "cancelled",
                retireSeq: RetireSeq(1),
                rollbackRunId: RunId(2),
                params: undefined,
            }),
            rollbackOf(2, 1, {}),
        ]);

        await pumpUntil("the rollback ends", async () =>
            node.act(a => a.get(TestTaskManager).get(RunId(2))?.status.state === "abandoned"),
        );
        expect((await node.act(a => a.get(TestTaskManager).get(RunId(2))!.status)).error).match(/left this controller/);
        expect((await stored(node, 1)).changeSet).deep.equals([]);
        expect(peer.items).deep.equals({});
        expect(peer.removeOrder).deep.equals([]);
        await MockTime.resolve(node.close(), { macrotasks: true });
    });

    it("gives up on a failed rollback nothing could retry", async () => {
        await using site = new MockSite();
        const node = await startWith(site, RootEndpoint, TestTaskManager, "gone-failed-rollback", [
            addNodeToGroup(1, {
                state: "cancelled",
                retireSeq: RetireSeq(1),
                rollbackRunId: RunId(2),
                params: undefined,
            }),
            rollbackOf(2, 1, {
                state: "failed",
                retireSeq: RetireSeq(2),
                error: "peer unreachable",
                params: undefined,
            }),
        ]);

        await pumpUntil("the failed rollback is abandoned", async () =>
            node.act(a => a.get(TestTaskManager).get(RunId(2))?.status.state === "abandoned"),
        );
        // Not left for an operator to retry: a retry could only replay these priors onto another fabric.
        expect(await node.act(a => a.get(TestTaskManager).failedRollbacks.length)).equals(0);
        expect((await node.act(a => a.get(TestTaskManager).get(RunId(2))!.status)).error).match(
            /^peer unreachable \(abandoned: .*left this controller\)$/,
        );
        expect((await stored(node, 1)).changeSet).deep.equals([]);
        await MockTime.resolve(node.close(), { macrotasks: true });
    });

    it("spends the priors of a finished run whose undo was refused", async () => {
        await using site = new MockSite();
        const node = await startWith(site, RootEndpoint, TestTaskManager, "gone-priors", [
            addNodeToGroup(1, { state: "failed", retireSeq: RetireSeq(1), error: "boom", params: undefined }),
        ]);

        await pumpUntil("the priors are spent", async () => (await stored(node, 1)).changeSet.length === 0);
        const status = await node.act(a => a.get(TestTaskManager).get(RunId(1))!.status);
        expect(status.state).equals("failed");
        expect(status.error).equals("boom");
        await MockTime.resolve(node.close(), { macrotasks: true });
    });
});

describe("a driven run whose fabric leaves", () => {
    before(() => MockTime.init());

    const TAG = "fails-in-window";

    afterEach(() => {
        LosingTaskManager.lost = false;
        LosingTaskManager.peers.clear();
        LosingTaskManager.reconcilerPeer = undefined;
        delete SyntheticTask.phasesByTag[TAG];
    });

    for (const writes of [true, false]) {
        it(`retires a run that fails on its own while the settlement stops it${writes ? ", and undoes nothing" : ", having written nothing"}`, async () => {
            await using site = new MockSite();
            const peer = new FakePeer(PEER);
            LosingTaskManager.peers.set(PEER, peer);
            LosingTaskManager.reconcilerPeer = peer;

            // A phase that writes, then waits on something that does not observe the abort, then reaches its peer
            // again: the driver fails on its own inside the settlement's window instead of stopping on its signal.
            let release!: () => void;
            const held = new Promise<void>(resolve => (release = resolve));
            let reached = false;
            SyntheticTask.phasesByTag[TAG] = [
                {
                    name: "write-then-wait",
                    async run(ctx) {
                        if (writes) {
                            await ctx.setIntent(ctx.resolvePeer(peer.address), kindOf("groupKey"), "42", { a: 1 });
                        }
                        reached = true;
                        await held;
                        ctx.resolvePeer(peer.address);
                    },
                },
            ];

            const node = await site.addNode(LosingRoot, { id: "fails-in-window", index: 1 });
            await node.act(a => a.get(LosingTaskManager).register(SyntheticTask));
            const handle = await node.act(a => a.get(LosingTaskManager).run(SyntheticTask, { tag: TAG }));
            await pumpUntil("the phase has written", () => reached);

            // Any fabric leaving the table starts the settlement; which one left is read from the table.
            const other = await (
                await node.env.load(FabricAuthority)
            ).createFabric({
                adminFabricId: FabricId(2),
                adminFabricLabel: "other",
                adminNodeId: NodeId(2002),
            });
            LosingTaskManager.lost = true;
            await MockTime.resolve(other.delete(), { macrotasks: true });
            release();
            await pumpUntil("the run ends", () => handle.status.state === "failed");
            await MockTime.advance(Millis(100));
            await MockTime.macrotask;

            // Its rollback was refused: the fabric it would replay onto is gone. The settlement then spends the
            // priors that refusal kept, and releases the target the driver could not release while it was owned.
            expect(handle.status.rollbackRunId).equals(undefined);
            expect(
                await node.act(a => a.get(LosingTaskManager).state.runs[String(handle.runId)].changeSet),
            ).deep.equals([]);
            expect(await node.act(a => a.get(LosingTaskManager).tasks.length)).equals(0);
            expect(peer.removeOrder).deep.equals([]);
            await MockTime.resolve(node.close(), { macrotasks: true });
        });
    }

    it("drives a run on when its fabric comes back while the settlement stops it", async () => {
        await using site = new MockSite();
        const peer = new FakePeer(PEER);
        LosingTaskManager.peers.set(PEER, peer);
        LosingTaskManager.reconcilerPeer = peer;

        let release!: () => void;
        const held = new Promise<void>(resolve => (release = resolve));
        let reached = false;
        SyntheticTask.phasesByTag[TAG] = [
            {
                name: "wait",
                async run() {
                    reached = true;
                    await held;
                },
            },
        ];

        const node = await site.addNode(LosingRoot, { id: "fabric-returns", index: 1 });
        await node.act(a => a.get(LosingTaskManager).register(SyntheticTask));
        const handle = await node.act(a => a.get(LosingTaskManager).run(SyntheticTask, { tag: TAG }));
        await pumpUntil("the phase is running", () => reached);

        const other = await (
            await node.env.load(FabricAuthority)
        ).createFabric({
            adminFabricId: FabricId(2),
            adminFabricLabel: "other",
            adminNodeId: NodeId(2002),
        });
        LosingTaskManager.lost = true;
        await MockTime.resolve(other.delete(), { macrotasks: true });
        // Back before the driver has stopped, so the settlement finds nothing to end once it has.
        LosingTaskManager.lost = false;
        release();

        await pumpUntil("the run completes", () => handle.status.state === "completed");
        await pumpUntil("the run releases its target", async () =>
            node.act(a => a.get(LosingTaskManager).tasks.length === 0),
        );
        await MockTime.resolve(node.close(), { macrotasks: true });
    });
});

/**
 * The runs of a fabric the controller still holds but this manager does not manage. Nothing ends them — the
 * fabric can be managed again — and nothing reaches the fabric that is managed through the index they share.
 */
describe("runs of a fabric the manager does not manage", () => {
    before(() => MockTime.init());

    let peer: FakePeer;

    beforeEach(() => {
        peer = new FakePeer(PEER);
        HoldingTaskManager.peers.set(PEER, peer);
        HoldingTaskManager.reconcilerPeer = peer;
    });

    afterEach(() => {
        HoldingTaskManager.peers.clear();
        HoldingTaskManager.reconcilerPeer = undefined;
    });

    it("keeps an unfinished run without driving it", async () => {
        await using site = new MockSite();
        const node = await startWith(site, HoldingRoot, HoldingTaskManager, "held-run", [addNodeToGroup(1, {})]);
        await MockTime.advance(Millis(1000));
        await MockTime.macrotask;

        const status = await node.act(a => a.get(HoldingTaskManager).get(RunId(1))!.status);
        expect(status.state).equals("running");
        expect((await node.act(a => a.get(HoldingTaskManager).state.runs["1"])).changeSet.length).equals(1);
        expect(peer.items).deep.equals({});
        await MockTime.resolve(node.close(), { macrotasks: true });
    });

    it("does not read a peer it cannot resolve as one that left", async () => {
        await using site = new MockSite();
        const node = await startWith(site, HoldingRoot, HoldingTaskManager, "held-unresolved", [
            addNodeToGroup(1, { changeSet: [{ peer: testAddress("elsewhere"), kind: "groupKeyMap", key: "1" }] }),
        ]);
        await MockTime.advance(Millis(1000));
        await MockTime.macrotask;

        expect((await node.act(a => a.get(HoldingTaskManager).get(RunId(1))!.status)).state).equals("running");
        await MockTime.resolve(node.close(), { macrotasks: true });
    });

    it("refuses to build an undo that would replay onto the managed fabric", async () => {
        await using site = new MockSite();
        const node = await startWith(site, HoldingRoot, HoldingTaskManager, "held-retry", [
            addNodeToGroup(1, { state: "failed", retireSeq: RetireSeq(1), error: "boom", params: undefined }),
        ]);

        await expect(node.act(a => a.get(HoldingTaskManager).retryRollback(RunId(1)))).rejectedWith(
            TaskForeignFabricError,
            /acts on fabric 7/,
        );
        expect(peer.removeOrder).deep.equals([]);
        await MockTime.resolve(node.close(), { macrotasks: true });
    });
});
