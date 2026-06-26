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

class GateTask extends Task {
    override readonly type = "gate-test";
    override get phases() {
        return [];
    }
}

function makeContext(peer: FakePeer) {
    const task = new GateTask("gate-test:1", {});
    const states = new Array<TaskState>();
    const setState = (s: TaskState) => {
        task.progress.state = s;
        states.push(s);
    };
    const ctx = new RunningTaskContext(task, () => peer.asNode(), peer as unknown as ReconcilerBehavior, setState);
    return { task, ctx, states };
}

describe("TaskContext gates", () => {
    before(() => MockTime.init());

    it("resolves immediately when the predicate already holds", async () => {
        const peer = new FakePeer("p1");
        peer.addItem("groupMembership", "1", "committed");
        const { ctx } = makeContext(peer);

        await ctx.awaitCommitted([{ peer: peer.asNode(), kind: "groupMembership", key: "1" }]);
    });

    it("waits, then resolves when itemChanged fires after a reconcile commits", async () => {
        const peer = new FakePeer("p1");
        peer.addItem("groupMembership", "1", "pending");
        const { ctx } = makeContext(peer);

        const gate = ctx.awaitCommitted([{ peer: peer.asNode(), kind: "groupMembership", key: "1" }]);

        // Let the initial evaluate settle so the gate has attached its observers.
        await MockTime.resolve(Promise.resolve());

        // Predicate is false; the gate parks on observers. Make the device "have" the item so the next
        // verify-reconcile commits it, then nudge with an itemChanged event.
        peer.markHas("groupMembership", "1");
        peer.setState("groupMembership", "1", "pending");

        await MockTime.resolve(gate);

        // A settled gate must not retain its peer observers.
        expect(peer.itemChanged.isObserved).equals(false);
        expect(peer.subscriptionStatusChanged.isObserved).equals(false);
    });

    it("parks while a relevant node is unreachable, resumes on reachability change", async () => {
        const peer = new FakePeer("p1");
        peer.addItem("groupMembership", "1", "pending");
        peer.markHas("groupMembership", "1");
        peer.setReachable(false);
        const { ctx, task, states } = makeContext(peer);

        const gate = ctx.awaitCommitted([{ peer: peer.asNode(), kind: "groupMembership", key: "1" }]);

        await MockTime.resolve(Promise.resolve());
        expect(task.progress.state).equals("parked");

        peer.setReachable(true);

        await MockTime.resolve(gate);
        expect(states).contains("parked");
        expect(states).contains("running");
        expect(task.progress.state).equals("running");
    });
});
