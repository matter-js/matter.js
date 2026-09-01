/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { ReconcilerBehavior } from "#ReconcilerBehavior.js";
import {
    TaskAbandonedError,
    TaskAbandonedSignal,
    TaskAlreadyUndoneError,
    TaskCancelledSignal,
    TaskCannotCancelRollbackError,
    TaskManagerClosingError,
    TaskNotARollbackError,
    TaskNotFoundError,
    TaskRollbackPendingError,
    TaskSlotDrainingError,
    TaskSlotSettlingError,
    TaskSupersededError,
} from "#task/errors.js";
import { TaskDefinition } from "#task/Task.js";
import { RunRecord } from "#task/Task.js";
import { TaskManagerBehavior } from "#task/TaskManagerBehavior.js";
import { RunId, TaskPhase } from "#task/types.js";
import { Environment, ImplementationError, InternalError, Lifecycle, MaybePromise } from "@matter/general";
import { ClientNode, itemMapKey, ServerNode } from "@matter/node";
import { MockServerNode } from "@matter/node/testing";
import { FakePeer, liveRecord, onPersisted, SyntheticTask } from "./helpers.js";

class TestTaskManager extends TaskManagerBehavior {
    static override readonly schema = TaskManagerBehavior.schema;
    static peers = new Map<string, FakePeer>();
    static reconcilerPeer?: FakePeer;
    /** Set to leave a persisted rollback with no driver, as a start before `Revert` is available would. */
    static omitRevert = false;

    protected override resolvePeerNode(peerId: string): ClientNode | undefined {
        return TestTaskManager.peers.get(peerId)?.asNode();
    }
    protected override taskReconciler(): ReconcilerBehavior {
        return TestTaskManager.reconcilerPeer as unknown as ReconcilerBehavior;
    }
    protected override registerBuiltins() {
        if (!TestTaskManager.omitRevert) {
            super.registerBuiltins();
        }
    }

    /** What a run's driver was told to stop for, as its phases would see it. */
    abortOf(runId: RunId) {
        return this.internal.runs.executionOf(runId)?.gate.aborted;
    }

    /** The verb tearing a run down, while it is in charge. */
    teardownOf(runId: RunId) {
        return this.internal.runs.transitionOf(runId)?.teardown;
    }

    isAttached(runId: RunId) {
        return this.internal.runs.isAttached(runId);
    }

    isDriven(runId: RunId) {
        const execution = this.internal.runs.executionOf(runId);
        return execution !== undefined && !execution.settled;
    }

    /** The execution object driving a run. A restored driver is a *new* one, which is what identity proves. */
    executionOf(runId: RunId) {
        return this.internal.runs.executionOf(runId);
    }

    resumableRunIds() {
        return this.internal.runs.resumable.map(r => r.runId);
    }

    record(runId: RunId) {
        return this.internal.runs.get(runId);
    }

    /**
     * Delay the moment this run's driver *appears* to stop, so a test can act inside the window between the
     * abort and the write that ends the run. The real driver still stops; only its observation is held.
     */
    holdDriverStop(runId: RunId): () => void {
        const execution = this.internal.runs.executionOf(runId);
        if (execution?.promise === undefined) {
            throw new InternalError(`Run #${runId} is not driving`);
        }
        let release = () => {};
        const held = new Promise<void>(resolve => (release = resolve));
        execution.promise = execution.promise.then(() => held);
        return release;
    }

    /**
     * Adopt the outcome a driver would have reached, for a test that needs that to happen inside a window a
     * driver cannot be stopped in.
     *
     * Adopts without writing, which the manager never does — a driver adopts only once its write has landed.
     * That is enough here because what is under test is which decision the transition takes from the state it
     * finds, and it reads memory; nothing in these tests asserts durability of the outcome itself.
     */
    reachOutcome(runId: RunId, state: "completed" | "failed", error?: string) {
        const record = this.internal.runs.get(runId);
        if (record === undefined) {
            throw new InternalError(`No run #${runId}`);
        }
        record.retireSeq = this.internal.runs.nextRetirement(record);
        record.state = state;
        record.error = error;
        return record.retireSeq;
    }

    holdPersistMutex(): () => void {
        const mutex = this.internal.persistMutex;
        if (mutex === undefined) {
            throw new InternalError("The persist mutex does not exist yet; run a task first");
        }
        let release = () => {};
        const held = new Promise<void>(resolve => (release = resolve));
        mutex.run(() => held);
        return release;
    }

    async closePersistMutex() {
        await this.internal.persistMutex?.close();
    }
}

const RootEndpoint = MockServerNode.RootEndpoint.with(TestTaskManager);

const KEY = itemMapKey("groupMembership", "X");

function testPeer(id: string) {
    const peer = new FakePeer(id);
    TestTaskManager.peers.set(id, peer);
    TestTaskManager.reconcilerPeer = peer;
    return peer;
}

async function makeNode(environment?: Environment, id = "abandon") {
    return MockServerNode.create(RootEndpoint, { environment, id });
}

async function pumpUntil(name: string, condition: () => MaybePromise<boolean>) {
    for (let i = 0; i < 10_000; i++) {
        if (await condition()) {
            return;
        }
        await MockTime.advance(1);
    }
    throw new InternalError(`Condition "${name}" never held`);
}

