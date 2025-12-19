/**
 * @license
 * Copyright 2022-2025 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import {
    AsyncObservable,
    BasicSet,
    Bytes,
    Construction,
    Crypto,
    Diagnostic,
    Environment,
    Environmental,
    ImplementationError,
    Key,
    Logger,
    MatterError,
    MatterFlowError,
    MaybePromise,
    Observable,
    Observer,
    StorageContext,
    StorageManager,
} from "#general";
import { FabricId, FabricIndex, GlobalFabricId, NodeId } from "#types";
import { Fabric } from "./Fabric.js";

const logger = Logger.get("FabricManager");

/** Specific Error for when a fabric is not found. */
export class FabricNotFoundError extends MatterError {}
export class FabricTableFullError extends MatterError {}

export class FabricManager {
    #crypto: Crypto;
    #nextFabricIndex = 1;
    readonly #fabrics = new BasicSet<Fabric>();
    #initializationDone = false;
    #storage?: StorageContext;
    #events = {
        added: Observable<[fabric: Fabric]>(),
        replaced: Observable<[fabric: Fabric]>(unhandled("replacing")),
        leaving: Observable<[fabric: Fabric]>(unhandled("leaving")),
        deleting: AsyncObservable<[fabric: Fabric]>(unhandled("deleting")),
        deleted: AsyncObservable<[fabric: Fabric]>(unhandled("deleted")),
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
                    this.#addNewFabric(await Fabric.create(crypto, fabricConfig));
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

    /**
     * Test whether the fabric identified by {@link identifier} is present.
     */
    has(address: Fabric.Identifier) {
        let fabric;
        if (typeof address === "bigint") {
            fabric = this.#fabrics.get("globalId", address);
        } else {
            if (typeof address === "object") {
                address = address.fabricIndex;
            }
            fabric = this.#fabrics.get("fabricIndex", address);
        }
        return fabric !== undefined && !fabric.isDeleting;
    }

    /**
     * Obtain the fabric identified by {@link identifier}.
     *
     * Throws if the fabric is not found.
     */
    for(identifier: Fabric.Identifier) {
        let fabric;
        if (typeof identifier === "bigint") {
            fabric = this.#fabrics.get("globalId", identifier);
        } else {
            if (typeof identifier === "object") {
                identifier = identifier.fabricIndex;
            }
            fabric = this.#fabrics.get("fabricIndex", identifier);
        }

        if (fabric === undefined || fabric.isDeleting) {
            const str = typeof identifier === "bigint" ? GlobalFabricId.strOf(identifier) : `#${identifier}`;
            throw new FabricNotFoundError(
                `Fabric index ${str} ${fabric === undefined ? "does not exist" : "is deleted"}`,
            );
        }
        return fabric;
    }

    /**
     * Get the fabric identified by {@link identifier} if present.
     */
    maybeFor(identifier: Fabric.Identifier) {
        if (this.has(identifier)) {
            return this.for(identifier);
        }
    }

