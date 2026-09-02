/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { RUN_STORE_VERSION, RunStore } from "#task/RunStore.js";
import { RunRecord, TaskPersistence } from "#task/Task.js";
import { ChangeEntry, RunId, TaskState } from "#task/types.js";
import { InternalError } from "@matter/general";

/**
 * What a record carries into storage, and what a store does with a table it cannot read.
 *
 * Both are properties of the run table and of nothing else. Driving a task to produce them would make each
 * case depend on a node, a gate and a clock, and would hide which input the rule actually reads.
 */

const ENTRY: ChangeEntry = { peerId: "p", kind: "groupMembership", key: "X" };

function persisted(runId: number, state: TaskState, changeSet: ChangeEntry[] = []): TaskPersistence {
    return {
        runId: RunId(runId),
        slotKey: `synthetic:${runId}`,
        type: "synthetic",
        params: { tag: String(runId) },
        phaseIndex: 0,
        state,
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
        expect("params" in dropped.toPersistence({ revertRunId: RunId(2) })).equals(false);
    });

    it("omits every field the run does not have, and none that it must", () => {
        const snapshot = record().toPersistence();
        for (const absent of ["externalId", "error", "retireSeq", "revertRunId", "revertOf"]) {
            expect(absent in snapshot).equals(false);
        }
        // The strip is enumerated rather than derived from the values present, so it cannot reach these.
        for (const required of ["runId", "slotKey", "type", "phaseIndex", "state", "changeSet"]) {
            expect(required in snapshot).equals(true);
        }
    });

    it("refuses a write that both sets a field and drops it", () => {
        // Which one wins would otherwise be decided by the order the two lists are applied in.
        expect(() => record().toPersistence({ params: { tag: "new" } }, ["params"])).throws(InternalError);
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
        const { resumable } = store.load({
            runs: { "1": persisted(1, "running", [ENTRY]) },
            nextRunId: 1_000,
            runsVersion: RUN_STORE_VERSION + 1,
        });
        // Nothing loaded and nothing resumable: the manager refuses new work rather than presenting a table
        // whose targets it cannot see are taken.
        expect(store.unreadable).equals(true);
        expect(resumable).deep.equals([]);
        expect(store.get(RunId(1))).equals(undefined);
    });
});
