/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { ObserverGroup } from "@matter/general";

/**
 * Everything the reconciler keeps for one wired peer: its observers, and the signal that tells a pass for the peer
 * whether the peer is still wired.
 *
 * Created when the peer is wired and released as a whole by {@link close}, so nothing kept for a peer outlives its
 * wiring.
 */
export class PeerWiring {
    readonly observers = new ObserverGroup();
    readonly #unwired = new AbortController();

    /**
     * Aborted by {@link close}. A pass takes it when it starts; once aborted, the pass writes nothing to the device or
     * to the peer's desired state.
     */
    get signal(): AbortSignal {
        return this.#unwired.signal;
    }

    close(): void {
        this.observers.close();
        this.#unwired.abort();
    }
}