/** A phase that writes one intent the device never confirms, so the run parks owning its target. */
function gatingPhase(peerId: string): TaskPhase {
    return {
        name: "hold",
        run: async ctx => {
            const peer = ctx.resolvePeer(peerId);
            await ctx.setIntent(peer, "groupMembership", "X", { v: 2 });
            await ctx.awaitCommitted([{ peer, kind: "groupMembership", key: "X" }]);
        },
    };
}

/**
 * A run parked with an unreachable peer, cancelled so its rollback parks too.
 *
 * The rollback is what these tests act on, and it has to be non-terminal and driving: one that had finished
 * would answer a different question.
 */
async function parkedRollback(node: ServerNode, tag: string, peer: FakePeer) {
    SyntheticTask.phasesByTag[tag] = [gatingPhase(peer.id)];
    await node.act(a => a.get(TestTaskManager).register(SyntheticTask));
    const original = await node.act(a => a.get(TestTaskManager).run(SyntheticTask, { tag }));
    await pumpUntil("intent written", () => peer.items[KEY] !== undefined);

    peer.setReachable(false);
    const rollback = await node.act(a => a.get(TestTaskManager).cancel(original.runId));
    if (rollback === undefined) {
        throw new InternalError("cancel produced no rollback");
    }
    await pumpUntil("rollback parked", () =>
        node.act(a => a.get(TestTaskManager).get(rollback.runId)?.status.state === "parked"),
    );
    return { original, rollback };
}

/**
 * A run whose rollback failed: the rollback restores a prior value and the reconciler then drops the intent it
 * is waiting for, so its gate can never commit. Only a failed rollback is out of flight and retryable.
 */
async function failedRollback(node: ServerNode, tag: string, peer: FakePeer) {
    peer.setIntent("groupMembership", "X", { v: 1 });
    SyntheticTask.phasesByTag[tag] = [gatingPhase(peer.id)];
    await node.act(a => a.get(TestTaskManager).register(SyntheticTask));
    const original = await node.act(a => a.get(TestTaskManager).run(SyntheticTask, { tag }));
    await pumpUntil("intent written", () => (peer.items[KEY]?.intent as { v?: number })?.v === 2);

    const first = await node.act(a => a.get(TestTaskManager).cancel(original.runId));
    if (first === undefined) {
        throw new InternalError("cancel produced no rollback");
    }
    await pumpUntil("rollback restoring", () => (peer.items[KEY]?.intent as { v?: number })?.v === 1);
    peer.dropItem("groupMembership", "X");
    // Retired, not merely terminal: a rollback whose driver has not handed back its responsibility yet still
    // reads as in flight, and a retry would be refused for that instead.
    await pumpUntil("rollback failed and retired", () =>
        node.act(a => {
            const manager = a.get(TestTaskManager);
            return manager.get(first.runId)?.status.state === "failed" && !manager.isAttached(first.runId);
        }),
    );
    return { original, first };
}

async function statusOf(node: ServerNode, runId: RunId) {
    return node.act(a => a.get(TestTaskManager).get(runId)?.status);
}

async function attempt<T>(node: ServerNode, fn: (manager: TestTaskManager) => Promise<T>) {
    return node.act(async a => {
        try {
            return await fn(a.get(TestTaskManager));
        } catch (e) {
            return e;
        }
    });
}

/** A caller-creatable definition that declares it undoes another run, which is what makes it a rollback. */
const UndoingTask: TaskDefinition<{ tag: string }> = {
    type: "undoer",
    slotKeyFor: params => `undoer:${params.tag}`,
    phases: () => [{ name: "hold", run: () => new Promise<void>(() => {}) }],
    // A run that no longer exists, so nothing else about admission depends on the link.
    undoes: () => RunId(9_999),
};

let legacyRollbackId: RunId;

function reset() {
    TestTaskManager.peers.clear();
    TestTaskManager.reconcilerPeer = undefined;
    TestTaskManager.omitRevert = false;
    for (const tag of Object.keys(SyntheticTask.phasesByTag)) {
        delete SyntheticTask.phasesByTag[tag];
    }
}

