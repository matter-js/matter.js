/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { ReconcilerBehavior } from "#ReconcilerBehavior.js";
import { TaskConflictError, TaskNotInFlightError, TaskStoreVersionError, TaskSupersededError } from "#task/errors.js";
import { RUN_STORE_VERSION } from "#task/RunStore.js";
import { TaskPersistence } from "#task/Task.js";
import { TaskManagerBehavior } from "#task/TaskManagerBehavior.js";
import { RunId, TaskPhase } from "#task/types.js";
import { Environment, InternalError, MaybePromise } from "@matter/general";
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

    isAttached(runId: RunId) {
        return this.internal.runs.isAttached(runId);
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

/** Writes one intent and returns, so the run completes having changed something. */
function touchPhase(peerId: string): TaskPhase {
    return {
        name: "touch",
        run: async ctx => {
            await ctx.setIntent(ctx.resolvePeer(peerId), "groupMembership", "X", { v: 2 });
        },
    };
}

/** Writes one intent the device never confirms, so the run stays in flight owning its target. */
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

    const rollback = await node.act(a => a.get(TestTaskManager).cancel(original.runId));
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
        expect(retry.status.revertOf).equals(original.runId);
        expect((await stored(node, original.runId))?.revertRunId).equals(retry.runId);
    });

    it("refuses to cancel a run that already finished", async () => {
        await using node = await makeNode();
        const peer = testPeer("done");
        peer.markHas("groupMembership", "X");
        const handle = await run(node, "done", [touchPhase("done")]);
        await awaitRetired(node, handle.runId);

        await expect(node.act(a => a.get(TestTaskManager).cancel(handle.runId))).rejectedWith(TaskNotInFlightError);
        expect((await stored(node, handle.runId))?.revertRunId).equals(undefined);
    });

    it("drops the parameters an older build left on finished records", async () => {
        const environment = new Environment("upgrade-params");
        let finished!: RunId;
        {
            await using node = await makeNode(environment, "upgrade");
            const peer = testPeer("upgrade");
            peer.markHas("groupMembership", "X");
            const handle = await run(node, "upgrade", [touchPhase("upgrade")]);
            await awaitRetired(node, handle.runId);
            finished = handle.runId;

            // Put the record back the way the previous build left it: parameters intact, table unversioned.
            await node.act(a => {
                const manager = a.get(TestTaskManager);
                manager.state.runs = {
                    ...manager.state.runs,
                    [String(finished)]: { ...manager.state.runs[String(finished)], params: { tag: "upgrade" } },
                };
                manager.state.runsVersion = 1;
            });
        }

        // A write replaces only the records its own transaction names, so nothing would ever rewrite a run
        // that was already finished — and its parameters are the raw keys this version exists to stop storing.
        await using node = await makeNode(environment, "upgrade");
        const record = await stored(node, finished);
        expect(record).not.equals(undefined);
        expect("params" in record!).equals(false);
        expect(await node.act(a => a.get(TestTaskManager).state.runsVersion)).equals(RUN_STORE_VERSION);
    });

    it("does not put migrated parameters back on the next write of the record", async () => {
        const environment = new Environment("upgrade-rewrite");
        let original!: RunId;
        {
            await using node = await makeNode(environment, "rewrite");
            const peer = testPeer("rewrite");
            const failed = await failedRollback(node, "rewrite", peer);
            original = failed.original.runId;

            // Back to the shape the previous build left: parameters present, table unversioned.
            await node.act(a => {
                const manager = a.get(TestTaskManager);
                manager.state.runs = {
                    ...manager.state.runs,
                    [String(original)]: { ...manager.state.runs[String(original)], params: { tag: "rewrite" } },
                };
                manager.state.runsVersion = 1;
            });
        }

        await using node = await makeNode(environment, "rewrite");
        const peer = testPeer("rewrite");
        peer.setIntent("groupMembership", "X", { v: 1 });
        await node.act(a => a.get(TestTaskManager).register(SyntheticTask));
        expect("params" in (await stored(node, original))!).equals(false);

        // A snapshot carries every field the record holds, so a write that mentions something else — here the
        // link to a fresh undo — would re-persist parameters the upgrade only took out of storage. The version
        // stamp means the upgrade would never run again to remove them.
        await node.act(a => a.get(TestTaskManager).retryRollback(original));
        expect("params" in (await stored(node, original))!).equals(false);
    });

    it("leaves an unfinished run's parameters alone on upgrade", async () => {
        const environment = new Environment("upgrade-inflight");
        let live!: RunId;
        {
            await using node = await makeNode(environment, "inflight");
            const peer = testPeer("inflight");
            const handle = await run(node, "inflight", [gatingPhase("inflight")]);
            await pumpUntil("intent written", () => peer.items[KEY] !== undefined);
            live = handle.runId;
            await node.act(a => {
                a.get(TestTaskManager).state.runsVersion = 1;
            });
        }

        // Parameters are what re-drives a run's phases after a restart, so the upgrade must not take them from
        // work that has not finished.
        await using node = await makeNode(environment, "inflight");
        testPeer("inflight");
        expect((await stored(node, live))?.params).deep.equals({ tag: "inflight" });
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
            m => m.cancel(existing),
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
