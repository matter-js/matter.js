/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { ReconcilerBehavior } from "#ReconcilerBehavior.js";
import {
    TaskFailedError,
    TaskFindingCode,
    TaskManagerClosingError,
    TaskNoRollbackError,
    TaskOutcomeUnrecordedError,
    TaskSlotOccupiedError,
} from "#task/errors.js";
import { TaskDefinition } from "#task/Task.js";
import { TaskManagerBehavior } from "#task/TaskManagerBehavior.js";
import { RunId, TaskPhase, TaskStatus } from "#task/types.js";
import { Environment, ImplementationError, InternalError } from "@matter/general";
import { ClientNode, itemMapKey } from "@matter/node";
import { MockServerNode } from "@matter/node/testing";
import { PeerAddress } from "@matter/protocol";
import { FakePeer, isTerminalState, kindOf, pumpUntil, SyntheticTask, testAddress } from "./helpers.js";

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

    internalRecord(runId: RunId) {
        return this.internal.runs.get(runId);
    }

    isAttached(runId: RunId) {
        return this.internal.runs.isAttached(runId);
    }

    async closePersistMutex(): Promise<void> {
        await this.internal.persistMutex?.close();
    }
}

/** A task nothing registers on the second start, so its record is awaiting a registration that never comes. */
const OrphanTask: TaskDefinition<{ tag: string }> = {
    type: "orphan",
    slotKeyFor(params) {
        return `orphan:${params.tag}`;
    },
    phases() {
        return [gatingPhase("orphan")];
    },
};

/** Registered on both starts, but refuses its stored parameters on the second: registration is not the gap. */
const RejectingTask: TaskDefinition<{ tag: string }> & { rejectParams: boolean } = {
    type: "rejecting",
    rejectParams: false,
    slotKeyFor(params) {
        return `rejecting:${params.tag}`;
    },
    phases() {
        return [gatingPhase("orphan")];
    },
    validate() {
        if (RejectingTask.rejectParams) {
            throw new ImplementationError("malformed persisted parameters");
        }
    },
};

/** Writes one intent the device never confirms, so the run stays in flight owning its target. */
function gatingPhase(peerId: string): TaskPhase {
    return {
        name: "hold",
        run: async ctx => {
            const peer = ctx.resolvePeer(testAddress(peerId));
            await ctx.setIntent(peer, kindOf("groupMembership"), "X", { v: 2 });
            await ctx.awaitCommitted([{ peer, kind: kindOf("groupMembership"), key: "X" }]);
        },
    };
}

const RootEndpoint = MockServerNode.RootEndpoint.with(TestTaskManager);

async function makeNode(name: string) {
    const peer = new FakePeer(name);
    TestTaskManager.peers.set(name, peer);
    TestTaskManager.reconcilerPeer = peer;
    const node = await MockServerNode.create(RootEndpoint, { environment: new Environment(name), id: name });
    await node.act(a => a.get(TestTaskManager).register(SyntheticTask));
    return { node, peer };
}

