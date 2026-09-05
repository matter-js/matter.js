/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { ReconcilerBehavior } from "#ReconcilerBehavior.js";
import {
    TaskFailedError,
    TaskManagerClosingError,
    TaskNotInFlightError,
    TaskSlotDrainingError,
    TaskSlotSettlingError,
} from "#task/errors.js";
import { RunRecord } from "#task/Task.js";
import { TaskHandle, TaskManagerBehavior } from "#task/TaskManagerBehavior.js";
import { Teardown, TaskPhase, TaskState } from "#task/types.js";
import { RunId } from "#task/types.js";
import { CrashedDependencyError, Environment, InternalError, Lifecycle, MaybePromise } from "@matter/general";
import { Behavior, ClientNode, ItemKind, itemMapKey } from "@matter/node";
import { MockServerNode } from "@matter/node/testing";
import {
    cancelSlot,
    FakePeer,
    liveRecord,
    onPersisted,
    recordFor,
    requireRecordFor,
    requireRunIdOfSlot,
    requireStatusOfSlot,
    revertRecordOf,
    runIdOfSlot,
    statusOfSlot,
    SyntheticTask,
} from "./helpers.js";

class TestTaskManager extends TaskManagerBehavior {
    static override readonly schema = TaskManagerBehavior.schema;
    static peers = new Map<string, FakePeer>();
    static reconcilerPeer?: FakePeer;

    /** Fires while the driver builds a phase context: the gate exists but the phase has not run yet. */
    static atContext?: (manager: TestTaskManager) => void;

    /** Fires before the shutdown abort pass, so a test can release a task into the pre-gate window. */
    static atShutdown?: (manager: TestTaskManager) => void;

    protected override resolvePeerNode(peerId: string): ClientNode | undefined {
        return TestTaskManager.peers.get(peerId)?.asNode();
    }

    /** The verb tearing a run down, once it has accepted the request and before it settles. */
    teardownOf(runId: RunId): Teardown | undefined {
        return this.internal.runs.transitionOf(runId)?.teardown;
    }

    /** True while a task's drive promise has not settled. */
    isDriven(runId: RunId): boolean {
        const execution = this.internal.runs.executionOf(runId);
        return execution !== undefined && !execution.settled;
    }

    /** Whether this process holds responsibility for the run — driving it, or having just stopped. */
    isAttached(runId: RunId): boolean {
        return this.internal.runs.executionOf(runId) !== undefined;
    }

    /**
     * Refuse every further write, with the node otherwise healthy. Distinct from shutdown: this is the storage
     * failure a cancel can hit while the manager is running normally.
     */
    async closePersistMutex(): Promise<void> {
        await this.internal.persistMutex?.close();
    }

    /** Occupy the persist mutex so the next persist queues behind the returned release. */
    holdPersistMutex(): () => void {
        const mutex = this.internal.persistMutex;
        if (mutex === undefined) {
            throw new Error("The persist mutex does not exist yet; run a task first");
        }
        let release!: () => void;
        const held = new Promise<void>(resolve => (release = resolve));
        mutex.run(() => held);
        return release;
    }

    protected override taskReconciler(): ReconcilerBehavior {
        TestTaskManager.atContext?.(this);
        return TestTaskManager.reconcilerPeer as unknown as ReconcilerBehavior;
    }

    override async [Symbol.asyncDispose]() {
        TestTaskManager.atShutdown?.(this);
        await super[Symbol.asyncDispose]();
    }
}

/**
 * Keeps a run's record reachable and traces every state it persists, so a test can inspect it after the node
 * is gone.
 */
const tracedRuns = new Map<string, { record: RunRecord; persistedStates: TaskState[] }>();

function traceRun(manager: TestTaskManager, runId: RunId): void {
    const record = liveRecord(manager, runId);
    if (tracedRuns.has(record.slotKey)) {
        throw new InternalError(`Slot ${record.slotKey} is already traced`);
    }
    const persistedStates = new Array<TaskState>();
    onPersisted(record, persisted => persistedStates.push(persisted.state));
    tracedRuns.set(record.slotKey, { record, persistedStates });
}

function tracedRun(slotKey: string): { record: RunRecord; persistedStates: TaskState[] } {
    const found = tracedRuns.get(slotKey);
    if (found === undefined) {
        throw new InternalError(`No traced run for slot ${slotKey}`);
    }
    return found;
}

/**
 * Registers a task type from its own teardown. Declaring the manager a dependency closes this behavior first,
 * which is the window that matters: the manager is closing but its state is still readable, so an unguarded
 * register() gets as far as resuming and driving.
 */
class ShutdownRegistrarBehavior extends Behavior {
    static override readonly id = "shutdownRegistrar";
    static override readonly early = true;
    static override readonly dependencies = [TestTaskManager];
    static atClose?: (manager: TestTaskManager) => void;

    override async [Symbol.asyncDispose]() {
        ShutdownRegistrarBehavior.atClose?.(this.agent.get(TestTaskManager));
        await super[Symbol.asyncDispose]?.();
    }
}

