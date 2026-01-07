/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { Construction, ImplementationError, Lifecycle, Logger, MutableSet } from "#general";
import { IdentityConflictError, IdentityService } from "#node/server/IdentityService.js";
import { Agent } from "../Agent.js";
import { Endpoint } from "../Endpoint.js";
import { EndpointPartsError, PartNotFoundError } from "../errors.js";
import { EndpointType } from "../type/EndpointType.js";
import { EndpointContainer } from "./EndpointContainer.js";
import { EndpointLifecycle } from "./EndpointLifecycle.js";

const logger = Logger.get("Parts");

/**
 * Manages the parent-child relationship between endpoints as defined by the "Parts" attribute of the Basic Information
 * cluster.
 *
 * You can manipulate child parts using {@link MutableSet} interface.
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

        // Insertion validation is only possible in a fully configured node. If we are not yet installed then an
        // ancestor will handle validation when we install
        if (this.owner.lifecycle.isReady) {
            this.#validateInsertion(endpoint, endpoint);
        }

        super.add(endpoint);

        endpoint.lifecycle.changed.on((type, endpoint) => this.#bubbleChange(type, endpoint));

        // If the part is already fully initialized we initialize the child now
        if (this.owner.lifecycle.isPartsReady) {
            if (!endpoint.construction.isErrorHandled) {
                endpoint.construction.onError(error => logger.error(`Error initializing ${endpoint}:`, error));
            }

            endpoint.construction.start();
        }

        return endpoint;
    }

    override delete(child: Endpoint | Agent) {
        const endpoint = this.#endpointFor(child);

        if (!super.delete(this.#endpointFor(child))) {
            return false;
        }

        const childLifeCycle = endpoint.lifecycle;
        childLifeCycle.changed.off(this.#bubbleChange);

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

    #validateInsertion(forefather: Endpoint, endpoint: Endpoint, usedNumbers?: Set<number>) {
        if (endpoint.lifecycle.hasNumber) {
            this.owner.env.get(IdentityService).assertNumberAvailable(endpoint.number, endpoint);
            if (usedNumbers?.has(endpoint.number)) {
                throw new IdentityConflictError(
                    `Cannot add endpoint ${forefather} because descendents have conflicting definitions for endpoint number ${endpoint.number}`,
                );
            }
        }

        if (!endpoint.hasParts) {
            return;
        }

        const children = endpoint.parts;
        if (!children.size) {
            return;
        }

        // We cannot rely on index to track identity of incoming endopint hierarchy because the entries are not yet
        // present in the index
        if (!usedNumbers) {
            usedNumbers = new Set();
        }
        if (endpoint.lifecycle.hasNumber) {
            usedNumbers.add(endpoint.number);
        }

        for (const child of children) {
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
