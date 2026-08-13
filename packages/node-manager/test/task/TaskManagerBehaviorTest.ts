/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { ReconcilerBehavior } from "#ReconcilerBehavior.js";
import { TaskConflictError, TaskFailedError, TaskNotFoundError } from "#task/errors.js";
import { RotateGroupKey } from "#task/groups/RotateGroupKey.js";
import { Task, TaskPersistence } from "#task/Task.js";
import { TaskManagerBehavior } from "#task/TaskManagerBehavior.js";
import { TaskPhase } from "#task/types.js";
import { Environment } from "@matter/general";
import { ServerNode } from "@matter/node";
import { MockServerNode } from "@matter/node/testing";
import { SyntheticTask } from "./helpers.js";

const RootEndpoint = MockServerNode.RootEndpoint.with(TaskManagerBehavior);

/** Exposes the driver bookkeeping a test cannot otherwise observe. */
class TracingTaskManager extends TaskManagerBehavior {
    static override readonly schema = TaskManagerBehavior.schema;

    /** True while a drive of `id` owns this id's gate and driving entries. */
    isDriven(id: string): boolean {
        return this.internal.driving.has(id) && this.internal.gates.has(id);
    }
}

/**
 * Fires a hook while its terminal record is being serialized for storage, i.e. after the task is terminal but
 * before its drive promise settles.
 */
class HookedTask extends SyntheticTask {
    static atTerminalWrite?: () => void;

