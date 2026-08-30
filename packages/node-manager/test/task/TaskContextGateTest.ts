/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { TaskCancelledSignal, TaskFailedError } from "#task/errors.js";
import { GateControl, RunningTaskContext } from "#task/RunningTaskContext.js";
import { Task, TaskDefinition } from "#task/Task.js";
import { TaskPhase, TaskState } from "#task/types.js";
import { RunId } from "#task/types.js";
import { Observable } from "@matter/general";
import { ClientNode, itemMapKey } from "@matter/node";
import { FakePeer } from "./helpers.js";

const GateTask: TaskDefinition = {
    type: "gate-test",
    slotKeyFor: () => "gate-test:1",
    phases: () => new Array<TaskPhase>(),
};

function makeContext(peer: FakePeer, gate?: GateControl, setState?: (state: TaskState) => void) {
    const task = new Task(GateTask, RunId(1), "gate-test:1", {});
    const states = new Array<TaskState>();
    const record =
        setState ??
        ((s: TaskState) => {
            task.progress.state = s;
            states.push(s);
        });
    const ctx = new RunningTaskContext(task, () => peer.asNode(), peer, record, gate);
    return { task, ctx, states };
}

/** The manager's gate control, reduced to what a gate reads: a recorded abort and a wake for it. */
function makeGate() {
    let aborted: unknown;
    const wake = new Observable<[]>();
    const control: GateControl = {
        aborted: () => aborted,
        onAbort: w => {
            wake.on(w);
            return () => wake.off(w);
        },
    };
    return {
        control,
        abort: (reason: unknown) => {
            aborted = reason;
            wake.emit();
        },
    };
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

    it("observes a change announced while its own first evaluation is still running", async () => {
        /** Announces the device's acceptance during the gate's first reconcile pass, and never again. */
        class LateAnnouncePeer extends FakePeer {
            passes = 0;
            override async reconcile(node: ClientNode, options?: { verify?: boolean }) {
                if (++this.passes > 1) {
                    await super.reconcile(node, options);
                    return;
                }
                // The item stays pending, so this pass cannot satisfy the gate; the announcement is the only
                // wakeup the gate will ever get.
                this.markHas("groupMembership", "1");
                this.itemChanged.emit(this.items[itemMapKey("groupMembership", "1")]);
            }
        }

        const peer = new LateAnnouncePeer("p1");
        peer.addItem("groupMembership", "1", "pending");
        const { ctx } = makeContext(peer);

        let settled = false;
        const gate = ctx
            .awaitCommitted([{ peer: peer.asNode(), kind: "groupMembership", key: "1" }])
            .then(() => (settled = true));

        // Bounded so a gate that lost the announcement fails here rather than hanging.
        for (let i = 0; i < 100 && !settled; i++) {
            await MockTime.advance(1);
        }
        expect(settled).equals(true);
        await MockTime.resolve(gate);
        expect(peer.passes).greaterThan(1);
        expect(peer.items[itemMapKey("groupMembership", "1")]?.status.state).equals("committed");
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

    it("fails once its own evaluation drops the awaited item after an unrecoverable rejection", async () => {
        const peer = new FakePeer("p1");
        peer.addItem("groupMembership", "1", "pending");
        peer.markRejects("groupMembership", "1");
        const { ctx, task } = makeContext(peer);

        const gate = ctx.awaitCommitted([{ peer: peer.asNode(), kind: "groupMembership", key: "1" }]);

        await expect(MockTime.resolve(gate)).rejectedWith(TaskFailedError);
        expect(peer.items[itemMapKey("groupMembership", "1")]).equals(undefined);
        expect(task.progress.state).does.not.equal("completed");
        // The failure takes two reconcile passes: one to record the rejection, the next to give up on the item.
        expect(peer.reconciles).greaterThan(1);
    });

    it("waits through a recoverable commit failure instead of failing the task", async () => {
        const peer = new FakePeer("p1");
        peer.addItem("groupMembership", "1", "pending");
        peer.markFailsRecoverably("groupMembership", "1", 2);
        peer.markHas("groupMembership", "1");
        const { ctx, task } = makeContext(peer);

        let settled = false;
        let failure: unknown;
        const gate = ctx.awaitCommitted([{ peer: peer.asNode(), kind: "groupMembership", key: "1" }]).then(
            () => (settled = true),
            e => (failure = e),
        );

        // Bounded so a gate that never resolves fails here rather than hanging.
        for (let i = 0; i < 100 && !settled && failure === undefined; i++) {
            await MockTime.advance(1);
        }

        // A failure the reconciler intends to retry is not the end of the item, so the gate must wait for the
        // retry that succeeds rather than treat the failure as terminal.
        expect(failure).equals(undefined);
        expect(settled).equals(true);
        await MockTime.resolve(gate);
        expect(peer.items[itemMapKey("groupMembership", "1")]?.status.state).equals("committed");
        expect(task.progress.state).equals("running");
        // Two failing applies and the retry that succeeds: the gate resolved through the retry path.
        expect(peer.reconciles).greaterThan(2);
    });

    it("touches the peer no further once an abort has settled it", async () => {
        /** Announces a change and then aborts the gate, both while its evaluation is still in flight. */
        class AbortMidEvaluatePeer extends FakePeer {
            passes = 0;
            onFirstPass?: () => void;
            override async reconcile(node: ClientNode, options?: { verify?: boolean }) {
                if (++this.passes > 1) {
                    await super.reconcile(node, options);
                    return;
                }
                this.setState("groupMembership", "1", "pending");
                this.onFirstPass?.();
            }
        }

        const peer = new AbortMidEvaluatePeer("p1");
        peer.addItem("groupMembership", "1", "pending");
        const gateControl = makeGate();
        const { ctx } = makeContext(peer, gateControl.control);
        peer.onFirstPass = () => gateControl.abort(new TaskCancelledSignal("cancelled"));

        const gate = ctx.awaitCommitted([{ peer: peer.asNode(), kind: "groupMembership", key: "1" }]);
        await expect(MockTime.resolve(gate)).rejectedWith(TaskCancelledSignal);

        // A reconcile started after the driver unwound races the rollback the cancel spawns next, and no longer
        // belongs to anything that awaits it.
        for (let i = 0; i < 20; i++) {
            await MockTime.advance(1);
        }
        expect(peer.passes).equals(1);
    });

    it("releases its peer observers when a state change throws", async () => {
        const peer = new FakePeer("p1");
        peer.addItem("groupMembership", "1", "pending");
        const { ctx } = makeContext(peer, undefined, () => {
            throw new Error("state write refused");
        });

        const gate = ctx.awaitCommitted([{ peer: peer.asNode(), kind: "groupMembership", key: "1" }]);
        await expect(MockTime.resolve(gate)).rejectedWith("state write refused");

        // Observers outliving the gate keep reconciling the peer for a task that is already gone.
        expect(peer.itemChanged.isObserved).equals(false);
        expect(peer.itemRemoved.isObserved).equals(false);
        expect(peer.subscriptionStatusChanged.isObserved).equals(false);
    });

    it("fails when an awaited item is dropped while the gate is parked", async () => {
        const peer = new FakePeer("p1");
        peer.addItem("groupMembership", "1", "pending");
        const { ctx } = makeContext(peer);

        const gate = ctx.awaitCommitted([{ peer: peer.asNode(), kind: "groupMembership", key: "1" }]);

        // Let the initial evaluate settle so the gate is parked on the peer's observers.
        await MockTime.resolve(Promise.resolve());

        // A reconcile pass this gate did not drive gives up on the item and drops it.
        peer.dropItem("groupMembership", "1");

        await expect(MockTime.resolve(gate)).rejectedWith(TaskFailedError);
        expect(peer.itemChanged.isObserved).equals(false);
        expect(peer.itemRemoved.isObserved).equals(false);
        expect(peer.subscriptionStatusChanged.isObserved).equals(false);
    });

    it("resolves a parked removal gate when the reconciler drops a rejected item", async () => {
        const peer = new FakePeer("p1");
        peer.addItem("groupMembership", "1", "pending");
        const { ctx } = makeContext(peer);

        let settled = false;
        const gate = ctx
            .awaitGate([peer.asNode()], () => ctx.itemAbsent(peer.asNode(), "groupMembership", "1"))
            .then(() => (settled = true));

        // Let the initial evaluate settle so the gate is parked on the peer's observers.
        await MockTime.resolve(Promise.resolve());
        expect(settled).equals(false);

        // The device rejects the item unrecoverably, and a reconcile pass this gate did not drive drops it.
        peer.markRejects("groupMembership", "1");
        await peer.reconcile(peer.asNode(), { verify: true });

        // Bounded so a gate that never wakes fails here rather than hanging.
        for (let i = 0; i < 100 && !settled; i++) {
            await MockTime.advance(1);
        }
        expect(settled).equals(true);
        await MockTime.resolve(gate);
        expect(peer.items[itemMapKey("groupMembership", "1")]).equals(undefined);
    });

    it("does not resolve on cached committed state while a node is unreachable", async () => {
        const peer = new FakePeer("p1");
        peer.addItem("groupMembership", "1", "committed");
        peer.setReachable(false);
        const { ctx, task } = makeContext(peer);

        let settled = false;
        const gate = ctx.awaitCommitted([{ peer: peer.asNode(), kind: "groupMembership", key: "1" }]).then(() => {
            settled = true;
        });

        await MockTime.resolve(Promise.resolve());
        expect(settled).equals(false);
        expect(task.progress.state).equals("parked");

        peer.setReachable(true);
        await MockTime.resolve(gate);
        expect(settled).equals(true);
    });
});
