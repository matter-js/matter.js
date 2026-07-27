/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */
import { MAX_COUNTER_VALUE_32BIT } from "#protocol/MessageCounter.js";
import { MessageReceptionStateEncryptedWithRollover } from "#protocol/MessageReceptionState.js";
import { Bytes, InternalError, Logger, StorageContext } from "@matter/general";
import { NodeId } from "@matter/types";

const logger = Logger.get("MessagingState");

/** Legacy per-operational-key group data counter storage key: 32 hex chars (16-byte key hash) + "-data". */
const LEGACY_GROUP_DATA_COUNTER_KEY = /^[0-9a-f]{32}-data$/;

export class MessagingState {
    /** Message reception state for data messages per Operational key and source node. */
    readonly #messageDataReceptionState = new Map<string, Map<NodeId, MessageReceptionStateEncryptedWithRollover>>();

    #storage?: StorageContext;

    constructor(storage?: StorageContext) {
        if (storage !== undefined) {
            this.#storage = storage;
        }
    }

    set storage(storage: StorageContext) {
        if (this.#storage !== undefined) {
            throw new InternalError("Storage context can only be set once.");
        }
        this.#storage = storage;
    }

    /**
     * @deprecated Migration-only. Reads the maximum value across the legacy per-operational-key group data counters so
     * the node-global group data counter can be seeded above every previously used value. Remove once the migration
     * window has passed.
     */
    async legacyGroupDataCounterMax(): Promise<number | undefined> {
        if (!this.#storage) {
            return undefined;
        }
        let max: number | undefined;
        for (const storageKey of await this.#storage.keys()) {
            if (!LEGACY_GROUP_DATA_COUNTER_KEY.test(storageKey)) {
                continue;
            }
            const value = await this.#storage.get<number>(storageKey);
            if (typeof value !== "number" || value < 0 || value > MAX_COUNTER_VALUE_32BIT) {
                logger.warn(`Ignoring invalid legacy group data counter at ${storageKey}: ${value}`);
                continue;
            }
            if (max === undefined || value > max) {
                max = value;
            }
        }
        return max;
    }

    /**
     * @deprecated Migration-only. Deletes the legacy per-operational-key group data counters after the node-global
     * counter has been seeded from them. Remove once the migration window has passed.
     */
    async clearLegacyGroupDataCounters(): Promise<void> {
        if (!this.#storage) {
            return;
        }
        for (const storageKey of await this.#storage.keys()) {
            if (LEGACY_GROUP_DATA_COUNTER_KEY.test(storageKey)) {
                await this.#storage.delete(storageKey);
            }
        }
    }

    /**
     * Returns the message reception state for a given source node id and operational key.
     */
    receptionStateFor(sourceNodeId: NodeId, operationalKey: Bytes) {
        const operationalKeyHex = Bytes.toHex(operationalKey);
        let receptionState = this.#messageDataReceptionState.get(operationalKeyHex)?.get(sourceNodeId);
        if (receptionState === undefined) {
            receptionState = new MessageReceptionStateEncryptedWithRollover();
            const keyMap = this.#messageDataReceptionState.get(operationalKeyHex) ?? new Map();
            keyMap.set(sourceNodeId, receptionState);
            this.#messageDataReceptionState.set(operationalKeyHex, keyMap);
        }
        return receptionState;
    }

    /**
     * Discards the replay-protection reception state for an operational key.  Called when the key's key set is removed
     * so that a later key set reusing the same epoch key starts a fresh counter window and its first message
     * re-synchronizes instead of being rejected as a replay against the removed key's high-water counter.
     */
    forgetReceptionState(operationalKey: Bytes) {
        this.#messageDataReceptionState.delete(Bytes.toHex(operationalKey));
    }
}