describe("run observation", () => {
    before(() => MockTime.init());

    it("reports every change to a run's status, ending in its outcome", async () => {
        await using node = (await makeNode("observe")).node;

        const seen = new Array<TaskStatus>();
        node.events.taskManager.runChanged.on(status => {
            seen.push(status);
        });

        SyntheticTask.phasesByTag["observed"] = [
            { name: "one", run: async () => {} },
            { name: "two", run: async () => {} },
        ];
        const handle = await node.act(a => a.get(TestTaskManager).run(SyntheticTask, { tag: "observed" }));
        await handle.settled();

        expect(seen.length).greaterThan(1);
        expect(seen.map(status => status.runId)).satisfies((ids: number[]) => ids.every(id => id === handle.runId));
        expect(seen[seen.length - 1].state).equals("completed");
        // The status carries what storage holds, not what the run is about to write.
        expect(seen[0].state).equals("running");
    });

    it("says nothing for a write that moves nothing a status carries", async () => {
        const { node, peer } = await makeNode("observe-quiet");
        await using _node = node;

        const seen = new Array<TaskStatus>();
        node.events.taskManager.runChanged.on(status => {
            seen.push(status);
        });

        // Three items in one phase: each is recorded before it is written, so three record writes land where
        // the status changes once.
        SyntheticTask.phasesByTag["quiet"] = [
            {
                name: "touch-three",
                run: async ctx => {
                    const target = ctx.resolvePeer(testAddress("observe-quiet"));
                    for (const key of ["A", "B", "C"]) {
                        await ctx.setIntent(target, kindOf("groupMembership"), key, { v: 1 });
                    }
                },
            },
        ];
        const handle = await node.act(a => a.get(TestTaskManager).run(SyntheticTask, { tag: "quiet" }));
        await handle.settled();

        expect(peer.items[itemMapKey("groupMembership", "C")]).not.equals(undefined);
        // Not a count: a phase parks and resumes as its gates settle, so several distinct statuses are
        // legitimate. What may never happen is telling a subscriber the same thing twice in a row.
        const repeated = seen
            .map(status => JSON.stringify(status))
            .filter((rendered, i, all) => i > 0 && rendered === all[i - 1]);
        expect(repeated).deep.equals([]);
        expect(seen.length).greaterThan(0);
    });

    it("settles a run that is already terminal", async () => {
        await using node = (await makeNode("settled-terminal")).node;

        SyntheticTask.phasesByTag["quick"] = [{ name: "one", run: async () => {} }];
        const handle = await node.act(a => a.get(TestTaskManager).run(SyntheticTask, { tag: "quick" }));
        await handle.settled();

        // A second wait on a run nothing will change again must not hang.
        await handle.settled();
        expect(handle.status.state).equals("completed");
    });

    it("keeps recording a run whose observer throws", async () => {
        await using node = (await makeNode("observer-throws")).node;

        node.events.taskManager.runChanged.on(() => {
            throw new InternalError("observer failed");
        });

        SyntheticTask.phasesByTag["throwing"] = [{ name: "one", run: async () => {} }];
        const handle = await node.act(a => a.get(TestTaskManager).run(SyntheticTask, { tag: "throwing" }));
        await handle.settled();

        expect(handle.status.state).equals("completed");
    });
});

describe("task status", () => {
    before(() => MockTime.init());

    it("says whether the run reached the device", async () => {
        const { node, peer } = await makeNode("wrote");
        await using _node = node;
        peer.markHas("groupMembership", "W");

        SyntheticTask.phasesByTag["untouched"] = [{ name: "one", run: async () => {} }];
        SyntheticTask.phasesByTag["touched"] = [
            {
                name: "one",
                run: async ctx => {
                    await ctx.setIntent(ctx.resolvePeer(testAddress("wrote")), kindOf("groupMembership"), "W", {
                        v: 1,
                    });
                },
            },
        ];

        const untouched = await node.act(a => a.get(TestTaskManager).run(SyntheticTask, { tag: "untouched" }));
        await untouched.settled();
        const touched = await node.act(a => a.get(TestTaskManager).run(SyntheticTask, { tag: "touched" }));
        await touched.settled();

        expect(untouched.status.wrote).equals(false);
        expect(touched.status.wrote).equals(true);
    });
});

