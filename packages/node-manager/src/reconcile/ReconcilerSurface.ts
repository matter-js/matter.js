/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { ClientNode, ItemKind } from "@matter/node";

/** The subset of ReconcilerBehavior that RunningTaskContext needs, so callers don't depend on the whole behavior. */
export interface ReconcilerSurface {
    itemKind(kind: string): ItemKind | undefined;
    reconcile(peer: ClientNode, options?: { verify?: boolean }): Promise<void>;

    /**
     * Why the reconciler last gave up on `(kind, key)` for this peer.
     *
     * A dropped item takes its status with it, so this is the only thing left to say why a task's intent is
     * gone. Optional so a stand-in reconciler need not carry it.
     */
    dropReasonFor?(peer: ClientNode, kind: string, key: string): string | undefined;
}
