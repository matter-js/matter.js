/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { RunningTaskContext } from "#task/RunningTaskContext.js";
import { TaskDefinition, RunRecord } from "#task/Task.js";
import { TaskPhase, TaskState } from "#task/types.js";
import { RunId } from "#task/types.js";
import { FakePeer } from "./helpers.js";

const CsTask: TaskDefinition = {
    type: "cs-test",
    slotKeyFor: () => "cs-test:1",
    phases: () => new Array<TaskPhase>(),
};

function makeContext(peer: FakePeer) {
    const record = new RunRecord(RunId(1), "cs-test:1", CsTask.type, {});
    const setState = (s: TaskState) => {
        record.state = s;
    };
    const ctx = new RunningTaskContext(record, () => peer.asNode(), peer, setState);
    return { record, ctx };
}

describe("changeSet prior capture", () => {
    it("records prior undefined when no item existed", async () => {
        const peer = new FakePeer("p1");
        const { record, ctx } = makeContext(peer);
        await ctx.setIntent(peer.asNode(), "groupKey", "42", { a: 1 }, "converge");
        expect(record.changeSet).deep.equals([{ peerId: "p1", kind: "groupKey", key: "42", prior: undefined }]);
    });

    it("records prior intent+mode when an item existed", async () => {
        const peer = new FakePeer("p1");
        peer.setIntent("groupKey", "42", { old: true }, "maintain");
        const { record, ctx } = makeContext(peer);
        await ctx.setIntent(peer.asNode(), "groupKey", "42", { new: true }, "converge");
        expect(record.changeSet[0].prior).deep.equals({ intent: { old: true }, mode: "maintain" });
    });

    it("first-touch-wins: a second touch does not overwrite the recorded prior", async () => {
        const peer = new FakePeer("p1");
        const { record, ctx } = makeContext(peer);
        await ctx.setIntent(peer.asNode(), "groupKey", "42", { a: 1 });
        await ctx.setIntent(peer.asNode(), "groupKey", "42", { a: 2 });
        expect(record.changeSet.length).equals(1);
        expect(record.changeSet[0].prior).equals(undefined);
    });

    it("removeIntent is logged too", async () => {
        const peer = new FakePeer("p1");
        peer.setIntent("groupKey", "42", { old: true }, "converge");
        const { record, ctx } = makeContext(peer);
        await ctx.removeIntent(peer.asNode(), "groupKey", "42");
        expect(record.changeSet[0].prior).deep.equals({ intent: { old: true }, mode: "converge" });
    });
});
