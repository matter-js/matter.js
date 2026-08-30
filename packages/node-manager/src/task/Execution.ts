/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { Observable } from "@matter/general";
import { BoundDefinition, RunRecord } from "./Task.js";
import { RunId, TaskPhase } from "./types.js";

/** Where a running phase waits, and where an abort reason is recorded for it to find. */
export interface GateState {
    aborted?: unknown;
    wake: Observable<[]>;
}

/**
 * This process's responsibility for one run: from admission until it stops being responsible — the retirement
 * commit, or a shutdown that leaves the run for the next start.
 *
 * Deliberately *not* "the driver". A run's driver stops before its outcome is durable, and during that window
 * the run still owns its target and must still refuse a re-run. Ending here rather than at driver settle also
 * puts the release of the target — and of any future per-slot reservations — at the same moment as this: one
 * object released once, rather than several things with two lifetimes.
 */
export class Execution {
    readonly record: RunRecord;
    readonly bound: BoundDefinition;
    readonly gate: GateState = { wake: new Observable() };

    /** Resolves when the driver stops. Absent until driving starts. */
    promise?: Promise<void>;

    /**
     * Whether the driver has stopped. Synchronous because a run's phase is a predicate, and a predicate cannot
     * await.
     */
    settled = false;

    /**
     * A cancel has been accepted and has not finished unwinding. Outlives the driver deliberately: it refuses a
     * re-run for the whole window, and the driver reads it between phases to stop advancing.
     */
    cancelling = false;

    #phases?: TaskPhase[];

    constructor(record: RunRecord, bound: BoundDefinition) {
        this.record = record;
        this.bound = bound;
        // The link to the run this undoes comes from params; a rollback rebuilt on resume or redrive must
        // keep the one already recorded rather than let a fresh read of its own params override it.
        record.revertOf ??= bound.undoes;
    }

    get runId(): RunId {
        return this.record.runId;
    }

    /** Built once: a driver indexes into this list across phases and must see one stable set. */
    get phases(): TaskPhase[] {
        return (this.#phases ??= this.bound.phases());
    }

    abort(reason: unknown): void {
        this.gate.aborted = reason;
        this.gate.wake.emit();
    }
}
