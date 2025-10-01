/**
 * @license
 * Copyright 2022-2025 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { IndexBehavior } from "#behavior/system/index/IndexBehavior.js";
import type { Endpoint } from "#endpoint/Endpoint.js";
import { EndpointType } from "#endpoint/type/EndpointType.js";
import type { ImmutableSet } from "#general";
import { Node } from "#node/Node.js";
import { StatusResponse } from "#types";

/**
 * Access to all endpoints on a node, including the root endpoint.
 */
export class Endpoints implements ImmutableSet<Endpoint> {
    #node: Node;

    constructor(node: Node) {
        this.#node = node;
    }

    has(endpoint: Endpoint | number): boolean {
        if (endpoint === this.#node || endpoint === 0) {
            return true;
        }

        if (typeof endpoint === "number") {
            return endpoint in this.#index;
        }

        return endpoint.lifecycle.hasNumber && endpoint.number in this.#index;
    }

    get size(): number {
        return this.#list.length + 1;
    }

    map<R>(mapper: (item: Endpoint<EndpointType.Empty>) => R): R[] {
        return this.#list.map(mapper);
    }

    find(predicate: (item: Endpoint) => boolean | undefined): Endpoint | undefined {
        return this.#list.find(predicate);
    }

    filter(predicate: (item: Endpoint) => boolean | undefined): Endpoint[] {
        return this.#list.filter(predicate);
    }

    [Symbol.iterator]() {
        return this.#list[Symbol.iterator]();
    }

    for(number: number): Endpoint {
        if (number === 0) {
            return this.#node;
        }

        const endpoint = this.#index[number];
        if (endpoint === undefined) {
            throw new StatusResponse.NotFoundError(`Endpoint ${number} does not exist`);
        }
        return endpoint;
    }

    /**
     * Object mapping EndpointNumber -> Endpoint.
     *
     * Note that this does not include endpoint 0, but we have that in #node.
     */
    get #index() {
        return this.#node.behaviors.internalsOf(IndexBehavior).partsByNumber;
    }

    /**
     * Full list of endpoints.  Includes endpoint 0.
     */
    get #list() {
        return [this.#node, ...Object.values(this.#index)];
    }
}