describe("abandon", () => {
    before(() => MockTime.init());
    beforeEach(reset);

    it("ends a parked rollback, retires it, and frees the target of the run it undoes", async () => {
        await using node = await makeNode();
        const peer = testPeer("free");
        const { original, rollback } = await parkedRollback(node, "free", peer);

        const handle = await node.act(a => a.get(TestTaskManager).abandon(rollback.runId, "the node was removed"));

        expect(handle.status.state).equals("abandoned");
        expect(handle.status.error).equals("the node was removed");
        expect(handle.status.retireSeq).not.equals(undefined);
        expect(await node.act(a => a.get(TestTaskManager).tasks.map(t => t.runId))).not.contains(rollback.runId);
        expect(
            await node.act(a =>
                a
                    .get(TestTaskManager)
                    .history()
                    .map(h => h.runId),
            ),
        ).contains(rollback.runId);
        expect(await node.act(a => a.get(TestTaskManager).isAttached(rollback.runId))).equals(false);

        // The original still names the rollback: how the undo ended is the rollback's own state to tell.
        expect((await statusOf(node, original.runId))?.revertRunId).equals(rollback.runId);

        // The point of the verb: work against that target is admissible again.
        const rerun = await node.act(a => a.get(TestTaskManager).run(SyntheticTask, { tag: "free" }));
        expect(rerun.status.slotKey).equals("synthetic:free");
    });

    it("leaves nothing for the next start to drive", async () => {
        const environment = new Environment("abandon-restart");
        let rollbackId: RunId;
        {
            await using first = await makeNode(environment, "restart");
            const peer = testPeer("restart");
            const { rollback } = await parkedRollback(first, "restart", peer);
            rollbackId = rollback.runId;
            await first.act(a => a.get(TestTaskManager).abandon(rollbackId));
        }

        await using node = await makeNode(environment, "restart");
        await node.act(a => a.get(TestTaskManager).register(SyntheticTask));

        // A state the store does not count as terminal is re-slotted and resumed at load, which drives an undo
        // the operator declined — against the device, with nothing left to refuse it.
        expect(await node.act(a => a.get(TestTaskManager).resumableRunIds())).not.contains(rollbackId);
        expect(await node.act(a => a.get(TestTaskManager).tasks.map(t => t.runId))).not.contains(rollbackId);
        expect(
            await node.act(a =>
                a
                    .get(TestTaskManager)
                    .history()
                    .map(h => h.runId),
            ),
        ).contains(rollbackId);
        expect((await statusOf(node, rollbackId))?.state).equals("abandoned");
    });

    it("records nothing until the driver has stopped", async () => {
        await using node = await makeNode();
        const peer = testPeer("order");
        const { rollback } = await parkedRollback(node, "order", peer);

        const written = new Array<string>();
        await node.act(a => {
            const manager = a.get(TestTaskManager);
            onPersisted(liveRecord(manager, rollback.runId), snapshot => written.push(snapshot.state));
        });

        // The driver's stop is not observed until released, so anything written meanwhile was written without
        // waiting for it.
        const release = await node.act(a => a.get(TestTaskManager).holdDriverStop(rollback.runId));
        const abandoning = node.act(a => a.get(TestTaskManager).abandon(rollback.runId));
        await pumpUntil("abandon in flight", () =>
            node.act(a => a.get(TestTaskManager).teardownOf(rollback.runId) === "abandon"),
        );

        expect(written).not.contains("abandoned");
        // "failed" would mean the stop the driver saw was not one it recognises, so it took the failure path
        // and raced this call's own write.
        expect(written).not.contains("failed");

        release();
        await abandoning;
        expect(written).contains("abandoned");
    });

    it("makes a second request wait for the first and answer from it", async () => {
        await using node = await makeNode();
        const peer = testPeer("dup");
        const { rollback } = await parkedRollback(node, "dup", peer);

        let writes = 0;
        await node.act(a => {
            onPersisted(liveRecord(a.get(TestTaskManager), rollback.runId), snapshot => {
                if (snapshot.state === "abandoned") {
                    writes++;
                }
            });
        });

        // The first request's write is held, so the second provably arrives while the first still owns the
        // run: overlap by construction rather than by scheduling. Refusing the loser would make the answer
        // depend on that scheduling; two winners would put two drivers on one record.
        const release = await node.act(a => a.get(TestTaskManager).holdPersistMutex());
        const first = node.act(a => a.get(TestTaskManager).abandon(rollback.runId));
        await pumpUntil("first request owns the run", () =>
            node.act(a => a.get(TestTaskManager).teardownOf(rollback.runId) === "abandon"),
        );
        const second = node.act(a => a.get(TestTaskManager).abandon(rollback.runId));
        release();

        const [firstHandle, secondHandle] = await MockTime.resolve(Promise.all([first, second]), {
            macrotasks: true,
        });

        expect(firstHandle.runId).equals(rollback.runId);
        expect(secondHandle.runId).equals(rollback.runId);
        expect(secondHandle.status.state).equals("abandoned");
        expect(writes).equals(1);
    });

    it("retires and refuses a rollback that reached its own outcome inside the window", async () => {
        await using node = await makeNode();
        const peer = testPeer("late");
        const { original, rollback } = await parkedRollback(node, "late", peer);

        // The driver's stop is observed only after the test has done what a completing driver would do, so the
        // decision the abandon takes is the one made *after* the unwind.
        const release = await node.act(a => a.get(TestTaskManager).holdDriverStop(rollback.runId));
        const abandoning = attempt(node, m => m.abandon(rollback.runId));
        await pumpUntil("abandon in flight", () =>
            node.act(a => a.get(TestTaskManager).teardownOf(rollback.runId) === "abandon"),
        );
        await node.act(a => a.get(TestTaskManager).reachOutcome(rollback.runId, "completed"));
        release();

        expect(await abandoning).instanceOf(TaskAlreadyUndoneError);
        expect((await statusOf(node, rollback.runId))?.state).equals("completed");
        // Retired despite the refusal: #retire declined to, because the teardown was in charge, and a rollback
        // left holding its target would refuse every future run of the original's target for this process.
        expect(await node.act(a => a.get(TestTaskManager).tasks.map(t => t.runId))).not.contains(rollback.runId);
        const rerun = await node.act(a => a.get(TestTaskManager).run(SyntheticTask, { tag: "late" }));
        expect(rerun.status.slotKey).equals("synthetic:late");
        expect((await statusOf(node, original.runId))?.revertRunId).equals(rollback.runId);
    });

    it("abandons a rollback that failed inside the window, keeping its order and its reason", async () => {
        await using node = await makeNode();
        const peer = testPeer("failed");
        const { rollback } = await parkedRollback(node, "failed", peer);

        const release = await node.act(a => a.get(TestTaskManager).holdDriverStop(rollback.runId));
        const abandoning = node.act(a => a.get(TestTaskManager).abandon(rollback.runId, "the node is gone"));
        await pumpUntil("abandon in flight", () =>
            node.act(a => a.get(TestTaskManager).teardownOf(rollback.runId) === "abandon"),
        );
        const retireSeq = await node.act(a =>
            a.get(TestTaskManager).reachOutcome(rollback.runId, "failed", "device refused"),
        );
        release();

        const handle = await abandoning;
        expect(handle.status.state).equals("abandoned");
        // The place it took when it failed: a second stamp would sort it after runs that finished later.
        expect(handle.status.retireSeq).equals(retireSeq);
        // Why the undo could not finish is what an operator needs to decide about the part-changed device, so
        // recording the decision must not erase it.
        expect(handle.status.error).contains("device refused");
        expect(handle.status.error).contains("the node is gone");
    });

    it("stops the driver with a signal #drive knows, naming the abandon", async () => {
        await using node = await makeNode();
        const peer = testPeer("signal");
        const { rollback } = await parkedRollback(node, "signal", peer);

        const release = await node.act(a => a.get(TestTaskManager).holdDriverStop(rollback.runId));
        const abandoning = node.act(a => a.get(TestTaskManager).abandon(rollback.runId));
        await pumpUntil("abandon in flight", () =>
            node.act(a => a.get(TestTaskManager).teardownOf(rollback.runId) === "abandon"),
        );

        // A stop the driver does not recognise takes its failure path and commits `failed`, racing this call's
        // own write; one that said "cancelled" would misreport in whatever a phase logs.
        expect(await node.act(a => a.get(TestTaskManager).abortOf(rollback.runId))).instanceOf(TaskAbandonedSignal);

        release();
        await abandoning;
    });

    it("is idempotent and writes nothing the second time", async () => {
        await using node = await makeNode();
        const peer = testPeer("twice");
        const { rollback } = await parkedRollback(node, "twice", peer);

        await node.act(a => a.get(TestTaskManager).abandon(rollback.runId));

        let writes = 0;
        await node.act(a => {
            const record = a.get(TestTaskManager).record(rollback.runId) as RunRecord;
            onPersisted(record, () => writes++);
        });
        const second = await node.act(a => a.get(TestTaskManager).abandon(rollback.runId));

        expect(second.status.state).equals("abandoned");
        // Asserted on the write, not on the state: a second write of the same value leaves the state right.
        expect(writes).equals(0);
    });

    it("leaves the undone run's record untouched", async () => {
        await using node = await makeNode();
        const peer = testPeer("untouched");
        const { original, rollback } = await parkedRollback(node, "untouched", peer);

        const persisted = () =>
            node.act(a => JSON.stringify(a.get(TestTaskManager).state.runs[String(original.runId)]));
        const before = await persisted();
        await node.act(a => a.get(TestTaskManager).abandon(rollback.runId));
        expect(await persisted()).equals(before);
    });

    it("refuses a run of the undone target while the abandon is in flight", async () => {
        await using node = await makeNode();
        const peer = testPeer("drain");
        const { rollback } = await parkedRollback(node, "drain", peer);

        // The write is held, not the driver: most of an abandon's flight is *after* its driver has stopped, and
        // a refusal that only covered the unwind would report the wrong thing for the rest of it.
        const release = await node.act(a => a.get(TestTaskManager).holdPersistMutex());
        const abandoning = node.act(a => a.get(TestTaskManager).abandon(rollback.runId));
        await pumpUntil("abandon past its driver", () =>
            node.act(a => {
                const manager = a.get(TestTaskManager);
                return manager.teardownOf(rollback.runId) === "abandon" && !manager.isDriven(rollback.runId);
            }),
        );

        const refusal = await node.act(a => {
            try {
                return a.get(TestTaskManager).run(SyntheticTask, { tag: "drain" });
            } catch (e) {
                return e;
            }
        });
        release();
        await abandoning;

        // Transient, and reported as such: the rollback is about to release the target. The run this rollback
        // undoes retired when the rollback was created, so nothing owns its target and only the pending-rollback
        // step of admission sees the transition at all.
        expect(refusal).instanceOf(TaskSlotDrainingError);
    });

    it("refuses a rollback whose own record is not durable yet", async () => {
        await using node = await makeNode();
        const peer = testPeer("settling");
        SyntheticTask.phasesByTag["settling"] = [gatingPhase("settling")];
        await node.act(a => a.get(TestTaskManager).register(SyntheticTask));
        const original = await node.act(a => a.get(TestTaskManager).run(SyntheticTask, { tag: "settling" }));
        await pumpUntil("intent written", () => peer.items[KEY] !== undefined);
        peer.setReachable(false);

        // The cancel's write is held, so its rollback is admitted but not yet driving.
        const release = await node.act(a => a.get(TestTaskManager).holdPersistMutex());
        const cancelling = node.act(a => a.get(TestTaskManager).cancel(original.runId));
        let rollbackId: RunId | undefined;
        await pumpUntil("rollback admitted", () =>
            node.act(a => {
                rollbackId = a.get(TestTaskManager).tasks.find(t => t.status.revertOf === original.runId)?.runId;
                return rollbackId !== undefined;
            }),
        );

        const refusal = await attempt(node, m => m.abandon(rollbackId!));
        release();
        await cancelling;

        expect(refusal).instanceOf(TaskSlotSettlingError);
    });

    it("abandons a persisted rollback that nothing is driving", async () => {
        const environment = new Environment("abandon-unattached");
        let rollbackId: RunId;
        {
            await using first = await makeNode(environment, "unattached");
            const peer = testPeer("unattached");
            const { rollback } = await parkedRollback(first, "unattached", peer);
            rollbackId = rollback.runId;
        }

        // Nothing registers the rollback's type on this start, so its record has no driver at all.
        TestTaskManager.omitRevert = true;
        await using node = await makeNode(environment, "unattached");
        expect(await node.act(a => a.get(TestTaskManager).isAttached(rollbackId))).equals(false);

        const handle = await node.act(a => a.get(TestTaskManager).abandon(rollbackId));
        expect(handle.status.state).equals("abandoned");
        expect(await node.act(a => a.get(TestTaskManager).resumableRunIds())).not.contains(rollbackId);
    });

    it("leaves the rollback unfinished and driven again when its own write is refused", async () => {
        await using node = await makeNode();
        const peer = testPeer("norecord");
        const { rollback } = await parkedRollback(node, "norecord", peer);

        const before = await node.act(a => a.get(TestTaskManager).executionOf(rollback.runId));

        // A closed mutex rejects the write on a node that is otherwise healthy, so this is a storage failure
        // rather than shutdown.
        await node.act(a => a.get(TestTaskManager).closePersistMutex());

        const outcome = await attempt(node, m => m.abandon(rollback.runId));

        expect(outcome).instanceOf(Error);
        expect(outcome).not.instanceOf(TaskManagerClosingError);
        // Non-terminal, so the next start can still resume it. `running` rather than `parked` because a
        // restored driver re-parks from live reachability rather than trusting the old note.
        expect((await statusOf(node, rollback.runId))?.state).equals("running");
        // The driver is given back — a rollback that keeps its state with nothing advancing it is stranded.
        // Asserted by identity: with storage refusing every write, the restored driver stops again at once, so
        // liveness would say nothing.
        const after = await node.act(a => a.get(TestTaskManager).executionOf(rollback.runId));
        expect(after).not.equals(undefined);
        expect(after).not.equals(before);
    });

    it("refuses while the manager is shutting down, leaving the rollback unfinished", async () => {
        const node = await makeNode(new Environment("abandon-closing"), "closing");
        const peer = testPeer("closing");
        const { rollback } = await parkedRollback(node, "closing", peer);

        // Held from before the close: `act` on a closing node refuses on its own, which would prove nothing
        // about the refusal under test.
        const manager = await node.act(a => a.get(TestTaskManager));
        const driving = manager.executionOf(rollback.runId);
        const closing = node.close();
        await pumpUntil("node no longer active", () => node.construction.status !== Lifecycle.Status.Active);
        let outcome: unknown = "abandoned";
        try {
            await manager.abandon(rollback.runId);
        } catch (e) {
            outcome = e;
        }
        await closing;

        expect(outcome).instanceOf(TaskManagerClosingError);
        // No fresh driver: the dispose drain has already taken its snapshot of what to abort and await, so one
        // started now would run outside it, on an endpoint that refuses every write.
        expect(manager.executionOf(rollback.runId)).equals(driving);
    });

    it("refuses an identity nothing answers to", async () => {
        await using node = await makeNode();
        expect(await attempt(node, m => m.abandon(RunId(Number.MAX_SAFE_INTEGER)))).instanceOf(TaskNotFoundError);
    });

    it("refuses a run that never had a rollback", async () => {
        await using node = await makeNode();
        testPeer("plain");
        SyntheticTask.phasesByTag["plain"] = [{ name: "a", run: async () => {} }];
        await node.act(a => a.get(TestTaskManager).register(SyntheticTask));
        const handle = await node.act(a => a.get(TestTaskManager).run(SyntheticTask, { tag: "plain" }));
        await pumpUntil("run finished", () =>
            node.act(a => a.get(TestTaskManager).get(handle.runId)?.status.state === "completed"),
        );

        const outcome = await attempt(node, m => m.abandon(handle.runId));
        expect(outcome).instanceOf(TaskNotARollbackError);
        expect((outcome as Error).message).not.contains("its rollback is");
    });

    it("refuses a run that is not a rollback, naming the rollback it has", async () => {
        await using node = await makeNode();
        const peer = testPeer("forward");
        const { original, rollback } = await parkedRollback(node, "forward", peer);

        const outcome = await attempt(node, m => m.abandon(original.runId));

        expect(outcome).instanceOf(TaskNotARollbackError);
        expect((outcome as Error).message).contains(`#${rollback.runId}`);
    });

    it("waits out a retry being admitted rather than calling the old rollback superseded", async () => {
        await using node = await makeNode();
        const peer = testPeer("retryrace");
        const { original, first } = await failedRollback(node, "retryrace", peer);

        // The retry's write is held, so its replacement is admitted but the original does not name it yet.
        // Reading that link instead of the live set is what would let this abandon through.
        const release = await node.act(a => a.get(TestTaskManager).holdPersistMutex());
        const retrying = node.act(a => a.get(TestTaskManager).retryRollback(original.runId));
        await pumpUntil("replacement admitted", () =>
            node.act(a =>
                a.get(TestTaskManager).tasks.some(t => t.status.revertOf === original.runId && t.runId !== first.runId),
            ),
        );
        expect((await statusOf(node, original.runId))?.revertRunId).equals(first.runId);

        const outcome = await attempt(node, m => m.abandon(first.runId));
        release();
        await retrying;

        // Transient, not `Superseded`: if the retry's write were refused it would be discarded and this
        // rollback would still be the one that applies, so nothing is settled yet.
        expect(outcome).instanceOf(TaskSlotSettlingError);
    });

    it("refuses to answer for a rollback that is not recorded yet", async () => {
        await using node = await makeNode();
        const peer = testPeer("provisional");
        const { original, first } = await failedRollback(node, "provisional", peer);

        // A retry admits its replacement and holds no claim on the run it relinks, so a cancel can arrive while
        // that replacement exists only in memory.
        const release = await node.act(a => a.get(TestTaskManager).holdPersistMutex());
        const retrying = node.act(a => a.get(TestTaskManager).retryRollback(original.runId));
        await pumpUntil("replacement admitted", () =>
            node.act(a =>
                a.get(TestTaskManager).tasks.some(t => t.status.revertOf === original.runId && t.runId !== first.runId),
            ),
        );

        const outcome = await attempt(node, m => m.cancel(original.runId));
        release();
        await retrying;

        // A handle for a run the producer may still discard would be a receipt for something that never
        // existed.
        expect(outcome).instanceOf(TaskSlotSettlingError);
    });

    it("tells a replacement it is not driving yet, not that it was superseded", async () => {
        await using node = await makeNode();
        const peer = testPeer("replacement");
        const { original, first } = await failedRollback(node, "replacement", peer);

        // Inside the retry's persistence window the original still names the rollback being replaced, so a
        // request about the *replacement* must not read that link and conclude the replacement is the stale one.
        const release = await node.act(a => a.get(TestTaskManager).holdPersistMutex());
        const retrying = node.act(a => a.get(TestTaskManager).retryRollback(original.runId));
        let replacementId: RunId | undefined;
        await pumpUntil("replacement admitted", () =>
            node.act(a => {
                replacementId = a
                    .get(TestTaskManager)
                    .tasks.find(t => t.status.revertOf === original.runId && t.runId !== first.runId)?.runId;
                return replacementId !== undefined;
            }),
        );
        expect((await statusOf(node, original.runId))?.revertRunId).equals(first.runId);

        const outcome = await attempt(node, m => m.abandon(replacementId!));
        release();
        await retrying;

        // Transient — it is about to be driving — where `Superseded` would tell the caller to stop trying.
        expect(outcome).instanceOf(TaskSlotSettlingError);
    });

    it("refuses a rollback whose replacement has already finished", async () => {
        await using node = await makeNode();
        const peer = testPeer("finished");
        const { original, first } = await failedRollback(node, "finished", peer);

        const retry = await node.act(a => a.get(TestTaskManager).retryRollback(original.runId));
        peer.markHas("groupMembership", "X");
        await pumpUntil("replacement finished", () =>
            node.act(a => {
                const manager = a.get(TestTaskManager);
                return (
                    manager.get(retry.runId)?.status.state === "completed" &&
                    !manager.tasks.some(t => t.runId === retry.runId)
                );
            }),
        );

        // Nothing is live now, so the recorded link is what answers — the fallback the live set cannot cover.
        const outcome = await attempt(node, m => m.abandon(first.runId));
        expect(outcome).instanceOf(TaskSupersededError);
    });

    it("answers a rollback an older build recorded as cancelled", async () => {
        const environment = new Environment("abandon-legacy");
        {
            await using seed = await makeNode(environment, "legacy");
            const peer = testPeer("legacy");
            const { rollback } = await parkedRollback(seed, "legacy", peer);
            // Ended first, so nothing is driving it and its record can be rewritten into the shape a build
            // that still admitted `cancel` of a rollback left behind: called off, with nothing undone and
            // nothing saying the device was left part-changed.
            await seed.act(a => a.get(TestTaskManager).abandon(rollback.runId));
            await seed.act(a => {
                const manager = a.get(TestTaskManager);
                const stored = { ...manager.state.runs };
                stored[String(rollback.runId)] = { ...stored[String(rollback.runId)], state: "cancelled" };
                manager.state.runs = stored;
            });
            legacyRollbackId = rollback.runId;
        }

        await using node = await makeNode(environment, "legacy");
        expect((await statusOf(node, legacyRollbackId))?.state).equals("cancelled");
        expect(await attempt(node, m => m.abandon(legacyRollbackId))).instanceOf(TaskAlreadyUndoneError);
    });
});

