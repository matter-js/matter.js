/**
 * @license
 * Copyright 2022-2025 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { BasicSet, decamelize, Diagnostic, ImmutableSet, MutableSet, ObservableSet } from "#general";
import { IdentityConflictError } from "#node/server/IdentityService.js";
import { Endpoint } from "../Endpoint.js";

/**
 * Manages parent-child relationships between endpoints.
 */
export class EndpointContainer<T extends Endpoint = Endpoint>
    implements ImmutableSet<T>, MutableSet<T, T>, ObservableSet<T>
{
    #children = new BasicSet<T>();
    #owner: Endpoint;

    constructor(endpoint: Endpoint) {
        this.#owner = endpoint;
    }

    get(id: string | number) {
        if (typeof id === "number") {
            for (const child of this) {
                if (child.maybeNumber === id) {
                    return child;
                }
            }
        } else {
            for (const child of this) {
                if (child.maybeId === id) {
                    return child;
                }
            }
        }
    }

    add(endpoint: T) {
        if (endpoint.lifecycle.hasId) {
            this.assertIdAvailable(endpoint.id, endpoint);
        }

        this.#children.add(endpoint);
        endpoint.owner = this.#owner;

        endpoint.lifecycle.destroyed.once(() => {
            this.delete(endpoint);
        });

        this.#children.add(endpoint);
    }

    delete(endpoint: T) {
        return this.#children.delete(endpoint);
    }

    clear() {
        this.#children.clear();
    }

    has(endpoint: T) {
        return this.#children.has(endpoint);
    }

    get added() {
        return this.#children.added;
    }

    get deleted() {
        return this.#children.deleted;
    }

    get empty() {
        return this.#children.empty;
    }

    get size() {
        return this.#children.size;
    }

    map<T2>(fn: (part: T) => T2) {
        return this.#children.map(fn);
    }

    filter(predicate: (part: T) => boolean) {
        return this.#children.filter(predicate);
    }

    find(predicate: (part: T) => boolean) {
        return this.#children.find(predicate);
    }

    forEach(fn: (part: T) => boolean) {
        [...this.#children].forEach(fn);
    }

    [Symbol.iterator]() {
        return this.#children[Symbol.iterator]();
    }

    /**
     * Soft-reset all parts.  Invoked automatically by the owner on reset.
     */
    async reset() {
        for (const endpoint of this) {
            await endpoint.reset();
        }
    }

    /**
     * Destroy all parts.  Invoked automatically by the owner on destroy.
     */
    async close() {
        for (const endpoint of this) {
            await endpoint.close();
        }
    }

    /**
     * Confirm availability of an ID amongst the endpoint's children.
     */
    assertIdAvailable(id: string, endpoint: Endpoint) {
        const other = this.get(id);
        if (other && other !== endpoint) {
            throw new IdentityConflictError(`${other} is already defined; endpoint IDs must be unique within parent`);
        }
    }

    protected get owner() {
        return this.#owner;
    }

    get [Diagnostic.value]() {
        return Diagnostic.list([decamelize(this.constructor.name), ...this]);
    }
}
