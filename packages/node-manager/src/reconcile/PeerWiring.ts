/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { ObserverGroup } from "@matter/general";
import type { DriftWatcher } from "./DriftWatcher.js";

/**
 * Everything the reconciler keeps for one wired peer: its observers, its drift watcher, and the signal that tells a
 * pass for the peer whether the peer is still wired.
 *
 * Created when the peer is wired and released as a whole by {@link close}, so nothing kept for a peer outlives its
 * wiring. Stored before anything is registered on it, so whatever wiring the peer registers is owned by it even
 * when a later step of the wiring throws.
 */
export class PeerWiring {
    readonly observers = new ObserverGroup();
    readonly driftWatcher: DriftWatcher;
    readonly #unwired = new AbortController();

    /** Takes ownership of `driftWatcher`; {@link close} closes it. */
    constructor(driftWatcher: DriftWatcher) {
        this.driftWatcher = driftWatcher;
    }

    /**
     * Aborted by {@link close}. A pass takes it when it starts; once aborted, the pass writes nothing to the device or
     * to the peer's desired state.
     */
    get signal(): AbortSignal {
        return this.#unwired.signal;
    }

    /** Release the drift watcher and the observers, and abort the signal. */
    close(): void {
        this.driftWatcher.close();
        this.observers.close();
        this.#unwired.abort();
    }
}
