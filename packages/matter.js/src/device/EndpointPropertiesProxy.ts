/**
 * @license
 * Copyright 2022-2025 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { Immutable } from "#general";
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
    #nameIdMap?: Map<string, ClusterId>;

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

                    // Try to find cluster by name first, then by id
                    let clusterId = this.#clusterIdForName(prop);
                    if (clusterId === undefined) {
                        const id = parseInt(prop, 10);
                        clusterId = Number.isFinite(id) ? ClusterId(id) : undefined;
                    }
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
            },
        ) as Immutable<Record<string | AttributeId, any>>;
    }

    #clusterIdForName(name: string): ClusterId | undefined {
        // Initialize map if not done yet or cluster structure changed
        if (this.#nameIdMap === undefined || this.#nameIdMap.size !== this.#clusterClients.size) {
            this.#nameIdMap = new Map<string, ClusterId>();
            for (const [id, client] of this.#clusterClients) {
                this.#nameIdMap.set(client.name.toLowerCase(), id);
            }
        }
        return this.#nameIdMap.get(name.toLowerCase());
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
