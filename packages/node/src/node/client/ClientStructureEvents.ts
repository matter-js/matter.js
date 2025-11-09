/**
 * @license
 * Copyright 2022-2025 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { Behavior } from "#behavior/Behavior.js";
import { ClusterBehavior } from "#behavior/cluster/ClusterBehavior.js";
import { DescriptorClient } from "#behaviors/descriptor";
import { Endpoint } from "#endpoint/Endpoint.js";
import { EndpointType } from "#endpoint/type/EndpointType.js";
import { Environment, Environmental, Logger, Observable } from "#general";
import { DeviceTypeId } from "#types";

const logger = Logger.get("ClientStructureEvents");

/**
 * An environmental service that manages events endpoint and behavior types.
 */
export class ClientStructureEvents {
    #endpointEvents?: Map<DeviceTypeId, Observable<[endpoint: Endpoint]>>;
    #clusterEvents?: Map<
        string,
        Array<{
            requestedType: Behavior.Type;
            event: Observable<[endpoint: Endpoint, type: ClusterBehavior.Type]>;
        }>
    >;

    #clusterReplaced?: Observable<[endpoint: Endpoint, type: ClusterBehavior.Type]>;
    #clusterDeleted?: Observable<[endpoint: Endpoint, type: ClusterBehavior.Type]>;

    static [Environmental.create](env: Environment) {
        const instance = new ClientStructureEvents();
        env.set(ClientStructureEvents, instance);
        return instance;
    }

    endpointInstalled<T extends EndpointType>(type: T): Observable<[endpoint: Endpoint<T>]> {
        if (this.#endpointEvents === undefined) {
            this.#endpointEvents = new Map();
        }

        let event = this.#endpointEvents.get(type.deviceType);
        if (event === undefined) {
            this.#endpointEvents.set(type.deviceType, (event = this.#createEvent("endpointInstalled")));
        }

        return event as Observable<[endpoint: Endpoint<T>]>;
    }

    clusterInstalled<T extends ClusterBehavior.Type>(type: T): Observable<[endpoint: Endpoint, type: T]> {
        if (this.#clusterEvents === undefined) {
            this.#clusterEvents = new Map();
        }

        let events = this.#clusterEvents.get(type.id);
        if (events === undefined) {
            this.#clusterEvents.set(type.id, (events = []));
        }

        for (const { requestedType, event } of events) {
            if (requestedType.supports(type)) {
                return event;
            }
        }

        const event = this.#createEvent("clusterInstalled");
        events.push({ requestedType: type, event });

        return event;
    }

    get clusterReplaced() {
        if (this.#clusterReplaced) {
            return this.#clusterReplaced;
        }
        return (this.#clusterReplaced = this.#createEvent("clusterReplaced"));
    }

    get clusterDeleted() {
        if (this.#clusterDeleted) {
            return this.#clusterDeleted;
        }
        return (this.#clusterDeleted = this.#createEvent("clusterDeleted"));
    }

    emitEndpoint(endpoint: Endpoint) {
        if (this.#endpointEvents && endpoint.behaviors.supported.descriptor) {
            const deviceTypes = endpoint.stateOf(DescriptorClient).deviceTypeList;
            for (const dt of deviceTypes) {
                this.#endpointEvents.get(dt.deviceType)?.emit(endpoint);
            }
        }

        for (const type of Object.values(endpoint.behaviors.supported)) {
            if (!("cluster" in type)) {
                continue;
            }

            this.emitCluster(endpoint, type as ClusterBehavior.Type);
        }

        for (const part of endpoint.parts) {
            this.emitEndpoint(part);
        }
    }

    emitCluster(endpoint: Endpoint, type: ClusterBehavior.Type) {
        const events = this.#clusterEvents?.get(type.id);
        if (!events) {
            return;
        }

        for (const { requestedType, event } of events) {
            if (type.supports(requestedType)) {
                event.emit(endpoint, type);
            }
        }
    }

    emitClusterReplaced(endpoint: Endpoint, type: ClusterBehavior.Type) {
        if (!this.#clusterReplaced) {
            return;
        }

        this.#clusterReplaced.emit(endpoint, type);
    }

    emitClusterDeleted(endpoint: Endpoint, type: ClusterBehavior.Type) {
        if (!this.#clusterDeleted) {
            return;
        }

        this.#clusterDeleted.emit(endpoint, type);
    }

    #createEvent(kind: string): Observable<any, void> {
        return Observable(unhandledError);

        function unhandledError(e: unknown) {
            logger.error(`Unhandled error in client structure ${kind} event handler:`, e);
        }
    }
}
