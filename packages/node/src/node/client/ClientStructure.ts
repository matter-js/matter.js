/**
 * @license
 * Copyright 2022-2025 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { Behavior } from "#behavior/Behavior.js";
import { ClusterBehavior } from "#behavior/cluster/ClusterBehavior.js";
import { Datasource } from "#behavior/state/managed/Datasource.js";
import { Descriptor } from "#clusters/descriptor";
import { Endpoint } from "#endpoint/Endpoint.js";
import { EndpointType } from "#endpoint/type/EndpointType.js";
import { RootEndpoint } from "#endpoints/root";
import {
    AcceptedCommandList,
    AttributeList,
    ClusterRevision,
    DeviceClassification,
    DeviceTypeModel,
    FeatureMap,
    Matter,
    type FeatureBitmap,
} from "#model";
import type { ClientNode } from "#node/ClientNode.js";
import { ReadScope, type Read, type ReadResult } from "#protocol";
import { DatasourceCache } from "#storage/client/DatasourceCache.js";
import { ClientNodeStore } from "#storage/index.js";
import type { AttributeId, ClusterId, ClusterType, CommandId, EndpointNumber } from "#types";
import { ClientEventEmitter } from "./ClientEventEmitter.js";
import { PeerBehavior } from "./PeerBehavior.js";

const DEVICE_TYPE_LIST_ATTR_ID = Descriptor.Cluster.attributes.deviceTypeList.id;
const SERVER_LIST_ATTR_ID = Descriptor.Cluster.attributes.serverList.id;
const PARTS_LIST_ATTR_ID = Descriptor.Cluster.attributes.partsList.id;

/**
 * Manages endpoint and behavior structure for a single client node.
 */
export class ClientStructure {
    #nodeStore: ClientNodeStore;
    #endpoints: Record<EndpointNumber, EndpointStructure> = {};
    #emitEvent: ClientEventEmitter;
    #node: ClientNode;
    #subscribedFabricFiltered?: boolean;