describe("cancel of a rollback", () => {
    before(() => MockTime.init());
    beforeEach(reset);

    it("is refused, and points at abandon", async () => {
        await using node = await makeNode();
        const peer = testPeer("nocancel");
        const { rollback } = await parkedRollback(node, "nocancel", peer);

        const outcome = await attempt(node, m => m.cancel(rollback.runId));

        expect(outcome).instanceOf(TaskCannotCancelRollbackError);
        expect((outcome as Error).message).contains("abandon");
        // Untouched: a refused cancel leaves the rollback driving, so it can still finish or be abandoned.
        expect((await statusOf(node, rollback.runId))?.state).equals("parked");
        expect(await node.act(a => a.get(TestTaskManager).isDriven(rollback.runId))).equals(true);
    });
});

describe("stop signals", () => {
    before(() => MockTime.init());
    beforeEach(reset);

    it("fails a run whose phase throws a stop nothing asked for", async () => {
        await using node = await makeNode();
        testPeer("forged");
        SyntheticTask.phasesByTag["forged"] = [
            {
                name: "forge",
                run: async () => {
                    throw new TaskCancelledSignal("nobody cancelled anything");
                },
            },
        ];
        await node.act(a => a.get(TestTaskManager).register(SyntheticTask));
        const handle = await node.act(a => a.get(TestTaskManager).run(SyntheticTask, { tag: "forged" }));

        // Honouring it would leave the run non-terminal with nothing driving it, holding its target for the
        // life of the process — so the run fails, as it would for any other error out of a phase.
        await pumpUntil("run failed and retired", () =>
            node.act(a => {
                const manager = a.get(TestTaskManager);
                return (
                    manager.get(handle.runId)?.status.state === "failed" &&
                    !manager.tasks.some(t => t.runId === handle.runId)
                );
            }),
        );
        const rerun = await node.act(a => a.get(TestTaskManager).run(SyntheticTask, { tag: "forged" }));
        expect(rerun.runId).not.equals(handle.runId);
    });

    it("refuses to start a definition that declares what it undoes", async () => {
        await using node = await makeNode();
        testPeer("undoer");
        await node.act(a => a.get(TestTaskManager).register(UndoingTask));

        // Admission lets a rollback in while the run it undoes still owns the target, on the strength of only
        // cancel creating one. A caller-created undo would take that exception with the original still driving.
        const outcome = await attempt(node, async m => m.run(UndoingTask, { tag: "u" }));
        expect(outcome).instanceOf(ImplementationError);
        expect((outcome as Error).message).contains("created by cancel()");
        expect(await node.act(a => a.get(TestTaskManager).tasks.length)).equals(0);
    });
});

