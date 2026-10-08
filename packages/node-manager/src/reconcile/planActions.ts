/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { ItemDrift, ManagedItem, itemMapKey } from "@matter/node";

/**
 * What a pass does with a `converge` drift it confirms: write it back, or only record it. `maintain` drift is
 * written back on any pass. Either way a write needs {@link VerifyPlan.canReapply}. `adopt` is reserved for
 * Phase 3.
 */
export type DriftDisposition = "reapply" | "record";

export type ReconcileAction = "apply" | "remove" | "retry" | "abandon" | "skip" | "drifted";

export interface VerifyResult {
    verified: ReadonlySet<string>;
    drifted: ReadonlySet<string>;
    /** Items whose live read threw, with the error. In none of the other sets. */
    unread: ReadonlyMap<string, unknown>;
}

export interface PlannedAction {
    item: ManagedItem;
    action: ReconcileAction;
    /** Set exactly when `action` is `drifted`. */
    drift?: ItemDrift["disposition"];
}

/** What a verify pass found, and what it may do about a drift. */
export interface VerifyPlan {
    result: VerifyResult;
    disposition: DriftDisposition;

    /**
     * Whether a drifted item may be written back: false once the item is held or its re-apply budget is spent.
     * Asked for both modes, and it also decides how a drift that is not written back is marked.
     */
    canReapply: (item: ManagedItem) => boolean;
}

export interface PlanOptions {
    /** Present on a verify pass only. */
    verify?: VerifyPlan;
    recoverable: (item: ManagedItem) => boolean;
}

export function planActions(items: readonly ManagedItem[], opts: PlanOptions): PlannedAction[] {
    const result = new Array<PlannedAction>();
    for (const item of items) {
        result.push(planFor(item, opts));
    }
    return result;
}

function planFor(item: ManagedItem, opts: PlanOptions): PlannedAction {
    const { verify } = opts;
    if (item.status.state === "committed" && verify?.result.drifted.has(itemMapKey(item.kind, item.key))) {
        const writesBack = item.mode === "maintain" || verify.disposition === "reapply";
        const canReapply = verify.canReapply(item);
        if (writesBack && canReapply) {
            return { item, action: "apply" };
        }
        return { item, action: "drifted", drift: canReapply ? "recorded" : "held" };
    }
    return { item, action: actionFor(item, opts) };
}

function actionFor(item: ManagedItem, opts: PlanOptions): ReconcileAction {
    switch (item.status.state) {
        case "pending":
            return "apply";
        case "deletePending":
            return "remove";
        case "commitFailed":
            // What failed decides what to try again. The reported state cannot say — it is the JFDS
            // `CommitFailure`, which covers both — so a retry that read it alone would re-apply an item a
            // caller asked to remove, and giving up on one would forget an entry the device still holds.
            if (!opts.recoverable(item)) {
                return "abandon";
            }
            return item.outstanding === "remove" ? "remove" : "retry";
        case "committed":
            return "skip";
    }
}