const RootEndpoint = MockServerNode.RootEndpoint.with(TestTaskManager);

const RegistrarRootEndpoint = MockServerNode.RootEndpoint.with(TestTaskManager, ShutdownRegistrarBehavior);

async function pumpUntil(name: string, condition: () => MaybePromise<boolean>) {
    for (let i = 0; i < 10_000; i++) {
        if (await condition()) {
            return;
        }
        await MockTime.advance(1);
    }
    throw new Error(`Condition "${name}" never held`);
}

/** A phase that sets an intent then gates on it committing; the device never "has" it, so the gate parks. */
function gatePhase(peerId: string, kind: string, key: string): TaskPhase {
    return {
        name: "gate",
        run: async ctx => {
            const peer = ctx.resolvePeer(peerId);
            await ctx.setIntent(peer, kind, key, {});
            await ctx.awaitCommitted([{ peer, kind, key }]);
        },
    };
}

/** Like {@link gatePhase}, but holds the driver inside the phase while it unwinds from an abort. */
function slowUnwindGatePhase(peerId: string, kind: string, key: string, unwinding: () => Promise<void>): TaskPhase {
    return {
        name: "gate",
        run: async ctx => {
            const peer = ctx.resolvePeer(peerId);
            await ctx.setIntent(peer, kind, key, {});
            try {
                await ctx.awaitCommitted([{ peer, kind, key }]);
            } catch (e) {
                await unwinding();
                throw e;
            }
        },
    };
}

/**
 * A peer whose capacity read blocks until released, holding a task in the driver's pre-gate window
 * (admission and first persist, before a phase has built its gate).
 */
function blockingAdmissionPeer(id: string) {
    let release!: () => void;
    const blocked = new Promise<void>(resolve => (release = resolve));
    const state = { entered: false, release: () => release() };
    const peer = new FakePeer(id);
    peer.itemKind = (kind: string): ItemKind | undefined =>
        kind === "cap"
            ? {
                  kind: "cap",
                  priority: 0,
                  async apply() {},
                  async capacity() {
                      state.entered = true;
                      await blocked;
                      return { limit: 10, used: 0 };
                  },
              }
            : undefined;
    return { peer, state };
}

