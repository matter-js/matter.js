/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { Duration, ObserverGroup, Seconds, Time } from "@matter/general";
import { ClientNode } from "@matter/node";

const DEFAULT_SEEDED_TIMEOUT = Seconds(60);

/**
 * Wait (bounded) for a peer's endpoint structure to seed before reading it.
 *
 * Legacy `await node.events.initialized` blocked forever for an offline peer; the direct replacement
 * `await node.lifecycle.seeded` inherits that hang. This bounds the wait: it returns `true` once the node is seeded
 * and, on timeout, prints an "offline?" notice and returns `false` so the caller can abort the command instead of
 * hanging.
 */
export async function awaitSeeded(
    node: ClientNode,
    { timeout = DEFAULT_SEEDED_TIMEOUT, quiet = false }: { timeout?: Duration; quiet?: boolean } = {},
): Promise<boolean> {
    if (node.lifecycle.isSeeded) {
        return true;
    }

    const observers = new ObserverGroup();
    const sleep = Time.sleep("awaitSeeded", timeout);
    try {
        const seeded = new Promise<void>(resolve => observers.on(node.lifecycle.seeded, () => resolve()));
        const isSeeded = await Promise.race([seeded.then(() => true), sleep.then(() => false)]);
        if (!isSeeded && !quiet) {
            console.log(
                `Node ${node.peerAddress?.nodeId} did not become ready within ${Duration.format(timeout)} (offline?); giving up.`,
            );
        }
        return isSeeded;
    } finally {
        sleep.cancel();
        observers.close();
    }
}
