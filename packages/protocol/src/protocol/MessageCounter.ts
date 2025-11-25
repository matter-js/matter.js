/**
 * @license
 * Copyright 2022-2025 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { Construction, Crypto, InternalError, StorageContext, asyncNew } from "#general";

/** Maximum 32 bit counter value. */
export const MAX_COUNTER_VALUE_32BIT = 0xfffffffe;

/** Default number of messages before a rollover callback is called. */
const ROLLOVER_INFO_DIFFERENCE = 1000;

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

/** Enhanced Message counter that can be persisted and will be initialized from the persisted value (if existing). */
export class PersistedMessageCounter extends MessageCounter {
    #construction: Construction<PersistedMessageCounter>;

    get construction() {
        return this.#construction;
    }

    static async create(
        crypto: Crypto,
        storageContext: StorageContext,
        storageKey: string,
        aboutToRolloverCallback?: () => Promise<void>,
        rolloverInfoDifference = ROLLOVER_INFO_DIFFERENCE,
    ) {
        return asyncNew(
            PersistedMessageCounter,
            crypto,
            storageContext,
            storageKey,
            aboutToRolloverCallback,
            rolloverInfoDifference,
        );
    }

    constructor(
        crypto: Crypto,
        private readonly storageContext: StorageContext,
        private readonly storageKey: string,
        aboutToRolloverCallback?: () => Promise<void>,
        rolloverInfoDifference = ROLLOVER_INFO_DIFFERENCE,
    ) {
        super(crypto, aboutToRolloverCallback, rolloverInfoDifference);
        this.#construction = Construction(this, async () => {
            if (await storageContext.has(storageKey)) {
                this.messageCounter = await storageContext.get<number>(storageKey);
                if (this.messageCounter < 0 || this.messageCounter > MAX_COUNTER_VALUE_32BIT) {
                    throw new InternalError(`Invalid message counter value: ${this.messageCounter}`);
                }
                // Make sure to call the callback if we are close to a rollover also for edge cases on initialization
                if (
                    this.onRollover !== undefined &&
                    this.messageCounter >= MAX_COUNTER_VALUE_32BIT - this.rolloverInfoDifference
                ) {
                    await this.onRollover();
                }
            }
        });
    }

    override async getIncrementedCounter() {
        const counter = await super.getIncrementedCounter();
        await this.storageContext.set(this.storageKey, counter);
        return counter;
    }
}
