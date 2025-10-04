/**
 * @license
 * Copyright 2022-2025 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { Logger } from "#log/Logger.js";
import { HttpEndpoint } from "./HttpEndpoint.js";

const logger = Logger.get("HttpSharedEntpoint");

/**
 * Shared access to a single underlying HTTP endpoint.
 */
export class HttpSharedEndpoint {
    #create: () => Promise<HttpEndpoint>;
    #target?: HttpEndpoint;
    #instances = new Set<HttpEndpoint>();
    #isTls: boolean;

    constructor(isTls: boolean, create: () => Promise<HttpEndpoint>) {
        this.#isTls = isTls;
        this.#create = create;
    }

    get isTls() {
        return this.#isTls;
    }

    async use() {
        if (this.#target === undefined) {
            this.#target = await this.#createTarget();
        }

        const instance: HttpEndpoint = {
            http: undefined,
            ws: undefined,

            close: async () => {
                this.#instances.delete(instance);
                if (!this.#instances.size) {
                    try {
                        await this.#target?.close();
                    } catch (e) {
                        logger.error("Error closing HTTP endpoint", e);
                    } finally {
                        this.#target = undefined;
                    }
                }
            },
        };

        this.#instances.add(instance);

        return instance;
    }

    async #createTarget() {
        const target = await this.#create();

        target.http = async request => {
            for (const instance of this.#instances) {
                const response = await instance.http?.(request);
                if (response) {
                    return response;
                }
            }
        };

        target.ws = async (request, connect) => {
            let connected = false;
            for (const instance of this.#instances) {
                await instance.ws?.(request, async () => {
                    connected = true;
                    return connect();
                });

                if (connected) {
                    break;
                }
            }
        };

        return target;
    }
}
