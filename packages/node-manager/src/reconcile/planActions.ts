/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { ManagedItem, itemMapKey } from "@matter/node";

export type ReconcileAction = "apply" | "remove" | "retry" | "drop" | "skip";

export interface VerifyResult {
    driftedKeys: ReadonlySet<string>;
}

export interface PlannedAction {
    item: ManagedItem;
    action: ReconcileAction;
}

export interface PlanOptions {
    verify: boolean;
    verifyResult?: VerifyResult;
    recoverable: (item: ManagedItem) => boolean;
}

export function planActions(items: readonly ManagedItem[], opts: PlanOptions): PlannedAction[] {
    const result = new Array<PlannedAction>();
    for (const item of items) {
        result.push({ item, action: actionFor(item, opts) });
    }
    return result;
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
                return "drop";
            }
            return item.outstanding === "remove" ? "remove" : "retry";
        case "committed":
            // A verify pass that finds drift re-applies in the same pass, so reconcile(verify) converges
            // deterministically without depending on a follow-up trigger.
            if (opts.verify && opts.verifyResult?.driftedKeys.has(itemMapKey(item.kind, item.key))) {
                return "apply";
            }
            return "skip";
    }
}
