/**
 * @license
 * Copyright 2022-2025 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { Duration, Logger, MatterFlowError, Time, Timer } from "#general";
import { Fabric } from "../fabric/Fabric.js";
import type { FailsafeContext } from "./FailsafeContext.js";

export class MatterFabricConflictError extends MatterFlowError {}

const logger = Logger.get("FailsafeTimer");

/**
 * Manages the failsafe timer associated with a {@link FailsafeContext}.
 */
export class FailsafeTimer {
    #expiryCallback: () => Promise<void>;
    #failsafeTimer: Timer;
    #maxCumulativeFailsafeTimer: Timer;

    constructor(
        public associatedFabric: Fabric | undefined,
        expiryLength: Duration,
        maxCumulativeFailsafe: Duration,
        expiryCallback: () => Promise<void>,
    ) {
        this.#expiryCallback = expiryCallback;
        this.#failsafeTimer = this.#startFailsafeTimer(expiryLength);
        this.#maxCumulativeFailsafeTimer = Time.getTimer("Max cumulative failsafe", maxCumulativeFailsafe, () =>
            this.expire(),
        ).start();
    }

    async close() {
        if (this.#failsafeTimer.isRunning) {
            this.#failsafeTimer.stop();
        }
        if (this.#maxCumulativeFailsafeTimer.isRunning) {
            this.#maxCumulativeFailsafeTimer.stop();
        }
    }

    /** Handle "Re-Arming" an existing FailSafe context to extend the timer, expire or fail if not allowed. */
    async reArm(associatedFabric: Fabric | undefined, expiry: Duration) {
        if (!this.#failsafeTimer.isRunning) {
            throw new MatterFlowError("FailSafe already expired.");
        }

        if (this.associatedFabric?.fabricIndex !== associatedFabric?.fabricIndex) {
            throw new MatterFlowError(
                `FailSafe already armed (index=${this.associatedFabric?.fabricIndex}) with different fabric (index=${associatedFabric?.fabricIndex}).`,
            );
        }

        this.#failsafeTimer.stop();

        if (expiry === 0) {
            // If ExpiryLengthSeconds is 0 and the fail-safe timer was already armed and the accessing fabric matches
            // the Fabric currently associated with the fail-safe context, then the fail-safe timer SHALL be
            // immediately expired (see further below for side-effects of expiration).
            await this.expire();
        } else {
            // If ExpiryLengthSeconds is non-zero and the fail-safe timer was currently armed, and the accessing Fabric
            // matches the fail-safe context’s associated Fabric, then the fail-safe timer SHALL be re- armed to expire
            // in ExpiryLengthSeconds.
            this.#failsafeTimer = this.#startFailsafeTimer(expiry);
        }
    }

    get armed() {
        return this.#failsafeTimer.isRunning && this.#maxCumulativeFailsafeTimer.isRunning;
    }

    /** Expire the FailSafe context. This is called by the timer and can also be called manually if needed. */
    async expire() {
        if (!this.armed) {
            // No timer is running so we are completed or already expired
            return;
        }
        this.complete();
        await this.#expiryCallback();
    }

    /** Complete the FailSafe context. This is called when the commissioning is completed. */
    complete() {
        this.#failsafeTimer.stop();
        this.#maxCumulativeFailsafeTimer.stop();
    }

    #startFailsafeTimer(expiry: Duration) {
        return Time.getTimer("Failsafe expiration", expiry, () =>
            this.expire().catch(e => logger.error("Error during failsafe expiration", e)),
        ).start();
    }
}
