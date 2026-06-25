/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { ReconcilerBehavior } from "#ReconcilerBehavior.js";
import { TaskManagerBehavior } from "#task/TaskManagerBehavior.js";
import { Environment } from "@matter/general";
import { MockServerNode } from "@matter/node/testing";
import { SyntheticTask } from "./helpers.js";

const RootEndpoint = MockServerNode.RootEndpoint.with(TaskManagerBehavior);

async function makeNode(environment?: Environment) {
    return MockServerNode.create(RootEndpoint, { environment, id: "tm-test" });
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
        await MockTime.resolve(node.act(agent => agent.get(TaskManagerBehavior).run("synthetic", { tag: "ok" })));
        expect(ran).deep.equals(["a", "b"]);
        const status = await node.act(a => a.get(TaskManagerBehavior).get("synthetic:ok")?.status);
        expect(status?.state).equals("completed");
    });

    it("dedups by deterministic id (re-run returns the same task)", async () => {
        await using node = await makeNode();
        SyntheticTask.phasesByTag["dup"] = [{ name: "a", run: async () => {} }];
        await node.act(agent => agent.get(TaskManagerBehavior).register("synthetic", SyntheticTask));
        const h1 = await MockTime.resolve(node.act(a => a.get(TaskManagerBehavior).run("synthetic", { tag: "dup" })));
        const h2 = await MockTime.resolve(node.act(a => a.get(TaskManagerBehavior).run("synthetic", { tag: "dup" })));
        expect(h1.id).equals(h2.id);
        const count = await node.act(a => a.get(TaskManagerBehavior).tasks.length);
        expect(count).equals(1);
    });

    it("looks up by external id", async () => {
        await using node = await makeNode();
        SyntheticTask.phasesByTag["ext"] = [{ name: "a", run: async () => {} }];
        await node.act(a => a.get(TaskManagerBehavior).register("synthetic", SyntheticTask));
        await MockTime.resolve(
            node.act(a => a.get(TaskManagerBehavior).run("synthetic", { tag: "ext" }, { externalId: "myref" })),
        );
        const found = await node.act(a => a.get(TaskManagerBehavior).get("myref"));
        expect(found?.status.externalId).equals("myref");
    });

    it("persists task records in nonvolatile state", async () => {
        await using node = await makeNode();
        SyntheticTask.phasesByTag["persist"] = [{ name: "a", run: async () => {} }];
        await node.act(a => a.get(TaskManagerBehavior).register("synthetic", SyntheticTask));
        await MockTime.resolve(node.act(a => a.get(TaskManagerBehavior).run("synthetic", { tag: "persist" })));
        const persisted = node.stateOf(TaskManagerBehavior).tasks;
        expect(Object.keys(persisted)).deep.equals(["synthetic:persist"]);
        expect(persisted["synthetic:persist"].state).equals("completed");
    });
});
