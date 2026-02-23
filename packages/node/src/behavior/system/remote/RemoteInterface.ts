/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import {
    Abort,
    AppAddress,
    BasicMultiplex,
    decamelize,
    ImplementationError,
    Lifetime,
    Logger,
    Multiplex,
} from "#general";
import type { ServerNode } from "#node/ServerNode.js";
import { ApiPath } from "./api/ApiPath.js";

const logger = Logger.get("RemoteAdapter");

/**
 * An implementation of a non-Matter network protocol for accessing a {@link ServerNode}.
 */
export abstract class RemoteInterface {
    #node: ServerNode;
    #lifetime: Lifetime;
    #address: AppAddress;
    #abort = new Abort();
    #root: ApiPath;
    #workers: Multiplex;
    #certificate?: string;
    #key?: string;

    constructor({ node, address, certificate, key }: RemoteInterface.Configuration) {
        this.assertProtocol(address.appProtocol);
        this.#node = node;
        this.#lifetime = node.env.join(decamelize(this.constructor.name, " "));
        this.#workers = new BasicMultiplex();
        this.#address = address;
        this.#root = new ApiPath(address);
        this.#certificate = certificate;
        this.#key = key;
    }

    join(...name: unknown[]) {
        return this.#lifetime.join(...name);
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

    get certificate() {
        return this.#certificate;
    }

    get key() {
        return this.#key;
    }

    get isAborted() {
        return this.#abort.aborted;
    }

    get abort() {
        return this.#abort.signal;
    }

    static async create<This extends new (config: RemoteInterface.Configuration) => RemoteInterface>(
        this: This,
        config: RemoteInterface.Configuration,
    ) {
        const instance = new this(config);
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

        using _closing = this.#lifetime.closing();

        this.#abort();

        try {
            await this.stop();
        } catch (e) {
            logger.error(`Error terminating API endpoint ${this.address}`);
        }
    }

    protected assertProtocol(appProtocol: string) {
        const baseProtocol = (this.constructor as unknown as RemoteInterface.Type).protocol;
        if (appProtocol !== baseProtocol && appProtocol !== `${baseProtocol}s`) {
            throw new ImplementationError(
                `Invalid protocol ${this.address} for API endpoin type ${this.constructor.name}`,
            );
        }
    }

    protected addWorker(worker: Promise<void>) {
        this.#workers.add(worker);
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
        create(config: Configuration): Promise<RemoteInterface>;
    }

    export interface Configuration {
        node: ServerNode;
        address: AppAddress;
        certificate?: string;
        key?: string;
    }
}
