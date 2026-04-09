/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { Endpoint } from "#endpoint/Endpoint.js";
import type { ServerNode } from "#node/ServerNode.js";
import {
    asyncNew,
    type BlobStorageDriver,
    type BlobStorageHandle,
    DatafileRoot,
    Destructable,
    Diagnostic,
    Environment,
    ImplementationError,
    Logger,
    StorageManager,
    StorageService,
} from "@matter/general";
import { NodeStore } from "../NodeStore.js";
import { ClientNodeStores } from "../client/ClientNodeStores.js";
import { ServerEndpointStores } from "./ServerEndpointStores.js";

const logger = Logger.get("ServerNodeStore");

/**
 * {@link ServerNode} persistence.
 *
 * Each {@link ServerNode} has an instance of this store.
 *
 * Exclusive access is enforced by {@link Directory.lock} when a filesystem-backed storage driver is in use.
 */
export class ServerNodeStore extends NodeStore implements Destructable {
    #env: Environment;
    #nodeId: string;
    #endpointStores: ServerEndpointStores;
    #storageManager?: StorageManager;
    #clientStores?: ClientNodeStores;
    #bdxHandle?: BlobStorageHandle;

    constructor(environment: Environment, nodeId: string) {
        super({
            createContext: (name: string) => {
                if (!this.#storageManager) {
                    throw new ImplementationError(
                        `Cannot create storage context ${name} because store is not initialized`,
                    );
                }
                return this.#storageManager.createContext(name);
            },
        });

        this.#endpointStores = new ServerEndpointStores();

        this.#env = environment;
        this.#nodeId = nodeId;

        this.construction.start();
    }

    static async create(environment: Environment, nodeId: string) {
        return await asyncNew(this, environment, nodeId);
    }

    async close() {
        await this.construction.close(async () => {
            await this.#clientStores?.close();
            await this.#bdxHandle?.close();
            await this.#storageManager?.close();
            await this.#env.get(StorageService).close(this.#nodeId);
            this.#logChange("Closed");
        });
    }

    /**
     * Stores associated with server endpoints supported by this node.
     */
    get endpointStores() {
        return this.construction.assert("endpoint stores", this.#endpointStores);
    }

    /**
     * Stores associated with remote nodes known by this node.
     */
    get clientStores() {
        return this.construction.assert("client stores", this.#clientStores);
    }

    /**
     * The underlying {@link StorageManager} that provides node data.
     */
    get storage() {
        return this.construction.assert("storage manager", this.#storageManager);
    }

    #logChange(what: "Opened" | "Closed") {
        const root = this.#env.has(DatafileRoot) ? this.#env.get(DatafileRoot) : undefined;
        logger.info(
            what,
            Diagnostic.strong(this.#nodeId ?? "node"),
            "storage",
            Diagnostic.dict({
                location: root?.path ?? "(unknown location)",
                driver: this.#storageManager?.driverId ?? "unknown",
            }),
        );
    }

    storeForEndpoint(endpoint: Endpoint) {
        return this.#endpointStores.storeForEndpoint(endpoint);
    }

    /**
     * Lazily opens and returns the BDX blob storage driver using a dedicated namespace.
     */
    override async bdxStore(): Promise<BlobStorageDriver> {
        if (!this.#bdxHandle) {
            const root = this.#env.has(DatafileRoot) ? this.#env.get(DatafileRoot) : undefined;
            const blobNamespace = root ? new DatafileRoot(root.directory.directory("bdx")) : `${this.#nodeId}-bdx`;
            this.#bdxHandle = await this.#env.get(StorageService).openBlobStorage(blobNamespace);
        }
        return this.#bdxHandle.driver;
    }

    erase() {
        return this.#endpointStores.erase();
    }

    async load() {
        const root = this.#env.has(DatafileRoot) ? this.#env.get(DatafileRoot) : undefined;
        this.#storageManager = await this.#env.get(StorageService).open(root ?? this.#nodeId);
        this.#env.set(StorageManager, this.#storageManager);

        this.#clientStores = await asyncNew(ClientNodeStores, this.#storageManager.createContext("nodes"));

        const rootContext = this.storageFactory.createContext("root");
        await this.#endpointStores.load(rootContext);

        this.#logChange("Opened");
    }
}
