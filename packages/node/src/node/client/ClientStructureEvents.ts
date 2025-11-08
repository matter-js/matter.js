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
import { Environment, Environmental, Observable } from "#general";
import { DeviceTypeId } from "#types";

/**
 * An environmental service that manages events endpoint and behavior types.
 */
export class ClientStructureEvents {
    #endpointEvents?: Map<DeviceTypeId, Observable<[Endpoint]>>;
    #clusterEvents?: Map<
        string,
        Array<{
            requestedType: Behavior.Type;
            event: Observable<[Endpoint, Behavior.Type]>;
        }>
    >;

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
            this.#endpointEvents.set(type.deviceType, (event = Observable()));
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

        const event = Observable();
        events.push({ requestedType: type, event });

        return event;
    }

    emitEndpoint(endpoint: Endpoint) {
        if (this.#endpointEvents && endpoint.behaviors.supported.descriptor) {
            const deviceTypes = endpoint.stateOf(DescriptorClient).deviceTypeList;
            for (const dt of deviceTypes) {
                this.#endpointEvents.get(dt.deviceType)?.emit(endpoint);
            }
        }

        for (const type of Object.values(endpoint.behaviors.supported)) {
            this.emitCluster(endpoint, type);
        }

        for (const part of endpoint.parts) {
            this.emitEndpoint(part);
        }
    }

    emitCluster(endpoint: Endpoint, type: Behavior.Type) {
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
}
