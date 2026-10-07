/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { Logger, PromiseTimeoutError, Seconds, withTimeout } from "@matter/general";

const logger = Logger.get("ScanControl");

/**
 * A radio call that has not settled after this long counts as failed, so one call noble never settles cannot keep
 * every later request waiting. Shorter than `BleScanner`'s bound on a scan transition, so a request whose call runs
 * alone fails with the call's own error.
 */
const RADIO_CALL_TIMEOUT = Seconds(5);

/** Starts and stops a radio's scan. The radio reports what it actually does through {@link ScanControl}'s events. */
export interface ScanRadio {
    start(): Promise<void>;
    stop(): Promise<void>;
}

/**
 * Keeps a radio's scan where its owner wants it, one radio call at a time.
 *
 * Only the owner's requests and the adapter becoming available start the scan. A scan the radio reports stopped stays
 * stopped until the owner asks again, because the radio also stops it for its own reasons, such as to connect. Of the
 * scans the radio reports started, only one answering our own start counts as ours; another user of the adapter may
 * start one we must leave alone.
 */
export class ScanControl {
    readonly #radio: ScanRadio;
    #wanted = false;
    #scanning = false;
    #available: boolean;
    #closed = false;
    /** Starts we issued that the radio has neither answered nor refused, or that timed out and may still take effect. */
    #outstandingStarts = 0;
    #calls: Promise<unknown> = Promise.resolve();

    constructor(radio: ScanRadio, available: boolean) {
        this.#radio = radio;
        this.#available = available;
    }

    /** Whether a scan of ours runs, as far as the radio reported. */
    get scanning() {
        return this.#scanning;
    }

    /**
     * Sets whether a scan is wanted and resolves once the radio was asked accordingly, or could not be asked because
     * the adapter is unavailable. Rejects only with the failure of this request's own radio call.
     */
    want(wanted: boolean) {
        this.#wanted = wanted;
        return this.#enqueueAdjustment();
    }

    /**
     * The radio reports that it scans. noble's HCI bindings also report scans that are not ours, such as one briefly
     * seen during a connect, and then report no end, so only a scan answering our own start counts.
     */
    started() {
        if (this.#outstandingStarts === 0) {
            return;
        }
        this.#outstandingStarts = 0;
        this.#scanning = true;
        if (!this.#wanted) {
            // Our own start completed after its request was given up or withdrawn
            this.#enqueueAdjustment().catch(error =>
                logger.warn("Stopping a BLE scan that started late failed:", error),
            );
        }
    }

    /** The radio reports that it stopped scanning. */
    stopped() {
        this.#scanning = false;
        this.#outstandingStarts = 0;
    }

    /** The adapter can scan or not. An adapter that cannot does not scan, whatever it reported before. */
    setAvailable(available: boolean) {
        this.#available = available;
        if (!available) {
            this.#scanning = false;
            this.#outstandingStarts = 0;
        } else if (this.#wanted) {
            this.#enqueueAdjustment().catch(error =>
                logger.warn("Starting the BLE scan after the adapter became available failed:", error),
            );
        }
    }

    close() {
        this.#closed = true;
    }

    #enqueueAdjustment() {
        const adjustment = this.#calls.then(() => this.#adjust());

        // A failed call fails only the request that queued it; the next adjustment decides again
        this.#calls = adjustment.catch(() => {});

        return adjustment;
    }

    async #adjust() {
        if (this.#closed || !this.#available) {
            return;
        }
        if (this.#wanted && !this.#scanning) {
            this.#outstandingStarts++;
            try {
                await withTimeout(RADIO_CALL_TIMEOUT, this.#radio.start());
            } catch (error) {
                // Only a start that timed out may still take effect later
                if (!(error instanceof PromiseTimeoutError) && this.#outstandingStarts > 0) {
                    this.#outstandingStarts--;
                }
                throw error;
            }
        } else if (!this.#wanted && this.#scanning) {
            await withTimeout(RADIO_CALL_TIMEOUT, this.#radio.stop());
        }
    }
}
