/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { ReconcilerBehavior } from "#ReconcilerBehavior.js";
import { RunningTaskContext } from "#task/RunningTaskContext.js";
import { Task } from "#task/Task.js";
import { TaskState } from "#task/types.js";
import { FakePeer } from "./helpers.js";

class CsTask extends Task {
    override readonly type = "cs-test";
    override get phases() {
        return [];
    }
}

function makeContext(peer: FakePeer) {
    const task = new CsTask("cs-test:1", {});
    const setState = (s: TaskState) => {
        task.progress.state = s;
    };
    const ctx = new RunningTaskContext(task, () => peer.asNode(), peer as unknown as ReconcilerBehavior, setState);
    return { task, ctx };
}

describe("changeSet prior capture", () => {
    it("records prior undefined when no item existed", async () => {
        const peer = new FakePeer("p1");
        const { task, ctx } = makeContext(peer);
        await ctx.setIntent(peer.asNode(), "groupKey", "42", { a: 1 }, "converge");
        expect(task.changeSet).deep.equals([{ peerId: "p1", kind: "groupKey", key: "42", prior: undefined }]);
    });

    it("records prior intent+mode when an item existed", async () => {
        const peer = new FakePeer("p1");
        peer.setIntent("groupKey", "42", { old: true }, "maintain");
        const { task, ctx } = makeContext(peer);
        await ctx.setIntent(peer.asNode(), "groupKey", "42", { new: true }, "converge");
        expect(task.changeSet[0].prior).deep.equals({ intent: { old: true }, mode: "maintain" });
    });

    it("first-touch-wins: a second touch does not overwrite the recorded prior", async () => {
        const peer = new FakePeer("p1");
        const { task, ctx } = makeContext(peer);
        await ctx.setIntent(peer.asNode(), "groupKey", "42", { a: 1 });
        await ctx.setIntent(peer.asNode(), "groupKey", "42", { a: 2 });
        expect(task.changeSet.length).equals(1);
        expect(task.changeSet[0].prior).equals(undefined);
    });

    it("removeIntent is logged too", async () => {
        const peer = new FakePeer("p1");
        peer.setIntent("groupKey", "42", { old: true }, "converge");
        const { task, ctx } = makeContext(peer);
        await ctx.removeIntent(peer.asNode(), "groupKey", "42");
        expect(task.changeSet[0].prior).deep.equals({ intent: { old: true }, mode: "converge" });
    });
});