describe("assess", () => {
    before(() => MockTime.init());

    it("reports a free target as ready, and the run then starts", async () => {
        await using node = (await makeNode("assess-ready")).node;

        SyntheticTask.phasesByTag["free"] = [{ name: "one", run: async () => {} }];
        const feasibility = await node.act(a => a.get(TestTaskManager).assess(SyntheticTask, { tag: "free" }));

        expect(feasibility.verdict).equals("ready");
        expect(feasibility.findings).deep.equals([]);

        const handle = await node.act(a => a.get(TestTaskManager).run(SyntheticTask, { tag: "free" }));
        await handle.settled();
        expect(handle.status.state).equals("completed");
    });

    it("names the run a repeated request would join", async () => {
        await using node = (await makeNode("assess-joins")).node;

        SyntheticTask.phasesByTag["held"] = [gatingPhase("assess-joins")];
        const held = await node.act(a =>
            a.get(TestTaskManager).run(SyntheticTask, { tag: "held" }, { externalId: "e" }),
        );

        const feasibility = await node.act(a =>
            a.get(TestTaskManager).assess(SyntheticTask, { tag: "held" }, { externalId: "e" }),
        );

        expect(feasibility.verdict).equals("joins");
        expect(feasibility.joins).equals(held.runId);
        expect(feasibility.findings).deep.equals([]);
    });

    it("reports the refusal run would throw, with the same cause and owner", async () => {
        await using node = (await makeNode("assess-blocked")).node;

        SyntheticTask.phasesByTag["busy"] = [gatingPhase("assess-blocked")];
        const held = await node.act(a => a.get(TestTaskManager).run(SyntheticTask, { tag: "busy" }));

        const feasibility = await node.act(a => a.get(TestTaskManager).assess(SyntheticTask, { tag: "busy" }));
        expect(feasibility.verdict).equals("blocked");
        expect(feasibility.findings.length).equals(1);
        expect(feasibility.findings[0].code).equals(TaskFindingCode.SlotOccupied);
        expect(feasibility.findings[0].owner).equals(held.runId);

        // One source: what assess reports is the refusal run throws, message included.
        let refusal: unknown;
        try {
            await node.act(a => a.get(TestTaskManager).run(SyntheticTask, { tag: "busy" }));
        } catch (e) {
            refusal = e;
        }
        expect(refusal).instanceOf(TaskSlotOccupiedError);
        expect((refusal as TaskSlotOccupiedError).message).equals(feasibility.findings[0].message);
    });

    it("refuses a definition that is not registered, as run does", async () => {
        await using node = (await makeNode("assess-unregistered")).node;

        let refusal: unknown;
        try {
            await node.act(a => a.get(TestTaskManager).assess(OrphanTask, { tag: "u" }));
        } catch (e) {
            refusal = e;
        }
        expect(refusal).instanceOf(ImplementationError);
    });
});