    override toPersistence(): TaskPersistence {
        const record = super.toPersistence();
        if (record.state === "completed") {
            const hook = HookedTask.atTerminalWrite;
            HookedTask.atTerminalWrite = undefined;
            hook?.();
        }
        return record;
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
 * Advances MockTime until the persisted state for the task reaches a terminal state.
 * Polling persisted state (state.tasks[id]) ensures #drive's final #persist has completed.
 */
async function awaitTaskDone(node: ServerNode, id: string): Promise<void> {
    // Bound the poll loop so a never-terminating task fails clearly instead of spinning.
    for (let i = 0; i < 10_000; i++) {
        const state = await node.act(a => a.get(TaskManagerBehavior).state.tasks[id]?.state);
        if (state === "completed" || state === "failed") return;
        await MockTime.advance(1);
    }
    throw new Error(`Task ${id} did not reach a terminal state`);
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
            agent.get(TaskManagerBehavior).register("synthetic", SyntheticTask);
        });
        await node.act(agent => agent.get(TaskManagerBehavior).run("synthetic", { tag: "ok" }));
        await awaitTaskDone(node, "synthetic:ok");
        expect(ran).deep.equals(["a", "b"]);
        const status = await node.act(a => a.get(TaskManagerBehavior).get("synthetic:ok")?.status);
        expect(status?.state).equals("completed");
    });

    it("keeps a handle answering for its task as the task progresses", async () => {
        await using node = await makeNode();
        SyntheticTask.phasesByTag["held"] = [{ name: "a", run: async () => {} }];
        await node.act(async agent => {
            agent.get(TaskManagerBehavior).register("synthetic", SyntheticTask);
        });
        const handle = await node.act(agent => agent.get(TaskManagerBehavior).run("synthetic", { tag: "held" }));
        expect(handle.status.state).equals("running");

        await awaitTaskDone(node, "synthetic:held");
        expect(handle.status.state).equals("completed");
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
        await node.act(agent => agent.get(TaskManagerBehavior).register("synthetic", SyntheticTask));

        const h1 = await node.act(a => a.get(TaskManagerBehavior).run("synthetic", { tag: "dup" }));
        await pumpUntil("first run in flight", () => runs === 1);

        try {
            // Nothing in this request identifies it as the one already running, and the id need not cover every
            // parameter, so the live task's outcome is not necessarily the outcome asked for.
            // `act` returns a MaybePromise, so normalize before asserting on the rejection.
            await expect(
                (async () => node.act(a => a.get(TaskManagerBehavior).run("synthetic", { tag: "dup" })))(),
            ).rejectedWith(TaskConflictError);
            expect(runs).equals(1);
            expect(await node.act(a => a.get(TaskManagerBehavior).tasks.length)).equals(1);
        } finally {
            release();
        }
        await awaitTaskDone(node, "synthetic:dup");

        // A terminal task does not hold its id, so the request runs again under it.
        const h3 = await node.act(a => a.get(TaskManagerBehavior).run("synthetic", { tag: "dup" }));
        expect(h3.id).equals(h1.id);
        await pumpUntil("re-run in flight", () => runs === 2);
        await pumpUntil("re-run complete", async () => {
            const state = await node.act(a => a.get(TaskManagerBehavior).get("synthetic:dup")?.status.state);
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
        await node.act(a => a.get(TaskManagerBehavior).register("synthetic", SyntheticTask));

        const first = await node.act(a =>
            a.get(TaskManagerBehavior).run("synthetic", { tag: "mine" }, { externalId: "owner" }),
        );
        await pumpUntil("task in flight", () => runs === 1);

        try {
            const again = await node.act(a =>
                a.get(TaskManagerBehavior).run("synthetic", { tag: "mine" }, { externalId: "owner" }),
            );
            expect(again.id).equals(first.id);
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
                        a.get(TaskManagerBehavior).run("synthetic", { tag: "mine" }, { externalId: "other" }),
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
        await node.act(a => a.get(TaskManagerBehavior).register("synthetic", SyntheticTask));
        await node.act(a => a.get(TaskManagerBehavior).run("synthetic", { tag: "ext" }, { externalId: "myref" }));
        await awaitTaskDone(node, "synthetic:ext");
        const found = await node.act(a => a.get(TaskManagerBehavior).get("myref"));
        expect(found?.status.externalId).equals("myref");
    });

    it("marks a rotation non-revertible once activate begins; tasks are revertible by default", () => {
        const rotatableAt = (phaseIndex: number) =>
            new RotateGroupKey(
                "rotateGroupKey:42:r1",
                { groupKeySetId: 42, newEpochKey: new Uint8Array(16), rotationId: "r1" },
                { phaseIndex, state: "running" },
            ).revertible;
        expect(rotatableAt(0)).equals(true); // distribute in flight — new key dormant, revert is clean
        expect(rotatableAt(1)).equals(false); // activate in flight — new key going live, point of no return
        expect(rotatableAt(2)).equals(false); // cleanup in flight
        expect(rotatableAt(3)).equals(false); // completed

        expect(new SyntheticTask("synthetic:x", { tag: "x" }).revertible).equals(true);

        // The generic decline reason must not leak a specific task type's domain language.
        expect(new SyntheticTask("synthetic:x", { tag: "x" }).notRevertibleReason).does.not.contain("rotation");
        expect(
            new RotateGroupKey("rotateGroupKey:42:r1", {
                groupKeySetId: 42,
                newEpochKey: new Uint8Array(16),
                rotationId: "r1",
            }).notRevertibleReason,
        ).contains("forward-only");
    });

    it("suppresses auto-rollback for a non-revertible task but not a revertible one", async () => {
        await using node = await makeNode();

        class HardFail extends Task<{ tag: string; revertible: boolean }> {
            override readonly type = "hardFail";
            override get revertible() {
                return this.params.revertible;
            }
            override get phases(): TaskPhase[] {
                return [
                    {
                        name: "touch",
                        run: async () => {
                            this.changeSet.push({ peerId: "peer1", kind: "groupKey", key: "42" });
                            throw new TaskFailedError("forced hard failure");
                        },
                    },
                ];
            }
            static override idFor(params: { tag: string }) {
                return `hardFail:${params.tag}`;
            }
        }

        await node.act(a => a.get(TaskManagerBehavior).register("hardFail", HardFail));

        await node.act(a => a.get(TaskManagerBehavior).run("hardFail", { tag: "revertible", revertible: true }));
        await awaitTaskDone(node, "hardFail:revertible");
        const revertible = await node.act(a => a.get(TaskManagerBehavior).get("hardFail:revertible")?.status);
        expect(revertible?.state).equals("failed");
        expect(revertible?.revertTaskId).equals("revert:hardFail:revertible");

        await node.act(a => a.get(TaskManagerBehavior).run("hardFail", { tag: "final", revertible: false }));
        await awaitTaskDone(node, "hardFail:final");
        const nonRevertible = await node.act(a => a.get(TaskManagerBehavior).get("hardFail:final")?.status);
        expect(nonRevertible?.state).equals("failed");
        expect(nonRevertible?.revertTaskId).equals(undefined);
        expect(await node.act(a => a.get(TaskManagerBehavior).state.tasks["revert:hardFail:final"])).equals(undefined);
    });

    it("keeps driver bookkeeping of a re-run started while the previous drive still settles", async () => {
        await using node = await MockServerNode.create(TracingRootEndpoint, { id: "tm-rerun-race" });
        let release!: () => void;
        const blocked = new Promise<void>(resolve => (release = resolve));
        let holding = false;
        let runs = 0;
        SyntheticTask.phasesByTag["race"] = [
            {
                name: "a",
                run: async () => {
                    if (++runs > 1) {
                        holding = true;
                        await blocked;
                    }
                },
            },
        ];
        await node.act(a => a.get(TracingTaskManager).register("synthetic", HookedTask));
        let manager!: TracingTaskManager;
        await node.act(a => {
            manager = a.get(TracingTaskManager);
        });

        // Re-run from inside the terminal write of the first run: its drive promise has not settled yet.
        HookedTask.atTerminalWrite = () => manager.run("synthetic", { tag: "race" });
        try {
            await node.act(a => a.get(TracingTaskManager).run("synthetic", { tag: "race" }));
            await pumpUntil("re-run in flight", () => holding);

            expect(await node.act(a => a.get(TracingTaskManager).isDriven("synthetic:race"))).equals(true);
        } finally {
            HookedTask.atTerminalWrite = undefined;
            release();
        }
    });

    it("distinguishes an id no live task answers to from a task with nothing to roll back", async () => {
        const environment = new Environment("test");
        const node = await MockServerNode.create(RootEndpoint, { environment, id: "tm-cancel-unknown" });
        SyntheticTask.phasesByTag["nothing"] = [{ name: "a", run: async () => {} }];
        await node.act(a => a.get(TaskManagerBehavior).register("synthetic", SyntheticTask));
        await node.act(a => a.get(TaskManagerBehavior).run("synthetic", { tag: "nothing" }));
        await awaitTaskDone(node, "synthetic:nothing");

        // A task that touched nothing has nothing to roll back, and says so.
        expect(await node.act(a => a.get(TaskManagerBehavior).cancel("synthetic:nothing"))).equals(undefined);

        // An id nobody is holding work under is a different answer, not the same one.
        await expect(
            (async () => node.act(a => a.get(TaskManagerBehavior).cancel("synthetic:never-existed")))(),
        ).rejectedWith(TaskNotFoundError);
        expect(await node.act(a => a.get(TaskManagerBehavior).get("synthetic:never-existed"))).equals(undefined);

        // So is a terminal record from a previous start: it is not resumed, so no live task answers to its id.
        await node.act(a => {
            a.get(TaskManagerBehavior).state.tasks = {
                "synthetic:orphan": {
                    type: "synthetic",
                    params: { tag: "orphan" },
                    phaseIndex: 1,
                    state: "cancelled",
                    changeSet: [],
                },
            };
        });
        await node.close();

        const node2 = await MockServerNode.create(RootEndpoint, { environment, id: "tm-cancel-unknown" });
        await node2.act(a => a.get(TaskManagerBehavior).register("synthetic", SyntheticTask));
        await expect(
            (async () => node2.act(a => a.get(TaskManagerBehavior).cancel("synthetic:orphan")))(),
        ).rejectedWith(TaskNotFoundError);
        await node2.close();
    });

    it("persists task records in nonvolatile state", async () => {
        await using node = await makeNode();
        SyntheticTask.phasesByTag["persist"] = [{ name: "a", run: async () => {} }];
        await node.act(a => a.get(TaskManagerBehavior).register("synthetic", SyntheticTask));
        await node.act(a => a.get(TaskManagerBehavior).run("synthetic", { tag: "persist" }));
        await awaitTaskDone(node, "synthetic:persist");
        const persisted = node.stateOf(TaskManagerBehavior).tasks;
        expect(Object.keys(persisted)).deep.equals(["synthetic:persist"]);
        expect(persisted["synthetic:persist"].state).equals("completed");
    });
});
