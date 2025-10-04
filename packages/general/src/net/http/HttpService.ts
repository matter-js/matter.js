/**
 * @license
 * Copyright 2022-2025 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { Environment } from "#environment/Environment.js";
import { Environmental } from "#environment/Environmental.js";
import { ImplementationError } from "#MatterError.js";
import { AppAddress } from "#net/AppAddress.js";
import { HttpEndpoint } from "./HttpEndpoint.js";
import { HttpEndpointFactory } from "./HttpEndpointFactory.js";
import { HttpEndpointGroup } from "./HttpEndpointGroup.js";
import { HttpSharedEndpoint } from "./HttpSharedEndpoint.js";

/**
 * An environmental service that manages shared access to a set of endpoints.
 */
export class HttpService {
    #factory: HttpEndpointFactory;
    #endpoints = {} as Record<string, HttpSharedEndpoint>;

    constructor(factory: HttpEndpointFactory) {
        this.#factory = factory;
    }

    async create(...addresses: AppAddress.Definition[]) {
        if (addresses.length === 1) {
            return this.#forAddress(addresses[0]);
        }

        const endpoints = Array<HttpEndpoint>();

        try {
            for (const address of addresses) {
                endpoints.push(await this.#forAddress(address));
            }
        } catch (e) {
            await Promise.allSettled(endpoints.map(endpoint => endpoint.close()));
            throw e;
        }

        return new HttpEndpointGroup(endpoints);
    }

    async #forAddress(address: AppAddress.Definition) {
        const addr = AppAddress.for(address);
        if (addr.appProtocol !== "http" && addr.appProtocol !== "ws") {
            throw new ImplementationError(`Unsupported address ${addr} for HTTP endpoint`);
        }

        const key = JSON.stringify(addr.transport);
        let endpoint = this.#endpoints[key];
        if (endpoint) {
            if (endpoint.isTls !== addr.isTls) {
                const addrIs = addr.isTls ? "encrypted" : "unencrypted";
                const endpointIs = endpoint.isTls ? "encrypted" : "unencrypted";
                throw new ImplementationError(
                    `Service address ${addr} is ${addrIs} but existing endpoint is ${endpointIs}`,
                );
            }
        } else {
            endpoint = new HttpSharedEndpoint(addr.isTls, () => this.#factory.create({ address }));
            this.#endpoints[key] = endpoint;
        }

        return await endpoint.use();
    }

    static [Environmental.create](env: Environment) {
        const instance = new HttpService(env.get(HttpEndpointFactory));
        env.set(HttpService, instance);
        return instance;
    }
}
