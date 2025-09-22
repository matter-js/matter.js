/**
 * @license
 * Copyright 2022-2025 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { decamelize, Immutable } from "#general";
import { ClusterClientObj } from "#protocol";
import { AttributeId, ClusterId, CommandId } from "#types";

enum EndpointPropertiesProxyType {
    State = "state",
    Commands = "commands",
}

/**
 * Factory for creating proxy-based access to cached cluster state values for legacy Endpoint.
 * This enables ClientNode-style state access patterns.
 */
export class EndpointPropertiesProxy {
    #clusterClients: Map<ClusterId, ClusterClientObj>;
    #nameIdMapData?: Map<string, ClusterId>;

    /**
     * Create a state proxy that allows access via cluster names/IDs
     */
    static state(clusterClients: Map<ClusterId, ClusterClientObj>) {
        return new EndpointPropertiesProxy(clusterClients).#proxy(
            EndpointPropertiesProxyType.State,
        ) as EndpointPropertiesProxy.State;
    }

    /**
     * Create a commands proxy that allows access via cluster names/IDs
     */
    static commands(clusterClients: Map<ClusterId, ClusterClientObj>) {
        return new EndpointPropertiesProxy(clusterClients).#proxy(
            EndpointPropertiesProxyType.Commands,
        ) as EndpointPropertiesProxy.Commands;
    }

    constructor(clusterClients: Map<ClusterId, ClusterClientObj>) {
        this.#clusterClients = clusterClients;
    }

    #proxy(type: EndpointPropertiesProxyType) {
        return new Proxy(
            {},
            {
                get: (_target, prop) => {
                    if (typeof prop !== "string") {
                        return undefined;
                    }

                    const clusterId = this.#clusterIdFromProp(prop);
                    if (clusterId !== undefined) {
                        const clusterClient = this.#clusterClients.get(clusterId);

                        if (clusterClient !== undefined) {
                            switch (type) {
                                case EndpointPropertiesProxyType.Commands:
                                    return clusterClient.commands;
                                case EndpointPropertiesProxyType.State:
                                    return this.#createClusterStateProxy(clusterClient);
                            }
                        }
                    }
                    return undefined;
                },

                has: (_target, prop) => {
                    if (typeof prop !== "string") {
                        return false;
                    }

                    const clusterId = this.#clusterIdFromProp(prop);

                    return clusterId !== undefined && this.#clusterClients.has(clusterId);
                },

                ownKeys: () => {
                    return Array.from(this.#nameIdMap.entries()).flatMap(([name, id]) => [name, id.toString()]);
                },
            },
        );
    }

    #createClusterStateProxy(clusterClient: ClusterClientObj): Immutable<Record<string | AttributeId, any>> {
        return new Proxy(
            {},
            {
                get: (_target, prop) => {
                    if (typeof prop !== "string") {
                        return undefined;
                    }

                    return clusterClient.attributes[prop]?.getLocal();
                },

                has: (_target, prop) => {
                    if (typeof prop !== "string") {
                        return false;
                    }
                    return prop in clusterClient.attributes;
                },

                ownKeys: () => {
                    return Object.keys(clusterClient.attributes);
                },
            },
        ) as Immutable<Record<string | AttributeId, any>>;
    }

    get #nameIdMap() {
        // Initialize map if not done yet or cluster structure changed
        if (this.#nameIdMapData === undefined || this.#nameIdMapData.size === this.#clusterClients.size) {
            this.#nameIdMapData = new Map<string, ClusterId>();
            for (const [id, client] of this.#clusterClients) {
                this.#nameIdMapData.set(decamelize(client.name), id);
            }
        }
        return this.#nameIdMapData;
    }

    #clusterIdFromProp(prop: string): ClusterId | undefined {
        // Try to find cluster by name first, then by id
        let clusterId = this.#nameIdMap.get(prop);
        if (clusterId === undefined) {
            const id = parseInt(prop, 10);
            clusterId = Number.isFinite(id) ? ClusterId(id) : undefined;
        }

        return clusterId;
    }
}

export namespace EndpointPropertiesProxy {
    export type State = Immutable<{
        [key: string | ClusterId]: Record<string | AttributeId, any> | undefined;
    }>;

    export type Commands = Immutable<{
        [key: string | ClusterId]: Record<string | CommandId, (data: any) => Promise<unknown>> | undefined;
    }>;
}