describe("cancel robustness", () => {
    before(() => MockTime.init());

    it("a cancel accepted before the task's first gate exists takes effect and settles", async () => {
        const environment = new Environment("test");
        const { peer, state } = blockingAdmissionPeer("pg");
        TestTaskManager.peers.set("pg", peer);
        TestTaskManager.reconcilerPeer = peer;

        SyntheticTask.plannedChangesByTag["pregate"] = [{ peerId: "pg", kind: "cap", key: "x", intent: {} }];
        SyntheticTask.phasesByTag["pregate"] = [gatePhase("pg", "groupMembership", "X")];

        const node = await MockServerNode.create(RootEndpoint, { environment, id: "cancel-pregate" });
        await node.act(a => a.get(TestTaskManager).register(SyntheticTask));
        await node.act(a => {
            const manager = a.get(TestTaskManager);
            traceRun(manager, manager.run(SyntheticTask, { tag: "pregate" }).status.runId);
        });
        await pumpUntil("admission in flight", () => state.entered);

        const cancelling = node.act(a => cancelSlot(a.get(TestTaskManager), "synthetic:pregate"));
        await pumpUntil("cancel accepted", () =>
            node.act(
                a =>
                    a.get(TestTaskManager).teardownOf(runIdOfSlot(a.get(TestTaskManager), "synthetic:pregate")!) ===
                    "cancel",
            ),
        );
        state.release();

        const handle = await MockTime.resolve(cancelling);

        // Nothing was written to the peer after the cancel was accepted, so there is nothing to revert.
        expect(peer.items[itemMapKey("groupMembership", "X")]).equals(undefined);
        expect(handle).equals(undefined);

        const status = await node.act(a => statusOfSlot(a.get(TestTaskManager), "synthetic:pregate"));
        expect(status?.state).equals("cancelled");
        expect(requireRecordFor(node.stateOf(TestTaskManager).runs, "synthetic:pregate").state).equals("cancelled");

        // The only state ever written is the cancelled one: a task whose cancel is already accepted must not be
        // stored as running, which a crash before the cancel completes would resume. Asserted on the distinct
        // states rather than the sequence, because retirement re-reads the record it just wrote.
        expect([...new Set(tracedRun("synthetic:pregate").persistedStates)]).deep.equals(["cancelled"]);

        await node.close();
    });

    it("a cancel accepted between phase context and phase run issues no device write", async () => {
        const environment = new Environment("test");
        const peer = new FakePeer("cr");
        TestTaskManager.peers.set("cr", peer);
        TestTaskManager.reconcilerPeer = peer;

        SyntheticTask.phasesByTag["ctxrace"] = [gatePhase("cr", "groupMembership", "Z")];

        const node = await MockServerNode.create(RootEndpoint, { environment, id: "cancel-ctxrace" });
        await node.act(a => a.get(TestTaskManager).register(SyntheticTask));

        let cancelling: Promise<TaskHandle | undefined> | undefined;
        TestTaskManager.atContext = manager => {
            TestTaskManager.atContext = undefined;
            cancelling = cancelSlot(manager, "synthetic:ctxrace");
        };
        try {
            await node.act(a => a.get(TestTaskManager).run(SyntheticTask, { tag: "ctxrace" }));
            await pumpUntil("cancel issued from phase context", () => cancelling !== undefined);
        } finally {
            TestTaskManager.atContext = undefined;
        }

        const handle = await MockTime.resolve(cancelling);

        expect(peer.items[itemMapKey("groupMembership", "Z")]).equals(undefined);
        expect(handle).equals(undefined);
        const status = await node.act(a => statusOfSlot(a.get(TestTaskManager), "synthetic:ctxrace"));
        expect(status?.state).equals("cancelled");

        await node.close();
    });

    it("has the revert persisted by the time cancel resolves", async () => {
        const environment = new Environment("test");
        const peer = new FakePeer("dp");
        TestTaskManager.peers.set("dp", peer);
        TestTaskManager.reconcilerPeer = peer;

        // The peer never commits, so the run is still in flight with its intent written — which is what cancel
        // applies to, and what gives the rollback something to undo.
        SyntheticTask.phasesByTag["durable"] = [gatePhase("dp", "groupMembership", "D")];

        const node = await MockServerNode.create(RootEndpoint, { environment, id: "cancel-durable" });
        await node.act(a => a.get(TestTaskManager).register(SyntheticTask));
        await node.act(a => a.get(TestTaskManager).run(SyntheticTask, { tag: "durable" }));
        await pumpUntil("intent written", () => peer.items[itemMapKey("groupMembership", "D")] !== undefined);

        const handle = await MockTime.resolve(node.act(a => cancelSlot(a.get(TestTaskManager), "synthetic:durable")));
        expect(handle?.status.revertOf).equals(
            requireRecordFor(node.stateOf(TestTaskManager).runs, "synthetic:durable").runId,
        );

        // A promised revert that is not yet durable is lost to a crash while the forward record already names it.
        const persisted = node.stateOf(TestTaskManager).runs;
        expect(requireRecordFor(persisted, "synthetic:durable").revertRunId).equals(handle?.runId);
        expect(persisted[String(handle!.runId)]).not.equals(undefined);

        await node.close();
    });

    it("refuses a re-run of an id whose cancel is still settling", async () => {
        const environment = new Environment("test");
        const peer = new FakePeer("cx");
        TestTaskManager.peers.set("cx", peer);
        TestTaskManager.reconcilerPeer = peer;

        const node = await MockServerNode.create(RootEndpoint, { environment, id: "cancel-rerun" });
        await node.act(a => a.get(TestTaskManager).register(SyntheticTask));

        // The re-run is attempted while the cancelled task unwinds, i.e. while cancel() waits on its drive. It
        // re-issues under the external id the task runs with, so only the cancel in flight can refuse it.
        let rerun: unknown = "not attempted";
        SyntheticTask.phasesByTag["cancelrerun"] = [
            slowUnwindGatePhase("cx", "groupMembership", "C", async () => {
                try {
                    rerun = await node.act(a =>
                        a.get(TestTaskManager).run(SyntheticTask, { tag: "cancelrerun" }, { externalId: "own" }),
                    );
                } catch (e) {
                    rerun = e;
                }
            }),
        ];

        await node.act(a => a.get(TestTaskManager).run(SyntheticTask, { tag: "cancelrerun" }, { externalId: "own" }));
        await pumpUntil("intent written", () => peer.items[itemMapKey("groupMembership", "C")] !== undefined);

        const handle = await MockTime.resolve(
            node.act(a => cancelSlot(a.get(TestTaskManager), "synthetic:cancelrerun")),
        );
        expect(handle?.status.revertOf).equals(
            requireRecordFor(node.stateOf(TestTaskManager).runs, "synthetic:cancelrerun").runId,
        );
        expect(rerun).instanceOf(TaskSlotDrainingError);

        const status = await node.act(a => statusOfSlot(a.get(TestTaskManager), "synthetic:cancelrerun"));
        expect(status?.state).equals("cancelled");
        await node.close();
    });

    it("refuses a cancel that cannot be recorded because shutdown intervened", async () => {
        const environment = new Environment("test");
        const peer = new FakePeer("sd");
        TestTaskManager.peers.set("sd", peer);
        TestTaskManager.reconcilerPeer = peer;

        let releaseUnwind!: () => void;
        const unwinding = new Promise<void>(resolve => (releaseUnwind = resolve));
        let unwindReached = false;
        SyntheticTask.phasesByTag["shutrace"] = [
            slowUnwindGatePhase("sd", "groupMembership", "S", () => {
                unwindReached = true;
                return unwinding;
            }),
        ];

        const node1 = await MockServerNode.create(RootEndpoint, { environment, id: "cancel-shutrace" });
        await node1.act(a => a.get(TestTaskManager).register(SyntheticTask));
        await node1.act(a => {
            const manager = a.get(TestTaskManager);
            traceRun(manager, manager.run(SyntheticTask, { tag: "shutrace" }).status.runId);
        });
        await pumpUntil("intent written", () => peer.items[itemMapKey("groupMembership", "S")] !== undefined);

        // Cancel is accepted while the node is still up, then shutdown takes over the unwind.
        const cancelling = node1.act(a => cancelSlot(a.get(TestTaskManager), "synthetic:shutrace"));
        await pumpUntil("cancel observed by the gate", () => unwindReached);

        const closing = node1.close();
        await pumpUntil("node no longer active", () => node1.construction.status !== Lifecycle.Status.Active);
        releaseUnwind();

        await expect(MockTime.resolve(cancelling)).rejectedWith(TaskManagerClosingError);
        await MockTime.resolve(closing);

        // The task keeps a resumable state: nothing claims the cancel took effect.
        const { record } = tracedRun("synthetic:shutrace");
        expect(record.state).equals("running");
        expect(record.revertRunId).equals(undefined);

        // Storage must agree: non-terminal, no dangling revert.
        const node2 = await MockServerNode.create(RootEndpoint, { environment, id: "cancel-shutrace" });
        const persisted = node2.stateOf(TestTaskManager).runs;
        expect(requireRecordFor(persisted, "synthetic:shutrace").state).equals("running");
        expect(requireRecordFor(persisted, "synthetic:shutrace").revertRunId).equals(undefined);
        expect(revertRecordOf(persisted, "synthetic:shutrace")).equals(undefined);
        await node2.close();
    });

    it("refuses a cancel whose record cannot be written because shutdown began while it queued", async () => {
        const environment = new Environment("test");
        const peer = new FakePeer("qw");
        TestTaskManager.peers.set("qw", peer);
        TestTaskManager.reconcilerPeer = peer;

        SyntheticTask.phasesByTag["queued"] = [gatePhase("qw", "groupMembership", "Q")];

        const node1 = await MockServerNode.create(RootEndpoint, { environment, id: "cancel-queued" });
        await node1.act(a => a.get(TestTaskManager).register(SyntheticTask));
        let manager!: TestTaskManager;
        await node1.act(a => {
            manager = a.get(TestTaskManager);
        });
        traceRun(manager, manager.run(SyntheticTask, { tag: "queued" }).status.runId);
        await pumpUntil("intent written", () => peer.items[itemMapKey("groupMembership", "Q")] !== undefined);

        // Hold the mutex so the cancel's write cannot run when it is enqueued, then start shutdown in that window:
        // a synchronous check before the enqueue cannot see the shutdown that begins after it.
        const release = await node1.act(a => a.get(TestTaskManager).holdPersistMutex());
        const cancelling = node1.act(a => cancelSlot(a.get(TestTaskManager), "synthetic:queued"));
        // The cancel is accepted before its write is enqueued, and the run adopts the cancelled state only once
        // that write lands — so acceptance, not state, is what says the window is open.
        await pumpUntil(
            "cancel write enqueued",
            () => manager.teardownOf(requireRunIdOfSlot(manager, "synthetic:queued")) === "cancel",
        );

        const closing = node1.close();
        await pumpUntil("node no longer active", () => node1.construction.status !== Lifecycle.Status.Active);
        release();

        await expect(MockTime.resolve(cancelling)).rejectedWith(TaskManagerClosingError);
        await MockTime.resolve(closing);

        // The refused write leaves no trace: state as it was, no rollback linked, none live, nothing rolled back.
        const { record } = tracedRun("synthetic:queued");
        expect(record.state).equals("running");
        expect(record.revertRunId).equals(undefined);
        expect(manager.tasks.map(t => t.status.slotKey)).deep.equals(["synthetic:queued"]);
        expect(peer.removeOrder).deep.equals([]);

        const node2 = await MockServerNode.create(RootEndpoint, { environment, id: "cancel-queued" });
        const persisted = node2.stateOf(TestTaskManager).runs;
        expect(requireRecordFor(persisted, "synthetic:queued").state).equals("running");
        expect(requireRecordFor(persisted, "synthetic:queued").revertRunId).equals(undefined);
        expect(revertRecordOf(persisted, "synthetic:queued")).equals(undefined);
        await node2.close();
    });

    it("does not report a crashed manager as shutting down", async () => {
        const environment = new Environment("test");
        const peer = new FakePeer("cd");
        TestTaskManager.peers.set("cd", peer);
        TestTaskManager.reconcilerPeer = peer;

        // In flight, with its intent written: cancel has to reach the write it cannot make. A finished run
        // would be refused before the crash ever mattered, and the test would prove nothing.
        SyntheticTask.phasesByTag["crashed"] = [gatePhase("cd", "groupMembership", "C")];

        const node = await MockServerNode.create(RootEndpoint, { environment, id: "cancel-crashed" });
        await node.act(a => a.get(TestTaskManager).register(SyntheticTask));
        let manager!: TestTaskManager;
        await node.act(a => {
            manager = a.get(TestTaskManager);
        });
        await node.act(a => a.get(TestTaskManager).run(SyntheticTask, { tag: "crashed" }));
        await pumpUntil("intent written", async () => peer.items[itemMapKey("groupMembership", "C")] !== undefined);

        // A crashed manager cannot record a cancel either, but it is not shutting down and a re-issue after the
        // next start is not the remedy — so it must not claim it is.
        node.construction.setStatus(Lifecycle.Status.Crashed);
        await expect(MockTime.resolve(cancelSlot(manager, "synthetic:crashed"))).rejectedWith(CrashedDependencyError);

        await node.close();
    });

    it("leaves a task that fails during shutdown resumable instead of rolling it back", async () => {
        const environment = new Environment("test");
        const peer = new FakePeer("sf");
        TestTaskManager.peers.set("sf", peer);
        TestTaskManager.reconcilerPeer = peer;

        let releasePhase!: () => void;
        const held = new Promise<void>(resolve => (releasePhase = resolve));
        let phaseEntered = false;
        SyntheticTask.phasesByTag["shutfail"] = [
            {
                name: "hold",
                run: async ctx => {
                    await ctx.setIntent(ctx.resolvePeer("sf"), "groupMembership", "F", {});
                    phaseEntered = true;
                    await held;
                },
            },
        ];

        const node = await MockServerNode.create(RootEndpoint, { environment, id: "cancel-shutfail" });
        await node.act(a => a.get(TestTaskManager).register(SyntheticTask));
        await node.act(a => {
            const manager = a.get(TestTaskManager);
            traceRun(manager, manager.run(SyntheticTask, { tag: "shutfail" }).status.runId);
        });
        await pumpUntil("phase in flight", () => phaseEntered);

        // The phase completes as shutdown drains the driver, so its next persist meets a closing endpoint.
        TestTaskManager.atShutdown = releasePhase;
        try {
            await MockTime.resolve(node.close());
        } finally {
            TestTaskManager.atShutdown = undefined;
        }

        const { record } = tracedRun("synthetic:shutfail");
        expect(record.state).equals("running");
        expect(record.revertRunId).equals(undefined);

        const node2 = await MockServerNode.create(RootEndpoint, { environment, id: "cancel-shutfail" });
        const persisted = node2.stateOf(TestTaskManager).runs;
        expect(requireRecordFor(persisted, "synthetic:shutfail").state).equals("running");
        expect(revertRecordOf(persisted, "synthetic:shutfail")).equals(undefined);
        await node2.close();
    });

    it("leaves no rollback behind when a failure state cannot be recorded", async () => {
        const environment = new Environment("test");
        const peer = new FakePeer("cf");
        TestTaskManager.peers.set("cf", peer);
        TestTaskManager.reconcilerPeer = peer;

        let releasePhase!: () => void;
        const held = new Promise<void>(resolve => (releasePhase = resolve));
        let phaseEntered = false;
        SyntheticTask.phasesByTag["failwrite"] = [
            {
                name: "touch",
                run: async ctx => {
                    await ctx.setIntent(ctx.resolvePeer("cf"), "groupMembership", "W", {});
                    phaseEntered = true;
                    await held;
                    throw new TaskFailedError("forced failure");
                },
            },
        ];

        const node = await MockServerNode.create(RootEndpoint, { environment, id: "cancel-failwrite" });
        await node.act(a => a.get(TestTaskManager).register(SyntheticTask));
        let manager!: TestTaskManager;
        await node.act(a => {
            manager = a.get(TestTaskManager);
        });
        await node.act(a => a.get(TestTaskManager).run(SyntheticTask, { tag: "failwrite" }));
        await pumpUntil("phase in flight", () => phaseEntered);

        // The task fails against a crashed node, so neither the failure nor a rollback of it can be recorded.
        node.construction.setStatus(Lifecycle.Status.Crashed);
        releasePhase();
        await pumpUntil("drive settled", () => !manager.isDriven(requireRunIdOfSlot(manager, "synthetic:failwrite")));
        // The failure was never recorded, so the run does not claim it: memory says what storage has.
        expect(requireStatusOfSlot(manager, "synthetic:failwrite").state).equals("running");

        // A rollback the record does not name must not exist: it would block every future run of the id, and
        // nothing would ever drive it.
        expect(requireStatusOfSlot(manager, "synthetic:failwrite").revertRunId).equals(undefined);
        expect(manager.tasks.map(t => t.status.slotKey)).deep.equals(["synthetic:failwrite"]);
        expect(peer.removeOrder).deep.equals([]);

        await node.close();
    });

    it("refuses a task started while the manager is shutting down", async () => {
        const environment = new Environment("test");
        const peer = new FakePeer("sb");
        TestTaskManager.peers.set("sb", peer);
        TestTaskManager.reconcilerPeer = peer;

        SyntheticTask.phasesByTag["shutstart"] = [gatePhase("sb", "groupMembership", "B")];

        const node = await MockServerNode.create(RootEndpoint, { environment, id: "cancel-shutstart" });
        await node.act(a => a.get(TestTaskManager).register(SyntheticTask));

        let started: unknown = "not attempted";
        TestTaskManager.atShutdown = manager => {
            try {
                started = manager.run(SyntheticTask, { tag: "shutstart" });
            } catch (e) {
                started = e;
            }
        };
        try {
            await MockTime.resolve(node.close());
        } finally {
            TestTaskManager.atShutdown = undefined;
        }

        expect(started).instanceOf(TaskManagerClosingError);
        expect(peer.items[itemMapKey("groupMembership", "B")]).equals(undefined);

        const node2 = await MockServerNode.create(RootEndpoint, { environment, id: "cancel-shutstart" });
        expect(recordFor(node2.stateOf(TestTaskManager).runs, "synthetic:shutstart")).equals(undefined);
        await node2.close();
    });

    it("refuses a task type registered while the manager is shutting down", async () => {
        const environment = new Environment("test");
        const peer = new FakePeer("sr");
        peer.markHas("groupMembership", "R");
        TestTaskManager.peers.set("sr", peer);
        TestTaskManager.reconcilerPeer = peer;

        SyntheticTask.phasesByTag["shutresume"] = [gatePhase("sr", "groupMembership", "R")];

        const node = await MockServerNode.create(RegistrarRootEndpoint, { environment, id: "cancel-shutresume" });
        await node.act(a => {
            // A persisted task of a type this start never registers, so nothing resumes it before shutdown.
            a.get(TestTaskManager).state.runs = {
                "1": {
                    runId: RunId(1),
                    slotKey: "synthetic:shutresume",
                    type: "synthetic",
                    params: { tag: "shutresume" },
                    phaseIndex: 0,
                    state: "running",
                    changeSet: [],
                },
            };
        });

        let registered: unknown = "not attempted";
        let liveAfterRegister = -1;
        ShutdownRegistrarBehavior.atClose = manager => {
            try {
                registered = manager.register(SyntheticTask);
            } catch (e) {
                registered = e;
            }
            liveAfterRegister = manager.tasks.length;
        };
        try {
            await MockTime.resolve(node.close());
        } finally {
            ShutdownRegistrarBehavior.atClose = undefined;
        }

        expect(registered).instanceOf(TaskManagerClosingError);
        // Resuming during teardown creates and drives a task the dispose drain may already have passed.
        expect(liveAfterRegister).equals(0);
        expect(peer.items[itemMapKey("groupMembership", "R")]).equals(undefined);

        // The refusal costs the task nothing: the next start resumes it as usual.
        const node2 = await MockServerNode.create(RegistrarRootEndpoint, { environment, id: "cancel-shutresume" });
        await node2.act(a => a.get(TestTaskManager).register(SyntheticTask));
        await pumpUntil("resumed task complete", async () => {
            const state = await node2.act(
                a => recordFor(a.get(TestTaskManager).state.runs, "synthetic:shutresume")?.state,
            );
            return state === "completed";
        });
        await node2.close();
    });

    it("shutdown suspends a task in the pre-gate window instead of failing it", async () => {
        const environment = new Environment("test");
        const { peer, state } = blockingAdmissionPeer("pd");
        TestTaskManager.peers.set("pd", peer);
        TestTaskManager.reconcilerPeer = peer;

        SyntheticTask.plannedChangesByTag["predispose"] = [{ peerId: "pd", kind: "cap", key: "x", intent: {} }];
        SyntheticTask.phasesByTag["predispose"] = [gatePhase("pd", "groupMembership", "Y")];

        const node = await MockServerNode.create(RootEndpoint, { environment, id: "cancel-predispose" });
        await node.act(a => a.get(TestTaskManager).register(SyntheticTask));
        await node.act(a => {
            const manager = a.get(TestTaskManager);
            traceRun(manager, manager.run(SyntheticTask, { tag: "predispose" }).status.runId);
        });
        await pumpUntil("admission in flight", () => state.entered);

        // Release the task into the pre-gate window as shutdown begins, before the abort pass.
        TestTaskManager.atShutdown = state.release;
        try {
            await MockTime.resolve(node.close());
        } finally {
            TestTaskManager.atShutdown = undefined;
        }

        const { record } = tracedRun("synthetic:predispose");
        expect(record.state).equals("running");
        expect(record.error).equals(undefined);
        expect(peer.items[itemMapKey("groupMembership", "Y")]).equals(undefined);

        // Suspending before the first persist means there is nothing to resume: the task is gone after a restart.
        // Shutdown cannot write state, so a task that never got that far is lost either way — but it must not be
        // recorded as failed.
        const node2 = await MockServerNode.create(RootEndpoint, { environment, id: "cancel-predispose" });
        expect(recordFor(node2.stateOf(TestTaskManager).runs, "synthetic:predispose")).equals(undefined);
        await node2.close();
    });

    it("refuses to join a run whose driver stopped before its outcome was recorded", async () => {
        const environment = new Environment("test");
        const peer = new FakePeer("settling");
        TestTaskManager.peers.set("settling", peer);
        TestTaskManager.reconcilerPeer = peer;
        SyntheticTask.phasesByTag["settling"] = [
            {
                name: "touch",
                run: async ctx => {
                    await ctx.setIntent(ctx.resolvePeer("settling"), "groupMembership", "S", {});
                },
            },
        ];

        const node = await MockServerNode.create(RootEndpoint, { environment, id: "settling-join" });
        await node.act(a => a.get(TestTaskManager).register(SyntheticTask));
        let manager!: TestTaskManager;
        await node.act(a => {
            manager = a.get(TestTaskManager);
        });
        await node.act(a => a.get(TestTaskManager).run(SyntheticTask, { tag: "settling" }, { externalId: "mine" }));

        // Storage refuses from here on, with the node still running, so the run's outcome never reaches a
        // record. Its driver stops all the same, and it keeps the slot it can no longer retire from.
        await node.act(a => a.get(TestTaskManager).closePersistMutex());
        await pumpUntil(
            "the run stops driving",
            () => manager.tasks.length === 1 && !manager.isDriven(requireRunIdOfSlot(manager, "synthetic:settling")),
        );

        // Re-issuing the same request must not be handed a run nothing is advancing.
        let refused: unknown;
        await node.act(a => {
            try {
                a.get(TestTaskManager).run(SyntheticTask, { tag: "settling" }, { externalId: "mine" });
            } catch (e) {
                refused = e;
            }
        });
        expect(refused).instanceOf(TaskSlotSettlingError);

        await node.close();
    });

    it("keeps a task driveable when the write recording its cancel is refused", async () => {
        const environment = new Environment("test");
        const peer = new FakePeer("cw");
        TestTaskManager.peers.set("cw", peer);
        TestTaskManager.reconcilerPeer = peer;

        SyntheticTask.phasesByTag["cancelwrite"] = [gatePhase("cw", "groupMembership", "W")];

        const node = await MockServerNode.create(RootEndpoint, { environment, id: "cancel-write-refused" });
        await node.act(a => a.get(TestTaskManager).register(SyntheticTask));
        let manager!: TestTaskManager;
        await node.act(a => {
            manager = a.get(TestTaskManager);
        });
        const handle = await node.act(a => a.get(TestTaskManager).run(SyntheticTask, { tag: "cancelwrite" }));

        // Wait until the phase has touched the peer, so the cancel has a changeSet to roll back.
        for (let i = 0; i < 10_000 && peer.items[itemMapKey("groupMembership", "W")] === undefined; i++) {
            await MockTime.advance(1);
        }

        // Storage refuses from here on, with the node still running: not shutdown, just a failed write.
        await node.act(a => a.get(TestTaskManager).closePersistMutex());

        await expect((async () => node.act(a => a.get(TestTaskManager).cancel(handle.runId)))()).rejected;

        // A cancel that was never recorded must leave the task exactly as it was — including its driver. The
        // abort stopped the driver and dropped the gate, so without giving both back the task would sit
        // non-terminal with nothing left to advance it, and never reach any outcome at all.
        expect(manager.get(handle.runId)?.status.state).does.not.equal("cancelled");
        expect(manager.get(handle.runId)?.status.revertRunId).equals(undefined);

        // Its driver is back. It cannot reach an outcome while storage refuses, because an outcome is only
        // adopted once it is recorded — which is the point: memory never claims one, so what it is given back
        // is responsibility for the run rather than a state.
        expect(manager.isAttached(handle.runId)).equals(true);

        await node.close();
    });

    it("leaves no trace of a run whose first write never landed, and says so on its handle", async () => {
        const environment = new Environment("test");
        const peer = new FakePeer("unwritten");
        TestTaskManager.peers.set("unwritten", peer);
        TestTaskManager.reconcilerPeer = peer;
        SyntheticTask.phasesByTag["unwritten"] = [
            {
                name: "touch",
                run: async ctx => {
                    await ctx.setIntent(ctx.resolvePeer("unwritten"), "groupMembership", "U", {});
                },
            },
        ];

        const node = await MockServerNode.create(RootEndpoint, { environment, id: "first-write-refused" });
        await node.act(a => a.get(TestTaskManager).register(SyntheticTask));
        let manager!: TestTaskManager;
        await node.act(a => {
            manager = a.get(TestTaskManager);
        });

        // One run first, so the persist mutex exists to be closed; then storage refuses before the run under
        // test has written anything at all.
        SyntheticTask.phasesByTag["warm"] = [{ name: "noop", run: async () => {} }];
        await node.act(a => a.get(TestTaskManager).run(SyntheticTask, { tag: "warm" }));
        await pumpUntil("the warm-up run retires", () => manager.tasks.length === 0);
        await node.act(a => a.get(TestTaskManager).closePersistMutex());
        const handle = await node.act(a => a.get(TestTaskManager).run(SyntheticTask, { tag: "unwritten" }));

        await pumpUntil("the run gives up", () => !manager.isAttached(handle.runId));

        // Nothing is left holding the target, and no restart could find the run.
        expect(manager.get(handle.runId)).equals(undefined);
        expect(manager.tasks).deep.equals([]);

        // The caller already holds a handle, and it says what happened rather than answering "running" forever.
        expect(handle.status.state).equals("failed");

        await node.close();
    });

    it("refuses a cancel whose run finished inside the transition window", async () => {
        const environment = new Environment("test");
        const peer = new FakePeer("iw");
        TestTaskManager.peers.set("iw", peer);
        TestTaskManager.reconcilerPeer = peer;

        // One phase that writes and returns, so the driver's next act is the write advancing past it.
        let phaseReturned = false;
        SyntheticTask.phasesByTag["inwindow"] = [
            {
                name: "touch",
                run: async ctx => {
                    await ctx.setIntent(ctx.resolvePeer("iw"), "groupMembership", "W", {});
                    phaseReturned = true;
                },
            },
        ];

        const node = await MockServerNode.create(RootEndpoint, { environment, id: "cancel-in-window" });
        await node.act(a => a.get(TestTaskManager).register(SyntheticTask));
        let manager!: TestTaskManager;
        await node.act(a => {
            manager = a.get(TestTaskManager);
        });
        const handle = await node.act(a => a.get(TestTaskManager).run(SyntheticTask, { tag: "inwindow" }));

        // The mutex is taken before the phase runs, so the write advancing the phase index queues on it. Then
        // we wait for the phase to have *returned*: the driver has passed its post-phase check on the
        // transition claim by then, and the loop top it is heading for does not consult that claim at all — so
        // a cancel accepted now finds a run that goes on to commit `completed`.
        const release = manager.holdPersistMutex();
        await pumpUntil("phase returned", () => phaseReturned);
        const cancelling = MockTime.resolve(
            node.act(async a => {
                try {
                    return await a.get(TestTaskManager).cancel(handle.runId);
                } catch (e) {
                    return e;
                }
            }),
            { macrotasks: true },
        );
        await MockTime.advance(1);
        release();

        // Refused, and refused for the right reason: a run that succeeded is not recorded as cancelled and its
        // priors are not replayed onto the device.
        expect(await cancelling).instanceOf(TaskNotInFlightError);
        expect(manager.get(handle.runId)?.status.state).equals("completed");
        expect(manager.get(handle.runId)?.status.revertRunId).equals(undefined);
        expect(revertRecordOf(node.stateOf(TestTaskManager).runs, "synthetic:inwindow")).equals(undefined);

        // `#retire` declined to release the target because the transition owned the run, so the refusal has to
        // release it. Otherwise the finished run holds its target for the life of the process.
        expect(manager.tasks.map(t => t.runId)).deep.equals([]);
        const next = await node.act(a => a.get(TestTaskManager).run(SyntheticTask, { tag: "inwindow" }));
        expect(next.runId).not.equals(handle.runId);

        await node.close();
    });

    it("leaves a retired run unchanged when its cancel cannot be recorded", async () => {
        const environment = new Environment("test");
        const peer = new FakePeer("rw");
        TestTaskManager.peers.set("rw", peer);
        TestTaskManager.reconcilerPeer = peer;

        // Completes on its own, so the run reaches a terminal state without a cancel deciding it.
        SyntheticTask.phasesByTag["retiredwrite"] = [
            {
                name: "touch",
                run: async ctx => {
                    await ctx.setIntent(ctx.resolvePeer("rw"), "groupMembership", "R", {});
                },
            },
        ];

        const node = await MockServerNode.create(RootEndpoint, { environment, id: "cancel-retired-write" });
        await node.act(a => a.get(TestTaskManager).register(SyntheticTask));
        let manager!: TestTaskManager;
        await node.act(a => {
            manager = a.get(TestTaskManager);
        });
        const handle = await node.act(a => a.get(TestTaskManager).run(SyntheticTask, { tag: "retiredwrite" }));
        await pumpUntil("the run retires", () => manager.tasks.length === 0);

        // The node crashes, so the write fails inside the state transaction — after the point where the record
        // for a retired run is re-read. A closed mutex fails earlier and would not exercise this at all.
        node.construction.setStatus(Lifecycle.Status.Crashed);
        await expect(MockTime.resolve(manager.cancel(handle.runId))).rejected;

        // The rollback was staged and then discarded, so the run must not go on naming it: a record pointing
        // at a rollback nothing created could never be rolled back again.
        expect(manager.get(handle.runId)?.status.revertRunId).equals(undefined);
        expect(manager.get(handle.runId)?.status.state).equals("completed");

        await node.close();
    });
});
