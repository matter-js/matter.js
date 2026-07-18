/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { ReconcilerSurface } from "#reconcile/ReconcilerSurface.js";
import { RunningTaskContext } from "#task/RunningTaskContext.js";
import { Task } from "#task/Task.js";
import { TaskState } from "#task/types.js";
import { FakePeer } from "./helpers.js";

/** peersWithIntent never touches the reconciler; a no-op stand-in avoids depending on the whole behavior. */
const unusedReconciler: ReconcilerSurface = {
    itemKind: () => undefined,
    reconcile: async () => {},
};

class PwiTask extends Task {
    override readonly type = "pwi-test";
    override get phases() {
        return [];
    }
}

describe("peersWithIntent", () => {
    it("returns peers holding a live intent for (kind,key)", () => {
        const a = new FakePeer("a");
        a.addItem("groupKey", "42", "committed");
        const b = new FakePeer("b");
        b.addItem("groupKey", "42", "pending");
        const c = new FakePeer("c"); // no intent
        const d = new FakePeer("d");
        d.addItem("groupKey", "42", "deletePending"); // not live
        const e = new FakePeer("e");
        e.addItem("groupKey", "43", "committed"); // live, but a different key

        const all = [a, b, c, d, e];
        const task = new PwiTask("pwi-test:1", {});
        const ctx = new RunningTaskContext(
            task,
            id => all.find(p => p.id === id)?.asNode(),
            unusedReconciler,
            (_s: TaskState) => {},
            undefined,
            () => all.map(p => p.asNode()),
        );

        const ids = ctx.peersWithIntent("groupKey", "42").map(p => p.id);
        expect(ids.sort()).deep.equals(["a", "b"]);
    });
});
