/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { RunStore } from "#task/RunStore.js";
import { RunRecord } from "#task/Task.js";
import { RetireSeq, RunId } from "#task/types.js";

/**
 * The store answers these without a node, a gate or a clock, so a table can be built by hand — the only way
 * to reach a rollback that holds its slot with no execution attached, which no public verb constructs.
 */
function storeWith(...records: RunRecord[]) {
    const store = new RunStore();
    for (const record of records) {
        store.admit(record);
        // A terminal record hands its slot back, exactly as its retirement write does; otherwise the next run
        // of the same target cannot be admitted.
        if (record.state !== "running") {
            store.commitRetirement(record);
        }
    }
    return store;
}

function retired(
    runId: number,
    slotKey: string,
    seq: number,
    state: "completed" | "failed" | "cancelled",
    wrote = false,
) {
    return new RunRecord(RunId(runId), slotKey, "synthetic", undefined, {
        state,
        retireSeq: RetireSeq(seq),
        wrote,
    });
}

describe("RunStore", () => {
    describe("liveRollbackOfTarget", () => {
        it("finds a rollback that holds its slot with nothing driving it", () => {
            // The shape a restart produces: the record is loaded and owns its slot, but no execution has been
            // attached to it yet. `isAttached` is false here and the rollback is nonetheless live — a re-run
            // of the target would rewrite exactly the intents it is going to restore.
            const undone = retired(1, "synthetic:t", 1, "cancelled", true);
            const rollback = new RunRecord(RunId(2), "revert:1", "revert", undefined, { revertOf: RunId(1) });
            const store = storeWith(undone, rollback);

            expect(store.isAttached(RunId(2))).equals(false);
            expect(store.liveRollbackOfTarget("synthetic:t")?.runId).equals(RunId(2));
        });
    });

    describe("supersederOf", () => {
        it("counts a later run that wrote", () => {
            const earlier = retired(1, "synthetic:t", 1, "cancelled", true);
            const later = retired(2, "synthetic:t", 2, "failed", true);

            expect(storeWith(earlier, later).supersederOf(RunId(1))?.runId).equals(RunId(2));
        });

        it("ignores a later run that reached no phase", () => {
            const earlier = retired(1, "synthetic:t", 1, "cancelled", true);
            const later = retired(2, "synthetic:t", 2, "failed");

            expect(storeWith(earlier, later).supersederOf(RunId(1))).equals(undefined);
        });

        it("counts a later run whose priors its retirement dropped", () => {
            // A retirement empties the changeSet once nothing can replay it; `wrote` is what still says the
            // device was changed, so the earlier run's priors are historical either way.
            const earlier = retired(1, "synthetic:t", 1, "cancelled", true);
            const later = retired(2, "synthetic:t", 2, "completed", true);

            expect(storeWith(earlier, later).supersederOf(RunId(1))?.runId).equals(RunId(2));
        });
    });
});
