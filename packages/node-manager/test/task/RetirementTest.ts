/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { ReconcilerBehavior } from "#ReconcilerBehavior.js";
import {
    TaskConflictError,
    TaskFailedError,
    TaskAbandonedError,
    TaskAlreadyUndoneError,
    TaskNoLongerTrackedError,
    TaskNotFoundError,
    TaskNoRollbackError,
    TaskNotInFlightError,
    TaskStoreVersionError,
    TaskSupersededError,
} from "#task/errors.js";
import { RUN_STORE_VERSION } from "#task/RunStore.js";
import { TaskDefinition, TaskPersistence } from "#task/Task.js";
import { TaskHandle, TaskManagerBehavior } from "#task/TaskManagerBehavior.js";
import { RunId, TaskPhase } from "#task/types.js";
import { Environment, ImplementationError, InternalError, MaybePromise } from "@matter/general";
import { ClientNode, itemMapKey, ServerNode } from "@matter/node";
import { MockServerNode } from "@matter/node/testing";
import { kindOf, FakePeer, SyntheticTask } from "./helpers.js";

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

    isAttached(runId: RunId) {
        return this.internal.runs.isAttached(runId);
    }

    /** The priors the loaded twin still holds, which storage alone cannot show. */
    priorsOf(runId: RunId) {
        return this.internal.runs.get(runId)?.changeSet;
    }

    paramsOf(runId: RunId) {
        return this.internal.runs.get(runId)?.params;
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

async function makeNode(environment?: Environment, id = "ledger") {
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

/** Writes one intent, then fails, and declares itself past the point of no return. */
const ForwardOnlyTask: TaskDefinition<{ tag: string; peerId: string }> = {
    type: "forward-only",
    // Deliberately the same slot shape as SyntheticTask: supersession is per target, so a test about one run
    // burying another has to put both on one slot.
    slotKeyFor(params) {
        return `synthetic:${params.tag}`;
    },
    rollbackable() {
        return false;
    },
    notRollbackableReason: "the test says so",
    phases(params) {
        return [
            {
                name: "write-then-fail",
                run: async ctx => {
                    await ctx.setIntent(ctx.resolvePeer(params.peerId), kindOf("groupMembership"), "X", { v: 2 });
                    throw new TaskFailedError("forward only");
                },
            },
        ];
    },
};

/** Writes one intent, then fails, while remaining rollbackable: the failure path creates a rollback. */
const FailingRollbackableTask: TaskDefinition<{ tag: string; peerId: string }> = {
    type: "failing-rollbackable",
    slotKeyFor(params) {
        return `synthetic:${params.tag}`;
    },
    phases(params) {
        return [
            {
                name: "write-then-fail",
                run: async ctx => {
                    await ctx.setIntent(ctx.resolvePeer(params.peerId), kindOf("groupMembership"), "X", { v: 2 });
                    throw new TaskFailedError("failing but rollbackable");
                },
            },
        ];
    },
};

/** Writes one intent, then fails, and cannot answer whether it is rollbackable. */
const UnaskableTask: TaskDefinition<{ tag: string; peerId: string }> = {
    type: "unaskable",
    slotKeyFor(params) {
        return `synthetic:${params.tag}`;
    },
    rollbackable(): boolean {
        throw new ImplementationError("the test cannot say");
    },
    phases(params) {
        return [
            {
                name: "write-then-fail",
                run: async ctx => {
                    await ctx.setIntent(ctx.resolvePeer(params.peerId), kindOf("groupMembership"), "X", { v: 2 });
                    throw new TaskFailedError("unaskable");
                },
            },
        ];
    },
};

/** Writes one intent and returns, so the run completes having changed something. */
function touchPhase(peerId: string): TaskPhase {
    return {
        name: "touch",
        run: async ctx => {
            await ctx.setIntent(ctx.resolvePeer(peerId), kindOf("groupMembership"), "X", { v: 2 });
        },
    };
}

/** Writes one intent the device never confirms, so the run stays in flight owning its target. */
function gatingPhase(peerId: string): TaskPhase {
    return {
        name: "hold",
        run: async ctx => {
            const peer = ctx.resolvePeer(peerId);
            await ctx.setIntent(peer, kindOf("groupMembership"), "X", { v: 2 });
            await ctx.awaitCommitted([{ peer, kind: kindOf("groupMembership"), key: "X" }]);
        },
    };
}

async function stored(node: ServerNode, runId: RunId): Promise<TaskPersistence | undefined> {
    return node.act(a => a.get(TestTaskManager).state.runs[String(runId)]);
}

async function run(node: ServerNode, tag: string, phases: TaskPhase[]) {
    SyntheticTask.phasesByTag[tag] = phases;
    await node.act(a => a.get(TestTaskManager).register(SyntheticTask));
    return node.act(a => a.get(TestTaskManager).run(SyntheticTask, { tag }));
}

async function awaitRetired(node: ServerNode, runId: RunId) {
    await pumpUntil(`run #${runId} retired`, () =>
        node.act(a => {
            const manager = a.get(TestTaskManager);
            const status = manager.get(runId)?.status;
            return status !== undefined && status.retireSeq !== undefined && !manager.isAttached(runId);
        }),
    );
}

/**
 * A run that failed and whose rollback then failed too: the rollback restores the prior value and the
 * reconciler drops the intent its gate waits for, so it can never commit.
 */
async function failedRollback(node: ServerNode, tag: string, peer: FakePeer) {
    peer.setIntent("groupMembership", "X", { v: 1 });
    const original = await run(node, tag, [gatingPhase(peer.id)]);
    await pumpUntil("intent written", () => (peer.items[KEY]?.intent as { v?: number })?.v === 2);

    const rollback = await node.act(a =>
        a
            .get(TestTaskManager)
            .cancel(original.runId)
            .then(c => c.rollback),
    );
    if (rollback === undefined) {
        throw new InternalError("cancel produced no rollback");
    }
    await pumpUntil("rollback restoring", () => (peer.items[KEY]?.intent as { v?: number })?.v === 1);
    peer.dropItem("groupMembership", "X");
    await pumpUntil("rollback failed and retired", () =>
        node.act(a => {
            const manager = a.get(TestTaskManager);
            return manager.get(rollback.runId)?.status.state === "failed" && !manager.isAttached(rollback.runId);
        }),
    );
    return { original, rollback };
}

/** A run whose rollback is parked on an unreachable peer, so it is live and has written nothing yet. */
async function parkedRollback(node: ServerNode, tag: string, peer: FakePeer) {
    peer.setIntent("groupMembership", "X", { v: 1 });
    const original = await run(node, tag, [gatingPhase(peer.id)]);
    await pumpUntil("intent written", () => (peer.items[KEY]?.intent as { v?: number })?.v === 2);

    peer.setReachable(false);
    const rollback = await node.act(a =>
        a
            .get(TestTaskManager)
            .cancel(original.runId)
            .then(c => c.rollback),
    );
    if (rollback === undefined) {
        throw new InternalError("cancel produced no rollback");
    }
    await pumpUntil("rollback parked", () =>
        node.act(a => a.get(TestTaskManager).get(rollback.runId)?.status.state === "parked"),
    );
    return { original, rollback };
}

/** Runs `fn` and returns whatever it produced, so a test can assert on a refusal without a try/catch. */
async function attempt<T>(node: ServerNode, fn: (manager: TestTaskManager) => Promise<T>) {
    return node.act(async a => {
        try {
            return await fn(a.get(TestTaskManager));
        } catch (e) {
            return e;
        }
    });
}

function reset() {
    TestTaskManager.peers.clear();
    TestTaskManager.reconcilerPeer = undefined;
    for (const tag of Object.keys(SyntheticTask.phasesByTag)) {
        delete SyntheticTask.phasesByTag[tag];
    }
}

describe("run records after a retirement", () => {
    before(() => MockTime.init());
    beforeEach(reset);

    it("keeps nothing owed once a run completes cleanly", async () => {
        await using node = await makeNode();
        const peer = testPeer("clean");
        peer.markHas("groupMembership", "X");
        const handle = await run(node, "clean", [touchPhase("clean")]);
        await awaitRetired(node, handle.runId);

        const record = await stored(node, handle.runId);
        expect(record).not.equals(undefined);
        // An absent key, not a key holding `undefined`: the claim is that key material does not outlive the
        // work, and a present-but-undefined field would satisfy a looser assertion while still being written.
        expect("params" in record!).equals(false);
        // Still answers, which is the whole point of keeping the record.
        expect(await node.act(a => a.get(TestTaskManager).get(handle.runId)?.status.state)).equals("completed");
    });

    it("retries a failed rollback with the original's params gone", async () => {
        await using node = await makeNode();
        const peer = testPeer("retry");
        const { original } = await failedRollback(node, "retry", peer);

        const retired = await stored(node, original.runId);
        expect("params" in retired!).equals(false);
        expect(retired?.changeSet?.length).equals(1);

        // The proof that retry does not go through the definition: the params it would need are gone, and the
        // changeSet alone is enough to build the replacement.
        const retry = await node.act(a => a.get(TestTaskManager).retryRollback(original.runId));
        expect(retry.status.rollbackOf).equals(original.runId);
        expect((await stored(node, original.runId))?.rollbackRunId).equals(retry.runId);
    });

    it("refuses to cancel a run that already finished", async () => {
        await using node = await makeNode();
        const peer = testPeer("done");
        peer.markHas("groupMembership", "X");
        const handle = await run(node, "done", [touchPhase("done")]);
        await awaitRetired(node, handle.runId);

        await expect(
            node.act(a =>
                a
                    .get(TestTaskManager)
                    .cancel(handle.runId)
                    .then(c => c.rollback),
            ),
        ).rejectedWith(TaskNotInFlightError);
        expect((await stored(node, handle.runId))?.rollbackRunId).equals(undefined);
    });

    it("records the schema version it wrote the table under", async () => {
        const environment = new Environment("ledger-stamp");
        {
            await using node = await makeNode(environment, "stamp");
            const peer = testPeer("stamp");
            peer.markHas("groupMembership", "X");
            const handle = await run(node, "stamp", [touchPhase("stamp")]);
            await awaitRetired(node, handle.runId);
        }

        // Read back on a fresh start: the stamp has to be in storage, not merely the default this build would
        // have supplied anyway, or a later build learns nothing about who wrote the table.
        await using node = await makeNode(environment, "stamp");
        expect(await node.act(a => a.get(TestTaskManager).state.runsVersion)).equals(RUN_STORE_VERSION);
    });

    it("refuses every writing verb, not only run, while the table is unreadable", async () => {
        const environment = new Environment("unreadable-verbs");
        let existing!: RunId;
        {
            // A real record, written by this build, and then the table stamped as a newer build's. The refusal
            // is worth having precisely because the run demonstrably exists and the verbs cannot see it.
            await using seeding = await makeNode(environment, "verbs");
            const peer = testPeer("verbs");
            peer.markHas("groupMembership", "X");
            const handle = await run(seeding, "verbs", [touchPhase("verbs")]);
            await awaitRetired(seeding, handle.runId);
            existing = handle.runId;
            await seeding.act(a => {
                a.get(TestTaskManager).state.runsVersion = RUN_STORE_VERSION + 1;
            });
        }

        await using node = await makeNode(environment, "verbs");
        // The record is in storage and was not loaded, so a read answers "nothing" — it cannot invent what it
        // did not read — while a write names the cause instead of claiming the run never existed.
        expect(await node.act(a => a.get(TestTaskManager).get(existing))).equals(undefined);
        const verbs: Array<(m: TestTaskManager) => Promise<unknown>> = [
            m => m.cancel(existing).then(c => c.rollback),
            m => m.abandon(existing),
            m => m.retryRollback(existing),
        ];
        for (const verb of verbs) {
            expect(await attempt(node, verb)).instanceOf(TaskStoreVersionError);
        }
        expect(await attempt(node, async m => m.run(SyntheticTask, { tag: "verbs" }))).instanceOf(
            TaskStoreVersionError,
        );
    });

    it("refuses to retry an undo a later run of the target has superseded", async () => {
        await using node = await makeNode();
        const peer = testPeer("superseded");

        // A failed run keeps the values it found, and its own rollback fails too, so both are terminal and the
        // target is free again.
        const { original } = await failedRollback(node, "superseded", peer);

        // A second run of the same target commits its own outcome. What the first would restore is historical.
        peer.markHas("groupMembership", "X");
        const later = await run(node, "superseded", [touchPhase("superseded")]);
        await awaitRetired(node, later.runId);

        const refusal = await attempt(node, m => m.retryRollback(original.runId));
        expect(refusal).instanceOf(TaskSupersededError);
        expect((refusal as TaskConflictError).owner).equals(later.runId);
    });

    it("abandons a failed rollback while a rollback of a later run of the target is live", async () => {
        await using node = await makeNode();
        const peer = testPeer("later-rollback");

        // The first run's undo failed, so the target is free and its changes are still on the device.
        const { original, rollback } = await failedRollback(node, "later-rollback", peer);

        // A second run of the same target is cancelled, and its undo parks: a rollback of a *later* run,
        // undoing values the first run never wrote.
        peer.setIntent("groupMembership", "X", { v: 3 });
        const second = await run(node, "later-rollback", [gatingPhase(peer.id)]);
        await pumpUntil("second intent written", () => (peer.items[KEY]?.intent as { v?: number })?.v === 2);
        const live = await node.act(a =>
            a
                .get(TestTaskManager)
                .cancel(second.runId)
                .then(c => c.rollback),
        );
        expect(live).not.equals(undefined);

        // The live rollback undoes the second run, not the first, so it is not the undo that applies here and
        // refusing on it would leave the first run's changes with no disposition at all.
        const abandoned = await node.act(a => a.get(TestTaskManager).abandon(rollback.runId, "operator"));
        expect(abandoned.status.state).equals("abandoned");
        expect(await node.act(a => a.get(TestTaskManager).get(original.runId)?.status.state)).equals("cancelled");
    });

    it("is not superseded by a later run that completed without changing anything", async () => {
        await using node = await makeNode();
        const peer = testPeer("noop-completion");

        const { original } = await failedRollback(node, "noop-completion", peer);

        // Completes without touching a peer, as a removal does when its node is already decommissioned.
        const later = await run(node, "noop-completion", [{ name: "noop", run: async () => {} }]);
        await awaitRetired(node, later.runId);
        expect((await stored(node, later.runId))?.wrote).equals(false);

        const retry = await attempt(node, m => m.retryRollback(original.runId));
        expect(retry).not.instanceOf(Error);
        expect((retry as TaskHandle).status.rollbackOf).equals(original.runId);
    });

    it("is not superseded by a later run that reached no phase", async () => {
        await using node = await makeNode();
        const peer = testPeer("no-phase");

        const { original } = await failedRollback(node, "no-phase", peer);

        // The later run touches nothing before it fails, so what the first would restore is still current.
        const later = await run(node, "no-phase", [
            {
                name: "throw",
                run: async () => new Promise<void>((_, reject) => reject(new TaskFailedError("nope"))),
            },
        ]);
        await awaitRetired(node, later.runId);
        expect((await stored(node, later.runId))?.changeSet).deep.equals([]);

        const retry = await attempt(node, m => m.retryRollback(original.runId));
        expect(retry).not.instanceOf(Error);
        expect((retry as TaskHandle).status.rollbackOf).equals(original.runId);
    });

    it("drops the priors of a run that completed", async () => {
        await using node = await makeNode();
        const peer = testPeer("completed-priors");
        peer.setIntent("groupMembership", "X", { v: 1 });

        const done = await run(node, "completed-priors", [touchPhase("completed-priors")]);
        await awaitRetired(node, done.runId);

        const record = await stored(node, done.runId);
        expect("changeSet" in (record ?? {})).equals(true);
        expect(record?.changeSet).deep.equals([]);
    });

    it("drops the priors of a run that cannot be undone, and still records that it wrote", async () => {
        await using node = await makeNode();
        const peer = testPeer("forward-only");
        peer.setIntent("groupMembership", "X", { v: 1 });

        await node.act(a => a.get(TestTaskManager).register(ForwardOnlyTask));
        const run1 = await node.act(a =>
            a.get(TestTaskManager).run(ForwardOnlyTask, { tag: "forward-only", peerId: "forward-only" }),
        );
        await awaitRetired(node, run1.runId);

        const record = await stored(node, run1.runId);
        expect(record?.state).equals("failed");
        // Nothing can ever replay them, so they go — while `wrote` keeps saying the device was changed.
        expect(record?.changeSet).deep.equals([]);
        expect(record?.wrote).equals(true);
        expect(await attempt(node, m => m.retryRollback(run1.runId))).instanceOf(TaskNoRollbackError);
    });

    it("keeps the priors of a failed run its rollback can still replay", async () => {
        await using node = await makeNode();
        const peer = testPeer("keeps-priors");
        const { original } = await failedRollback(node, "keeps-priors", peer);

        expect((await stored(node, original.runId))?.changeSet).not.deep.equals([]);
    });

    it("drops a rollback's own priors, which nothing can ever replay", async () => {
        await using node = await makeNode();
        const peer = testPeer("rollback-priors");
        const { rollback } = await failedRollback(node, "rollback-priors", peer);

        const record = await stored(node, rollback.runId);
        expect(record?.state).equals("failed");
        expect(record?.wrote).equals(true);
        expect(record?.changeSet).deep.equals([]);
        expect(await node.act(a => a.get(TestTaskManager).priorsOf(rollback.runId))).deep.equals([]);
    });

    it("spends the original's priors when its rollback completes, and still refuses a retry", async () => {
        await using node = await makeNode();
        const peer = testPeer("undo-completes");
        const { original, rollback } = await parkedRollback(node, "undo-completes", peer);

        peer.markHas("groupMembership", "X");
        peer.setReachable(true);
        await pumpUntil("rollback completed", () =>
            node.act(a => a.get(TestTaskManager).get(rollback.runId)?.status.state === "completed"),
        );

        expect((await stored(node, original.runId))?.changeSet).deep.equals([]);
        expect(await node.act(a => a.get(TestTaskManager).priorsOf(original.runId))).deep.equals([]);
        // The refusal stays coded: an emptied changeSet must never surface as the "cannot happen" error.
        expect(await attempt(node, m => m.retryRollback(original.runId))).instanceOf(TaskAlreadyUndoneError);
    });

    it("spends the original's priors when its rollback is abandoned, and still refuses a retry", async () => {
        await using node = await makeNode();
        const peer = testPeer("undo-abandoned");
        const { original, rollback } = await failedRollback(node, "undo-abandoned", peer);

        await node.act(a => a.get(TestTaskManager).abandon(rollback.runId));

        expect((await stored(node, original.runId))?.changeSet).deep.equals([]);
        expect(await node.act(a => a.get(TestTaskManager).priorsOf(original.runId))).deep.equals([]);
        expect(await attempt(node, m => m.retryRollback(original.runId))).instanceOf(TaskAbandonedError);
    });

    it("gives a rollback its own copy of the priors it replays", async () => {
        await using node = await makeNode();
        const peer = testPeer("undo-copy");
        // Parked, so the rollback still holds its params: a retirement drops them.
        const { original, rollback } = await parkedRollback(node, "undo-copy", peer);

        const entries = await node.act(
            a => (a.get(TestTaskManager).paramsOf(rollback.runId) as { entries: unknown[] }).entries,
        );
        const priors = await node.act(a => a.get(TestTaskManager).priorsOf(original.runId));
        expect(entries).not.equals(priors);
        expect(entries).deep.equals(priors);
    });

    it("keeps the priors of a run that failed on its own and got a rollback", async () => {
        await using node = await makeNode();
        const peer = testPeer("failed-with-undo");
        peer.setIntent("groupMembership", "X", { v: 1 });
        peer.setReachable(false);

        await node.act(a => a.get(TestTaskManager).register(FailingRollbackableTask));
        const failed = await node.act(a =>
            a.get(TestTaskManager).run(FailingRollbackableTask, {
                tag: "failed-with-undo",
                peerId: "failed-with-undo",
            }),
        );
        await awaitRetired(node, failed.runId);

        const record = await stored(node, failed.runId);
        expect(record?.state).equals("failed");
        expect(record?.rollbackRunId).not.equals(undefined);
        // The rollback exists and is parked, so it can still replay these.
        expect(record?.changeSet).not.deep.equals([]);
    });

    it("drops the priors of a run whose type cannot say whether it is rollbackable", async () => {
        await using node = await makeNode();
        const peer = testPeer("unaskable");
        peer.setIntent("groupMembership", "X", { v: 1 });

        await node.act(a => a.get(TestTaskManager).register(UnaskableTask));
        const failed = await node.act(a =>
            a.get(TestTaskManager).run(UnaskableTask, { tag: "unaskable", peerId: "unaskable" }),
        );
        await awaitRetired(node, failed.runId);

        const record = await stored(node, failed.runId);
        expect(record?.state).equals("failed");
        // No rollback could be prepared, so nothing will ever replay the priors.
        expect(record?.rollbackRunId).equals(undefined);
        expect(record?.changeSet).deep.equals([]);
        expect(record?.wrote).equals(true);
        expect(await attempt(node, m => m.retryRollback(failed.runId))).instanceOf(TaskNoRollbackError);
    });

    it("drops a completed rollback's own priors", async () => {
        await using node = await makeNode();
        const peer = testPeer("undo-completes-own");
        const { rollback } = await parkedRollback(node, "undo-completes-own", peer);

        peer.markHas("groupMembership", "X");
        peer.setReachable(true);
        await pumpUntil("rollback completed", () =>
            node.act(a => a.get(TestTaskManager).get(rollback.runId)?.status.state === "completed"),
        );

        expect((await stored(node, rollback.runId))?.changeSet).deep.equals([]);
    });

    it("forgets retired runs beyond the history limit, in storage as well as in memory", async () => {
        await using node = await makeNode();
        testPeer("history");
        await node.act(a => (a.get(TestTaskManager).state.historyLimit = 2));

        const ids = new Array<RunId>();
        for (let i = 0; i < 4; i++) {
            const handle = await run(node, `history-${i}`, [{ name: "noop", run: async () => {} }]);
            await awaitRetired(node, handle.runId);
            ids.push(handle.runId);
        }

        const stored = await node.act(a => Object.keys(a.get(TestTaskManager).state.runs));
        // Bounded in storage, not merely in what `history()` reports — a memory-only eviction would leave the
        // table growing for the life of the node.
        expect(stored.length).equals(2);
        expect(await node.act(a => a.get(TestTaskManager).get(ids[0]))).equals(undefined);
        expect(await node.act(a => a.get(TestTaskManager).get(ids[3]))).not.equals(undefined);
    });

    it("says an evicted run was forgotten rather than never known", async () => {
        await using node = await makeNode();
        testPeer("evicted");
        await node.act(a => (a.get(TestTaskManager).state.historyLimit = 0));

        const first = await run(node, "evicted-0", [{ name: "noop", run: async () => {} }]);
        await awaitRetired(node, first.runId);
        // Eviction happens in a retirement write, and a run is never in its own. So the second run's
        // retirement is what forgets the first.
        const second = await run(node, "evicted-1", [{ name: "noop", run: async () => {} }]);
        await awaitRetired(node, second.runId);

        expect(await node.act(a => a.get(TestTaskManager).get(first.runId))).equals(undefined);
        expect(await attempt(node, m => m.cancel(first.runId))).instanceOf(TaskNoLongerTrackedError);
        // An identity never issued is still a different answer.
        expect(await attempt(node, m => m.cancel(RunId(9_999)))).instanceOf(TaskNotFoundError);
    });

    it("survives a restart with the forgotten runs still forgotten", async () => {
        const environment = new Environment("history-restart");
        let evicted: RunId;
        let kept: RunId;
        {
            await using seed = await makeNode(environment, "historyrestart");
            testPeer("restart");
            await seed.act(a => (a.get(TestTaskManager).state.historyLimit = 1));
            const first = await run(seed, "restart-0", [{ name: "noop", run: async () => {} }]);
            await awaitRetired(seed, first.runId);
            const second = await run(seed, "restart-1", [{ name: "noop", run: async () => {} }]);
            await awaitRetired(seed, second.runId);
            evicted = first.runId;
            kept = second.runId;
        }

        await using node = await makeNode(environment, "historyrestart");
        expect(await node.act(a => a.get(TestTaskManager).get(evicted))).equals(undefined);
        expect(await node.act(a => a.get(TestTaskManager).get(kept))).not.equals(undefined);
        // The high-water mark outlived the records, so the answer is still "forgotten", not "never existed".
        expect(await attempt(node, m => m.cancel(evicted))).instanceOf(TaskNoLongerTrackedError);
    });

    it("builds a first rollback from the priors of a run whose rollback was refused", async () => {
        const environment = new Environment("refused-rollback");
        let originalId: RunId;
        {
            await using seed = await makeNode(environment, "refusedrollback");
            const peer = testPeer("refused");
            const { original, rollback } = await failedRollback(seed, "refused", peer);
            originalId = original.runId;

            // The state a refused rollback leaves: the run retired `failed` having changed the device, its
            // priors kept because one could still be built, and no rollback recorded. `#prepareRollback`
            // decided the run was rollbackable before the refusal, so building one now is the same act as
            // retrying a failed one.
            await seed.act(a => {
                const runs = { ...a.get(TestTaskManager).state.runs };
                delete runs[String(rollback.runId)];
                const { rollbackRunId: _dropped, ...withoutLink } = runs[String(originalId)];
                runs[String(originalId)] = withoutLink;
                a.get(TestTaskManager).state.runs = runs;
            });
        }

        await using node = await makeNode(environment, "refusedrollback");
        testPeer("refused");
        await node.act(a => a.get(TestTaskManager).register(SyntheticTask));

        expect(await node.act(a => a.get(TestTaskManager).priorsOf(originalId))).not.deep.equals([]);
        const handle = await node.act(a => a.get(TestTaskManager).retryRollback(originalId));

        expect(handle.status.rollbackOf).equals(originalId);
        expect(await stored(node, originalId).then(r => r?.rollbackRunId)).equals(handle.runId);
    });

    it("is superseded by a later run that reached the device and cannot be undone", async () => {
        await using node = await makeNode();
        const peer = testPeer("forward-only-superseder");

        const { original } = await failedRollback(node, "forward-only-superseder", peer);

        await node.act(a => a.get(TestTaskManager).register(ForwardOnlyTask));
        const later = await node.act(a =>
            a.get(TestTaskManager).run(ForwardOnlyTask, {
                tag: "forward-only-superseder",
                peerId: "forward-only-superseder",
            }),
        );
        await awaitRetired(node, later.runId);

        const refusal = await attempt(node, m => m.retryRollback(original.runId));
        expect(refusal).instanceOf(TaskSupersededError);
        expect((refusal as TaskConflictError).owner).equals(later.runId);
    });

    it("admits nothing when the stored table is newer than this build", async () => {
        const environment = new Environment("ledger-version");
        {
            await using node = await makeNode(environment, "version");
            await node.act(a => {
                a.get(TestTaskManager).state.runsVersion = RUN_STORE_VERSION + 1;
            });
        }

        await using node = await makeNode(environment, "version");
        SyntheticTask.phasesByTag["version"] = [touchPhase("version")];
        await node.act(a => a.get(TestTaskManager).register(SyntheticTask));
        expect(await attempt(node, async m => m.run(SyntheticTask, { tag: "version" }))).instanceOf(
            TaskStoreVersionError,
        );
    });
});
