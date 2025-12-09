/**
 * @license
 * Copyright 2022-2025 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { IndexBehavior } from "#behavior/system/index/IndexBehavior.js";
import type { Endpoint } from "#endpoint/Endpoint.js";
import { EndpointType } from "#endpoint/type/EndpointType.js";
import type { ImmutableSet } from "#general";
import type { Node } from "#node/Node.js";
import { StatusResponse } from "#types";

/**
 * Access to all endpoints on a node, including the root endpoint.
 */
export class Endpoints implements ImmutableSet<Endpoint> {
    #node: Node;

    constructor(node: Node) {
        this.#node = node;
    }

    protected get node(): Node {
        return this.#node;
    }

    has(endpoint: Endpoint | number | string): boolean {
        if (endpoint === this.#node || endpoint === 0) {
            return true;
        }

        if (typeof endpoint === "number") {
            return endpoint in this.#index;
        }

        if (typeof endpoint === "string") {
            return endpoint in this.#idIndex;
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

    for(id: number | string): Endpoint {
        if (id === 0) {
            return this.#node;
        }

        const endpoint = typeof id === "string" ? this.#idIndex[id] : this.#index[id];
        if (endpoint === undefined) {
            throw new StatusResponse.NotFoundError(`Endpoint ${id} does not exist`);
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
     * Object mapping Endpoint-Id -> Endpoint.
     *
     * Note that this does not include endpoint 0, but we have that in #node.
     */
    get #idIndex() {
        return this.#node.behaviors.internalsOf(IndexBehavior).partsById;
    }

    /**
     * Full list of endpoints.  Includes endpoint 0.
     */
    get #list() {
        return [this.#node, ...Object.values(this.#index)];
    }
}
