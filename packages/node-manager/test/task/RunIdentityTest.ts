/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { ReconcilerBehavior } from "#ReconcilerBehavior.js";
import { TaskConflictError, TaskTypeNotRegisteredError } from "#task/errors.js";
import { TaskPersistence } from "#task/Task.js";
import { TaskManagerBehavior } from "#task/TaskManagerBehavior.js";
import { RunId, TaskPhase } from "#task/types.js";
import { Environment } from "@matter/general";
import { ClientNode, itemMapKey, ServerNode } from "@matter/node";
import { MockServerNode } from "@matter/node/testing";
import { FakePeer, SyntheticTask } from "./helpers.js";

/** Resolves peers to fakes, so a phase records a real changeSet and its rollback has something to undo. */
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

/** A peer that never reports the item as present, so a task parks with its changeSet recorded. */
function touchingPeer(id: string) {
    const peer = new FakePeer(id);
    TestTaskManager.peers.set(id, peer);
    TestTaskManager.reconcilerPeer = peer;
    return peer;
}

/** A phase that records one intent and never settles, so the run stays live and owns its slot. */
function gateForever(peerId: string): TaskPhase {
    return {
        name: "hold",
        run: async ctx => {
            const peer = ctx.resolvePeer(peerId);
            await ctx.setIntent(peer, "groupMembership", "X", {});
            await ctx.awaitCommitted([{ peer, kind: "groupMembership", key: "X" }]);
        },
    };
}

/** A phase that records one intent and returns, so the run completes with a non-empty changeSet. */
function touchPhase(peerId: string): TaskPhase {
    return {
        name: "touch",
        run: async ctx => {
            await ctx.setIntent(ctx.resolvePeer(peerId), "groupMembership", "X", {});
        },
    };
}

/** Fires while a terminal record is being serialized — after the task is terminal, before its driver settles. */
class UnwindHookedTask extends SyntheticTask {
    static atTerminalWrite?: () => void;

    override toPersistence(): TaskPersistence {
        const record = super.toPersistence();
        if (record.state === "completed") {
            const hook = UnwindHookedTask.atTerminalWrite;
            UnwindHookedTask.atTerminalWrite = undefined;
            hook?.();
        }
        return record;
    }
}

async function makeNode(environment?: Environment, id = "run-identity") {
    return MockServerNode.create(RootEndpoint, { environment, id });
}

/** An environment with its own storage so a node can be closed and recreated over the same records. */
function persistentEnvironment() {
    return new Environment("run-identity");
}

async function records(node: ServerNode): Promise<Record<string, TaskPersistence>> {
    return node.act(a => ({ ...a.get(TestTaskManager).state.runs }));
}

/**
 * Wait until no run owns `slotKey` any more. A run turns terminal one step before it retires, so waiting for
 * the record to read terminal would let a test act while the slot is still held.
 */
async function settle(node: ServerNode, slotKey: string) {
    for (let i = 0; i < 10_000; i++) {
        const retired = await node.act(a => {
            const manager = a.get(TestTaskManager);
            const owned = manager.tasks.some(t => t.status.slotKey === slotKey);
            return !owned && manager.history().some(h => h.status.slotKey === slotKey);
        });
        if (retired) {
            return;
        }
        await MockTime.advance(1);
    }
    throw new Error(`No run of slot ${slotKey} retired`);
}

