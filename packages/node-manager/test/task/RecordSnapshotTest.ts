/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { RUN_STORE_VERSION, RunStore } from "#task/RunStore.js";
import { RunRecord, TaskPersistence } from "#task/Task.js";
import { ChangeEntry, RetireSeq, RunId, TaskState } from "#task/types.js";
import { InternalError } from "@matter/general";
import { testAddress } from "./helpers.js";

/**
 * What a record carries into storage, and what a store does with a table it cannot read.
 *
 * Both are properties of the run table and of nothing else. Driving a task to produce them would make each
 * case depend on a node, a gate and a clock, and would hide which input the rule actually reads.
 */

const ENTRY: ChangeEntry = { peer: testAddress("p"), kind: "groupMembership", key: "X" };

function persisted(runId: number, state: TaskState, changeSet: ChangeEntry[] = []): TaskPersistence {
    return {
        runId: RunId(runId),
        slotKey: `synthetic:${runId}`,
        type: "synthetic",
        params: { tag: String(runId) },
        phaseIndex: 0,
        state,
        wrote: changeSet.length > 0,
        changeSet,
    };
}

describe("run record snapshots", () => {
    const record = () => RunRecord.fromPersistence(persisted(1, "failed", [ENTRY]));

    it("removes a field a write drops, and keeps the rest", () => {
        const snapshot = record().toPersistence({ state: "cancelled" }, ["params"]);
        expect("params" in snapshot).equals(false);
        expect(snapshot.state).equals("cancelled");
        expect(snapshot.changeSet).deep.equals([ENTRY]);
    });

    it("keeps a field absent once dropped, however many writes follow", () => {
        const dropped = record();
        dropped.adoptDrop(["params"]);
        // Otherwise the key returns holding `undefined` on the next write and "storage omits it" holds for
        // exactly one write.
        expect("params" in dropped.toPersistence({ rollbackRunId: RunId(2) })).equals(false);
    });

    it("omits every field the run does not have, and none that it must", () => {
        const snapshot = record().toPersistence();
        for (const absent of ["externalId", "error", "retireSeq", "rollbackRunId", "rollbackOf"]) {
            expect(absent in snapshot).equals(false);
        }
        // The strip is enumerated rather than derived from the values present, so it cannot reach these.
        for (const required of ["runId", "slotKey", "type", "phaseIndex", "state", "changeSet", "wrote"]) {
            expect(required in snapshot).equals(true);
        }
    });

    it("refuses a write that both sets a field and drops it", () => {
        // Which one wins would otherwise be decided by the order the two lists are applied in.
        expect(() => record().toPersistence({ params: { tag: "new" } }, ["params"])).throws(InternalError);
    });
});

describe("an outcome and its place in the retirement order", () => {
    // The two are written in one transaction, so a record holding one without the other did not come from
    // this layer. A terminal record with no sequence sorts at zero — ahead of every real retirement — so
    // history would forget it first and supersession would read the wrong run as the later one.
    it("refuses a finished record that does not say when it retired", () => {
        const store = new RunStore();
        expect(() => store.load({ runs: { "1": persisted(1, "completed") }, nextRunId: 10 })).throws(
            InternalError,
            /completed but has no retirement sequence/,
        );
    });

    it("refuses an unfinished record that says it retired", () => {
        const store = new RunStore();
        expect(() =>
            store.load({
                runs: { "1": { ...persisted(1, "running"), retireSeq: RetireSeq(3) } },
                nextRunId: 10,
            }),
        ).throws(InternalError, /running but has a retirement sequence/);
    });

    it("accepts the pair the layer writes", () => {
        const store = new RunStore();
        store.load({
            runs: { "1": { ...persisted(1, "completed"), retireSeq: RetireSeq(3) } },
            nextRunId: 10,
        });
        expect(store.get(RunId(1))?.retireSeq).equals(3);
    });
});

describe("the two halves of a rollback link", () => {
    const undo = (runId: number, rollbackOf: number, state: TaskState = "running"): TaskPersistence => ({
        ...persisted(runId, state),
        slotKey: `rollback:${rollbackOf}`,
        type: "rollback",
        rollbackOf: RunId(rollbackOf),
        ...(state === "running" ? {} : { retireSeq: RetireSeq(runId) }),
    });

    it("refuses an original and an undo that name different runs", () => {
        const store = new RunStore();
        expect(() =>
            store.load({
                runs: {
                    "1": { ...persisted(1, "cancelled"), retireSeq: RetireSeq(1), rollbackRunId: RunId(9) },
                    "2": undo(2, 1),
                },
                nextRunId: 10,
            }),
        ).throws(InternalError, /undoes 1, which names 9 as its rollback/);
    });

    it("refuses a record that undoes itself", () => {
        const store = new RunStore();
        expect(() => store.load({ runs: { "1": undo(1, 1) }, nextRunId: 10 })).throws(
            InternalError,
            /is its own rollback/,
        );
    });

    it("refuses two unfinished undos of one run", () => {
        const store = new RunStore();
        expect(() =>
            store.load({
                runs: {
                    "1": { ...persisted(1, "cancelled"), retireSeq: RetireSeq(1) },
                    "2": undo(2, 1),
                    "3": { ...undo(3, 1), slotKey: "rollback:1b" },
                },
                nextRunId: 10,
            }),
        ).throws(InternalError, /both unfinished rollbacks of 1/);
    });

    it("accepts an undo whose original history has already forgotten", () => {
        // An original is evicted once its undo concluded, and the undo keeps the link. That is the layer's
        // own doing, not a disagreement.
        const store = new RunStore();
        store.load({ runs: { "2": undo(2, 1, "completed") }, nextRunId: 10 });
        expect(store.get(RunId(2))?.rollbackOf).equals(1);
    });

    it("accepts a link only one half has written yet", () => {
        // A rollback links to its original at admission; the original's link lands with a later write.
        const store = new RunStore();
        store.load({
            runs: { "1": { ...persisted(1, "cancelled"), retireSeq: RetireSeq(1) }, "2": undo(2, 1) },
            nextRunId: 10,
        });
        expect(store.get(RunId(2))?.rollbackOf).equals(1);
    });
});

describe("run table schema version", () => {
    it("loads a table written before the version existed", () => {
        const store = new RunStore();
        store.load({
            runs: { "1": persisted(1, "running", [ENTRY]) },
            nextRunId: 1_000,
        });
        expect(store.unreadable).equals(false);
        expect(store.get(RunId(1))?.state).equals("running");
    });

    it("reads nothing from a table a newer build wrote", () => {
        const store = new RunStore();
        store.load({
            runs: { "1": persisted(1, "running", [ENTRY]) },
            nextRunId: 1_000,
            runsVersion: RUN_STORE_VERSION + 1,
        });
        // Nothing loaded and nothing resumable: the manager refuses new work rather than presenting a table
        // whose targets it cannot see are taken.
        expect(store.unreadable).equals(true);
        expect(store.resumable).deep.equals([]);
        expect(store.get(RunId(1))).equals(undefined);
    });
});