    allocateFabricIndex() {
        this.#construction.assert();

        for (let i = 0; i < 254; i++) {
            const fabricIndex = this.#nextFabricIndex++;
            if (this.#nextFabricIndex > 254) this.#nextFabricIndex = 1;
            if (!this.#fabrics.get("fabricIndex", FabricIndex(fabricIndex))) {
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
            this.fabrics.map(fabric => fabric.config),
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
        if (this.#fabrics.get("fabricIndex", fabricIndex)) {
            throw new MatterFlowError(`Fabric with index ${fabricIndex} already exists.`);
        }

        this.#addOrUpdateFabricEntry(fabric);

        if (this.#initializationDone) {
            this.#events.added.emit(fabric);
        }
    }

    /** Insert Fabric into the manager without emitting events */
    #addOrUpdateFabricEntry(fabric: Fabric) {
        const existing = this.#fabrics.get("fabricIndex", fabric.fabricIndex);
        if (existing) {
            this.#fabrics.delete(existing);
        }

        this.#fabrics.add(fabric);

        fabric.leaving.on(() => this.events.leaving.emit(fabric));
        fabric.deleting.on(() => this.events.deleting.emit(fabric));
        fabric.deleted.on(() => this.#handleFabricDeleted(fabric));

        fabric.persistCallback = (isUpdate = true) => {
            if (!this.#storage) {
                if (isUpdate) {
                    logger.warn(`Fabric ${fabric.fabricIndex} cannot persist because FabricManager has no storage`);
                }
                return;
            }
            const persistResult = this.persistFabrics();
            return MaybePromise.then(persistResult, () => {
                if (isUpdate) {
                    this.#events.replaced.emit(fabric); // Assume Fabric got updated when persist callback is called
                }
            });
        };
        if (this.#storage !== undefined && fabric.storage === undefined) {
            fabric.storage = this.#storage.createContext(`fabric-${fabric.fabricIndex}`);
        }
    }

    async #handleFabricDeleted(fabric: Fabric) {
        await this.#construction;

        this.#fabrics.delete(fabric);
        if (this.#storage) {
            await this.persistFabrics();
        }
        await fabric.storage?.clearAll();
    }

    [Symbol.iterator]() {
        this.#construction.assert();

        return this.fabrics[Symbol.iterator]();
    }

    get fabrics() {
        this.#construction.assert();

        return this.#fabrics.filter(fabric => !fabric.isDeleting);
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

        for (const fabric of this.#fabrics) {
            const candidateDestinationIds = await fabric.destinationIdsFor(fabric.nodeId, initiatorRandom);
            if (candidateDestinationIds.some(candidate => Bytes.areEqual(candidate, destinationId))) {
                if (fabric.isDeleting) {
                    throw new FabricNotFoundError("Fabric is deleting for CASE sigma2");
                }

                return fabric;
            }
        }

        const fabrics = this.#fabrics.map(
            fabric =>
                `#${fabric.fabricIndex} (node ID ${NodeId.strOf(fabric.nodeId)}) keys ${fabric.groups.keySets
                    .allKeysForId(0)
                    .map(({ key }) => Bytes.toHex(key))
                    .join(" & ")}`,
        );

        logger.debug(
            `No match for destination ID`,
            Diagnostic.dict({ destId: destinationId, random: initiatorRandom, ...fabrics }),
        );

        throw new FabricNotFoundError("Fabric not found for CASE sigma2");
    }

    findByKeypair(keypair: Key) {
        this.#construction.assert();

        for (const fabric of this.fabrics) {
            if (fabric.matchesKeyPair(keypair)) {
                return fabric;
            }
        }
        return undefined;
    }

    forDescriptor(descriptor: { rootPublicKey: Bytes; fabricId: FabricId }) {
        this.#construction.assert();

        return this.find(
            fabric =>
                Bytes.areEqual(fabric.rootPublicKey, descriptor.rootPublicKey) &&
                fabric.fabricId === descriptor.fabricId,
        );
    }

    async replaceFabric(fabric: Fabric) {
        await this.#construction;

        const { fabricIndex } = fabric;
        const existingFabric = this.for(fabricIndex);
        if (existingFabric === undefined) {
            throw new FabricNotFoundError(
                `Fabric with index ${fabricIndex} cannot be replaced because it does not exist.`,
            );
        }
        if (existingFabric === fabric) {
            // Nothing changed, so it is a restore without any change
            return;
        }

        this.#addOrUpdateFabricEntry(fabric);

        if (this.#storage) {
            await this.persistFabrics();
        }
        this.#events.replaced.emit(fabric);
    }
}

// Log unhandled errors but do not abort deletion.  We will still likely end up with inconsistent state but should be
// less harmful (and more secure) if we allow other observers to proceed
function unhandled(what: string) {
    return (e: Error, observer: Observer) => {
        logger.error(`Unhandled error in fabric ${what} observer ${observer.name || "(anon)"}`, e);
    };
}
