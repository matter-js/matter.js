/**
 * @license
 * Copyright 2022-2025 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { Immutable, ImplementationError } from "#general";
import { ClusterClientObj } from "#protocol";
import { ClusterId, ClusterType } from "#types";

/**
 * Provides proxy-based access to cached cluster state values and commands for legacy Endpoint.
 * This class enables ClientNode-style state and command access patterns.
 */
export class EndpointStateProxy {
    #clusterClients: Map<ClusterId, ClusterClientObj>;
    #endpointNumber: number | undefined;
    #stateProxy?: any;

    constructor(clusterClients: Map<ClusterId, ClusterClientObj>, endpointNumber: number | undefined) {
        this.#clusterClients = clusterClients;
        this.#endpointNumber = endpointNumber;
    }

    /**
     * Get the main state proxy that allows access via cluster names/IDs
     */
    get state() {
        if (!this.#stateProxy) {
            this.#stateProxy = this.#createStateProxy();
        }
        return this.#stateProxy;
    }

    /**
     * Get typed state access for a specific cluster
     */
    stateOf<const T extends ClusterType>(cluster: T): Immutable<Record<string, any>> {
        const clusterClient = this.#clusterClients.get(cluster.id) as ClusterClientObj<T>;
        if (!clusterClient) {
            throw new ImplementationError(
                `Cluster ${cluster.name} (0x${cluster.id.toString(16)}) is not present on endpoint ${this.#endpointNumber}`,
            );
        }
        return this.#createClusterStateProxy(clusterClient);
    }

    /**
     * Get typed command access for a specific cluster
     */
    commandsOf<const T extends ClusterType>(cluster: T): Record<string, (...args: any[]) => any> {
        const clusterClient = this.#clusterClients.get(cluster.id) as ClusterClientObj<T>;
        if (!clusterClient) {
            throw new ImplementationError(
                `Cluster ${cluster.name} (0x${cluster.id.toString(16)}) is not present on endpoint ${this.#endpointNumber}`,
            );
        }
        return clusterClient.commands;
    }

    #createStateProxy(): any {
        return new Proxy(
            {},
            {
                get: (_target, prop) => {
                    if (typeof prop !== "string") {
                        return undefined;
                    }

                    // Try to find cluster by name first
                    let clusterClient = this.#findClusterClientByName(prop);
                    if (!clusterClient) {
                        // Try to find by ID (numeric string or hex string)
                        clusterClient = this.#findClusterClientById(prop);
                    }

                    if (!clusterClient) {
                        return undefined;
                    }

                    return this.#createClusterStateProxy(clusterClient);
                },
            },
        );
    }

    #createClusterStateProxy(clusterClient: ClusterClientObj): Immutable<Record<string, any>> {
        return new Proxy(
            {},
            {
                get: (_target, prop) => {
                    if (typeof prop !== "string") {
                        return undefined;
                    }

                    // Try to find attribute by name first
                    const attributeClient = clusterClient.attributes[prop];
                    if (attributeClient) {
                        const value = attributeClient.getLocal();
                        return value;
                    }

                    // Try to find by ID (numeric string or hex string)
                    const numericId = this.#parseId(prop);
                    if (numericId !== undefined) {
                        for (const [, attrClient] of Object.entries(clusterClient.attributes)) {
                            if ((attrClient as any).id === numericId) {
                                const value = (attrClient as any).getLocal();
                                return value;
                            }
                        }
                    }

                    return undefined;
                },
            },
        ) as Immutable<Record<string, any>>;
    }

    #findClusterClientByName(name: string): ClusterClientObj | undefined {
        for (const clusterClient of this.#clusterClients.values()) {
            if (clusterClient.name.toLowerCase() === name.toLowerCase()) {
                return clusterClient;
            }
        }
        return undefined;
    }

    #findClusterClientById(idStr: string): ClusterClientObj | undefined {
        const id = this.#parseId(idStr);
        if (id !== undefined) {
            return this.#clusterClients.get(id as ClusterId);
        }
        return undefined;
    }

    #parseId(idStr: string): number | undefined {
        // Try decimal first
        const decimal = parseInt(idStr, 10);
        if (!isNaN(decimal) && decimal.toString() === idStr) {
            return decimal;
        }

        // Try hex (with or without 0x prefix)
        if (idStr.startsWith("0x")) {
            const hex = parseInt(idStr.slice(2), 16);
            if (!isNaN(hex)) {
                return hex;
            }
        } else {
            const hex = parseInt(idStr, 16);
            if (!isNaN(hex) && /^[0-9a-f]+$/i.test(idStr)) {
                return hex;
            }
        }

        return undefined;
    }
}
