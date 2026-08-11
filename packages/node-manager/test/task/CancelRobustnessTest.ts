/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { ReconcilerBehavior } from "#ReconcilerBehavior.js";
import { TaskConflictError, TaskManagerClosingError } from "#task/errors.js";
import { TaskPersistence } from "#task/Task.js";
import { TaskHandle, TaskManagerBehavior } from "#task/TaskManagerBehavior.js";
import { TaskPhase, TaskState } from "#task/types.js";
import { CrashedDependencyError, Environment, Lifecycle, MaybePromise } from "@matter/general";
import { Behavior, ClientNode, ItemKind, itemMapKey } from "@matter/node";
import { MockServerNode } from "@matter/node/testing";
import { FakePeer, SyntheticTask } from "./helpers.js";

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

    /** True once cancel() has accepted the request, before it settles. */
    isCancelling(id: string): boolean {
        return this.internal.cancelling.has(id);
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

/** SyntheticTask that keeps its instances reachable, so a test can inspect task state after the node is gone. */
class TracedTask extends SyntheticTask {
    static instances = new Array<TracedTask>();

    /** The state of every record written for this task, in order. */
    readonly persistedStates = new Array<TaskState>();

    constructor(id: string, params: { tag: string }, persisted?: Partial<TaskPersistence>) {
        super(id, params, persisted);
        TracedTask.instances.push(this);
    }

    override toPersistence(): TaskPersistence {
        const record = super.toPersistence();
        this.persistedStates.push(record.state);
        return record;
    }
    static instance(id: string): TracedTask {
        const found = TracedTask.instances.filter(t => t.id === id);
        expect(found.length).equals(1);
        return found[0];
    }
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
        await node.act(a => a.get(TestTaskManager).register("synthetic", TracedTask));
        await node.act(a => a.get(TestTaskManager).run("synthetic", { tag: "pregate" }));
        await pumpUntil("admission in flight", () => state.entered);

        const cancelling = node.act(a => a.get(TestTaskManager).cancel("synthetic:pregate"));
        await pumpUntil("cancel accepted", () =>
            node.act(a => a.get(TestTaskManager).isCancelling("synthetic:pregate")),
        );
        state.release();

        const handle = await MockTime.resolve(cancelling);

        // Nothing was written to the peer after the cancel was accepted, so there is nothing to revert.
        expect(peer.items[itemMapKey("groupMembership", "X")]).equals(undefined);
        expect(handle).equals(undefined);

        const status = await node.act(a => a.get(TestTaskManager).get("synthetic:pregate")?.status);
        expect(status?.state).equals("cancelled");
        expect(node.stateOf(TestTaskManager).tasks["synthetic:pregate"].state).equals("cancelled");

        // The only record ever written is the cancelled one: a task whose cancel is already accepted must not be
        // stored as running, which a crash before the cancel completes would resume.
        expect(TracedTask.instance("synthetic:pregate").persistedStates).deep.equals(["cancelled"]);

        await node.close();
    });

    it("a cancel accepted between phase context and phase run issues no device write", async () => {
        const environment = new Environment("test");
        const peer = new FakePeer("cr");
        TestTaskManager.peers.set("cr", peer);
        TestTaskManager.reconcilerPeer = peer;

        SyntheticTask.phasesByTag["ctxrace"] = [gatePhase("cr", "groupMembership", "Z")];

        const node = await MockServerNode.create(RootEndpoint, { environment, id: "cancel-ctxrace" });
        await node.act(a => a.get(TestTaskManager).register("synthetic", SyntheticTask));

        let cancelling: Promise<TaskHandle | undefined> | undefined;
        TestTaskManager.atContext = manager => {
            TestTaskManager.atContext = undefined;
            cancelling = manager.cancel("synthetic:ctxrace");
        };
        try {
            await node.act(a => a.get(TestTaskManager).run("synthetic", { tag: "ctxrace" }));
            await pumpUntil("cancel issued from phase context", () => cancelling !== undefined);
        } finally {
            TestTaskManager.atContext = undefined;
        }

        const handle = await MockTime.resolve(cancelling);

        expect(peer.items[itemMapKey("groupMembership", "Z")]).equals(undefined);
        expect(handle).equals(undefined);
        const status = await node.act(a => a.get(TestTaskManager).get("synthetic:ctxrace")?.status);
        expect(status?.state).equals("cancelled");

        await node.close();
    });

    it("has the revert persisted by the time cancel resolves", async () => {
        const environment = new Environment("test");
        const peer = new FakePeer("dp");
        TestTaskManager.peers.set("dp", peer);
        TestTaskManager.reconcilerPeer = peer;
        peer.markHas("groupMembership", "D");

        SyntheticTask.phasesByTag["durable"] = [gatePhase("dp", "groupMembership", "D")];

        const node = await MockServerNode.create(RootEndpoint, { environment, id: "cancel-durable" });
        await node.act(a => a.get(TestTaskManager).register("synthetic", SyntheticTask));
        await node.act(a => a.get(TestTaskManager).run("synthetic", { tag: "durable" }));
        await pumpUntil("task complete", async () => {
            const state = await node.act(a => a.get(TestTaskManager).state.tasks["synthetic:durable"]?.state);
            return state === "completed";
        });

        const handle = await MockTime.resolve(node.act(a => a.get(TestTaskManager).cancel("synthetic:durable")));
        expect(handle?.id).equals("revert:synthetic:durable");

        // A promised revert that is not yet durable is lost to a crash while the forward record already names it.
        const persisted = node.stateOf(TestTaskManager).tasks;
        expect(persisted["synthetic:durable"].revertTaskId).equals("revert:synthetic:durable");
        expect(persisted["revert:synthetic:durable"]).not.equals(undefined);

        await node.close();
    });

    it("refuses a re-run of an id whose cancel is still settling", async () => {
        const environment = new Environment("test");
        const peer = new FakePeer("cx");
        TestTaskManager.peers.set("cx", peer);
        TestTaskManager.reconcilerPeer = peer;

        const node = await MockServerNode.create(RootEndpoint, { environment, id: "cancel-rerun" });
        await node.act(a => a.get(TestTaskManager).register("synthetic", SyntheticTask));

        // The re-run is attempted while the cancelled task unwinds, i.e. while cancel() waits on its drive.
        let rerun: unknown = "not attempted";
        SyntheticTask.phasesByTag["cancelrerun"] = [
            slowUnwindGatePhase("cx", "groupMembership", "C", async () => {
                try {
                    rerun = await node.act(a => a.get(TestTaskManager).run("synthetic", { tag: "cancelrerun" }));
                } catch (e) {
                    rerun = e;
                }
            }),
        ];

        await node.act(a => a.get(TestTaskManager).run("synthetic", { tag: "cancelrerun" }));
        await pumpUntil("intent written", () => peer.items[itemMapKey("groupMembership", "C")] !== undefined);

        const handle = await MockTime.resolve(node.act(a => a.get(TestTaskManager).cancel("synthetic:cancelrerun")));
        expect(handle?.id).equals("revert:synthetic:cancelrerun");
        expect(rerun).instanceOf(TaskConflictError);

        const status = await node.act(a => a.get(TestTaskManager).get("synthetic:cancelrerun")?.status);
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
        await node1.act(a => a.get(TestTaskManager).register("synthetic", TracedTask));
        await node1.act(a => a.get(TestTaskManager).run("synthetic", { tag: "shutrace" }));
        await pumpUntil("intent written", () => peer.items[itemMapKey("groupMembership", "S")] !== undefined);

        // Cancel is accepted while the node is still up, then shutdown takes over the unwind.
        const cancelling = node1.act(a => a.get(TestTaskManager).cancel("synthetic:shutrace"));
        await pumpUntil("cancel observed by the gate", () => unwindReached);

        const closing = node1.close();
        await pumpUntil("node no longer active", () => node1.construction.status !== Lifecycle.Status.Active);
        releaseUnwind();

        await expect(MockTime.resolve(cancelling)).rejectedWith(TaskManagerClosingError);
        await MockTime.resolve(closing);

        // The task keeps a resumable state: nothing claims the cancel took effect.
        const task = TracedTask.instance("synthetic:shutrace");
        expect(task.progress.state).equals("running");
        expect(task.revertTaskId).equals(undefined);

        // Storage must agree: non-terminal, no dangling revert.
        const node2 = await MockServerNode.create(RootEndpoint, { environment, id: "cancel-shutrace" });
        const persisted = node2.stateOf(TestTaskManager).tasks;
        expect(persisted["synthetic:shutrace"].state).equals("running");
        expect(persisted["synthetic:shutrace"].revertTaskId).equals(undefined);
        expect(persisted["revert:synthetic:shutrace"]).equals(undefined);
        await node2.close();
    });

    it("does not report a crashed manager as shutting down", async () => {
        const environment = new Environment("test");
        const peer = new FakePeer("cd");
        TestTaskManager.peers.set("cd", peer);
        TestTaskManager.reconcilerPeer = peer;
        peer.markHas("groupMembership", "C");

        SyntheticTask.phasesByTag["crashed"] = [gatePhase("cd", "groupMembership", "C")];

        const node = await MockServerNode.create(RootEndpoint, { environment, id: "cancel-crashed" });
        await node.act(a => a.get(TestTaskManager).register("synthetic", SyntheticTask));
        let manager!: TestTaskManager;
        await node.act(a => {
            manager = a.get(TestTaskManager);
        });
        await node.act(a => a.get(TestTaskManager).run("synthetic", { tag: "crashed" }));
        await pumpUntil("task complete", async () => {
            const state = await node.act(a => a.get(TestTaskManager).state.tasks["synthetic:crashed"]?.state);
            return state === "completed";
        });

        // A crashed manager cannot record a cancel either, but it is not shutting down and a re-issue after the
        // next start is not the remedy — so it must not claim it is.
        node.construction.setStatus(Lifecycle.Status.Crashed);
        await expect(MockTime.resolve(manager.cancel("synthetic:crashed"))).rejectedWith(CrashedDependencyError);

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
        await node.act(a => a.get(TestTaskManager).register("synthetic", TracedTask));
        await node.act(a => a.get(TestTaskManager).run("synthetic", { tag: "shutfail" }));
        await pumpUntil("phase in flight", () => phaseEntered);

        // The phase completes as shutdown drains the driver, so its next persist meets a closing endpoint.
        TestTaskManager.atShutdown = releasePhase;
        try {
            await MockTime.resolve(node.close());
        } finally {
            TestTaskManager.atShutdown = undefined;
        }

        const task = TracedTask.instance("synthetic:shutfail");
        expect(task.progress.state).equals("running");
        expect(task.revertTaskId).equals(undefined);

        const node2 = await MockServerNode.create(RootEndpoint, { environment, id: "cancel-shutfail" });
        const persisted = node2.stateOf(TestTaskManager).tasks;
        expect(persisted["synthetic:shutfail"].state).equals("running");
        expect(persisted["revert:synthetic:shutfail"]).equals(undefined);
        await node2.close();
    });

    it("refuses a task started while the manager is shutting down", async () => {
        const environment = new Environment("test");
        const peer = new FakePeer("sb");
        TestTaskManager.peers.set("sb", peer);
        TestTaskManager.reconcilerPeer = peer;

        SyntheticTask.phasesByTag["shutstart"] = [gatePhase("sb", "groupMembership", "B")];

        const node = await MockServerNode.create(RootEndpoint, { environment, id: "cancel-shutstart" });
        await node.act(a => a.get(TestTaskManager).register("synthetic", SyntheticTask));

        let started: unknown = "not attempted";
        TestTaskManager.atShutdown = manager => {
            try {
                started = manager.run("synthetic", { tag: "shutstart" });
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
        expect(node2.stateOf(TestTaskManager).tasks["synthetic:shutstart"]).equals(undefined);
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
            a.get(TestTaskManager).state.tasks = {
                "synthetic:shutresume": {
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
                registered = manager.register("synthetic", SyntheticTask);
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
        await node2.act(a => a.get(TestTaskManager).register("synthetic", SyntheticTask));
        await pumpUntil("resumed task complete", async () => {
            const state = await node2.act(a => a.get(TestTaskManager).state.tasks["synthetic:shutresume"]?.state);
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
        await node.act(a => a.get(TestTaskManager).register("synthetic", TracedTask));
        await node.act(a => a.get(TestTaskManager).run("synthetic", { tag: "predispose" }));
        await pumpUntil("admission in flight", () => state.entered);

        // Release the task into the pre-gate window as shutdown begins, before the abort pass.
        TestTaskManager.atShutdown = state.release;
        try {
            await MockTime.resolve(node.close());
        } finally {
            TestTaskManager.atShutdown = undefined;
        }

        const task = TracedTask.instance("synthetic:predispose");
        expect(task.progress.state).equals("running");
        expect(task.error).equals(undefined);
        expect(peer.items[itemMapKey("groupMembership", "Y")]).equals(undefined);

        // Suspending before the first persist means there is nothing to resume: the task is gone after a restart.
        // Shutdown cannot write state, so a task that never got that far is lost either way — but it must not be
        // recorded as failed.
        const node2 = await MockServerNode.create(RootEndpoint, { environment, id: "cancel-predispose" });
        expect(node2.stateOf(TestTaskManager).tasks["synthetic:predispose"]).equals(undefined);
        await node2.close();
    });
});
