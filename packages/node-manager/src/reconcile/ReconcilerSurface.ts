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
}
