/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { ReconcilerSurface } from "#reconcile/ReconcilerSurface.js";
import { RunningTaskContext } from "#task/RunningTaskContext.js";
import { TaskDefinition, RunRecord } from "#task/Task.js";
import { TaskPhase, TaskState } from "#task/types.js";
import { RunId } from "#task/types.js";
import { PeerAddress } from "@matter/protocol";
import { kindOf, FakePeer } from "./helpers.js";

/** peersWithIntent reads desired state; the reconciler only says which kinds it owns. */
const kindsOnlyReconciler: ReconcilerSurface = {
    itemKind: name => kindOf(name),
    reconcile: async () => {},
};

const PwiTask: TaskDefinition = {
    type: "pwi-test",
    slotKeyFor: () => "pwi-test:1",
    phases: () => new Array<TaskPhase>(),
};

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
        const record = new RunRecord(RunId(1), "pwi-test:1", PwiTask.type, {});
        const ctx = new RunningTaskContext(
            record,
            address => all.find(p => PeerAddress.is(p.address, address))?.asNode(),
            kindsOnlyReconciler,
            (_s: TaskState) => {},
            undefined,
            () => all.map(p => p.asNode()),
        );

        const ids = ctx.peersWithIntent(kindOf("groupKey"), "42").map(p => p.id);
        expect(ids.sort()).deep.equals(["a", "b"]);
    });
});
