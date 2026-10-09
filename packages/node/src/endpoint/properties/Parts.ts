/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { IndexBehavior } from "#behavior/system/index/IndexBehavior.js";
import { Construction, ImplementationError, Lifecycle, Logger, MutableSet } from "@matter/general";
import { Agent } from "../Agent.js";
import { Endpoint } from "../Endpoint.js";
import { EndpointPartsError, IdentityConflictError, PartNotFoundError } from "../errors.js";
import { EndpointType } from "../type/EndpointType.js";
import { EndpointContainer } from "./EndpointContainer.js";
import { EndpointLifecycle } from "./EndpointLifecycle.js";

const logger = Logger.get("Parts");

/**
 * Manages the parent-child relationship between endpoints as defined by the "Parts" attribute of the Basic Information
 * cluster.
 *
 * Add child parts with {@link add}.  A part leaves its parent when it is closed or deleted; {@link delete} and
 * {@link clear} throw.
 *
 * Notifications of structural change bubble via {@link Endpoint.lifecycle.changed}.
 */
export class Parts extends EndpointContainer implements MutableSet<Endpoint, Endpoint | Agent> {
    #bubbleChange: (type: EndpointLifecycle.Change, endpoint: Endpoint) => void;

    constructor(endpoint: Endpoint) {
        super(endpoint);

        const lifecycle = this.owner.lifecycle;
        this.#bubbleChange = (type, endpoint) => lifecycle.bubble(type, endpoint);
    }

    override add(child: Endpoint.Definition | Agent) {
        const endpoint = this.#endpointFor(child);

        // Setting endpoint.owner also invokes add() so make sure we don't recurse
        if (this.has(endpoint)) {
            return;
        }

        assertNotAncestor(this.owner, endpoint);

        if (endpoint.maybeNumber === 0) {
            throw new IdentityConflictError(
                `Cannot add ${endpoint} to ${this.owner} because endpoint number 0 belongs to the node root`,
            );
        }

        // Insertion validation is only possible in a fully configured node. Otherwise each endpoint's number is
        // checked when the endpoint is constructed
        if (this.owner.lifecycle.isReady) {
            this.#validateInsertion(endpoint, endpoint);
        }

        super.add(endpoint);

        endpoint.lifecycle.changed.on(this.#bubbleChange);

        // If the part is already fully initialized we initialize the child now
        if (this.owner.lifecycle.isPartsReady) {
            if (!endpoint.construction.isErrorHandled) {
                endpoint.construction.onError(error => logger.error(`Error initializing ${endpoint}:`, error));
            }

            endpoint.construction.start();
        }

        return endpoint;
    }

    /**
     * @deprecated Always throws; remove the endpoint with {@link Endpoint.close} or {@link Endpoint.delete}.
     */
    override delete(child: Endpoint | Agent): never {
        throw new ImplementationError(
            `Cannot remove ${this.#endpointFor(child)} from ${this.owner} directly; use close() or delete() on the endpoint`,
        );
    }

    /**
     * @deprecated Always throws; remove each endpoint with {@link Endpoint.close} or {@link Endpoint.delete}.
     */
    override clear(): never {
        throw new ImplementationError(
            `Cannot remove the parts of ${this.owner} directly; use close() or delete() on each endpoint`,
        );
    }

    override remove(endpoint: Endpoint) {
        if (!super.remove(endpoint)) {
            return false;
        }

        endpoint.lifecycle.changed.off(this.#bubbleChange);

        return true;
    }

    require(id: string) {
        const part = this.get(id);

        if (part === undefined) {
            throw new PartNotFoundError(`Endpoint ${this.owner} has no part ${id}`);
        }

        return part;
    }

    override has(identity: string | Endpoint | Agent) {
        if (typeof identity === "string") {
            for (const child of this) {
                if (child.maybeId === identity) {
                    return true;
                }
            }
            return false;
        }

        return super.has(this.#endpointFor(identity));
    }

    indexOf(child: Endpoint | Agent) {
        const endpoint = this.#endpointFor(child);
        let index = 0;

        for (const other of this) {
            if (endpoint === other) {
                return index;
            }
            index++;
        }

        return -1;
    }

    /**
     * Initialize all uninitialized Parts.
     *
     * Invoked automatically by the owner after behaviors initialize.
     */
    initialize() {
        // Sanity check
        if (!this.owner.lifecycle.isReady) {
            throw new ImplementationError(`Cannot initialize parts because endpoint is not ready`);
        }

        // Our only purpose is to initialize child parts
        const onPartsReady = () => this.owner.lifecycle.change(EndpointLifecycle.Change.PartsReady);
        if (!this.size) {
            onPartsReady();
            return;
        }

        // Initiate initialization of all parts
        for (const endpoint of this) {
            const isInactive = endpoint.construction.status === Lifecycle.Status.Inactive;
            if (isInactive || endpoint.construction.status === Lifecycle.Status.Initializing) {
                endpoint.construction.onError(error => {
                    // We always log startup errors as an AggregateError could lead to some deeply nested, confusing
                    // error hierarchies.  For essential endpoints we then throw EndpointPartsError for the owner
                    // that lists the parts that crashed
                    logger.error(`Error initializing ${endpoint}:`, error);
                });

                if (isInactive) {
                    endpoint.construction.start();
                }
            }
        }

        // Wait for parts to initialize.  Throws if any essential parts crashed
        const onPartsCrashed = (errored: Iterable<Endpoint>) => {
            const essential = [...errored].filter(endpoint => endpoint.lifecycle.isEssential);
            if (essential.length) {
                return new EndpointPartsError(essential);
            }
        };
        let promise = Construction.all(this, onPartsCrashed);

        // Once parts are initialized we consider the endpoint "tree ready"
        if (promise) {
            promise = promise.then(onPartsReady);
        } else {
            onPartsReady();
        }

        return promise;
    }

    // The incoming endpoints are not indexed yet, so duplicates within the inserted tree are tracked separately
    #validateInsertion(forefather: Endpoint, endpoint: Endpoint, usedNumbers = new Set<number>()) {
        if (endpoint.lifecycle.hasNumber) {
            IndexBehavior.assertNumberAvailable(endpoint, endpoint.number, this.owner);
            if (usedNumbers.has(endpoint.number)) {
                throw new IdentityConflictError(
                    `Cannot add endpoint ${forefather} because descendants have conflicting definitions for endpoint number ${endpoint.number}`,
                );
            }
            usedNumbers.add(endpoint.number);
        }

        if (!endpoint.hasParts) {
            return;
        }

        for (const child of endpoint.parts) {
            this.#validateInsertion(forefather, child, usedNumbers);
        }
    }

    #endpointFor(child: Endpoint.Definition | Agent) {
        if (child instanceof Agent) {
            child = child.endpoint;
        }

        if (!(child instanceof Endpoint)) {
            if ((child as any).type) {
                (child as any).owner = this.owner;
            } else {
                child = {
                    type: child as EndpointType,
                    owner: this.owner,
                };
            }
        }

        return Endpoint.partFor(child);
    }
}

function assertNotAncestor(owner: Endpoint, endpoint: Endpoint) {
    if (owner === endpoint) {
        throw new ImplementationError(`Cannot add ${endpoint} to itself`);
    }

    for (let ancestor: Endpoint | undefined = owner; ancestor; ancestor = ancestor.owner) {
        if (ancestor === endpoint) {
            throw new ImplementationError(
                `Cannot add ${endpoint} to ${owner} because ${endpoint} is an ancestor of ${owner}`,
            );
        }
        if (ancestor.maybeNumber === 0) {
            break;
        }
    }
}
