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

/** Retention limit lowered so eviction is observable without driving dozens of tasks. */
class RetentionTaskManager extends TaskManagerBehavior {
    static override readonly schema = TaskManagerBehavior.schema;

    /** True while a drive of `id` owns this id's gate and driving entries. */
    isDriven(id: string): boolean {
        return this.internal.driving.has(id) && this.internal.gates.has(id);
    }

    protected override get terminalRetention() {
        return 2;
    }
}

/** A controller that keeps no finished history at all. */
class ZeroRetentionTaskManager extends TaskManagerBehavior {
    static override readonly schema = TaskManagerBehavior.schema;
    protected override get terminalRetention() {
        return 0;
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

const RetentionRootEndpoint = MockServerNode.RootEndpoint.with(RetentionTaskManager);

const ZeroRetentionRootEndpoint = MockServerNode.RootEndpoint.with(ZeroRetentionTaskManager);

function terminalRecord(tag: string): TaskPersistence {
    return { type: "synthetic", params: { tag }, phaseIndex: 1, state: "completed", changeSet: [] };
}

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
async function awaitTaskDone(
    node: ServerNode,
    id: string,
    type: typeof TaskManagerBehavior = TaskManagerBehavior,
): Promise<void> {
    // Bound the poll loop so a never-terminating task fails clearly instead of spinning.
    for (let i = 0; i < 10_000; i++) {
        const state = await node.act(a => a.get(type).state.tasks[id]?.state);
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

    it("dedups an in-flight task by deterministic id, and re-runs a terminal one", async () => {
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

        // A live, non-terminal task with identical parameters dedups.
        try {
            const h2 = await node.act(a => a.get(TaskManagerBehavior).run("synthetic", { tag: "dup" }));
            expect(h2.id).equals(h1.id);
            expect(runs).equals(1);
            expect(await node.act(a => a.get(TaskManagerBehavior).tasks.length)).equals(1);
        } finally {
            release();
        }
        await awaitTaskDone(node, "synthetic:dup");

        // A terminal task no longer dedups: the requested work runs again under the same deterministic id.
        const h3 = await node.act(a => a.get(TaskManagerBehavior).run("synthetic", { tag: "dup" }));
        expect(h3.id).equals(h1.id);
        await pumpUntil("re-run in flight", () => runs === 2);
        await pumpUntil("re-run complete", async () => {
            const state = await node.act(a => a.get(TaskManagerBehavior).get("synthetic:dup")?.status.state);
            return state === "completed";
        });
        expect(await node.act(a => a.get(TaskManagerBehavior).tasks.length)).equals(1);
    });

    it("rejects a re-run of a live task whose parameters differ", async () => {
        await using node = await makeNode();
        let runs = 0;
        let release!: () => void;
        const blocked = new Promise<void>(resolve => (release = resolve));

        class PartialIdTask extends Task<{ tag: string; value: number }> {
            override readonly type = "partialId";
            override get phases(): TaskPhase[] {
                return [
                    {
                        name: "hold",
                        run: async () => {
                            runs++;
                            await blocked;
                        },
                    },
                ];
            }
            // The id covers only `tag`, so `value` can differ between requests for the same id.
            static override idFor(params: { tag: string }) {
                return `partialId:${params.tag}`;
            }
        }

        await node.act(a => a.get(TaskManagerBehavior).register("partialId", PartialIdTask));
        const h1 = await node.act(a => a.get(TaskManagerBehavior).run("partialId", { tag: "p", value: 1 }));
        await pumpUntil("task in flight", () => runs === 1);

        try {
            // `act` returns a MaybePromise, so normalize before asserting on the rejection.
            await expect(
                (async () => node.act(a => a.get(TaskManagerBehavior).run("partialId", { tag: "p", value: 2 })))(),
            ).rejectedWith(TaskConflictError);

            // An identical request stays idempotent.
            const h2 = await node.act(a => a.get(TaskManagerBehavior).run("partialId", { tag: "p", value: 1 }));
            expect(h2.id).equals(h1.id);
            expect(runs).equals(1);
        } finally {
            release();
        }
        await awaitTaskDone(node, "partialId:p");
    });

    it("retains only the most recent terminal tasks", async () => {
        await using node = await MockServerNode.create(RetentionRootEndpoint, { id: "tm-retention" });
        SyntheticTask.phasesByTag["r1"] = [{ name: "a", run: async () => {} }];
        SyntheticTask.phasesByTag["r2"] = [{ name: "a", run: async () => {} }];
        SyntheticTask.phasesByTag["r3"] = [{ name: "a", run: async () => {} }];
        await node.act(a => a.get(RetentionTaskManager).register("synthetic", SyntheticTask));

        for (const tag of ["r1", "r2", "r3"]) {
            await node.act(a => a.get(RetentionTaskManager).run("synthetic", { tag }));
            await awaitTaskDone(node, `synthetic:${tag}`, RetentionTaskManager);
        }

        const ids = await node.act(a => a.get(RetentionTaskManager).tasks.map(t => t.id));
        expect([...ids].sort()).deep.equals(["synthetic:r2", "synthetic:r3"]);
        expect(await node.act(a => a.get(RetentionTaskManager).get("synthetic:r1"))).equals(undefined);
        expect(Object.keys(node.stateOf(RetentionTaskManager).tasks).sort()).deep.equals([
            "synthetic:r2",
            "synthetic:r3",
        ]);
    });

    it("keeps storage bounded for a controller that retains no finished history", async () => {
        await using node = await MockServerNode.create(ZeroRetentionRootEndpoint, { id: "tm-retention-zero" });
        for (const tag of ["z1", "z2", "z3"]) {
            SyntheticTask.phasesByTag[tag] = [{ name: "a", run: async () => {} }];
        }
        await node.act(a => a.get(ZeroRetentionTaskManager).register("synthetic", SyntheticTask));

        for (const tag of ["z1", "z2", "z3"]) {
            await node.act(a => a.get(ZeroRetentionTaskManager).run("synthetic", { tag }));
            await awaitTaskDone(node, `synthetic:${tag}`, ZeroRetentionTaskManager);
        }

        // A record the current write also stores cannot be forgotten by that write, so it stays in the retention
        // queue and a later write prunes it. Otherwise every finished task leaks into storage forever.
        expect(Object.keys(node.stateOf(ZeroRetentionTaskManager).tasks)).deep.equals(["synthetic:z3"]);
    });

    it("prunes inherited terminal records down to the retention bound at startup", async () => {
        const environment = new Environment("test");
        const node1 = await MockServerNode.create(RetentionRootEndpoint, { environment, id: "tm-retention-inherit" });
        await node1.act(a => {
            a.get(RetentionTaskManager).state.tasks = {
                "synthetic:i1": terminalRecord("i1"),
                "synthetic:i2": terminalRecord("i2"),
                "synthetic:i3": terminalRecord("i3"),
                "synthetic:i4": terminalRecord("i4"),
            };
        });
        await node1.close();

        const node2 = await MockServerNode.create(RetentionRootEndpoint, { environment, id: "tm-retention-inherit" });
        await node2.close();

        // Asserted only against freshly loaded storage: an in-memory prune would leave a start that retains far
        // more with all four records again.
        const node3 = await MockServerNode.create(RootEndpoint, { environment, id: "tm-retention-inherit" });
        expect(Object.keys(node3.stateOf(TaskManagerBehavior).tasks).sort()).deep.equals([
            "synthetic:i3",
            "synthetic:i4",
        ]);
        await node3.close();
    });

    it("looks up by external id", async () => {
        await using node = await makeNode();
        SyntheticTask.phasesByTag["ext"] = [{ name: "a", run: async () => {} }];
        await node.act(a => a.get(TaskManagerBehavior).register("synthetic", SyntheticTask));
        await node.act(a => a.get(TaskManagerBehavior).run("synthetic", { tag: "ext" }, { externalId: "myref" }));
        await awaitTaskDone(node, "synthetic:ext");
        const found = await node.act(a => a.get(TaskManagerBehavior).get("myref"));
        expect(found?.status.externalIds).deep.equals(["myref"]);
    });

    it("resolves the external id of every caller that deduped onto one task", async () => {
        await using node = await makeNode();
        let release!: () => void;
        const blocked = new Promise<void>(resolve => (release = resolve));
        let runs = 0;
        SyntheticTask.phasesByTag["shared"] = [
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
            a.get(TaskManagerBehavior).run("synthetic", { tag: "shared" }, { externalId: "first" }),
        );
        await pumpUntil("task in flight", () => runs === 1);
        try {
            const second = await node.act(a =>
                a.get(TaskManagerBehavior).run("synthetic", { tag: "shared" }, { externalId: "second" }),
            );
            expect(second.id).equals(first.id);
            expect(runs).equals(1);

            // Both callers hold a working handle on the one task that does their work.
            expect(second.status.externalIds).deep.equals(["first", "second"]);
            expect(await node.act(a => a.get(TaskManagerBehavior).get("first")?.id)).equals(first.id);
            expect(await node.act(a => a.get(TaskManagerBehavior).get("second")?.id)).equals(first.id);

            // A caller re-issuing its own request under its own id is idempotent, not a conflict with itself.
            const again = await node.act(a =>
                a.get(TaskManagerBehavior).run("synthetic", { tag: "shared" }, { externalId: "second" }),
            );
            expect(again.id).equals(first.id);
            expect(again.status.externalIds).deep.equals(["first", "second"]);
            expect(runs).equals(1);
        } finally {
            release();
        }
        await awaitTaskDone(node, "synthetic:shared");
    });

    it("reuses an external id retained by finished work for the live task that claims it", async () => {
        await using node = await makeNode();
        let release!: () => void;
        const blocked = new Promise<void>(resolve => (release = resolve));
        SyntheticTask.phasesByTag["was"] = [{ name: "a", run: async () => {} }];
        SyntheticTask.phasesByTag["now"] = [{ name: "a", run: async () => await blocked }];
        await node.act(a => a.get(TaskManagerBehavior).register("synthetic", SyntheticTask));

        await node.act(a => a.get(TaskManagerBehavior).run("synthetic", { tag: "was" }, { externalId: "nightly" }));
        await awaitTaskDone(node, "synthetic:was");

        // Retained history keeps the id it ran under, but the caller means its current request by it.
        await node.act(a => a.get(TaskManagerBehavior).run("synthetic", { tag: "now" }, { externalId: "nightly" }));
        try {
            expect(await node.act(a => a.get(TaskManagerBehavior).get("nightly")?.id)).equals("synthetic:now");
        } finally {
            release();
        }
        await awaitTaskDone(node, "synthetic:now");

        // Both runs are retained under the id now, and it still means the one that ran most recently.
        expect(await node.act(a => a.get(TaskManagerBehavior).get("nightly")?.id)).equals("synthetic:now");
    });

    it("refuses an external id that already names other live work", async () => {
        await using node = await makeNode();
        let release!: () => void;
        const blocked = new Promise<void>(resolve => (release = resolve));
        let runs = 0;
        for (const tag of ["taken", "other"]) {
            SyntheticTask.phasesByTag[tag] = [
                {
                    name: "a",
                    run: async () => {
                        runs++;
                        await blocked;
                    },
                },
            ];
        }
        await node.act(a => a.get(TaskManagerBehavior).register("synthetic", SyntheticTask));
        await node.act(a => a.get(TaskManagerBehavior).run("synthetic", { tag: "taken" }, { externalId: "ref" }));
        await pumpUntil("task in flight", () => runs === 1);

        try {
            // An id that resolves to someone else's task would let this caller observe and cancel the wrong work.
            await expect(
                (async () =>
                    node.act(a =>
                        a.get(TaskManagerBehavior).run("synthetic", { tag: "other" }, { externalId: "ref" }),
                    ))(),
            ).rejectedWith(TaskConflictError);

            // Nor may it shadow a live task's own id.
            await expect(
                (async () =>
                    node.act(a =>
                        a
                            .get(TaskManagerBehavior)
                            .run("synthetic", { tag: "other" }, { externalId: "synthetic:taken" }),
                    ))(),
            ).rejectedWith(TaskConflictError);

            // The refused requests started nothing.
            expect(runs).equals(1);
            expect(await node.act(a => a.get(TaskManagerBehavior).tasks.map(t => t.id))).deep.equals([
                "synthetic:taken",
            ]);
        } finally {
            release();
        }
        await awaitTaskDone(node, "synthetic:taken");
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

    it("prunes terminal records inherited from a previous start", async () => {
        const environment = new Environment("test");
        SyntheticTask.phasesByTag["p1"] = [{ name: "a", run: async () => {} }];
        SyntheticTask.phasesByTag["p2"] = [{ name: "a", run: async () => {} }];
        SyntheticTask.phasesByTag["p3"] = [{ name: "a", run: async () => {} }];

        const node1 = await MockServerNode.create(RetentionRootEndpoint, { environment, id: "tm-retention-restart" });
        await node1.act(a => a.get(RetentionTaskManager).register("synthetic", SyntheticTask));
        for (const tag of ["p1", "p2"]) {
            await node1.act(a => a.get(RetentionTaskManager).run("synthetic", { tag }));
            await awaitTaskDone(node1, `synthetic:${tag}`, RetentionTaskManager);
        }
        expect(Object.keys(node1.stateOf(RetentionTaskManager).tasks).length).equals(2);
        await node1.close();

        const node2 = await MockServerNode.create(RetentionRootEndpoint, { environment, id: "tm-retention-restart" });
        await node2.act(a => a.get(RetentionTaskManager).register("synthetic", SyntheticTask));
        await node2.act(a => a.get(RetentionTaskManager).run("synthetic", { tag: "p3" }));
        await awaitTaskDone(node2, "synthetic:p3", RetentionTaskManager);

        expect(Object.keys(node2.stateOf(RetentionTaskManager).tasks).sort()).deep.equals([
            "synthetic:p2",
            "synthetic:p3",
        ]);
        await node2.close();
    });

    it("does not evict a re-run that reuses the id of a retired task", async () => {
        await using node = await MockServerNode.create(RetentionRootEndpoint, { id: "tm-retention-rerun" });
        let release!: () => void;
        const blocked = new Promise<void>(resolve => (release = resolve));
        let holding = false;
        let runs = 0;
        SyntheticTask.phasesByTag["k1"] = [
            {
                name: "a",
                run: async () => {
                    runs++;
                    if (holding) {
                        await blocked;
                    }
                },
            },
        ];
        for (const tag of ["k2", "k3", "k4"]) {
            SyntheticTask.phasesByTag[tag] = [{ name: "a", run: async () => {} }];
        }
        await node.act(a => a.get(RetentionTaskManager).register("synthetic", SyntheticTask));

        // Fill the retention queue with two terminal tasks.
        for (const tag of ["k1", "k2"]) {
            await node.act(a => a.get(RetentionTaskManager).run("synthetic", { tag }));
            await awaitTaskDone(node, `synthetic:${tag}`, RetentionTaskManager);
        }

        holding = true;
        await node.act(a => a.get(RetentionTaskManager).run("synthetic", { tag: "k1" }));
        await pumpUntil("re-run in flight", () => runs === 2);

        try {
            // Two more terminal tasks refill the queue, so the second one's write evicts.
            for (const tag of ["k3", "k4"]) {
                await node.act(a => a.get(RetentionTaskManager).run("synthetic", { tag }));
                await awaitTaskDone(node, `synthetic:${tag}`, RetentionTaskManager);
            }
            expect(node.stateOf(RetentionTaskManager).tasks["synthetic:k2"]).equals(undefined);

            const status = await node.act(a => a.get(RetentionTaskManager).get("synthetic:k1")?.status);
            expect(status?.state).equals("running");
            expect(node.stateOf(RetentionTaskManager).tasks["synthetic:k1"]).not.equals(undefined);
        } finally {
            release();
        }
    });

    it("keeps driver bookkeeping of a re-run started while the previous drive still settles", async () => {
        await using node = await MockServerNode.create(RetentionRootEndpoint, { id: "tm-rerun-race" });
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
        await node.act(a => a.get(RetentionTaskManager).register("synthetic", HookedTask));
        let manager!: RetentionTaskManager;
        await node.act(a => {
            manager = a.get(RetentionTaskManager);
        });

        // Re-run from inside the terminal write of the first run: its drive promise has not settled yet.
        HookedTask.atTerminalWrite = () => manager.run("synthetic", { tag: "race" });
        try {
            await node.act(a => a.get(RetentionTaskManager).run("synthetic", { tag: "race" }));
            await pumpUntil("re-run in flight", () => holding);

            expect(await node.act(a => a.get(RetentionTaskManager).isDriven("synthetic:race"))).equals(true);
        } finally {
            HookedTask.atTerminalWrite = undefined;
            release();
        }
    });

    it("keeps a re-run that took over a retired id alive through a later eviction", async () => {
        await using node = await MockServerNode.create(RetentionRootEndpoint, { id: "tm-rerun-evict" });
        let release!: () => void;
        const blocked = new Promise<void>(resolve => (release = resolve));
        let holding = false;
        let runs = 0;
        SyntheticTask.phasesByTag["own"] = [
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
        for (const tag of ["e1", "e2"]) {
            SyntheticTask.phasesByTag[tag] = [{ name: "a", run: async () => {} }];
        }
        await node.act(a => a.get(RetentionTaskManager).register("synthetic", HookedTask));
        let manager!: RetentionTaskManager;
        await node.act(a => {
            manager = a.get(RetentionTaskManager);
        });

        HookedTask.atTerminalWrite = () => manager.run("synthetic", { tag: "own" });
        try {
            await node.act(a => a.get(RetentionTaskManager).run("synthetic", { tag: "own" }));
            await pumpUntil("re-run in flight", () => holding);

            // The terminal record wrote while the re-run already owned the id, so the id must not be queued for
            // eviction: dropping it would take the live re-run and its record with it.
            for (const tag of ["e1", "e2"]) {
                await node.act(a => a.get(RetentionTaskManager).run("synthetic", { tag }));
                await awaitTaskDone(node, `synthetic:${tag}`, RetentionTaskManager);
            }

            const status = await node.act(a => a.get(RetentionTaskManager).get("synthetic:own")?.status);
            expect(status?.state).equals("running");
            expect(node.stateOf(RetentionTaskManager).tasks["synthetic:own"]).not.equals(undefined);
        } finally {
            HookedTask.atTerminalWrite = undefined;
            release();
        }
    });

    it("distinguishes an unretained task from a task with nothing to roll back", async () => {
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

        // So is a rollback the task recorded but retention has since forgotten.
        await node.act(a => {
            a.get(TaskManagerBehavior).state.tasks = {
                "synthetic:orphan": {
                    type: "synthetic",
                    params: { tag: "orphan" },
                    phaseIndex: 1,
                    state: "cancelled",
                    changeSet: [],
                    revertTaskId: "revert:synthetic:orphan",
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