describe("outstanding work", () => {
    before(() => MockTime.init());

    it("lists the rollback an operator must retry or abandon", async () => {
        const { node, peer } = await makeNode("failed-rollbacks");
        await using _node = node;

        peer.setIntent("groupMembership", "X", { v: 1 });
        SyntheticTask.phasesByTag["undone"] = [gatingPhase("failed-rollbacks")];
        const original = await node.act(a => a.get(TestTaskManager).run(SyntheticTask, { tag: "undone" }));
        await pumpUntil(
            "intent written",
            () => (peer.items[itemMapKey("groupMembership", "X")]?.intent as { v?: number })?.v === 2,
        );

        const rollback = await node.act(a =>
            a
                .get(TestTaskManager)
                .cancel(original.runId)
                .then(c => c.rollback),
        );
        if (rollback === undefined) {
            throw new InternalError("cancel produced no rollback");
        }
        await pumpUntil(
            "rollback restoring",
            () => (peer.items[itemMapKey("groupMembership", "X")]?.intent as { v?: number })?.v === 1,
        );
        // The reconciler drops the item the rollback's gate waits for, so the undo can never commit.
        peer.dropItem("groupMembership", "X");
        await pumpUntil("rollback failed", () =>
            node.act(a => {
                const manager = a.get(TestTaskManager);
                return manager.get(rollback.runId)?.status.state === "failed" && !manager.isAttached(rollback.runId);
            }),
        );

        const outstanding = await node.act(a => a.get(TestTaskManager).failedRollbacks.map(h => h.runId));
        expect(outstanding).deep.equals([rollback.runId]);

        // A retry takes the work over, so the attempt it replaces is no longer outstanding. The device accepts
        // the item again, so this undo can reach it.
        peer.markHas("groupMembership", "X");
        const retry = await node.act(a => a.get(TestTaskManager).retryRollback(original.runId));
        expect(retry.runId).not.equals(rollback.runId);
        const afterRetry = await node.act(a => a.get(TestTaskManager).failedRollbacks.map(h => h.runId));
        expect(afterRetry).not.contains(rollback.runId);

        // And an undo that reached the device is not outstanding work at all.
        await retry.settled();
        await pumpUntil("the retry retires", () => node.act(a => !a.get(TestTaskManager).isAttached(retry.runId)));
        expect(retry.status.state).equals("completed");
        expect(await node.act(a => a.get(TestTaskManager).failedRollbacks.map(h => h.runId))).deep.equals([]);
    });

    it("refuses a request for a busy target on the target, not on the name it asked for", async () => {
        await using node = (await makeNode("refusal-order")).node;

        // Both conflicts at once: the target is held by one run, and the external id the request asks for is
        // live on a different target. The order the checks run in decides which of the two a caller is told.
        SyntheticTask.phasesByTag["target"] = [gatingPhase("refusal-order")];
        SyntheticTask.phasesByTag["elsewhere"] = [gatingPhase("refusal-order")];
        await node.act(a => a.get(TestTaskManager).run(SyntheticTask, { tag: "target" }));
        await node.act(a => a.get(TestTaskManager).run(SyntheticTask, { tag: "elsewhere" }, { externalId: "e" }));

        const feasibility = await node.act(a =>
            a.get(TestTaskManager).assess(SyntheticTask, { tag: "target" }, { externalId: "e" }),
        );
        expect(feasibility.findings[0].code).equals(TaskFindingCode.SlotOccupied);
    });

    it("lists a run held up by a task type this build does not know", async () => {
        const environment = new Environment("awaiting-registration");
        const peer = new FakePeer("orphan");
        TestTaskManager.peers.set("orphan", peer);
        TestTaskManager.reconcilerPeer = peer;

        let parked: RunId;
        {
            await using node = await MockServerNode.create(RootEndpoint, { environment, id: "orphan-node" });
            RejectingTask.rejectParams = false;
            await node.act(a => a.get(TestTaskManager).register(OrphanTask));
            await node.act(a => a.get(TestTaskManager).register(RejectingTask));
            const handle = await node.act(a => a.get(TestTaskManager).run(OrphanTask, { tag: "o" }));
            parked = handle.runId;
            await node.act(a => a.get(TestTaskManager).run(RejectingTask, { tag: "r" }));
            await pumpUntil("the runs are recorded", () =>
                node.act(a => Object.keys(a.get(TestTaskManager).state.runs).length === 2),
            );
        }

        // Same records. Nothing registers the orphan's type this time, and the second type is registered but
        // refuses what storage holds — a run nothing drives for a reason no registration would fix.
        await using node = await MockServerNode.create(RootEndpoint, { environment, id: "orphan-node" });
        RejectingTask.rejectParams = true;
        await node.act(a => a.get(TestTaskManager).register(RejectingTask));
        const held = await node.act(a => a.get(TestTaskManager).awaitingRegistration.map(h => h.runId));
        expect(held).deep.equals([parked]);

        RejectingTask.rejectParams = false;
        await node.act(a => a.get(TestTaskManager).register(OrphanTask));
        expect(await node.act(a => a.get(TestTaskManager).awaitingRegistration.length)).equals(0);
    });
});

