/**
 * @license
 * Copyright 2022-2025 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { Immutable, ImplementationError } from "#general";
import { ClusterClientObj } from "#protocol";
import { ClusterId, ClusterType } from "#types";

/**
 * Factory for creating proxy-based access to cached cluster state values for legacy Endpoint.
 * This enables ClientNode-style state access patterns.
 */
export class EndpointStateProxy {
    /**
     * Create a state proxy that allows access via cluster names/IDs
     */
    static create(clusterClients: Map<ClusterId, ClusterClientObj>, endpointNumber: number | undefined): any {
        return this.#createStateProxy(clusterClients, endpointNumber);
    }

    /**
     * Get typed state access for a specific cluster
     */
    static stateOf<const T extends ClusterType>(
        clusterClients: Map<ClusterId, ClusterClientObj>,
        endpointNumber: number | undefined,
        cluster: T,
    ): Immutable<Record<string, any>> {
        const clusterClient = clusterClients.get(cluster.id) as ClusterClientObj<T>;
        if (!clusterClient) {
            throw new ImplementationError(
                `Cluster ${cluster.name} (0x${cluster.id.toString(16)}) is not present on endpoint ${endpointNumber}`,
            );
        }
        return this.#createClusterStateProxy(clusterClient);
    }

    static #createStateProxy(clusterClients: Map<ClusterId, ClusterClientObj>, endpointNumber: number | undefined): any {
        return new Proxy(
            {},
            {
                get: (_target, prop) => {
                    if (typeof prop !== "string") {
                        return undefined;
                    }

                    // Try to find cluster by name first
                    let clusterClient = this.#findClusterClientByName(clusterClients, prop);
                    if (!clusterClient) {
                        // Try to find by ID (numeric string or hex string)
                        clusterClient = this.#findClusterClientById(clusterClients, prop);
                    }

                    if (!clusterClient) {
                        return undefined;
                    }

                    return this.#createClusterStateProxy(clusterClient);
                },
            },
        );
    }

    static #createClusterStateProxy(clusterClient: ClusterClientObj): Immutable<Record<string, any>> {
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

    static #findClusterClientByName(clusterClients: Map<ClusterId, ClusterClientObj>, name: string): ClusterClientObj | undefined {
        for (const clusterClient of clusterClients.values()) {
            if (clusterClient.name.toLowerCase() === name.toLowerCase()) {
                return clusterClient;
            }
        }
        return undefined;
    }

    static #findClusterClientById(clusterClients: Map<ClusterId, ClusterClientObj>, idStr: string): ClusterClientObj | undefined {
        const id = this.#parseId(idStr);
        if (id !== undefined) {
            return clusterClients.get(id as ClusterId);
        }
        return undefined;
    }

    static #parseId(idStr: string): number | undefined {
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
