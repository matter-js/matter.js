/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { Construction, Crypto, InternalError, StorageContext, asyncNew } from "@matter/general";

/** Maximum 32 bit counter value. Per Matter spec the counter wraps from 0xFFFFFFFF to 0. */
export const MAX_COUNTER_VALUE_32BIT = 0xffffffff;

/** Default number of messages before a rollover callback is called. */
const ROLLOVER_INFO_DIFFERENCE = 100_000;

export enum MessageCounterTypes {
    /**
     * Used for "Unsecure" sessions
     * Rollover allowed, Persistence: Optional
     */
    GlobalUnencrypted,

    /**
     * Used for "Group" sessions to encode regular data messages encrypted with a group key.
     * Lifetime: Operational Group Key, Rollover allowed, Persistence: Mandatory
     */
    GlobalEncryptedData,

    /**
     * Used for "Group" sessions to encode control messages encrypted with a group key.
     * Lifetime: Operational Group Key, Rollover allowed, Persistence: Mandatory
     */
    GlobalEncryptedControl,

    /**
     * Used for "Unicast" sessions
     * Lifetime: Session Key, Rollover expires, Persistence: Optional
     */
    SecureSession,
}

/**
 * Represents a message counter which gets randomly initialized and then incremented for each message.
 * Rollover can be allowed or forbidden and a callback can be provided to be notified before a rollover would happen.
 */
export class MessageCounter {
    protected messageCounter: number;

    /**
     * Creates a new message counter with a random start value. If a aboutToRolloverCallback is provided this
     * counter is not allowed to rollover and the callback is called before a rollover would happen. Optionally provide
     * a number of messages before the rollover callback is called (Default 1000).
     */
    constructor(
        crypto: Crypto,
        protected readonly onRollover?: () => Promise<void>,

        // Counter is a 28 bit random number plus 1
        protected readonly rolloverInfoDifference = ROLLOVER_INFO_DIFFERENCE,
    ) {
        this.messageCounter = (crypto.randomUint32 >>> 4) + 1;
    }

    async getIncrementedCounter() {
        this.messageCounter++;
        if (this.messageCounter > MAX_COUNTER_VALUE_32BIT) {
            if (this.onRollover !== undefined) {
                this.messageCounter = 0;
            } else {
                throw new InternalError("Message counter rollover not allowed.");
            }
        } else if (
            this.onRollover !== undefined &&
            this.messageCounter === MAX_COUNTER_VALUE_32BIT - this.rolloverInfoDifference
        ) {
            await this.onRollover();
        }
        return this.messageCounter;
    }
}

/** Options for {@link PersistedMessageCounter}. */
export interface PersistedMessageCounterOptions {
    aboutToRolloverCallback?: () => Promise<void>;
    rolloverInfoDifference?: number;

    /**
     * When set, persist the counter a block of this size ahead instead of on every increment: the stored value is kept
     * `reserve` above the in-RAM counter and only re-written when the counter crosses it. An unclean restart then
     * resumes at the reserved mark — above any value already issued — so the counter never rolls back (Matter spec
     * §4.6.1.3 for the group data counter; matches CHIP `GROUP_MSG_COUNTER_MIN_INCREMENT`). Up to `reserve` values are
     * skipped per unclean restart.
     */
    reserve?: number;

    /** Initial counter value to use when no value is persisted yet, instead of a random start. */
    seed?: number;
}

/** Enhanced Message counter that can be persisted and will be initialized from the persisted value (if existing). */
export class PersistedMessageCounter extends MessageCounter {
    #construction: Construction<PersistedMessageCounter>;
    readonly #reserve?: number;
    #reserved = Infinity;

    get construction() {
        return this.#construction;
    }

    static async create(
        crypto: Crypto,
        storageContext: StorageContext,
        storageKey: string,
        options: PersistedMessageCounterOptions = {},
    ) {
        return asyncNew(PersistedMessageCounter, crypto, storageContext, storageKey, options);
    }

    constructor(
        crypto: Crypto,
        private readonly storageContext: StorageContext,
        private readonly storageKey: string,
        options: PersistedMessageCounterOptions = {},
    ) {
        const { aboutToRolloverCallback, rolloverInfoDifference = ROLLOVER_INFO_DIFFERENCE, reserve, seed } = options;
        if (reserve !== undefined && (!Number.isInteger(reserve) || reserve <= 0)) {
            throw new InternalError(`Invalid message counter reserve: ${reserve}`);
        }
        super(crypto, aboutToRolloverCallback, rolloverInfoDifference);
        this.#reserve = reserve;
        this.#construction = Construction(this, async () => {
            if (await storageContext.has(storageKey)) {
                const stored = await storageContext.get<number>(storageKey);
                if (typeof stored !== "number" || stored < 0 || stored > MAX_COUNTER_VALUE_32BIT) {
                    throw new InternalError(`Invalid message counter value: ${stored}`);
                }
                this.messageCounter = stored;
                // Make sure to call the callback if we are close to a rollover also for edge cases on initialization
                if (
                    this.onRollover !== undefined &&
                    this.messageCounter >= MAX_COUNTER_VALUE_32BIT - this.rolloverInfoDifference
                ) {
                    await this.onRollover();
                }
            } else if (seed !== undefined) {
                if (typeof seed !== "number" || seed < 0 || seed > MAX_COUNTER_VALUE_32BIT) {
                    throw new InternalError(`Invalid message counter seed: ${seed}`);
                }
                this.messageCounter = seed;
            }
            if (reserve !== undefined) {
                await this.#reserveAhead();
            }
        });
    }

    async #reserveAhead() {
        this.#reserved = Math.min(this.messageCounter + this.#reserve!, MAX_COUNTER_VALUE_32BIT);
        await this.storageContext.set(this.storageKey, this.#reserved);
    }

    override async getIncrementedCounter() {
        const counter = await super.getIncrementedCounter();
        if (this.#reserve === undefined) {
            await this.storageContext.set(this.storageKey, counter);
        } else if (counter >= this.#reserved || counter < this.#reserved - this.#reserve) {
            // Re-reserve at the block boundary, and also after a rollover to 0 (counter drops below the reserved
            // window) so the wrapped-around low values are persisted ahead and never re-issued after a restart.
            await this.#reserveAhead();
        }
        return counter;
    }
}