describe("settling when nothing can be written", () => {
    before(() => MockTime.init());

    it("settles a run whose outcome storage refused", async () => {
        await using node = (await makeNode("unwritable")).node;

        SyntheticTask.phasesByTag["warm"] = [{ name: "noop", run: async () => {} }];
        SyntheticTask.phasesByTag["unwritten"] = [
            {
                name: "touch",
                run: async ctx => {
                    await ctx.setIntent(ctx.resolvePeer(testAddress("unwritable")), kindOf("groupMembership"), "U", {});
                },
            },
        ];

        // One run first, so the persist mutex exists to be closed; then storage refuses before the run under
        // test has written anything, and its failure has no record to announce it.
        const warm = await node.act(a => a.get(TestTaskManager).run(SyntheticTask, { tag: "warm" }));
        await warm.settled();
        await node.act(a => a.get(TestTaskManager).closePersistMutex());

        const handle = await node.act(a => a.get(TestTaskManager).run(SyntheticTask, { tag: "unwritten" }));
        // Asked while the run is still live: a caller that asks after the outcome is answered by the record
        // alone, which is not the path that can hang.
        const settled = handle.settled();
        await pumpUntil("the run gives up", () => node.act(a => !a.get(TestTaskManager).isAttached(handle.runId)));
        await settled;

        expect(handle.status.state).equals("failed");
    });

    it("releases a caller waiting on a run whose outcome storage refused after it was recorded", async () => {
        await using node = (await makeNode("unrecorded-outcome")).node;

        SyntheticTask.phasesByTag["unrecorded-outcome"] = [
            {
                name: "write",
                run: async ctx => {
                    const peer = ctx.resolvePeer(testAddress("unrecorded-outcome"));
                    await ctx.setIntent(peer, kindOf("groupMembership"), "X", { v: 1 });
                },
            },
            {
                name: "boom",
                // Storage stops answering only once the run is durable, so the failure below has a record it
                // cannot write to — the case the shutdown test above cannot reach.
                run: async () => {
                    await node.act(a => a.get(TestTaskManager).closePersistMutex());
                    throw new TaskFailedError("storage is gone");
                },
            },
        ];

        const handle = await node.act(a => a.get(TestTaskManager).run(SyntheticTask, { tag: "unrecorded-outcome" }));
        let rejection: unknown;
        const waiting = handle.settled().catch(e => {
            rejection = e;
        });
        await pumpUntil("the waiter is released", () => rejection !== undefined);
        await waiting;

        expect(rejection).instanceOf(TaskOutcomeUnrecordedError);
        // The record keeps the state storage holds, so the next start is what states an outcome for it.
        expect(isTerminalState(handle.status.state)).equals(false);

        // And a caller that asks afterwards is owed the same answer: the outcome it would wait for is not
        // coming either, and nothing else would ever release it.
        await expect(handle.settled()).rejectedWith(TaskOutcomeUnrecordedError);
        await expect(node.act(a => a.get(TestTaskManager).get(handle.runId)?.settled())).rejectedWith(
            TaskOutcomeUnrecordedError,
        );
    });

    it("releases a caller waiting on a run the shutdown left for the next start", async () => {
        const environment = new Environment("suspended");
        const peer = new FakePeer("suspended");
        TestTaskManager.peers.set("suspended", peer);
        TestTaskManager.reconcilerPeer = peer;
        const node = await MockServerNode.create(RootEndpoint, { environment, id: "suspended" });
        await node.act(a => a.get(TestTaskManager).register(SyntheticTask));

        SyntheticTask.phasesByTag["suspended"] = [gatingPhase("suspended")];
        const handle = await node.act(a => a.get(TestTaskManager).run(SyntheticTask, { tag: "suspended" }));

        let rejection: unknown;
        const waiting = handle.settled().catch(e => {
            rejection = e;
        });

        await node.close();
        await waiting;

        expect(rejection).instanceOf(TaskManagerClosingError);
        // The run itself is untouched: the next start resumes it.
        expect(handle.status.state).equals("running");
    });
});

