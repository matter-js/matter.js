/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { ReconcilerBehavior } from "#ReconcilerBehavior.js";
import { TaskConflictError, TaskFailedError, TaskNotFoundError } from "#task/errors.js";
import { RotateGroupKey } from "#task/groups/RotateGroupKey.js";
import { BoundDefinition, Task, TaskDefinition } from "#task/Task.js";
import { TaskManagerBehavior } from "#task/TaskManagerBehavior.js";
import { TaskRegistry } from "#task/TaskRegistry.js";
import { RetireSeq, RunId, TaskPhase } from "#task/types.js";
import { Environment, ImplementationError } from "@matter/general";
import { ServerNode } from "@matter/node";
import { MockServerNode } from "@matter/node/testing";
import {
    cancelSlot,
    handleOfSlot,
    liveTask,
    onTerminalWrite,
    recordFor,
    requireRecordFor,
    requireStatusOfSlot,
    revertRecordOf,
    statusOfSlot,
    SyntheticTask,
} from "./helpers.js";

const RootEndpoint = MockServerNode.RootEndpoint.with(TaskManagerBehavior);

/** Exposes the driver bookkeeping a test cannot otherwise observe. */
class TracingTaskManager extends TaskManagerBehavior {
    static override readonly schema = TaskManagerBehavior.schema;

    /** True while a drive of `id` owns this id's gate and driving entries. */
    isDriven(runId: RunId): boolean {
        return this.internal.driving.has(runId) && this.internal.gates.has(runId);
    }
}

const TracingRootEndpoint = MockServerNode.RootEndpoint.with(TracingTaskManager);

async function makeNode(environment?: Environment) {
    return MockServerNode.create(RootEndpoint, { environment, id: "tm-test" });
}

async function pumpUntil(name: string, condition: () => boolean | Promise<boolean>) {
    for (let i = 0; i < 10_000; i++) {
        if (await condition()) {
            return;
        }
        await MockTime.advance(1);
    }
    throw new Error(`Condition "${name}" never held`);
}

/**
 * Advances MockTime until no run owns `slotKey` any more.
 *
 * A run turns terminal one step before it retires, so waiting for the record to read terminal would let a
 * caller act while the slot is still held — and a re-run of that slot would then be refused.
 */
async function awaitTaskDone(node: ServerNode, slotKey: string): Promise<void> {
    // Bound the poll loop so a never-terminating task fails clearly instead of spinning.
    for (let i = 0; i < 10_000; i++) {
        const retired = await node.act(a => {
            const manager = a.get(TaskManagerBehavior);
            return (
                !manager.tasks.some(t => t.status.slotKey === slotKey) &&
                recordFor(manager.state.runs, slotKey) !== undefined
            );
        });
        if (retired) return;
        await MockTime.advance(1);
    }
    throw new Error(`No run of slot ${slotKey} retired`);
}