describe("run identity", () => {
    before(() => MockTime.init());

    it("gives a re-run of a terminal slot a new runId and leaves the prior record intact", async () => {
        await using node = await makeNode();
        SyntheticTask.phasesByTag["rerun"] = [{ name: "a", run: async () => {} }];
        await node.act(a => a.get(TestTaskManager).register("synthetic", SyntheticTask));

        const first = await node.act(a => a.get(TestTaskManager).run("synthetic", { tag: "rerun" }));
        await settle(node, "synthetic:rerun");
        const firstRunId = first.status.runId;

        const second = await node.act(a => a.get(TestTaskManager).run("synthetic", { tag: "rerun" }));
        await settle(node, "synthetic:rerun");

        expect(second.status.runId).not.equals(firstRunId);
        expect(second.runId).not.equals(first.runId);

        // Both runs are on record: the re-run must not have overwritten its predecessor.
        const all = Object.values(await records(node)).filter(r => r.slotKey === "synthetic:rerun");
        expect(all.map(r => r.runId).sort()).deep.equals([firstRunId, second.status.runId].sort());
    });

    it("keeps every record of cancel, re-run, cancel", async () => {
        await using node = await makeNode();
        touchingPeer("churn");
        // A changeSet is what makes a cancel produce a rollback record, so the phase must really touch a peer.
        SyntheticTask.phasesByTag["churn"] = [touchPhase("churn")];
        await node.act(a => a.get(TestTaskManager).register("synthetic", SyntheticTask));

        const peer = TestTaskManager.peers.get("churn")!;
        const runIds = new Array<number>();
        for (let round = 0; round < 2; round++) {
            const handle = await node.act(a => a.get(TestTaskManager).run("synthetic", { tag: "churn" }));
            runIds.push(handle.runId);

            // Cancel only once the phase has actually touched the peer: a run with an empty changeSet has
            // nothing to roll back, and cancelling it would prove nothing about record retention.
            for (let i = 0; i < 10_000 && peer.items[itemMapKey("groupMembership", "X")] === undefined; i++) {
                await MockTime.advance(1);
            }
            const revert = await node.act(a => a.get(TestTaskManager).cancel(handle.runId));
            expect(revert).not.equals(undefined);
            runIds.push(revert!.runId);

            // Let the rollback finish and release the slot, so the next round is a genuine re-run of it.
            await settle(node, `revert:${handle.runId}`);
            peer.dropItem("groupMembership", "X");
        }

        const persisted = await records(node);
        // Two forward runs and two rollbacks, all four distinct and all four still readable: the defect this
        // replaces overwrote both the first run's record and its rollback's.
        expect(runIds).length(4);
        expect(new Set(runIds).size).equals(4);
        for (const runId of runIds) {
            expect(Object.keys(persisted)).includes(String(runId));
        }
        const cancelled = Object.values(persisted).filter(r => r.state === "cancelled");
        expect(cancelled).length(2);
        // Each rollback is linked to the forward run it undoes, so the audit trail of both cancels survives.
        const rollbacks = Object.values(persisted).filter(r => r.revertOf !== undefined);
        expect(rollbacks.map(r => r.revertOf).sort()).deep.equals(cancelled.map(r => r.runId).sort());
    });

    it("lists only non-terminal runs in tasks", async () => {
        await using node = await makeNode();
        SyntheticTask.phasesByTag["retire"] = [{ name: "a", run: async () => {} }];
        await node.act(a => a.get(TestTaskManager).register("synthetic", SyntheticTask));

        await node.act(a => a.get(TestTaskManager).run("synthetic", { tag: "retire" }));
        await settle(node, "synthetic:retire");

        expect(await node.act(a => a.get(TestTaskManager).tasks.length)).equals(0);
    });

    it("answers for a run that retired before a restart", async () => {
        const environment = persistentEnvironment();
        SyntheticTask.phasesByTag["survive"] = [{ name: "a", run: async () => {} }];

        let runId: RunId;
        {
            await using node = await makeNode(environment, "restart");
            await node.act(a => a.get(TestTaskManager).register("synthetic", SyntheticTask));
            const handle = await node.act(a => a.get(TestTaskManager).run("synthetic", { tag: "survive" }));
            runId = handle.status.runId;
            await settle(node, "synthetic:survive");
        }

        await using node = await makeNode(environment, "restart");
        await node.act(a => a.get(TestTaskManager).register("synthetic", SyntheticTask));
        const status = await node.act(a => a.get(TestTaskManager).get(runId)?.status);
        expect(status?.state).equals("completed");
    });

    it("never re-issues a runId across a restart", async () => {
        const environment = persistentEnvironment();
        SyntheticTask.phasesByTag["counter"] = [{ name: "a", run: async () => {} }];

        let firstRunId: number;
        {
            await using node = await makeNode(environment, "counter");
            await node.act(a => a.get(TestTaskManager).register("synthetic", SyntheticTask));
            const handle = await node.act(a => a.get(TestTaskManager).run("synthetic", { tag: "counter" }));
            firstRunId = handle.status.runId;
            await settle(node, "synthetic:counter");
        }

        await using node = await makeNode(environment, "counter");
        await node.act(a => a.get(TestTaskManager).register("synthetic", SyntheticTask));
        const handle = await node.act(a => a.get(TestTaskManager).run("synthetic", { tag: "counter" }));
        expect(handle.status.runId).greaterThan(firstRunId);
    });

    it("refuses a re-run of a slot while the previous run's driver is still unwinding", async () => {
        await using node = await makeNode(undefined, "unwind");
        UnwindHookedTask.phasesByTag["unwind"] = [{ name: "a", run: async () => {} }];
        await node.act(a => a.get(TestTaskManager).register("synthetic", UnwindHookedTask));

        let manager!: TaskManagerBehavior;
        await node.act(a => {
            manager = a.get(TestTaskManager);
        });

        // The re-run is attempted from inside the first run's terminal write: it is terminal there, but its
        // driver has not settled, so it still owns the slot and the re-run must be refused.
        let outcome: unknown = "hook never ran";
        UnwindHookedTask.atTerminalWrite = () => {
            try {
                manager.run("synthetic", { tag: "unwind" });
                outcome = "admitted";
            } catch (e) {
                outcome = e;
            }
        };
        try {
            await node.act(a => a.get(TestTaskManager).run("synthetic", { tag: "unwind" }));
            await settle(node, "synthetic:unwind");
        } finally {
            UnwindHookedTask.atTerminalWrite = undefined;
        }

        expect(outcome).instanceOf(TaskConflictError);
    });

    it("rolls back a run that retired before a restart", async () => {
        const environment = persistentEnvironment();
        touchingPeer("undo");
        SyntheticTask.phasesByTag["undo"] = [touchPhase("undo")];

        let runId: RunId;
        {
            await using node = await makeNode(environment, "undo");
            await node.act(a => a.get(TestTaskManager).register("synthetic", SyntheticTask));
            const handle = await node.act(a => a.get(TestTaskManager).run("synthetic", { tag: "undo" }));
            runId = handle.runId;
            await settle(node, "synthetic:undo");
        }

        // The undo path for finished work reads the retained changeSet, so it has to survive the restart and
        // the run has to be reconstituted to answer whether it may be rolled back at all.
        await using node = await makeNode(environment, "undo");
        await node.act(a => a.get(TestTaskManager).register("synthetic", SyntheticTask));
        const rollback = await node.act(a => a.get(TestTaskManager).cancel(runId));
        expect(rollback?.status.revertOf).equals(runId);
    });

    it("refuses to roll back a retired run whose type nothing has registered", async () => {
        const environment = persistentEnvironment();
        touchingPeer("unregistered");
        SyntheticTask.phasesByTag["unregistered"] = [touchPhase("unregistered")];

        let runId: RunId;
        {
            await using node = await makeNode(environment, "unregistered");
            await node.act(a => a.get(TestTaskManager).register("synthetic", SyntheticTask));
            const handle = await node.act(a => a.get(TestTaskManager).run("synthetic", { tag: "unregistered" }));
            runId = handle.runId;
            await settle(node, "synthetic:unregistered");
        }

        // Observing a retired run needs no task; rolling one back does, because revertibility is the task's
        // decision and a record cannot answer it.
        await using node = await makeNode(environment, "unregistered");
        expect(await node.act(a => a.get(TestTaskManager).get(runId)?.status.state)).equals("completed");
        await expect((async () => node.act(a => a.get(TestTaskManager).cancel(runId)))()).rejectedWith(
            TaskTypeNotRegisteredError,
        );
    });

    it("refuses an external id a live run of another slot already answers to", async () => {
        await using node = await makeNode(undefined, "extid");
        SyntheticTask.phasesByTag["holder"] = [{ name: "a", run: async () => new Promise<void>(() => {}) }];
        SyntheticTask.phasesByTag["other"] = [{ name: "a", run: async () => {} }];
        await node.act(a => a.get(TestTaskManager).register("synthetic", SyntheticTask));

        const held = await node.act(a =>
            a.get(TestTaskManager).run("synthetic", { tag: "holder" }, { externalId: "mine" }),
        );

        // An external id is one-to-one, so a different slot may not take the name a live run answers to.
        let refusal: unknown;
        try {
            await node.act(a => a.get(TestTaskManager).run("synthetic", { tag: "other" }, { externalId: "mine" }));
        } catch (e) {
            refusal = e;
        }
        expect(refusal).instanceOf(TaskConflictError);
        expect((refusal as TaskConflictError).owner).equals(held.runId);
        expect(await node.act(a => a.get(TestTaskManager).forExternalId("mine")?.runId)).equals(held.runId);
    });

    it("refuses a re-run while a rollback of an older run of the slot is still live", async () => {
        await using node = await makeNode(undefined, "older");
        const peer = touchingPeer("older");
        SyntheticTask.phasesByTag["older"] = [touchPhase("older")];
        await node.act(a => a.get(TestTaskManager).register("synthetic", SyntheticTask));

        // Two completed runs of one slot, so the rollback in flight is not the newest run's.
        const first = await node.act(a => a.get(TestTaskManager).run("synthetic", { tag: "older" }));
        for (let i = 0; i < 10_000 && peer.items[itemMapKey("groupMembership", "X")] === undefined; i++) {
            await MockTime.advance(1);
        }
        await settle(node, "synthetic:older");
        peer.dropItem("groupMembership", "X");

        const second = await node.act(a => a.get(TestTaskManager).run("synthetic", { tag: "older" }));
        for (let i = 0; i < 10_000 && peer.items[itemMapKey("groupMembership", "X")] === undefined; i++) {
            await MockTime.advance(1);
        }
        await settle(node, "synthetic:older");
        expect(second.runId).not.equals(first.runId);

        // The rollback of the OLDER run parks on an unreachable peer, so it stays live.
        peer.setReachable(false);
        const rollback = await node.act(a => a.get(TestTaskManager).cancel(first.runId));
        expect(rollback?.status.revertOf).equals(first.runId);

        // A rollback rewrites exactly the intents a re-run would re-apply, whichever run of the slot it undoes.
        let refusal: unknown;
        try {
            await node.act(a => a.get(TestTaskManager).run("synthetic", { tag: "older" }));
        } catch (e) {
            refusal = e;
        }
        expect(refusal).instanceOf(TaskConflictError);
        expect((refusal as TaskConflictError).owner).equals(rollback?.runId);
    });

    it("answers a repeated cancel with the rollback it recorded, once that rollback has finished", async () => {
        await using node = await makeNode(undefined, "recancel");
        const peer = touchingPeer("recancel");
        SyntheticTask.phasesByTag["recancel"] = [touchPhase("recancel")];
        await node.act(a => a.get(TestTaskManager).register("synthetic", SyntheticTask));

        const handle = await node.act(a => a.get(TestTaskManager).run("synthetic", { tag: "recancel" }));
        for (let i = 0; i < 10_000 && peer.items[itemMapKey("groupMembership", "X")] === undefined; i++) {
            await MockTime.advance(1);
        }
        const rollback = await node.act(a => a.get(TestTaskManager).cancel(handle.runId));
        expect(rollback).not.equals(undefined);

        // Let the rollback finish and retire, so it no longer answers as live work.
        await settle(node, `revert:${handle.runId}`);

        // Cancelling again is idempotent and must keep naming the same rollback. Resolving only live runs here
        // would make the answer depend on whether the rollback happens to have finished yet.
        const again = await node.act(a => a.get(TestTaskManager).cancel(handle.runId));
        expect(again?.runId).equals(rollback?.runId);
        expect(again?.status.revertOf).equals(handle.runId);
    });

    it("refuses a re-run against a rollback started through the public run path", async () => {
        await using node = await makeNode(undefined, "publicrevert");
        const peer = touchingPeer("publicrevert");
        SyntheticTask.phasesByTag["publicrevert"] = [touchPhase("publicrevert")];
        await node.act(a => a.get(TestTaskManager).register("synthetic", SyntheticTask));

        const forward = await node.act(a => a.get(TestTaskManager).run("synthetic", { tag: "publicrevert" }));
        for (let i = 0; i < 10_000 && peer.items[itemMapKey("groupMembership", "X")] === undefined; i++) {
            await MockTime.advance(1);
        }
        await settle(node, "synthetic:publicrevert");

        // A rollback issued through the public API — how a failed one is retried — must exclude a re-run of the
        // work it is undoing just as the manager's own does. It parks on an unreachable peer so it stays live.
        peer.setReachable(false);
        await node.act(a =>
            a.get(TestTaskManager).run("revert", {
                originalRunId: forward.runId,
                entries: [{ peerId: "publicrevert", kind: "groupMembership", key: "X" }],
            }),
        );

        let refusal: unknown;
        try {
            await node.act(a => a.get(TestTaskManager).run("synthetic", { tag: "publicrevert" }));
        } catch (e) {
            refusal = e;
        }
        expect(refusal).instanceOf(TaskConflictError);
    });

    it("answers a repeated cancel from the record when the task type is not registered", async () => {
        const environment = persistentEnvironment();
        touchingPeer("norereg");
        SyntheticTask.phasesByTag["norereg"] = [touchPhase("norereg")];

        let runId: RunId;
        let rollbackId: RunId;
        {
            await using node = await makeNode(environment, "norereg");
            await node.act(a => a.get(TestTaskManager).register("synthetic", SyntheticTask));
            const handle = await node.act(a => a.get(TestTaskManager).run("synthetic", { tag: "norereg" }));
            runId = handle.runId;
            await settle(node, "synthetic:norereg");
            const rollback = await node.act(a => a.get(TestTaskManager).cancel(runId));
            rollbackId = rollback!.runId;
            await settle(node, `revert:${runId}`);
        }

        // Nothing registers the type on this start. Deciding on a NEW rollback would need the task, because
        // revertibility is the task's decision — but a run that already recorded one is answered by its record.
        await using node = await makeNode(environment, "norereg");
        const again = await node.act(a => a.get(TestTaskManager).cancel(runId));
        expect(again?.runId).equals(rollbackId);
    });

    it("refuses a second rollback of a slot another rollback is already undoing", async () => {
        await using node = await makeNode(undefined, "tworollbacks");
        const peer = touchingPeer("tworollbacks");
        SyntheticTask.phasesByTag["tworollbacks"] = [touchPhase("tworollbacks")];
        await node.act(a => a.get(TestTaskManager).register("synthetic", SyntheticTask));

        const runs = new Array<RunId>();
        for (let round = 0; round < 2; round++) {
            const handle = await node.act(a => a.get(TestTaskManager).run("synthetic", { tag: "tworollbacks" }));
            for (let i = 0; i < 10_000 && peer.items[itemMapKey("groupMembership", "X")] === undefined; i++) {
                await MockTime.advance(1);
            }
            await settle(node, "synthetic:tworollbacks");
            peer.dropItem("groupMembership", "X");
            runs.push(handle.runId);
        }

        // Each rollback has a slot of its own, so nothing about their own slots keeps them apart. They rewrite
        // the same intents, so the second must be refused against the slot they both undo.
        peer.setReachable(false);
        const first = await node.act(a => a.get(TestTaskManager).cancel(runs[0]));
        expect(first).not.equals(undefined);

        let refusal: unknown;
        try {
            await node.act(a => a.get(TestTaskManager).cancel(runs[1]));
        } catch (e) {
            refusal = e;
        }
        expect(refusal).instanceOf(TaskConflictError);
        expect((refusal as TaskConflictError).owner).equals(first?.runId);
    });

    it("refuses a rollback of a retired run whose slot a newer run now owns", async () => {
        await using node = await makeNode(undefined, "reverseorder");
        const peer = touchingPeer("reverseorder");
        SyntheticTask.phasesByTag["reverseorder"] = [touchPhase("reverseorder")];
        SyntheticTask.phasesByTag["holdit"] = [gateForever("reverseorder")];
        await node.act(a => a.get(TestTaskManager).register("synthetic", SyntheticTask));

        const older = await node.act(a => a.get(TestTaskManager).run("synthetic", { tag: "reverseorder" }));
        for (let i = 0; i < 10_000 && peer.items[itemMapKey("groupMembership", "X")] === undefined; i++) {
            await MockTime.advance(1);
        }
        await settle(node, "synthetic:reverseorder");
        peer.dropItem("groupMembership", "X");

        // A newer run takes the slot and stays live. Undoing the older run now would rewrite the intents the
        // newer one is working on.
        const newer = await node.act(a => a.get(TestTaskManager).run("synthetic", { tag: "reverseorder" }));
        expect(newer.runId).not.equals(older.runId);

        let refusal: unknown;
        try {
            await node.act(a => a.get(TestTaskManager).cancel(older.runId));
        } catch (e) {
            refusal = e;
        }
        expect(refusal).instanceOf(TaskConflictError);
    });
});