describe("retrying an undo", () => {
    before(() => MockTime.init());

    it("refuses a run that is still writing, and says to cancel it instead", async () => {
        const { node, peer } = await makeNode("retry-live");
        await using _node = node;
        peer.setIntent("groupMembership", "X", { v: 1 });

        SyntheticTask.phasesByTag["live"] = [gatingPhase("retry-live")];
        const handle = await node.act(a => a.get(TestTaskManager).run(SyntheticTask, { tag: "live" }));
        // Priors are recorded as the run writes, so by now it has something a rollback could replay.
        await pumpUntil(
            "intent written",
            () => (peer.items[itemMapKey("groupMembership", "X")]?.intent as { v?: number })?.v === 2,
        );

        let refusal: unknown;
        try {
            await node.act(a => a.get(TestTaskManager).retryRollback(handle.runId));
        } catch (e) {
            refusal = e;
        }
        expect(refusal).instanceOf(TaskNoRollbackError);
        // The run itself is untouched, and nothing is undoing it.
        expect(handle.status.state).equals("running");
        expect((peer.items[itemMapKey("groupMembership", "X")]?.intent as { v?: number })?.v).equals(2);
    });

    it("refuses a rollback's own identity, because nothing undoes an undo", async () => {
        const { node, peer } = await makeNode("retry-undo");
        await using _node = node;
        peer.setIntent("groupMembership", "X", { v: 1 });

        SyntheticTask.phasesByTag["undone"] = [gatingPhase("retry-undo")];
        const original = await node.act(a => a.get(TestTaskManager).run(SyntheticTask, { tag: "undone" }));
        await pumpUntil(
            "intent written",
            () => (peer.items[itemMapKey("groupMembership", "X")]?.intent as { v?: number })?.v === 2,
        );
        const rollback = await node.act(a =>
            a
                .get(TestTaskManager)
                .cancel(original.runId)
                .then(c => c.rollback),
        );
        if (rollback === undefined) {
            throw new InternalError("cancel produced no rollback");
        }

        let refusal: unknown;
        try {
            await node.act(a => a.get(TestTaskManager).retryRollback(rollback.runId));
        } catch (e) {
            refusal = e;
        }
        expect(refusal).instanceOf(TaskNoRollbackError);
        expect((refusal as Error).message).contains("nothing undoes an undo");
    });
});

describe("peer identity", () => {
    before(() => MockTime.init());

    it("does not replay onto a different device that took the removed peer's local id", async () => {
        const { node, peer } = await makeNode("identity");
        await using _node = node;
        peer.setIntent("groupMembership", "X", { v: 1 });

        SyntheticTask.phasesByTag["identity"] = [gatingPhase("identity")];
        const original = await node.act(a => a.get(TestTaskManager).run(SyntheticTask, { tag: "identity" }));
        await pumpUntil(
            "intent written",
            () => (peer.items[itemMapKey("groupMembership", "X")]?.intent as { v?: number })?.v === 2,
        );

        // What the record kept is the address, not the local id.
        const entry = await node.act(a => a.get(TestTaskManager).internalRecord(original.runId)?.changeSet[0]);
        expect(entry).not.equals(undefined);
        expect(PeerAddress.is(entry!.peer, peer.address)).equals(true);

        // Another device is given the removed peer's local id — the reuse that makes that id unusable as an
        // identity. Both are resolvable, so the undo has somewhere wrong to go if it names the id.
        peer.markHas("groupMembership", "X");
        const successor = new FakePeer("identity", testAddress("identity-successor"));
        successor.setIntent("groupMembership", "X", { v: 99 });
        TestTaskManager.peers.set("successor-under-old-id", successor);

        const rollback = await node.act(a =>
            a
                .get(TestTaskManager)
                .cancel(original.runId)
                .then(c => c.rollback),
        );
        if (rollback === undefined) {
            throw new InternalError("cancel produced no rollback");
        }
        await rollback.settled();

        // The undo ran against the device the record named, restoring what that device held.
        expect(rollback.status.state).equals("completed");
        expect((peer.items[itemMapKey("groupMembership", "X")]?.intent as { v?: number })?.v).equals(1);
        // And not against the device that merely inherited a string.
        expect((successor.items[itemMapKey("groupMembership", "X")]?.intent as { v?: number })?.v).equals(99);
    });
});