describe("TaskManagerBehavior", () => {
    before(() => MockTime.init());

    it("requires ReconcilerBehavior automatically", async () => {
        await using node = await makeNode();
        expect(node.behaviors.has(ReconcilerBehavior)).equals(true);
    });

    it("runs a task's phases to completion and exposes status", async () => {
        await using node = await makeNode();
        const ran = new Array<string>();
        SyntheticTask.phasesByTag["ok"] = [
            {
                name: "a",
                run: async () => {
                    ran.push("a");
                },
            },
            {
                name: "b",
                run: async () => {
                    ran.push("b");
                },
            },
        ];
        await node.act(async agent => {
            agent.get(TaskManagerBehavior).register(SyntheticTask);
        });
        await node.act(agent => agent.get(TaskManagerBehavior).run(SyntheticTask, { tag: "ok" }));
        await awaitTaskDone(node, "synthetic:ok");
        expect(ran).deep.equals(["a", "b"]);
        const status = await node.act(a => statusOfSlot(a.get(TaskManagerBehavior), "synthetic:ok"));
        expect(status?.state).equals("completed");
    });

    it("keeps a handle answering for its task as the task progresses", async () => {
        await using node = await makeNode();
        SyntheticTask.phasesByTag["held"] = [{ name: "a", run: async () => {} }];
        await node.act(async agent => {
            agent.get(TaskManagerBehavior).register(SyntheticTask);
        });
        const handle = await node.act(agent => agent.get(TaskManagerBehavior).run(SyntheticTask, { tag: "held" }));
        expect(handle.status.state).equals("running");

        await awaitTaskDone(node, "synthetic:held");
        expect(handle.status.state).equals("completed");
    });

    it("refuses a definition that only shares a registered name", async () => {
        await using node = await makeNode();
        await node.act(agent => agent.get(TaskManagerBehavior).register(SyntheticTask));

        // Declares different params under a registered name. Its own type checks, so nothing stops the call
        // being written; what it must not do is hand a number to the definition that actually runs.
        const lookalike: TaskDefinition<number> = {
            type: SyntheticTask.type,
            slotKeyFor(tag) {
                return `synthetic:${tag}`;
            },
            phases() {
                return new Array<TaskPhase>();
            },
        };

        await expect((async () => node.act(agent => agent.get(TaskManagerBehavior).run(lookalike, 1)))()).rejectedWith(
            ImplementationError,
        );

        // Nothing was admitted under the name it borrowed.
        expect(await node.act(agent => agent.get(TaskManagerBehavior).tasks.length)).equals(0);
    });

    it("refuses an anonymous re-run of a live task, and re-runs a terminal one", async () => {
        await using node = await makeNode();
        let runs = 0;
        let release!: () => void;
        const blocked = new Promise<void>(resolve => (release = resolve));
        SyntheticTask.phasesByTag["dup"] = [
            {
                name: "a",
                run: async () => {
                    runs++;
                    await blocked;
                },
            },
        ];
        await node.act(agent => agent.get(TaskManagerBehavior).register(SyntheticTask));

        const h1 = await node.act(a => a.get(TaskManagerBehavior).run(SyntheticTask, { tag: "dup" }));
        await pumpUntil("first run in flight", () => runs === 1);

        try {
            // Nothing in this request identifies it as the one already running, and the id need not cover every
            // parameter, so the live task's outcome is not necessarily the outcome asked for.
            // `act` returns a MaybePromise, so normalize before asserting on the rejection.
            await expect(
                (async () => node.act(a => a.get(TaskManagerBehavior).run(SyntheticTask, { tag: "dup" })))(),
            ).rejectedWith(TaskConflictError);
            expect(runs).equals(1);
            expect(await node.act(a => a.get(TaskManagerBehavior).tasks.length)).equals(1);
        } finally {
            release();
        }
        await awaitTaskDone(node, "synthetic:dup");

        // A terminal task does not hold its id, so the request runs again under it.
        const h3 = await node.act(a => a.get(TaskManagerBehavior).run(SyntheticTask, { tag: "dup" }));
        expect(h3.runId).not.equals(h1.runId);
        expect(h3.status.slotKey).equals(h1.status.slotKey);
        await pumpUntil("re-run in flight", () => runs === 2);
        await pumpUntil("re-run complete", async () => {
            const state = await node.act(a => requireStatusOfSlot(a.get(TaskManagerBehavior), "synthetic:dup").state);
            return state === "completed";
        });
        expect(await node.act(a => a.get(TaskManagerBehavior).tasks.length)).equals(1);
    });

    it("joins a live task only for the caller re-issuing it under its own external id", async () => {
        await using node = await makeNode();
        let runs = 0;
        let release!: () => void;
        const blocked = new Promise<void>(resolve => (release = resolve));
        SyntheticTask.phasesByTag["mine"] = [
            {
                name: "a",
                run: async () => {
                    runs++;
                    await blocked;
                },
            },
        ];
        await node.act(a => a.get(TaskManagerBehavior).register(SyntheticTask));

        const first = await node.act(a =>
            a.get(TaskManagerBehavior).run(SyntheticTask, { tag: "mine" }, { externalId: "owner" }),
        );
        await pumpUntil("task in flight", () => runs === 1);

        try {
            const again = await node.act(a =>
                a.get(TaskManagerBehavior).run(SyntheticTask, { tag: "mine" }, { externalId: "owner" }),
            );
            expect(again.runId).equals(first.runId);
            expect(await node.act(a => a.get(TaskManagerBehavior).tasks.length)).equals(1);
            // The join must reach the running task, not replace it under its id: a replacement would drive the
            // phases a second time against the same peers.
            for (let i = 0; i < 20; i++) {
                await MockTime.advance(1);
            }
            expect(runs).equals(1);

            // Another caller's id is not the one the live task runs under, so it is refused rather than resolved
            // onto work that caller never asked for.
            await expect(
                (async () =>
                    node.act(a =>
                        a.get(TaskManagerBehavior).run(SyntheticTask, { tag: "mine" }, { externalId: "other" }),
                    ))(),
            ).rejectedWith(TaskConflictError);
            expect(runs).equals(1);
            expect(await node.act(a => a.get(TaskManagerBehavior).tasks.length)).equals(1);
        } finally {
            release();
        }
        await awaitTaskDone(node, "synthetic:mine");
    });

    it("looks up by external id", async () => {
        await using node = await makeNode();
        SyntheticTask.phasesByTag["ext"] = [{ name: "a", run: async () => {} }];
        await node.act(a => a.get(TaskManagerBehavior).register(SyntheticTask));
        await node.act(a => a.get(TaskManagerBehavior).run(SyntheticTask, { tag: "ext" }, { externalId: "myref" }));
        await awaitTaskDone(node, "synthetic:ext");
        const found = await node.act(a => a.get(TaskManagerBehavior).forExternalId("myref"));
        expect(found?.status.externalId).equals("myref");
    });

    it("marks a rotation non-revertible once activate begins; tasks are revertible by default", () => {
        const registry = new TaskRegistry();
        registry.register(RotateGroupKey);
        registry.register(SyntheticTask);

        const rotateParams = { groupKeySetId: 42, newEpochKey: new Uint8Array(16), rotationId: "r1" };
        const rotatableAt = (phaseIndex: number) => {
            const run = new Task(new BoundDefinition(RotateGroupKey, rotateParams), RunId(1), "rotateGroupKey:42", {
                phaseIndex,
                state: "running",
            });
            return registry.interpret(run.type, run.params).revertible(run);
        };
        expect(rotatableAt(0)).equals(true); // distribute in flight — new key dormant, revert is clean
        expect(rotatableAt(1)).equals(false); // activate in flight — new key going live, point of no return
        expect(rotatableAt(2)).equals(false); // cleanup in flight
        expect(rotatableAt(3)).equals(false); // completed

        const plain = new Task(new BoundDefinition(SyntheticTask, { tag: "x" }), RunId(1), "synthetic:x");
        expect(registry.interpret(plain.type, plain.params).revertible(plain)).equals(true);

        // The generic decline reason must not leak a specific task type's domain language.
        expect(registry.interpret("synthetic", { tag: "x" }).notRevertibleReason).does.not.contain("rotation");
        expect(registry.interpret("rotateGroupKey", rotateParams).notRevertibleReason).contains("forward-only");
    });

    it("suppresses auto-rollback for a non-revertible task but not a revertible one", async () => {
        await using node = await makeNode();

        // The phase needs a changeSet entry so a failure has something to roll back, but has no peer to
        // record one through `ctx.setIntent`. Task is concrete now, so this reaches into the live instance the
        // manager already built (as `onPersisted`/`liveTask` do elsewhere) rather than pushing via `this`.
        let changeSetTarget: Task | undefined;

        const HardFail: TaskDefinition<{ tag: string; revertible: boolean }> = {
            type: "hardFail",
            slotKeyFor(params) {
                return `hardFail:${params.tag}`;
            },
            revertible(_run, params) {
                return params.revertible;
            },
            phases() {
                return [
                    {
                        name: "touch",
                        run: async () => {
                            changeSetTarget?.changeSet.push({ peerId: "peer1", kind: "groupKey", key: "42" });
                            throw new TaskFailedError("forced hard failure");
                        },
                    },
                ];
            },
        };

        await node.act(a => a.get(TaskManagerBehavior).register(HardFail));

        await node.act(a => {
            const manager = a.get(TaskManagerBehavior);
            const handle = manager.run(HardFail, { tag: "revertible", revertible: true });
            changeSetTarget = liveTask(manager, handle.status.runId);
        });
        await awaitTaskDone(node, "hardFail:revertible");
        const revertible = await node.act(a => statusOfSlot(a.get(TaskManagerBehavior), "hardFail:revertible"));
        expect(revertible?.state).equals("failed");
        // A rollback was created, and it is a rollback OF this run — not merely "some record exists", which
        // would pass identically when nothing was rolled back at all.
        const revertRunId = revertible?.revertRunId;
        expect(typeof revertRunId).equals("number");
        const rollback = await node.act(a => a.get(TaskManagerBehavior).get(revertRunId!)?.status);
        expect(rollback?.revertOf).equals(revertible?.runId);
        expect(rollback?.slotKey).equals(`revert:${revertible?.runId}`);

        await node.act(a => {
            const manager = a.get(TaskManagerBehavior);
            const handle = manager.run(HardFail, { tag: "final", revertible: false });
            changeSetTarget = liveTask(manager, handle.status.runId);
        });
        await awaitTaskDone(node, "hardFail:final");
        const nonRevertible = await node.act(a => statusOfSlot(a.get(TaskManagerBehavior), "hardFail:final"));
        expect(nonRevertible?.state).equals("failed");
        expect(nonRevertible?.revertRunId).equals(undefined);
        expect(await node.act(a => revertRecordOf(a.get(TaskManagerBehavior).state.runs, "hardFail:final"))).equals(
            undefined,
        );
    });

    it("refuses a re-run of a slot while the previous run's driver is still unwinding", async () => {
        await using node = await MockServerNode.create(TracingRootEndpoint, { id: "tm-rerun-race" });
        let runs = 0;
        SyntheticTask.phasesByTag["race"] = [
            {
                name: "a",
                run: async () => {
                    runs++;
                },
            },
        ];
        await node.act(a => a.get(TracingTaskManager).register(SyntheticTask));
        let manager!: TracingTaskManager;
        await node.act(a => {
            manager = a.get(TracingTaskManager);
        });

        // A run turns terminal before its driver settles, and it keeps its slot until it does. A re-run
        // admitted in that window would start writing to the peer while the previous unwind is still in
        // flight, so it is refused rather than queued.
        let outcome: unknown = "hook never ran";
        await node.act(a => {
            const tm = a.get(TracingTaskManager);
            const handle = tm.run(SyntheticTask, { tag: "race" });
            onTerminalWrite(tm, handle.status.runId, () => {
                try {
                    manager.run(SyntheticTask, { tag: "race" });
                    outcome = "admitted";
                } catch (e) {
                    outcome = e;
                }
            });
        });
        await pumpUntil(
            "first run retired",
            async () => (await node.act(a => a.get(TracingTaskManager).tasks.length)) === 0,
        );

        expect(outcome).instanceOf(TaskConflictError);
        expect(runs).equals(1);
    });

    it("distinguishes an id no live task answers to from a task with nothing to roll back", async () => {
        const environment = new Environment("test");
        const node = await MockServerNode.create(RootEndpoint, { environment, id: "tm-cancel-unknown" });
        SyntheticTask.phasesByTag["nothing"] = [{ name: "a", run: async () => {} }];
        await node.act(a => a.get(TaskManagerBehavior).register(SyntheticTask));
        await node.act(a => a.get(TaskManagerBehavior).run(SyntheticTask, { tag: "nothing" }));
        await awaitTaskDone(node, "synthetic:nothing");

        // A task that touched nothing has nothing to roll back, and says so.
        expect(await node.act(a => cancelSlot(a.get(TaskManagerBehavior), "synthetic:nothing"))).equals(undefined);

        // An id nobody is holding work under is a different answer, not the same one.
        await expect(
            (async () => node.act(a => cancelSlot(a.get(TaskManagerBehavior), "synthetic:never-existed")))(),
        ).rejectedWith(TaskNotFoundError);
        expect(await node.act(a => handleOfSlot(a.get(TaskManagerBehavior), "synthetic:never-existed"))).equals(
            undefined,
        );

        // A run that retired before a restart still answers. This is the contract this increment changes: it
        // used to vanish, because only non-terminal records were resumed and lookup read only the live table.
        await node.act(a => {
            a.get(TaskManagerBehavior).state.runs = {
                "7": {
                    runId: RunId(7),
                    slotKey: "synthetic:orphan",
                    type: "synthetic",
                    params: { tag: "orphan" },
                    phaseIndex: 1,
                    state: "cancelled",
                    retireSeq: RetireSeq(1),
                    changeSet: [],
                },
            };
        });
        await node.close();

        const node2 = await MockServerNode.create(RootEndpoint, { environment, id: "tm-cancel-unknown" });
        await node2.act(a => a.get(TaskManagerBehavior).register(SyntheticTask));

        expect(await node2.act(a => a.get(TaskManagerBehavior).get(RunId(7))?.status.state)).equals("cancelled");
        // Its changeSet is empty, so there is nothing to roll back — a different answer from "never existed".
        expect(await node2.act(a => a.get(TaskManagerBehavior).cancel(RunId(7)))).equals(undefined);
        await expect((async () => node2.act(a => a.get(TaskManagerBehavior).cancel(RunId(999))))()).rejectedWith(
            TaskNotFoundError,
        );
        await node2.close();
    });

    it("persists task records in nonvolatile state", async () => {
        await using node = await makeNode();
        SyntheticTask.phasesByTag["persist"] = [{ name: "a", run: async () => {} }];
        await node.act(a => a.get(TaskManagerBehavior).register(SyntheticTask));
        await node.act(a => a.get(TaskManagerBehavior).run(SyntheticTask, { tag: "persist" }));
        await awaitTaskDone(node, "synthetic:persist");
        const persisted = node.stateOf(TaskManagerBehavior).runs;
        const record = requireRecordFor(persisted, "synthetic:persist");
        // One record, stored under the identity of the run that wrote it.
        expect(Object.keys(persisted)).deep.equals([String(record.runId)]);
        expect(record.state).equals("completed");
    });
});
