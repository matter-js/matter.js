/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { ManagedItem, itemMapKey } from "@matter/node";

export type ReconcileAction = "apply" | "remove" | "retry" | "drop" | "repend" | "skip";

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
            return opts.recoverable(item) ? "retry" : "drop";
        case "committed":
            if (
                opts.verify &&
                item.mode === "maintain" &&
                opts.verifyResult?.driftedKeys.has(itemMapKey(item.kind, item.key))
            ) {
                return "repend";
            }
            return "skip";
    }
}
