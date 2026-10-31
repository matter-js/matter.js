/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { Logger, Mutex, StorageContext, SupportedStorageTypes } from "@matter/general";
import { FabricIndex, NodeId } from "@matter/types";
import { PeerAddress, PeerAddressMap } from "./PeerAddress.js";

const logger = Logger.get("PeerAddressStore");

const FABRIC_CONTEXT_PATTERN = /^[1-9]\d*$/;
const NODE_KEY_PATTERN = /^[0-9a-f]+$/;

/**
 * Persistent storage keyed by {@link PeerAddress}: one value per peer, so a change for one peer writes only that peer's
 * key instead of the whole collection.
 *
 * Layout: one sub-context per fabric index (decimal), one key per node ID (lowercase hex).  This class owns the format
 * in both directions.  It holds no values in memory; callers keep their own view and use {@link load} once at startup.
 *
 * Operations run one after another in call order, so after concurrent calls for one address the stored value is the
 * one passed last.
 */
export class PeerAddressStore<T extends SupportedStorageTypes> {
    readonly #storage: StorageContext;
    readonly #operations = new Mutex(this);

    constructor(storage: StorageContext) {
        this.#storage = storage;
    }

    set(address: PeerAddress, value: T) {
        return this.#operations.produce(async () => this.#set(address, value));
    }

    delete(address: PeerAddress) {
        return this.#operations.produce(async () => this.#fabricContext(address.fabricIndex).delete(keyOf(address)));
    }

    deleteFabric(fabricIndex: FabricIndex) {
        return this.#operations.produce(async () => this.#fabricContext(fabricIndex).clearAll());
    }

    clear() {
        return this.#operations.produce(async () => this.#storage.clearAll());
    }

    /**
     * Replace all stored values with {@link entries}.
     */
    replaceAll(entries: Iterable<[PeerAddress, T]>) {
        return this.#operations.produce(async () => {
            await this.#storage.clearAll();
            for (const [address, value] of entries) {
                await this.#set(address, value);
            }
        });
    }

    /**
     * Read all stored values.  Entries {@link keep} rejects and entries the driver cannot read are deleted from storage
     * and left out of the result.
     */
    load(keep?: (address: PeerAddress, value: T) => boolean) {
        return this.#operations.produce(async () => {
            const result = new PeerAddressMap<T>();

            for (const fabricName of await this.#storage.contexts()) {
                if (!FABRIC_CONTEXT_PATTERN.test(fabricName)) {
                    logger.info(`Ignoring stored context ${fabricName} in ${this}: not a fabric index`);
                    continue;
                }
                const fabricIndex = FabricIndex(Number.parseInt(fabricName, 10));
                const fabricContext = this.#storage.createContext(fabricName);

                for (const key of await fabricContext.keys()) {
                    if (!NODE_KEY_PATTERN.test(key)) {
                        logger.info(`Ignoring stored key ${key} in ${this}: not a node ID`);
                        continue;
                    }
                    const address = PeerAddress({ fabricIndex, nodeId: NodeId(BigInt(`0x${key}`)) });
                    if (!(await fabricContext.has(key))) {
                        logger.warn(`Deleting stored value of ${address} in ${this}: not readable`);
                        await fabricContext.delete(key);
                        continue;
                    }
                    const value = await fabricContext.get<T>(key);
                    if (keep !== undefined && !keep(address, value)) {
                        await fabricContext.delete(key);
                        continue;
                    }
                    result.set(address, value);
                }
            }

            return result;
        });
    }

    toString() {
        return `storage:${this.#storage.thisContexts.join(".")}`;
    }

    #set(address: PeerAddress, value: T) {
        return this.#fabricContext(address.fabricIndex).set(keyOf(address), value);
    }

    #fabricContext(fabricIndex: FabricIndex) {
        return this.#storage.createContext(fabricIndex.toString());
    }
}

function keyOf({ nodeId }: PeerAddress) {
    return nodeId.toString(16);
}
