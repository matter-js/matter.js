/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { Duration, Instant, Millis, Time, Timestamp } from "@matter/general";

/**
 * Accumulates the time a BLE client's radio scanned, which it reports as `BleScannerClient.listeningTime`.
 */
export class BleListeningClock {
    #since?: Timestamp;
    #total: Duration = Instant;

    /** The radio scans. A repeated start while it already scans changes nothing. */
    start() {
        this.#since ??= Time.nowUs;
    }

    /** The radio stopped scanning or can no longer scan. A repeated stop changes nothing. */
    stop() {
        if (this.#since === undefined) {
            return;
        }
        this.#total = Millis(this.#total + Timestamp.delta(this.#since, Time.nowUs));
        this.#since = undefined;
    }

    /** Total scan time so far, including a scan still running. */
    get total(): Duration {
        if (this.#since === undefined) {
            return this.#total;
        }
        return Millis(this.#total + Timestamp.delta(this.#since, Time.nowUs));
    }
}
