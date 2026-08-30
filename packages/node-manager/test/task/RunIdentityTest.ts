/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { ReconcilerBehavior } from "#ReconcilerBehavior.js";
import { TaskConflictError, TaskIdentityExhaustedError, TaskTypeNotRegisteredError } from "#task/errors.js";
import { RUN_ID_RESERVATION, RunStore } from "#task/RunStore.js";
import { TaskDefinition, TaskPersistence } from "#task/Task.js";
import { TaskManagerBehavior } from "#task/TaskManagerBehavior.js";
import { RunId, TaskPhase } from "#task/types.js";
import { Environment, ImplementationError } from "@matter/general";
import { ClientNode, itemMapKey, ServerNode } from "@matter/node";
import { MockServerNode } from "@matter/node/testing";
import { FakePeer, onTerminalWrite, recordFor, SyntheticTask } from "./helpers.js";

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

    /** Hands out an identity without running anything, to reproduce a stop before the first record. */
    get internalRunStore() {
        return this.internal.runs;
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

async function pumpUntil(name: string, condition: () => Promise<boolean>) {
    for (let i = 0; i < 10_000; i++) {
        if (await condition()) {
            return;
        }
        await MockTime.advance(1);
    }
    throw new Error(`Condition "${name}" never held`);
}

/** Refuses to be rebuilt from its persisted parameters, as a custom task validating them might. */
const UnbuildableTask: TaskDefinition<{ tag: string }> & { rejectConstruction: boolean } = {
    type: "unbuildable",
    rejectConstruction: false,
    slotKeyFor(params) {
        return `unbuildable:${params.tag}`;
    },
    phases() {
        return new Array<TaskPhase>();
    },
    validate() {
        if (UnbuildableTask.rejectConstruction) {
            throw new ImplementationError("malformed persisted parameters");
        }
    },
};

/** A second type, so a request for a different slot can try to take a pending run's external id. */
const OtherTask: TaskDefinition<{ tag: string }> = {
    type: "other",
    slotKeyFor(params) {
        return `other:${params.tag}`;
    },
    phases() {
        return new Array<TaskPhase>();
    },
};

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
        await node.act(a => a.get(TestTaskManager).register(SyntheticTask));

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
        await node.act(a => a.get(TestTaskManager).register(SyntheticTask));

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
        await node.act(a => a.get(TestTaskManager).register(SyntheticTask));

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
            await node.act(a => a.get(TestTaskManager).register(SyntheticTask));
            const handle = await node.act(a => a.get(TestTaskManager).run("synthetic", { tag: "survive" }));
            runId = handle.status.runId;
            await settle(node, "synthetic:survive");
        }

        await using node = await makeNode(environment, "restart");
        await node.act(a => a.get(TestTaskManager).register(SyntheticTask));
        const status = await node.act(a => a.get(TestTaskManager).get(runId)?.status);
        expect(status?.state).equals("completed");
    });

    it("never re-issues a runId across a restart", async () => {
        const environment = persistentEnvironment();
        SyntheticTask.phasesByTag["counter"] = [{ name: "a", run: async () => {} }];

        let firstRunId: number;
        {
            await using node = await makeNode(environment, "counter");
            await node.act(a => a.get(TestTaskManager).register(SyntheticTask));
            const handle = await node.act(a => a.get(TestTaskManager).run("synthetic", { tag: "counter" }));
            firstRunId = handle.status.runId;
            await settle(node, "synthetic:counter");
        }

        await using node = await makeNode(environment, "counter");
        await node.act(a => a.get(TestTaskManager).register(SyntheticTask));
        const handle = await node.act(a => a.get(TestTaskManager).run("synthetic", { tag: "counter" }));
        expect(handle.status.runId).greaterThan(firstRunId);
    });

    it("refuses a re-run of a slot while the previous run's driver is still unwinding", async () => {
        await using node = await makeNode(undefined, "unwind");
        SyntheticTask.phasesByTag["unwind"] = [{ name: "a", run: async () => {} }];
        await node.act(a => a.get(TestTaskManager).register(SyntheticTask));

        let manager!: TaskManagerBehavior;
        await node.act(a => {
            manager = a.get(TestTaskManager);
        });

        // The re-run is attempted from inside the first run's terminal write: it is terminal there, but its
        // driver has not settled, so it still owns the slot and the re-run must be refused.
        let outcome: unknown = "hook never ran";
        await node.act(a => {
            const handle = a.get(TestTaskManager).run("synthetic", { tag: "unwind" });
            onTerminalWrite(a.get(TestTaskManager), handle.status.runId, () => {
                try {
                    manager.run("synthetic", { tag: "unwind" });
                    outcome = "admitted";
                } catch (e) {
                    outcome = e;
                }
            });
        });
        await settle(node, "synthetic:unwind");

        expect(outcome).instanceOf(TaskConflictError);
    });

    it("rolls back a run that retired before a restart", async () => {
        const environment = persistentEnvironment();
        touchingPeer("undo");
        SyntheticTask.phasesByTag["undo"] = [touchPhase("undo")];

        let runId: RunId;
        {
            await using node = await makeNode(environment, "undo");
            await node.act(a => a.get(TestTaskManager).register(SyntheticTask));
            const handle = await node.act(a => a.get(TestTaskManager).run("synthetic", { tag: "undo" }));
            runId = handle.runId;
            await settle(node, "synthetic:undo");
        }

        // The undo path for finished work reads the retained changeSet, so it has to survive the restart and
        // the run has to be reconstituted to answer whether it may be rolled back at all.
        await using node = await makeNode(environment, "undo");
        await node.act(a => a.get(TestTaskManager).register(SyntheticTask));
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
            await node.act(a => a.get(TestTaskManager).register(SyntheticTask));
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
        await node.act(a => a.get(TestTaskManager).register(SyntheticTask));

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

    it("refuses a re-run while a rollback of that slot is still live", async () => {
        await using node = await makeNode(undefined, "older");
        const peer = touchingPeer("older");
        SyntheticTask.phasesByTag["older"] = [touchPhase("older")];
        await node.act(a => a.get(TestTaskManager).register(SyntheticTask));

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

        // The rollback parks on an unreachable peer, so it stays live while the re-run is attempted.
        peer.setReachable(false);
        const rollback = await node.act(a => a.get(TestTaskManager).cancel(second.runId));
        expect(rollback?.status.revertOf).equals(second.runId);

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
        await node.act(a => a.get(TestTaskManager).register(SyntheticTask));

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

    it("refuses to start a rollback through run(), which only cancel may create", async () => {
        await using node = await makeNode(undefined, "norun");
        touchingPeer("norun");
        SyntheticTask.phasesByTag["norun"] = [touchPhase("norun")];
        await node.act(a => a.get(TestTaskManager).register(SyntheticTask));

        const forward = await node.act(a => a.get(TestTaskManager).run("synthetic", { tag: "norun" }));

        // Only cancel knows the run's driver has been stopped. A caller able to conjure a rollback could start
        // one against work still writing to a peer, which no admission check can tell from a prepared one.
        let refusal: unknown;
        try {
            await node.act(a => a.get(TestTaskManager).run("revert", { originalRunId: forward.runId, entries: [] }));
        } catch (e) {
            refusal = e;
        }
        expect(refusal).instanceOf(ImplementationError);
    });

    it("answers a repeated cancel from the record when the task type is not registered", async () => {
        const environment = persistentEnvironment();
        touchingPeer("norereg");
        SyntheticTask.phasesByTag["norereg"] = [touchPhase("norereg")];

        let runId: RunId;
        let rollbackId: RunId;
        {
            await using node = await makeNode(environment, "norereg");
            await node.act(a => a.get(TestTaskManager).register(SyntheticTask));
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

    it("refuses to undo a run a later run of its slot has superseded", async () => {
        await using node = await makeNode(undefined, "superseded");
        const peer = touchingPeer("superseded");
        SyntheticTask.phasesByTag["superseded"] = [touchPhase("superseded")];
        await node.act(a => a.get(TestTaskManager).register(SyntheticTask));

        const runs = new Array<RunId>();
        for (let round = 0; round < 2; round++) {
            const handle = await node.act(a => a.get(TestTaskManager).run("synthetic", { tag: "superseded" }));
            for (let i = 0; i < 10_000 && peer.items[itemMapKey("groupMembership", "X")] === undefined; i++) {
                await MockTime.advance(1);
            }
            await settle(node, "synthetic:superseded");
            peer.dropItem("groupMembership", "X");
            runs.push(handle.runId);
        }

        // Undoing a run restores the values it found. A later run of the slot has committed its own since, so
        // restoring the older run's would overwrite an outcome nobody asked to undo.
        let refusal: unknown;
        try {
            await node.act(a => a.get(TestTaskManager).cancel(runs[0]));
        } catch (e) {
            refusal = e;
        }
        expect(refusal).instanceOf(TaskConflictError);
        expect((refusal as TaskConflictError).owner).equals(runs[1]);

        // The newest run of the slot is still undoable.
        peer.setReachable(false);
        const rollback = await node.act(a => a.get(TestTaskManager).cancel(runs[1]));
        expect(rollback?.status.revertOf).equals(runs[1]);
    });

    it("refuses a rollback of a retired run whose slot a newer run now owns", async () => {
        await using node = await makeNode(undefined, "reverseorder");
        const peer = touchingPeer("reverseorder");
        SyntheticTask.phasesByTag["reverseorder"] = [touchPhase("reverseorder")];
        await node.act(a => a.get(TestTaskManager).register(SyntheticTask));

        const older = await node.act(a => a.get(TestTaskManager).run("synthetic", { tag: "reverseorder" }));
        for (let i = 0; i < 10_000 && peer.items[itemMapKey("groupMembership", "X")] === undefined; i++) {
            await MockTime.advance(1);
        }
        await settle(node, "synthetic:reverseorder");
        peer.dropItem("groupMembership", "X");

        // A newer run takes the slot and is held live on a gate that never settles, so reaching the conflict
        // does not depend on scheduling. Swapped only now, so the older run above still completes and retires.
        SyntheticTask.phasesByTag["reverseorder"] = [gateForever("reverseorder")];
        const newer = await node.act(a => a.get(TestTaskManager).run("synthetic", { tag: "reverseorder" }));
        expect(newer.runId).not.equals(older.runId);
        await pumpUntil(
            "the newer run owns the slot",
            async () => (await node.act(a => a.get(TestTaskManager).tasks.some(t => t.runId === newer.runId))) === true,
        );
        // Asserted rather than assumed: the conflict this test is about exists only while the newer run holds
        // the slot, so a setup that quietly let it finish would prove nothing.
        expect(await node.act(a => a.get(TestTaskManager).tasks.map(t => t.runId))).contains(newer.runId);

        let refusal: unknown;
        try {
            await node.act(a => a.get(TestTaskManager).cancel(older.runId));
        } catch (e) {
            refusal = e;
        }
        expect(refusal).instanceOf(TaskConflictError);
    });

    it("gives every concurrent cancel of a run the same rollback", async () => {
        await using node = await makeNode(undefined, "racecancel");
        const peer = touchingPeer("racecancel");
        SyntheticTask.phasesByTag["racecancel"] = [touchPhase("racecancel")];
        await node.act(a => a.get(TestTaskManager).register(SyntheticTask));

        const handle = await node.act(a => a.get(TestTaskManager).run("synthetic", { tag: "racecancel" }));
        for (let i = 0; i < 10_000 && peer.items[itemMapKey("groupMembership", "X")] === undefined; i++) {
            await MockTime.advance(1);
        }
        peer.setReachable(false);

        // Both callers pass the "already has a rollback" check before either creates one. The loser must be
        // told about the rollback that was created, not told there was nothing to roll back.
        const [first, second] = await MockTime.resolve(
            Promise.all([
                node.act(a => a.get(TestTaskManager).cancel(handle.runId)),
                node.act(a => a.get(TestTaskManager).cancel(handle.runId)),
            ]),
            { macrotasks: true },
        );
        expect(first).not.equals(undefined);
        expect(second).not.equals(undefined);
        expect(second?.runId).equals(first?.runId);
    });

    it("does not re-issue an identity handed out before its run was ever recorded", async () => {
        const environment = persistentEnvironment();
        touchingPeer("reserve");
        SyntheticTask.phasesByTag["reserve"] = [touchPhase("reserve")];

        let issued: RunId;
        {
            await using node = await makeNode(environment, "reserve");
            await node.act(a => a.get(TestTaskManager).register(SyntheticTask));
            const first = await node.act(a => a.get(TestTaskManager).run("synthetic", { tag: "reserve" }));
            await settle(node, "synthetic:reserve");

            // A second identity is handed out and the process stops before its run is ever recorded — the
            // window `run()` being synchronous creates.
            issued = await node.act(a => a.get(TestTaskManager).internalRunStore.allocate());
            expect(issued).greaterThan(first.runId);
        }

        await using node = await makeNode(environment, "reserve");
        await node.act(a => a.get(TestTaskManager).register(SyntheticTask));
        const next = await node.act(a => a.get(TestTaskManager).run("synthetic", { tag: "reserve" }));
        // The identity was durable when it was issued, so unrelated work cannot be given it after a restart.
        expect(next.runId).greaterThan(issued);
    });

    it("keeps a run awaiting resume in charge of the name it answers to", async () => {
        const environment = persistentEnvironment();
        touchingPeer("awaiting");
        SyntheticTask.phasesByTag["awaiting"] = [gateForever("awaiting")];

        let parked: RunId;
        {
            await using node = await makeNode(environment, "awaiting");
            await node.act(a => a.get(TestTaskManager).register(SyntheticTask));
            const handle = await node.act(a =>
                a.get(TestTaskManager).run("synthetic", { tag: "awaiting" }, { externalId: "held" }),
            );
            parked = handle.runId;
            await pumpUntil(
                "the run records its intent",
                async () =>
                    (await node.act(a => recordFor(a.get(TestTaskManager).state.runs, "synthetic:awaiting"))) !==
                    undefined,
            );
        }

        // Nothing registers "synthetic" on this start, so that run cannot be instantiated yet. It is still
        // unfinished work that has already written to a peer: it answers lookups, and a different slot may not
        // take the name it answers to, or the run would come back answering to nothing.
        await using node = await makeNode(environment, "awaiting");
        await node.act(a => a.get(TestTaskManager).register(OtherTask));
        expect(await node.act(a => a.get(TestTaskManager).get(parked)?.status.slotKey)).equals("synthetic:awaiting");
        expect(await node.act(a => a.get(TestTaskManager).forExternalId("held")?.runId)).equals(parked);

        let refusal: unknown;
        try {
            await node.act(a => a.get(TestTaskManager).run("other", { tag: "awaiting" }, { externalId: "held" }));
        } catch (e) {
            refusal = e;
        }
        expect(refusal).instanceOf(TaskConflictError);
        expect((refusal as TaskConflictError).owner).equals(parked);
    });

    it("reserves the very first identity of a fresh store", async () => {
        const environment = persistentEnvironment();
        touchingPeer("fresh");
        SyntheticTask.phasesByTag["fresh"] = [touchPhase("fresh")];

        let issued: RunId;
        {
            // Nothing has ever been written here, so without a reservation at startup the first identity
            // would be handed out uncovered and the next start would give it to different work.
            await using node = await makeNode(environment, "fresh");
            await node.act(a => a.get(TestTaskManager).register(SyntheticTask));
            issued = await node.act(a => a.get(TestTaskManager).internalRunStore.allocate());
        }

        await using node = await makeNode(environment, "fresh");
        await node.act(a => a.get(TestTaskManager).register(SyntheticTask));
        const next = await node.act(a => a.get(TestTaskManager).run("synthetic", { tag: "fresh" }));
        expect(next.runId).greaterThan(issued);
    });

    it("discards a terminal record that reached storage without its place in the retirement order", () => {
        const store = new RunStore();
        const { resumable, discarded } = store.load({
            runs: {
                // Written by a build that recorded the outcome and the order separately, and stopped between
                // the two. It has no position, so it would sort ahead of every sequenced run of its slot.
                "run:1": { runId: 1, slotKey: "synthetic:a", type: "synthetic", state: "completed", changeSet: [] },
                "run:2": {
                    runId: 2,
                    slotKey: "synthetic:a",
                    type: "synthetic",
                    state: "completed",
                    retireSeq: 1,
                    changeSet: [],
                },
            } as unknown as Record<string, TaskPersistence>,
            nextRunId: 3,
            nextRetireSeq: 2,
        });

        expect(discarded).equals(1);
        expect(resumable.length).equals(0);
        // Only the sequenced run survives, so nothing in the table can be misordered against it.
        expect(store.retiredRun(RunId(1))).equals(undefined);
        expect(store.retiredRun(RunId(2))?.retireSeq).equals(1);
    });

    it("refuses an identity the reservation does not cover rather than issuing it", async () => {
        await using node = await makeNode(undefined, "burst");
        touchingPeer("burst");
        SyntheticTask.phasesByTag["burst"] = [touchPhase("burst")];
        await node.act(a => a.get(TestTaskManager).register(SyntheticTask));

        // Exhaust the block without letting any record land. An identity beyond it is one the next start can
        // re-issue, so allocation refuses instead of handing out something it cannot promise.
        let exhausted: unknown;
        await node.act(a => {
            const store = a.get(TestTaskManager).internalRunStore;
            try {
                for (let i = 0; i < RUN_ID_RESERVATION + 5; i++) {
                    store.allocate();
                }
            } catch (e) {
                exhausted = e;
            }
        });
        expect(exhausted).instanceOf(TaskIdentityExhaustedError);
    });

    it("keeps a run pending when its task cannot be rebuilt from its record", async () => {
        const environment = persistentEnvironment();

        let parked: RunId;
        {
            await using node = await makeNode(environment, "unbuildable");
            UnbuildableTask.rejectConstruction = false;
            await node.act(a => a.get(TestTaskManager).register(UnbuildableTask));
            const handle = await node.act(a => a.get(TestTaskManager).run("unbuildable", { tag: "u" }));
            parked = handle.runId;
            await pumpUntil(
                "the run is recorded",
                async () =>
                    (await node.act(a => recordFor(a.get(TestTaskManager).state.runs, "unbuildable:u"))) !== undefined,
            );
        }

        // The record survives but its task refuses to be rebuilt. It is still unfinished work that has been
        // written down, so forgetting it here would free its slot and hide it for the rest of this process.
        await using node = await makeNode(environment, "unbuildable");
        UnbuildableTask.rejectConstruction = true;
        await node.act(a => a.get(TestTaskManager).register(UnbuildableTask));

        expect(await node.act(a => a.get(TestTaskManager).get(parked)?.status.slotKey)).equals("unbuildable:u");
        UnbuildableTask.rejectConstruction = false;
        let refusal: unknown;
        try {
            await node.act(a => a.get(TestTaskManager).run("unbuildable", { tag: "u" }));
        } catch (e) {
            refusal = e;
        }
        expect(refusal).instanceOf(TaskConflictError);
        expect((refusal as TaskConflictError).owner).equals(parked);
    });
});