describe("retryRollback", () => {
    before(() => MockTime.init());
    beforeEach(reset);

    it("refuses while the recorded rollback is still in flight", async () => {
        await using node = await makeNode();
        const peer = testPeer("inflight");
        const { original } = await parkedRollback(node, "inflight", peer);

        const outcome = await attempt(node, m => m.retryRollback(original.runId));

        expect(outcome).instanceOf(TaskRollbackPendingError);
    });

    it("reports a rollback being created as in flight, not as absent", async () => {
        await using node = await makeNode();
        const peer = testPeer("creating");
        SyntheticTask.phasesByTag["creating"] = [gatingPhase("creating")];
        await node.act(a => a.get(TestTaskManager).register(SyntheticTask));
        const original = await node.act(a => a.get(TestTaskManager).run(SyntheticTask, { tag: "creating" }));
        await pumpUntil("intent written", () => peer.items[KEY] !== undefined);
        peer.setReachable(false);

        // The cancel's write is held, so its rollback is admitted but the original does not name it yet.
        const release = await node.act(a => a.get(TestTaskManager).holdPersistMutex());
        const cancelling = node.act(a => a.get(TestTaskManager).cancel(original.runId));
        await pumpUntil("rollback admitted", () =>
            node.act(a => a.get(TestTaskManager).tasks.some(t => t.status.revertOf === original.runId)),
        );

        const outcome = await attempt(node, m => m.retryRollback(original.runId));
        release();
        await cancelling;

        // A rollback exists and is about to drive; answering "this run has no rollback to retry" would tell a
        // caller to do something about a state that is not the state it is in.
        expect(outcome).instanceOf(TaskRollbackPendingError);
    });

    it("refuses a rollback that already restored the device", async () => {
        await using node = await makeNode();
        const peer = testPeer("concluded");
        const { original, rollback } = await parkedRollback(node, "concluded", peer);

        // The device takes the undo, so the rollback finishes — and a finished rollback is detached, which is
        // what would otherwise carry it past the in-flight checks.
        peer.markHas("groupMembership", "X");
        peer.setReachable(true);
        await pumpUntil("rollback completed", () =>
            node.act(a => a.get(TestTaskManager).get(rollback.runId)?.status.state === "completed"),
        );

        const outcome = await attempt(node, m => m.retryRollback(original.runId));
        expect(outcome).instanceOf(TaskAlreadyUndoneError);
        // Nothing replayed: a second undo would write the run's priors back over a device already restored.
        const rollbacks = await node.act(a =>
            Object.values(a.get(TestTaskManager).state.runs).filter(r => r.revertOf === original.runId),
        );
        expect(rollbacks.map(r => r.runId)).deep.equals([rollback.runId]);
    });

    it("refuses a rollback an older build recorded as cancelled", async () => {
        const environment = new Environment("retry-legacy");
        let originalId: RunId;
        {
            await using seed = await makeNode(environment, "retrylegacy");
            const peer = testPeer("retrylegacy");
            const { original, rollback } = await parkedRollback(seed, "retrylegacy", peer);
            originalId = original.runId;
            await seed.act(a => a.get(TestTaskManager).abandon(rollback.runId));
            await seed.act(a => {
                const manager = a.get(TestTaskManager);
                const stored = { ...manager.state.runs };
                stored[String(rollback.runId)] = { ...stored[String(rollback.runId)], state: "cancelled" };
                manager.state.runs = stored;
            });
        }

        await using node = await makeNode(environment, "retrylegacy");
        expect(await attempt(node, m => m.retryRollback(originalId))).instanceOf(TaskAlreadyUndoneError);
    });

    it("refuses a rollback an operator abandoned", async () => {
        await using node = await makeNode();
        const peer = testPeer("noretry");
        const { original, rollback } = await parkedRollback(node, "noretry", peer);
        await node.act(a => a.get(TestTaskManager).abandon(rollback.runId));

        expect(await attempt(node, m => m.retryRollback(original.runId))).instanceOf(TaskAbandonedError);
    });

    it("refuses to abandon a rollback a retry has replaced", async () => {
        await using node = await makeNode();
        const peer = testPeer("replaced");
        const { original, first } = await failedRollback(node, "replaced", peer);

        const retry = await node.act(a => a.get(TestTaskManager).retryRollback(original.runId));
        expect(retry.runId).not.equals(first.runId);
        expect((await statusOf(node, original.runId))?.revertRunId).equals(retry.runId);

        // The replaced rollback forecloses nothing, and recording it as abandoned would say an undo still in
        // progress was given up on.
        expect(await attempt(node, m => m.abandon(first.runId))).instanceOf(TaskSupersededError);
    });

    it("drives a fresh rollback for a run whose previous one failed", async () => {
        await using node = await makeNode();
        const peer = testPeer("driveretry");
        const { original, first } = await failedRollback(node, "driveretry", peer);

        const retry = await node.act(a => a.get(TestTaskManager).retryRollback(original.runId));
        expect(retry.runId).not.equals(first.runId);

        // Nothing rolls back a rollback: the failed one gets no undo of its own, or the manager would recurse.
        const undosOfTheRollback = await node.act(a =>
            Object.values(a.get(TestTaskManager).state.runs).filter(r => r.revertOf === first.runId),
        );
        expect(undosOfTheRollback).length(0);

        // The device takes the restore this time, so the retry finishes the undo the first one could not.
        peer.markHas("groupMembership", "X");
        await pumpUntil("retry completed", () =>
            node.act(a => a.get(TestTaskManager).get(retry.runId)?.status.state === "completed"),
        );
        expect((peer.items[KEY]?.intent as { v?: number })?.v).equals(1);
    });

    it("refuses a run that never had a rollback", async () => {
        await using node = await makeNode();
        testPeer("norollback");
        SyntheticTask.phasesByTag["norollback"] = [{ name: "a", run: async () => {} }];
        await node.act(a => a.get(TestTaskManager).register(SyntheticTask));
        const handle = await node.act(a => a.get(TestTaskManager).run(SyntheticTask, { tag: "norollback" }));
        await pumpUntil("run finished", () =>
            node.act(a => a.get(TestTaskManager).get(handle.runId)?.status.state === "completed"),
        );

        expect(await attempt(node, m => m.retryRollback(handle.runId))).instanceOf(ImplementationError);
    });

    it("leaves the original naming the old rollback when the retry's write is refused", async () => {
        await using node = await makeNode();
        const peer = testPeer("retrywrite");
        const { original, first } = await failedRollback(node, "retrywrite", peer);

        await node.act(a => a.get(TestTaskManager).closePersistMutex());
        const outcome = await attempt(node, m => m.retryRollback(original.runId));

        expect(outcome).instanceOf(Error);
        // One transaction carries the retry's record and the link to it, so a refused write leaves neither.
        expect((await statusOf(node, original.runId))?.revertRunId).equals(first.runId);
        const rollbacks = await node.act(a =>
            Object.values(a.get(TestTaskManager).state.runs).filter(r => r.revertOf === original.runId),
        );
        expect(rollbacks.map(r => r.runId)).deep.equals([first.runId]);
    });
});
