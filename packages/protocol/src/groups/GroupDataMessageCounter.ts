/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { MAX_COUNTER_VALUE_32BIT, MessageCounter } from "#protocol/MessageCounter.js";
import { Construction, Crypto, InternalError, StorageContext, asyncNew } from "@matter/general";

/**
 * Reserve block size for the persisted group data counter. Matches CHIP `GROUP_MSG_COUNTER_MIN_INCREMENT`: the
 * persisted value is kept this far ahead of the in-RAM counter so an unclean restart resumes above any value already
 * sent (spec §4.6.1.3 "never rolls back") without a storage write per message.
 */
export const GROUP_DATA_COUNTER_RESERVE = 1000;

/**
 * The single node-global Group Encrypted Data Message Counter (Matter spec §4.6.1.3). Persisted with a reserve block
 * so it never rolls back across restarts; randomized only when no value (and no migration seed) is present.
 */
export class GroupDataMessageCounter extends MessageCounter {
    #construction: Construction<GroupDataMessageCounter>;
    #reserved = 0;

    get construction() {
        return this.#construction;
    }

    static async create(crypto: Crypto, storage: StorageContext, storageKey: string, seed?: number) {
        return asyncNew(GroupDataMessageCounter, crypto, storage, storageKey, seed);
    }

    constructor(
        crypto: Crypto,
        private readonly storage: StorageContext,
        private readonly storageKey: string,
        seed?: number,
    ) {
        super(crypto);
        this.#construction = Construction(this, async () => {
            if (await storage.has(storageKey)) {
                const stored = await storage.get<number>(storageKey);
                if (typeof stored !== "number" || stored < 0 || stored > MAX_COUNTER_VALUE_32BIT) {
                    throw new InternalError(`Invalid group data counter value: ${stored}`);
                }
                this.messageCounter = stored;
            } else if (seed !== undefined) {
                if (typeof seed !== "number" || seed < 0 || seed > MAX_COUNTER_VALUE_32BIT) {
                    throw new InternalError(`Invalid group data counter seed: ${seed}`);
                }
                this.messageCounter = seed;
            }
            await this.#reserve();
        });
    }

    async #reserve() {
        this.#reserved = Math.min(this.messageCounter + GROUP_DATA_COUNTER_RESERVE, MAX_COUNTER_VALUE_32BIT);
        await this.storage.set(this.storageKey, this.#reserved);
    }

    override async getIncrementedCounter() {
        const counter = await super.getIncrementedCounter();
        if (counter >= this.#reserved) {
            await this.#reserve();
        }
        return counter;
    }
}
