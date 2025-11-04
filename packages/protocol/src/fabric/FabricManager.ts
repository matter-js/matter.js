/**
 * @license
 * Copyright 2022-2025 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import {
    Bytes,
    Construction,
    Crypto,
    Environment,
    Environmental,
    ImplementationError,
    Key,
    Logger,
    MatterError,
    MatterFlowError,
    MaybePromise,
    Observable,
    StorageContext,
    StorageManager,
} from "#general";
import { PeerAddress } from "#peer/PeerAddress.js";
import { FabricIndex } from "#types";
import { Fabric } from "./Fabric.js";

const logger = Logger.get("FabricManager");

/** Specific Error for when a fabric is not found. */
export class FabricNotFoundError extends MatterError {}
export class FabricTableFullError extends MatterError {}

export enum FabricAction {
    Added,
    Removed,
    Updated,
}

export class FabricManager {
    #crypto: Crypto;
    #nextFabricIndex = 1;
    readonly #fabrics = new Map<FabricIndex, Fabric>();
    #initializationDone = false;
    #storage?: StorageContext;
    #events = {
        added: Observable<[fabric: Fabric]>(),
        updated: Observable<[fabric: Fabric]>(),
        deleted: Observable<[fabric: Fabric]>(),
        failsafeClosed: Observable<[]>(),
    };
    #construction: Construction<FabricManager>;

    constructor(crypto: Crypto, storage?: StorageContext) {
        this.#crypto = crypto;
        this.#storage = storage;

        let construct;
        if (this.#storage === undefined) {
            construct = () => {};
        } else {
            construct = async () => {
                if (this.#storage === undefined) {
                    // Storage disabled
                    return;
                }

                const fabrics = await this.#storage.get<Fabric.Config[]>("fabrics", []);
                for (const fabricConfig of fabrics) {
                    this.#addNewFabric(new Fabric(crypto, fabricConfig));
                }

                this.#nextFabricIndex = await this.#storage.get("nextFabricIndex", this.#nextFabricIndex);

                this.#initializationDone = true;
            };
        }

        this.#construction = Construction(this, construct);
    }

    get crypto() {
        return this.#crypto;
    }

    get construction() {
        return this.#construction;
    }

    async [Construction.construct]() {
        await this.construction;
    }

    static [Environmental.create](env: Environment) {
        const instance = new FabricManager(env.get(Crypto), env.get(StorageManager).createContext("fabrics"));
        env.set(FabricManager, instance);
        return instance;
    }

    get events() {
        return this.#events;
    }

    async clear() {
        await this.#construction;
        this.#nextFabricIndex = 1;
        this.#fabrics.clear();
        await this.#storage?.clear();
    }

    has(address: FabricIndex | PeerAddress) {
        if (typeof address === "object") {
            address = address.fabricIndex;
        }
        return this.#fabrics.has(address);
    }

    for(address: FabricIndex | PeerAddress) {
        if (typeof address === "object") {
            address = address.fabricIndex;
        }
        const fabric = this.#fabrics.get(address);
        if (fabric === undefined) {
            throw new FabricNotFoundError(`Cannot access fabric for unknown index ${address}`);
        }
        return fabric;
    }

    allocateFabricIndex() {
        this.#construction.assert();

        for (let i = 0; i < 254; i++) {
            const fabricIndex = this.#nextFabricIndex++;
            if (this.#nextFabricIndex > 254) this.#nextFabricIndex = 1;
            if (!this.#fabrics.has(FabricIndex(fabricIndex))) {
                return FabricIndex(fabricIndex);
            }
        }
        throw new FabricTableFullError("No free fabric index available.");
    }

    persistFabrics(): MaybePromise<void> {
        if (this.#storage === undefined) {
            throw new ImplementationError(
                "Fabric persistence is disabled because FabricManager constructed without storage",
            );
        }

        this.#construction.assert();

        const storeResult = this.#storage.set(
            "fabrics",
            Array.from(this.#fabrics.values()).map(fabric => fabric.config),
        );
        if (MaybePromise.is(storeResult)) {
            return storeResult.then(() => this.#storage!.set("nextFabricIndex", this.#nextFabricIndex));
        }
        return this.#storage.set("nextFabricIndex", this.#nextFabricIndex);
    }

    addFabric(fabric: Fabric) {
        this.#construction.assert();
        this.#addNewFabric(fabric);
    }

    #addNewFabric(fabric: Fabric) {
        const { fabricIndex } = fabric;
        if (this.#fabrics.has(fabricIndex)) {
            throw new MatterFlowError(`Fabric with index ${fabricIndex} already exists.`);
        }

        this.#addOrUpdateFabricEntry(fabric);

        if (this.#initializationDone) {
            this.#events.added.emit(fabric);
        }
    }

    /** Insert Fabric into the manager without emitting events */
    #addOrUpdateFabricEntry(fabric: Fabric) {
        const { fabricIndex } = fabric;
        this.#fabrics.set(fabricIndex, fabric);
        fabric.addRemoveCallback(async () => this.removeFabric(fabricIndex));
        fabric.persistCallback = (isUpdate = true) => {
            if (!this.#storage) {
                if (isUpdate) {
                    logger.warn(
                        "Fabric can not be persisted because FabricManager has no storage but it is a fabric update.",
                    );
                }
                return;
            }
            const persistResult = this.persistFabrics();
            return MaybePromise.then(persistResult, () => {
                if (isUpdate) {
                    this.#events.updated.emit(fabric); // Assume Fabric got updated when persist callback is called
                }
            });
        };
        if (this.#storage !== undefined && fabric.storage === undefined) {
            fabric.storage = this.#storage.createContext(`fabric-${fabricIndex}`);
        }
    }

    async removeFabric(fabricIndex: FabricIndex) {
        await this.#construction;

        const fabric = this.#fabrics.get(fabricIndex);
        if (fabric === undefined)
            throw new FabricNotFoundError(
                `Fabric with index ${fabricIndex} cannot be removed because it does not exist.`,
            );
        this.#fabrics.delete(fabricIndex);
        if (this.#storage) {
            await this.persistFabrics();
        }
        await fabric.storage?.clearAll();
        this.#events.deleted.emit(fabric);
    }

    [Symbol.iterator]() {
        this.#construction.assert();

        return this.#fabrics.values();
    }

    get fabrics() {
        this.#construction.assert();

        return Array.from(this.#fabrics.values());
    }

    get length() {
        return this.fabrics.length;
    }

    find(predicate: (fabric: Fabric) => boolean) {
        return this.fabrics.find(predicate);
    }

    map<T>(translator: (fabric: Fabric) => T) {
        return this.fabrics.map(translator);
    }

    async findFabricFromDestinationId(destinationId: Bytes, initiatorRandom: Bytes) {
        this.#construction.assert();

        for (const fabric of this.#fabrics.values()) {
            const candidateDestinationIds = await fabric.destinationIdsFor(fabric.nodeId, initiatorRandom);
            if (candidateDestinationIds.some(candidate => Bytes.areEqual(candidate, destinationId))) {
                return fabric;
            }
        }

        throw new FabricNotFoundError();
    }

    findByKeypair(keypair: Key) {
        this.#construction.assert();

        for (const fabric of this.#fabrics.values()) {
            if (fabric.matchesKeyPair(keypair)) {
                return fabric;
            }
        }
        return undefined;
    }

    findByIndex(index: FabricIndex) {
        this.#construction.assert();

        return this.#fabrics.get(index);
    }

    async updateFabric(fabric: Fabric) {
        await this.#construction;

        const { fabricIndex } = fabric;
        if (!this.#fabrics.has(fabricIndex)) {
            throw new FabricNotFoundError(
                `Fabric with index ${fabricIndex} cannot be updated because it does not exist.`,
            );
        }

        this.#addOrUpdateFabricEntry(fabric);

        if (this.#storage) {
            await this.persistFabrics();
        }
        this.#events.updated.emit(fabric);
    }

    async revokeFabric(fabricIndex: FabricIndex) {
        await this.#construction;

        const fabric = this.#fabrics.get(fabricIndex);
        if (fabric === undefined) {
            throw new MatterFlowError(`Fabric with index ${fabricIndex} does not exist to revoke.`);
        }
        await fabric.remove();
    }
}
