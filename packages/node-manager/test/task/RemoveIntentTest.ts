/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { RunningTaskContext } from "#task/RunningTaskContext.js";
import { BoundDefinition, Task, TaskDefinition } from "#task/Task.js";
import { TaskPhase, TaskState } from "#task/types.js";
import { RunId } from "#task/types.js";
import { itemMapKey } from "@matter/node";
import { FakePeer } from "./helpers.js";

const CtxTask: TaskDefinition = {
    type: "ctx-test",
    slotKeyFor: () => "ctx-test:1",
    phases: () => new Array<TaskPhase>(),
};

function makeContext(peer: FakePeer, referenced: boolean) {
    const task = new Task(new BoundDefinition(CtxTask, {}), RunId(1), "ctx-test:1");
    const setState = (s: TaskState) => {
        task.progress.state = s;
    };
    (peer as unknown as { itemKind(kind: string): unknown }).itemKind = () => ({
        isReferenced: () => referenced,
    });
    const ctx = new RunningTaskContext(task, () => peer.asNode(), peer, setState);
    return { task, ctx };
}

describe("removeIntentIfUnreferenced", () => {
    it("removes and returns true when not referenced", async () => {
        const peer = new FakePeer("p1");
        peer.addItem("groupKey", "42", "committed");
        const { ctx } = makeContext(peer, false);
        const removed = await ctx.removeIntentIfUnreferenced(peer.asNode(), "groupKey", "42");
        expect(removed).equals(true);
        expect(peer.removeOrder).contains(itemMapKey("groupKey", "42"));
    });

    it("skips and returns false when still referenced", async () => {
        const peer = new FakePeer("p1");
        peer.addItem("groupKey", "42", "committed");
        const { ctx } = makeContext(peer, true);
        const removed = await ctx.removeIntentIfUnreferenced(peer.asNode(), "groupKey", "42");
        expect(removed).equals(false);
        expect(peer.removeOrder.length).equals(0);
    });
});
