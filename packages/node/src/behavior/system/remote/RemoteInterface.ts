/**
 * @license
 * Copyright 2022-2025 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { AppAddress, BasicMultiplex, ImplementationError, Logger } from "#general";
import type { ServerNode } from "#node/ServerNode.js";
import { ApiPath } from "./api/ApiPath.js";

const logger = Logger.get("RemoteAdapter");

/**
 * An implementation of a non-Matter network protocol for accessing a {@link ServerNode}.
 */
export abstract class RemoteInterface {
    #node: ServerNode;
    #address: AppAddress;
    #abort = new AbortController();
    #root: ApiPath;
    #workers = new BasicMultiplex();

    constructor(node: ServerNode, address: AppAddress) {
        if (address.appProtocol !== (this.constructor as unknown as RemoteInterface.Type).protocol) {
            throw new ImplementationError(
                `API endpoint type ${this.constructor.name} does not support address ${address}`,
            );
        }
        this.#node = node;
        this.#address = address;
        this.#root = new ApiPath(address);
    }

    get root() {
        return this.#root;
    }

    get env() {
        return this.#node.env;
    }

    get node() {
        return this.#node;
    }

    get address() {
        return this.#address;
    }

    get isAborted() {
        return this.#abort.signal.aborted;
    }

    get abort() {
        return this.#abort.signal;
    }

    static async create<This extends new (node: ServerNode, address: AppAddress) => RemoteInterface>(
        this: This,
        node: ServerNode,
        address: AppAddress,
    ) {
        const instance = new this(node, address);
        try {
            await instance.start();
        } catch (e) {
            await instance.close();
            throw e;
        }
        return instance;
    }

    async close(): Promise<void> {
        if (this.isAborted) {
            return;
        }

        this.#abort.abort();

        try {
            await this.stop();
        } catch (e) {
            logger.error(`Error terminating API endpoint ${this.address}`);
        }
    }

    protected assertProtocol(appProtocol: string) {
        if (this.address.appProtocol !== appProtocol) {
            throw new ImplementationError(
                `Invalid protocol ${this.address} for API endpoin type ${this.constructor.name}`,
            );
        }
    }

    protected addWorker(worker: Promise<void>, description: string) {
        this.#workers.add(worker, description);
    }

    static protocol = "";

    /**
     * Initialize and begin handling requests to the interface.
     */
    protected abstract start(): Promise<void>;

    /**
     * Stop servicing requests.  Called on close.  The default implementation just waits for any workers to complete.
     */
    protected async stop(): Promise<void> {
        await this.#workers.close();
    }
}

export namespace RemoteInterface {
    export interface Type {
        protocol: string;
        create(node: ServerNode, address: AppAddress): Promise<RemoteInterface>;
    }
}
