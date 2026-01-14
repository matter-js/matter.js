/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */
import { Bytes, Crypto, ImplementationError, InternalError, StorageContext } from "#general";
import { PersistedMessageCounter } from "#protocol/MessageCounter.js";
import { MessageReceptionStateEncryptedWithRollover } from "#protocol/MessageReceptionState.js";
import { NodeId } from "#types";

export class MessagingState {
    /**
     * Message counter for sending data messages to a group per Operational key. No need to scope to a source node
     * because we are the sending node
     * TODO: For management: Make sure to start rotating the key early enough that a former counter-value is not used
     *  again for the same key.
     */
    readonly #groupDataCounters = new Map<string, PersistedMessageCounter>();

    /** Message reception state for data messages per Operational key and source node. */
    readonly #messageDataReceptionState = new Map<string, Map<NodeId, MessageReceptionStateEncryptedWithRollover>>();

    #crypto: Crypto;
    #storage?: StorageContext;

    constructor(crypto: Crypto, storage?: StorageContext) {
        this.#crypto = crypto;
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
     * Return the message counter for sending messages to a group with the given operational key.
     */
    counterFor(operationalKey: Bytes) {
        if (!this.#storage) {
            throw new ImplementationError("Group session cannot be created without storage context.");
        }
        const operationalKeyHex = Bytes.toHex(operationalKey);
        let counter = this.#groupDataCounters.get(operationalKeyHex);
        if (counter === undefined) {
            counter = new PersistedMessageCounter(this.#crypto, this.#storage, `${operationalKeyHex}-data`);
            this.#groupDataCounters.set(operationalKeyHex, counter);
        }
        return counter;
    }

    async removeCounter(key: Bytes, forDelete = false) {
        const operationalKeyHex = Bytes.toHex(key);
        this.#groupDataCounters.delete(operationalKeyHex);
        if (forDelete) {
            // If we are deleting the group key set, also delete the persisted counter values
            await this.#storage?.delete(`${operationalKeyHex}-data`);
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
}
