/**
 * @license
 * Copyright 2022-2025 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { Behavior } from "#behavior/Behavior.js";
import { BehaviorBacking } from "#behavior/internal/BehaviorBacking.js";
import { ServerBehaviorBacking } from "#behavior/internal/ServerBehaviorBacking.js";
import { Endpoint } from "#endpoint/Endpoint.js";
import { EndpointInitializer } from "#endpoint/properties/EndpointInitializer.js";
import { Environment, InternalError, Logger } from "#general";
import { ServerNodeStore } from "#storage/server/ServerNodeStore.js";
import { DescriptorServer } from "../../behaviors/descriptor/DescriptorServer.js";

const logger = Logger.get("BehaviorInit");

export class ServerEndpointInitializer extends EndpointInitializer {
    #store: ServerNodeStore;

    constructor(environment: Environment) {
        super();
        this.#store = environment.get(ServerNodeStore);
    }

    override initializeDescendant(endpoint: Endpoint) {
        if (!endpoint.lifecycle.hasId) {
            endpoint.id = this.#identifyPart(endpoint);
        }

        this.#store.endpointStores.assignNumber(endpoint);

        // DescriptorServer is mandatory but we don't include it in generated device types
        if (!(DescriptorServer.id in endpoint.behaviors.supported)) {
            endpoint.behaviors.inject(DescriptorServer, undefined, false);
        }
    }

    async eraseDescendant(endpoint: Endpoint) {
        if (!endpoint.lifecycle.hasId) {
            return;
        }

        await this.#store.endpointStores.eraseStoreForEndpoint(endpoint);
    }

    async deactivateDescendant(endpoint: Endpoint) {
        if (!endpoint.lifecycle.hasId || endpoint.number === 0) {
            return;
        }

        this.#store.endpointStores.deactivateStoreForEndpoint(endpoint);
    }

    /**
     * Create the backing.
     *
     * If the behavior is a cluster behavior and the node is already initialized, create a server when the behavior
     * initializes.
     */
    createBacking(endpoint: Endpoint, type: Behavior.Type): BehaviorBacking {
        const store = this.#store.storeForEndpoint(endpoint).createStoreForBehavior(type.id);

        return new ServerBehaviorBacking(endpoint, type, store, endpoint.behaviors.optionsFor(type));
    }

    /**
     * Select an ID for an endpoint automatically based on available metadata.
     */
    #identifyPart(endpoint: Endpoint) {
        const basicInfo =
            endpoint.behaviors.supported.basicInformation ?? endpoint.behaviors.supported.bridgedDeviceBasicInformation;
        if (basicInfo) {
            const defaults = {
                ...new basicInfo.State(),
                ...endpoint.behaviors.defaultsFor(basicInfo),
            };

            let id = (defaults as Record<string, string>).uniqueId;
            if (id) {
                return id;
            }

            id = (defaults as Record<string, string>).serialNumber;
            if (id) {
                return id;
            }
        }

        if (!(endpoint.owner instanceof Endpoint)) {
            throw new InternalError("Cannot determine ID for endpoint with unknown parent type");
        }
        if (!endpoint.owner.lifecycle.hasId) {
            throw new InternalError("Cannot determine ID for endpoint because parent has no ID");
        }

        const index = endpoint.owner.parts.indexOf(endpoint);
        if (index === -1) {
            throw new InternalError("Cannot determine ID for endpoint because parent does not list as child");
        }

        // Use "part" rather than "endpoint" because it is scoped within parent endpoint
        const id = `part${index}`;
        logger.warn(`Using fallback ID of ${id} for child of ${endpoint.owner}; assign ID to remove this warning`);

        return id;
    }
}
