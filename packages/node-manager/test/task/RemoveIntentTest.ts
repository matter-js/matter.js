/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { TaskFailedError } from "#task/errors.js";
import { RunningTaskContext } from "#task/RunningTaskContext.js";
import { TaskDefinition, RunRecord } from "#task/Task.js";
import { TaskPhase, TaskState } from "#task/types.js";
import { RunId } from "#task/types.js";
import { itemMapKey } from "@matter/node";
import { kindOf, FakePeer } from "./helpers.js";

const CtxTask: TaskDefinition = {
    type: "ctx-test",
    slotKeyFor: () => "ctx-test:1",
    phases: () => new Array<TaskPhase>(),
};

function makeContext(peer: FakePeer, referenced: boolean) {
    const record = new RunRecord(RunId(1), "ctx-test:1", CtxTask.type, {});
    const setState = (s: TaskState) => {
        record.state = s;
    };
    peer.kindResolver = kind => kindOf(kind, { isReferenced: () => referenced });
    const ctx = new RunningTaskContext(record, () => peer.asNode(), peer, setState);
    return { record, ctx };
}

describe("removeIntentIfUnreferenced", () => {
    it("removes and returns true when not referenced", async () => {
        const peer = new FakePeer("p1");
        peer.addItem("groupKey", "42", "committed");
        const { ctx } = makeContext(peer, false);
        const removed = await ctx.removeIntentIfUnreferenced(peer.asNode(), kindOf("groupKey"), "42");
        expect(removed).equals(true);
        expect(peer.removeOrder).contains(itemMapKey("groupKey", "42"));
    });

    it("skips and returns false when still referenced", async () => {
        const peer = new FakePeer("p1");
        peer.addItem("groupKey", "42", "committed");
        const { ctx } = makeContext(peer, true);
        const removed = await ctx.removeIntentIfUnreferenced(peer.asNode(), kindOf("groupKey"), "42");
        expect(removed).equals(false);
        expect(peer.removeOrder.length).equals(0);
    });
});

describe("a kind the reconciler does not own", () => {
    /** Reconciles nothing, as a build that never registered the kind a task names would not. */
    function contextWithoutKinds(peer: FakePeer) {
        const record = new RunRecord(RunId(1), "ctx-test:1", CtxTask.type, {});
        peer.kindResolver = () => undefined;
        return {
            record,
            ctx: new RunningTaskContext(
                record,
                () => peer.asNode(),
                peer,
                () => {},
            ),
        };
    }

    it("fails the run rather than writing an intent nothing will converge", async () => {
        const peer = new FakePeer("p1");
        const { ctx, record } = contextWithoutKinds(peer);
        await expect(ctx.setIntent(peer.asNode(), kindOf("groupKey"), "42", { v: 1 })).rejectedWith(
            TaskFailedError,
            /no item kind "groupKey" is registered/,
        );
        expect(peer.items[itemMapKey("groupKey", "42")]).equals(undefined);
        // Nothing reached a device, so the run has nothing to undo and nothing to report as written.
        expect(record.changeSet).deep.equals([]);
        expect(record.wrote).equals(false);
    });

    it("refuses every verb that takes a kind, not only the ones that write", async () => {
        const peer = new FakePeer("p1");
        peer.addItem("groupKey", "42", "committed");
        const { ctx } = contextWithoutKinds(peer);
        const node = peer.asNode();
        const kind = kindOf("groupKey");

        // Each verb is a door of its own: a task reaching an unregistered kind through any of them acts on an
        // item no reconciler will converge, and the read verbs are how a phase decides to write.
        expect(() => ctx.itemAbsent(node, kind, "42")).throws(TaskFailedError);
        expect(() => ctx.intentOf(node, kind, "42")).throws(TaskFailedError);
        expect(() => ctx.peersWithIntent(kind, "42")).throws(TaskFailedError);
        await expect(ctx.removeIntent(node, kind, "42")).rejectedWith(TaskFailedError);
        await expect(ctx.removeIntentIfUnreferenced(node, kind, "42")).rejectedWith(TaskFailedError);
        await expect(ctx.awaitCommitted([{ peer: node, kind, key: "42" }])).rejectedWith(TaskFailedError);

        expect(peer.items[itemMapKey("groupKey", "42")]).not.equals(undefined);
    });
});
