/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { Duration, ObserverGroup } from "@matter/general";
import { DriftBudget } from "./DriftBudget.js";

/**
 * Everything the reconciler keeps for one wired peer: its observers and its drift budget.
 *
 * Created when the peer is wired and released as a whole by {@link close}, so nothing kept for a peer outlives its
 * wiring.
 */
export class PeerWiring {
    readonly observers = new ObserverGroup();
    readonly budget: DriftBudget;

    /** @param policy See {@link DriftBudget}. */
    constructor(policy: () => { count: number; window: Duration }) {
        this.budget = new DriftBudget(policy);
    }

    close(): void {
        this.observers.close();
    }
}