    constructor(node: ClientNode) {
        this.#node = node;
        this.#nodeStore = node.env.get(ClientNodeStore);
        this.#endpoints[node.number] = {
            endpoint: node,
            clusters: {},
        };
        this.#emitEvent = ClientEventEmitter(node, this);
    }

    /**
     * Load initial structure from cache.
     */
    loadCache() {
        for (const store of this.#nodeStore.endpointStores) {
            const id = store.id;

            // Client storage uses the endpoint number as the key for the endpoint
            const number = Number.parseInt(id);
            if (!Number.isFinite(number)) {
                continue;
            }

            const endpoint = this.#endpointFor(number as EndpointNumber);

            // Load state for each behavior
            for (const idStr of store.knownBehaviors) {
                const id = Number.parseInt(idStr) as ClusterId;
                if (!Number.isFinite(id)) {
                    continue;
                }

                const cluster = this.#clusterFor(endpoint, id);
                this.#initializeCluster(endpoint, cluster);
            }
        }
    }

    /**
     * Obtain the store for a remote cluster.
     */
    storeForRemote(endpoint: Endpoint, type: ClusterBehavior.Type) {
        const endpointStructure = this.#endpointFor(endpoint.number);
        const clusterStructure = this.#clusterFor(endpointStructure, type.cluster.id);

        return clusterStructure.store;
    }

    /**
     * Obtain the store for a non-cluster behavior.
     *
     * The data for these behaviors is managed locally and not synced from the peer.
     */
    storeForLocal(endpoint: Endpoint, type: Behavior.Type) {
        return this.#nodeStore.storeForEndpoint(endpoint).createStoreForLocalBehavior(type.id);
    }

    /**
     * Inject version filters into a Read or Subscribe request.
     */
    injectVersionFilters<T extends Read>(request: T): T {
        const scope = ReadScope(request);
        let result = request;

        for (const {
            endpoint: { number: endpointId },
            clusters,
        } of Object.values(this.#endpoints)) {
            for (const {
                id: clusterId,
                store: { version },
            } of Object.values(clusters)) {
                if (!scope.isRelevant(endpointId, clusterId)) {
                    continue;
                }

                if (version === Datasource.UNKNOWN_VERSION) {
                    continue;
                }

                if (result === request) {
                    result = { ...request };
                }

                if (result.dataVersionFilters === undefined) {
                    result.dataVersionFilters = [];
                }

                result.dataVersionFilters.push({ path: { endpointId, clusterId }, dataVersion: version });
            }
        }

        return result;
    }

    /**
     * Update the node structure by applying attribute changes.
     */
    async *mutate(request: Read, changes: ReadResult) {
        const scope = ReadScope(request);

        let currentUpdates: AttributeUpdates | undefined;

        for await (const chunk of changes) {
            for (const change of chunk) {
                switch (change.kind) {
                    case "attr-value":
                        currentUpdates = await this.#mutateAttribute(change, scope, currentUpdates);
                        break;

                    case "event-value":
                        this.#emitEvent(change);
                        break;

                    // we ignore attr-status and event-status for now
                }
            }

            yield chunk;
        }

        if (currentUpdates) {
            await this.#updateCluster(currentUpdates);
        }
    }

    /** Reference to the default subscription used when the node was started. */
    protected get subscribedFabricFiltered() {
        if (this.#subscribedFabricFiltered === undefined) {
            this.#subscribedFabricFiltered = this.#node.state.network.defaultSubscription?.isFabricFiltered ?? true;
            this.#node.events.network.defaultSubscription$Changed.on(newSubscription => {
                this.#subscribedFabricFiltered = newSubscription?.isFabricFiltered ?? true;
            });
        }
        return this.#subscribedFabricFiltered;
    }

    async #mutateAttribute(
        change: ReadResult.AttributeValue,
        scope: ReadScope,
        currentUpdates: undefined | AttributeUpdates,
    ) {
        // We only store values when an initial subscription is defined and the fabric filter matches
        if (this.subscribedFabricFiltered !== scope.isFabricFiltered) {
            return currentUpdates;
        }

        const { endpointId, clusterId, attributeId } = change.path;

        // If we are building updates to a cluster and the cluster/endpoint changes, apply the current update
        // set
        if (currentUpdates && (currentUpdates.endpointId !== endpointId || currentUpdates.clusterId !== clusterId)) {
            await this.#updateCluster(currentUpdates);
            currentUpdates = undefined;
        }

        if (currentUpdates === undefined) {
            // Updating a new endpoint/cluster
            currentUpdates = {
                endpointId,
                clusterId,
                values: {
                    [attributeId]: change.value,
                },
            };

            // Update version but only if this was a wildcard read
            if (scope.isWildcard(endpointId, clusterId)) {
                currentUpdates.values[DatasourceCache.VERSION_KEY] = change.version;
            }
        } else {
            // Add value to change set for current endpoint/cluster
            currentUpdates.values[attributeId] = change.value;
        }

        return currentUpdates;
    }

    /**
     * Obtain the {@link ClusterType} for an {@link EndpointNumber} and {@link ClusterId}.
     */
    clusterFor(endpoint: EndpointNumber, cluster: ClusterId) {
        const ep = this.#endpointFor(endpoint);
        if (!ep) {
            return;
        }

        return this.#clusterFor(ep, cluster)?.behavior?.cluster;
    }

    /**
     * Obtain the {@link Endpoint} for a {@link EndpointNumber}.
     */
    endpointFor(endpoint: EndpointNumber): Endpoint | undefined {
        return this.#endpoints[endpoint]?.endpoint;
    }

    /**
     * Apply new attribute values for specific endpoint/cluster.
     *
     * This is invoked in a batch when we've collected all sequential values for the current endpoint/cluster.
     */
    async #updateCluster(attrs: AttributeUpdates) {
        const endpoint = this.#endpointFor(attrs.endpointId);
        const cluster = this.#clusterFor(endpoint, attrs.clusterId);
        await cluster.store.externalSet(attrs.values);
        this.#initializeCluster(endpoint, cluster);
    }

    /**
     * If enough attributes are present, installs a behavior on an endpoint
     *
     * If the cluster is Descriptor, performs additional {@link Endpoint} configuration such as installing parts and
     * device types.
     *
     * Invoked once we've loaded all attributes in an interaction.
     */
    #initializeCluster(endpoint: EndpointStructure, cluster: ClusterStructure) {
        const attrs = cluster.store.initialValues ?? {};

        // Generate a behavior if enough information is available
        // TODO: Detect changes in revision/features/attributes/commands and update behavior if needed
        if (cluster.behavior === undefined) {
            const {
                [ClusterRevision.id]: clusterRevision,
                [FeatureMap.id]: features,
                [AttributeList.id]: attributeList,
                [AcceptedCommandList.id]: commandList,
            } = attrs;

            if (typeof clusterRevision === "number") {
                cluster.revision = clusterRevision;
            }

            if (typeof features === "object" && features !== null && !Array.isArray(features)) {
                cluster.features = features as FeatureBitmap;
            }

            if (Array.isArray(attributeList)) {
                cluster.attributes = attributeList.filter(attr => typeof attr === "number") as AttributeId[];
            }

            if (Array.isArray(commandList)) {
                cluster.commands = commandList.filter(cmd => typeof cmd === "number") as CommandId[];
            }

            if (
                cluster.revision !== undefined &&
                cluster.features !== undefined &&
                cluster.attributes !== undefined &&
                cluster.commands !== undefined
            ) {
                cluster.behavior = PeerBehavior(cluster as PeerBehavior.ClusterShape);
                endpoint.endpoint.behaviors.require(cluster.behavior);
            }
        }

        // Special handling for descriptor cluster
        if (cluster.id === Descriptor.Cluster.id) {
            this.#synchronizeDescriptor(endpoint, attrs);
        }
    }

    #synchronizeDescriptor(endpoint: EndpointStructure, attrs: Record<number, unknown>) {
        const deviceTypeList = attrs[DEVICE_TYPE_LIST_ATTR_ID] as Descriptor.DeviceType[];
        if (Array.isArray(deviceTypeList)) {
            const endpointType = endpoint.endpoint.type;
            for (const dt of deviceTypeList) {
                if (typeof dt?.deviceType !== "number") {
                    continue;
                }

                let isApp = false;
                const model = Matter.get(DeviceTypeModel, dt.deviceType);
                if (model !== undefined) {
                    isApp = DeviceClassification.isApplication(model.classification);
                }

                // Root endpoint really needs to be a root endpoint so ignore any noise that would disrupt that
                if (!endpoint.endpoint.number && endpointType.deviceType !== RootEndpoint.deviceType) {
                    endpointType.deviceRevision = dt.revision;
                    break;
                }

                // Skip this device type if we've already found one and this one is not an application type
                if (endpointType.deviceType !== undefined && !isApp) {
                    continue;
                }

                endpointType.deviceType = dt.deviceType;
                endpointType.deviceRevision = dt.revision;
                endpointType.deviceClass = model?.classification ?? DeviceClassification.Simple;

                // If we found a known application device type we stop because this is the classification we want to
                // report
                if (isApp) {
                    break;
                }
            }
        }

        const serverList = attrs[SERVER_LIST_ATTR_ID];
        if (Array.isArray(serverList)) {
            // TODO: Remove clusters that are no longer present
            //  Including events vis parts/endpoints on node (per endpoint and generic "changed")?
            //  Including data cleanup
            for (const cluster of serverList) {
                if (typeof cluster === "number") {
                    this.#clusterFor(endpoint, cluster as ClusterId);
                }
            }
        }

        const partsList = attrs[PARTS_LIST_ATTR_ID];
        if (Array.isArray(partsList)) {
            for (const partNo of partsList) {
                if (typeof partNo !== "number") {
                    continue;
                }

                const part = this.#endpointFor(partNo as EndpointNumber);

                // TODO - remove endpoints/parts that are no longer present
                //  Including events vis parts/endpoints on node (per endpoint and generic "changed")?
                //  Including data cleanup
                let isAlreadyDescendant = false;
                for (let owner = part.endpoint.owner; owner; owner = owner.owner) {
                    if (owner === endpoint.endpoint) {
                        isAlreadyDescendant = true;
                        break;
                    }
                }

                if (isAlreadyDescendant) {
                    continue;
                }

                part.endpoint.owner = endpoint.endpoint;
            }
        }
    }

    #endpointFor(number: EndpointNumber) {
        let endpoint = this.#endpoints[number];
        if (endpoint) {
            return endpoint;
        }

        endpoint = {
            endpoint: new Endpoint({
                id: `ep${number}`,
                number,
                type: EndpointType({
                    name: "Unknown",
                    deviceType: EndpointType.UNKNOWN_DEVICE_TYPE,
                    deviceRevision: EndpointType.UNKNOWN_DEVICE_REVISION,
                }),
            }),
            clusters: {},
        };
        this.#endpoints[number] = endpoint;

        return endpoint;
    }

    #clusterFor(endpoint: EndpointStructure, id: ClusterId) {
        let cluster = endpoint.clusters[id];
        if (cluster) {
            return cluster;
        }

        cluster = {
            id,
            store: this.#nodeStore.storeForEndpoint(endpoint.endpoint).createStoreForBehavior(id.toString()),
        };
        endpoint.clusters[id] = cluster;

        return cluster;
    }
}

interface AttributeUpdates {
    endpointId: EndpointNumber;
    clusterId: ClusterId;
    values: {
        [K in number | typeof DatasourceCache.VERSION_KEY]?: unknown;
    };
}

interface EndpointStructure {
    endpoint: Endpoint;
    clusters: Record<ClusterId, ClusterStructure>;
}

interface ClusterStructure extends Partial<PeerBehavior.ClusterShape> {
    id: ClusterId;
    behavior?: ClusterBehavior.Type;
    store: Datasource.ExternallyMutableStore;
}
