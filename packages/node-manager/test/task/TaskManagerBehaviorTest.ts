/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { ReconcilerBehavior } from "#ReconcilerBehavior.js";
import { TaskFailedError } from "#task/errors.js";
import { RotateGroupKey } from "#task/groups/RotateGroupKey.js";
import { Task } from "#task/Task.js";
import { TaskManagerBehavior } from "#task/TaskManagerBehavior.js";
import { TaskPhase } from "#task/types.js";
import { Environment } from "@matter/general";
import { ServerNode } from "@matter/node";
import { MockServerNode } from "@matter/node/testing";
import { SyntheticTask } from "./helpers.js";

const RootEndpoint = MockServerNode.RootEndpoint.with(TaskManagerBehavior);

async function makeNode(environment?: Environment) {
    return MockServerNode.create(RootEndpoint, { environment, id: "tm-test" });
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

    it("dedups by deterministic id (re-run returns the same task)", async () => {
        await using node = await makeNode();
        SyntheticTask.phasesByTag["dup"] = [{ name: "a", run: async () => {} }];
        await node.act(agent => agent.get(TaskManagerBehavior).register("synthetic", SyntheticTask));
        const h1 = await node.act(a => a.get(TaskManagerBehavior).run("synthetic", { tag: "dup" }));
        await awaitTaskDone(node, "synthetic:dup");
        const h2 = await node.act(a => a.get(TaskManagerBehavior).run("synthetic", { tag: "dup" }));
        expect(h1.id).equals(h2.id);
        const count = await node.act(a => a.get(TaskManagerBehavior).tasks.length);
        expect(count).equals(1);
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

    it("marks a rotation non-revertible once cleanup begins; tasks are revertible by default", () => {
        const rotatableAt = (phaseIndex: number) =>
            new RotateGroupKey(
                "rotateGroupKey:42",
                { groupKeySetId: 42, newEpochKey: new Uint8Array(16) },
                { phaseIndex, state: "running" },
            ).revertible;
        expect(rotatableAt(0)).equals(true); // before distribute
        expect(rotatableAt(1)).equals(true); // activate
        expect(rotatableAt(2)).equals(false); // cleanup in flight — point of no return
        expect(rotatableAt(3)).equals(false); // completed

        expect(new SyntheticTask("synthetic:x", { tag: "x" }).revertible).equals(true);

        // The generic decline reason must not leak a specific task type's domain language.
        expect(new SyntheticTask("synthetic:x", { tag: "x" }).notRevertibleReason).does.not.contain("rotation");
        expect(
            new RotateGroupKey("rotateGroupKey:42", { groupKeySetId: 42, newEpochKey: new Uint8Array(16) })
                .notRevertibleReason,
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
