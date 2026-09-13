/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { RunStore } from "#task/RunStore.js";
import { RunRecord, TaskPersistence } from "#task/Task.js";
import { ChangeEntry, RetireSeq, RunId } from "#task/types.js";
import { InternalError } from "@matter/general";

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
    changeSet: ChangeEntry[] = [],
) {
    return new RunRecord(RunId(runId), slotKey, "synthetic", undefined, {
        state,
        retireSeq: RetireSeq(seq),
        wrote,
        changeSet,
    });
}

/** A retired run still holding priors, so a rollback that can replay them pins it. */
function pinned(runId: number, slotKey: string, seq: number) {
    return retired(runId, slotKey, seq, "failed", true, [{ peerId: "p", kind: "groupKey", key: "42" }]);
}

describe("RunStore", () => {
    describe("liveRollbackOfTarget", () => {
        it("finds a rollback that holds its slot with nothing driving it", () => {
            // The shape a restart produces: the record is loaded and owns its slot, but no execution has been
            // attached to it yet. `isAttached` is false here and the rollback is nonetheless live — a re-run
            // of the target would rewrite exactly the intents it is going to restore.
            const undone = retired(1, "synthetic:t", 1, "cancelled", true);
            const rollback = new RunRecord(RunId(2), "rollback:1", "rollback", undefined, { rollbackOf: RunId(1) });
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
    describe("a corrupt stored table", () => {
        const KEY_MATERIAL = new Uint8Array([1, 2, 3, 4]);

        function loadField(field: string, value: unknown) {
            const store = new RunStore();
            return () =>
                store.load({
                    runs: {
                        "run:1": {
                            runId: 1,
                            slotKey: "synthetic:t",
                            type: "synthetic",
                            state: "running",
                            phaseIndex: 0,
                            changeSet: [],
                            wrote: false,
                            [field]: value,
                        },
                    } as unknown as Record<string, TaskPersistence>,
                });
        }

        function loadWith(runId: unknown) {
            const store = new RunStore();
            return () =>
                store.load({
                    runs: {
                        "run:1": {
                            runId,
                            slotKey: "synthetic:t",
                            type: "rotateGroupKey",
                            state: "running",
                            phaseIndex: 0,
                            changeSet: [],
                            wrote: false,
                            // What a group task actually carries: raw key material, and a bigint that cannot be
                            // serialized at all.
                            params: { newEpochKey: KEY_MATERIAL, epochStartTime0: 1n },
                        },
                    } as unknown as Record<string, TaskPersistence>,
                });
        }

        // Zero and negatives pass `Number.isSafeInteger` but no caller can build a `RunId` from them, so the
        // rule the rest of the code enforces has to be the rule here.
        for (const runId of [0, -1, 1.5, "1", undefined]) {
            it(`refuses a record whose identity is ${JSON.stringify(runId) ?? "undefined"}`, () => {
                expect(loadWith(runId)).throws(InternalError);
            });
        }

        it("names the record without serializing it", () => {
            let message = "";
            try {
                loadWith(0)();
            } catch (e) {
                message = (e as Error).message;
            }
            expect(message).contains("run:1");
            // A `bigint` in params would make serializing the record throw before the refusal could be built,
            // and its key material would reach the log if it did not.
            expect(message).not.contains("epochStartTime0");
            expect(message).not.contains("newEpochKey");
        });

        it("accepts the smallest identity a caller can hold", () => {
            expect(loadWith(1)).not.throws();
        });

        // Each of these decides something no later check revisits: `state` decides whether the record holds
        // its target, `phaseIndex` which phase resumes, `retireSeq` seeds the counter every retirement reads.
        for (const [field, value] of [
            ["state", "sometimes"],
            ["state", 3],
            ["phaseIndex", -1],
            ["phaseIndex", 1.5],
            ["phaseIndex", Number.NaN],
            ["retireSeq", 0],
            ["retireSeq", "2"],
            ["changeSet", {}],
            // Each entry, not only the container: a run walks them as it writes, and a rollback replays them.
            ["changeSet", [null]],
            ["changeSet", [{ peerId: "p", kind: "groupKey" }]],
            ["changeSet", [{ peerId: "p", kind: "groupKey", key: "1", prior: { mode: "converge" } }]],
            ["changeSet", [{ peerId: "p", kind: "groupKey", key: "1", prior: { intent: {}, mode: "sometimes" } }]],
            ["slotKey", ""],
            ["slotKey", 7],
            ["type", ""],
            ["wrote", "false"],
            ["rollbackOf", "2"],
            ["rollbackRunId", 0],
        ] as Array<[string, unknown]>) {
            it(`refuses a record whose ${field} is ${JSON.stringify(value) ?? String(value)}`, () => {
                expect(loadField(field, value)).throws(InternalError);
            });
        }

        it("accepts a record whose optional retirement order is absent", () => {
            expect(loadField("retireSeq", undefined)).not.throws();
        });
    });
    describe("bounded history", () => {
        it("keeps everything while retired runs fit the limit", () => {
            const store = storeWith(retired(1, "s:a", 1, "completed"), retired(2, "s:b", 2, "completed"));
            expect(store.evictableRetired(2)).deep.equals([]);
        });

        it("forgets the oldest retirements first", () => {
            const store = storeWith(
                retired(1, "s:a", 1, "completed"),
                retired(2, "s:b", 2, "completed"),
                retired(3, "s:c", 3, "completed"),
            );
            expect(store.evictableRetired(1).map(r => r.runId)).deep.equals([RunId(1), RunId(2)]);
        });

        it("stops at a run whose priors a rollback can still replay, and keeps everything after it", () => {
            const store = storeWith(
                retired(1, "s:a", 1, "completed"),
                pinned(2, "s:b", 2),
                retired(3, "s:c", 3, "completed"),
                retired(4, "s:d", 4, "completed"),
            );
            // Not a filter: run 3 and 4 are younger than the pin, so they stay even though they are evictable
            // on their own. Skipping the pin would let `liveRollbackOfTarget` lose the record it walks from.
            expect(store.evictableRetired(0).map(r => r.runId)).deep.equals([RunId(1)]);
        });

        it("forgets nothing until told to", () => {
            const store = storeWith(retired(1, "s:a", 1, "completed"), retired(2, "s:b", 2, "completed"));
            const evictable = store.evictableRetired(0);
            expect(store.get(RunId(1))).not.equals(undefined);
            store.forget(evictable);
            expect(store.get(RunId(1))).equals(undefined);
            expect(store.get(RunId(2))).equals(undefined);
        });

        it("keeps every superseder of a run it keeps", () => {
            // A superseder always retired later, so a prefix eviction cannot remove one while its subject
            // survives — the property `supersederOf` depends on.
            const store = storeWith(
                retired(1, "s:a", 1, "cancelled", true),
                retired(2, "s:a", 2, "completed", true),
                retired(3, "s:a", 3, "completed", true),
            );
            store.forget(store.evictableRetired(2));
            expect(store.get(RunId(1))).equals(undefined);
            expect(store.supersederOf(RunId(2))?.runId).equals(RunId(3));
        });

        it("tells an evicted run apart from one that never existed", () => {
            const store = new RunStore();
            store.noteReserved(100);
            const issued = store.allocate();
            const record = retired(issued, "s:a", 1, "completed");
            store.admit(record);
            store.commitRetirement(record);
            store.forget(store.evictableRetired(0));

            expect(store.get(issued)).equals(undefined);
            expect(store.wasEvicted(issued)).equals(true);
            expect(store.wasEvicted(RunId(99))).equals(false);
        });
    });
});
