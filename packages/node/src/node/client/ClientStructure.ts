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
import { InternalError, Logger } from "#general";
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
import type { Node } from "#node/Node.js";
import { ReadScope, type Read, type ReadResult } from "#protocol";
import { DatasourceCache } from "#storage/client/DatasourceCache.js";
import { ClientNodeStore } from "#storage/index.js";
import type { AttributeId, ClusterId, ClusterType, CommandId, EndpointNumber } from "#types";
import { ClientEventEmitter } from "./ClientEventEmitter.js";
import { ClientStructureEvents } from "./ClientStructureEvents.js";
import { PeerBehavior } from "./PeerBehavior.js";

const logger = Logger.get("ClientStructure");

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
    #pending = new Map<EndpointStructure, "erase" | "reparent">();
    #events: ClientStructureEvents;

    constructor(node: ClientNode) {
        this.#node = node;
        this.#nodeStore = node.env.get(ClientNodeStore);
        this.#endpoints[node.number] = {
            endpoint: node,
            clusters: {},
        };
        this.#emitEvent = ClientEventEmitter(node, this);
        this.#events = this.#node.env.get(ClientStructureEvents);
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
                this.#synchronizeCluster(endpoint, cluster);
            }
        }

        for (const [endpoint, opcode] of this.#pending.entries()) {
            this.#pending.delete(endpoint);

            switch (opcode) {
                case "reparent":
                    this.#install(endpoint);
                    break;

                default:
                    throw new InternalError(`Unexpected ${opcode} operation in initial hierarchy load`);
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
        // Ensure mutations run serially and integrate properly with node lifecycle
        using _lock = await this.#node.lifecycle.mutex.lock();

        // We collect updates and only apply when we transition clusters
        let currentUpdates: AttributeUpdates | undefined;

        // Apply changes
        const scope = ReadScope(request);
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

        // The last cluster still needs its changes applied
        if (currentUpdates) {
            await this.#updateCluster(currentUpdates);
        }

        // We don't apply structural changes until we've processed all attribute data if a.) listeners might otherwise
        // see partially initialized endpoints, or b.) the change requires an async operation
        for (const [endpoint, opcode] of this.#pending.entries()) {
            this.#pending.delete(endpoint);

            switch (opcode) {
                case "reparent":
                    this.#install(endpoint);
                    break;

                case "erase":
                    logger.debug(`Removing endpoint ${endpoint.endpoint} because it is no longer present on the peer`);
                    delete this.#endpoints[endpoint.endpoint.number];
                    try {
                        await endpoint.endpoint.delete();
                    } catch (e) {
                        logger.error(`Error erasing peer endpoint ${endpoint.endpoint}:`, e);
                    }
                    break;
            }
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
        // TODO: Detect changes in revision/features/attributes/commands and update behavior if needed
        const endpoint = this.#endpointFor(attrs.endpointId);
        const cluster = this.#clusterFor(endpoint, attrs.clusterId);
        await cluster.store.externalSet(attrs.values);
        this.#synchronizeCluster(endpoint, cluster);
    }

    /**
     * If enough attributes are present, installs a behavior on an endpoint
     *
     * If the cluster is Descriptor, performs additional {@link Endpoint} configuration such as installing parts and
     * device types.
     *
     * Invoked once we've loaded all attributes in an interaction.
     */
    #synchronizeCluster(endpoint: EndpointStructure, cluster: ClusterStructure) {
        // Generate a behavior if enough information is available
        if (cluster.behavior === undefined && cluster.store.initialValues) {
            const {
                [ClusterRevision.id]: clusterRevision,
                [FeatureMap.id]: features,
                [AttributeList.id]: attributeList,
                [AcceptedCommandList.id]: commandList,
            } = cluster.store.initialValues;

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
                if (endpoint.endpoint.lifecycle.isInstalled) {
                    this.#events.emitCluster(endpoint.endpoint, cluster.behavior);
                }
            }
        }

        // Special handling for descriptor cluster
        if (cluster.id === Descriptor.Cluster.id) {
            let attrs;
            if (cluster.behavior && endpoint.endpoint.behaviors.isActive(cluster.behavior.id)) {
                attrs = endpoint.endpoint.stateOf(cluster.behavior);
            } else {
                attrs = cluster.store.initialValues ?? {};
            }
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

        // The remaining logic deals with the parts list
        const partsList = attrs[PARTS_LIST_ATTR_ID];
        if (!Array.isArray(partsList)) {
            return;
        }

        // Ensure an endpoint is present and installed for each part in the partsList
        for (const partNo of partsList) {
            if (typeof partNo !== "number") {
                continue;
            }

            const part = this.#endpointFor(partNo as EndpointNumber);

            let isAlreadyDescendant = false;
            for (let owner = this.#ownerOf(part); owner; owner = this.#ownerOf(owner)) {
                if (owner === endpoint) {
                    isAlreadyDescendant = true;
                    break;
                }
            }

            if (isAlreadyDescendant) {
                continue;
            }

            part.pendingOwner = endpoint;
            this.#pending.set(part, "reparent");
        }

        // For the root partsList specifically, if an endpoint is no longer present then it has been removd from the
        // node.  Schedule for erase
        if (endpoint.endpoint.maybeNumber === 0) {
            const numbersUsed = new Set(partsList);
            for (const descendent of (endpoint.endpoint as Node).endpoints) {
                // Skip root endpoint and uninitialized numbers (though latter shouldn't be possible)
                if (!descendent.maybeNumber) {
                    continue;
                }

                if (!numbersUsed.has(descendent.number)) {
                    const endpoint = this.#endpoints[descendent.number];
                    if (endpoint) {
                        this.#pending.set(endpoint, "erase");
                    }
                }
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
            kind: "discovered",
            id,
            store: this.#nodeStore.storeForEndpoint(endpoint.endpoint).createStoreForBehavior(id.toString()),
        };
        endpoint.clusters[id] = cluster;

        return cluster;
    }

    #ownerOf(endpoint: EndpointStructure) {
        if (endpoint.pendingOwner) {
            return endpoint.pendingOwner;
        }

        // Do not return the ServerNode if this is the ClientNode
        if (endpoint.endpoint.number === 0) {
            return;
        }

        const ownerNumber = endpoint.endpoint.owner?.maybeNumber;
        if (ownerNumber !== undefined) {
            return this.#endpointFor(ownerNumber);
        }
    }

    #install(endpoint: EndpointStructure) {
        const { pendingOwner } = endpoint;
        if (!pendingOwner) {
            return;
        }

        endpoint.endpoint.owner = pendingOwner.endpoint;
        endpoint.pendingOwner = undefined;
        this.#events.emitEndpoint(endpoint.endpoint);
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
    pendingOwner?: EndpointStructure;
    endpoint: Endpoint;
    clusters: Record<ClusterId, ClusterStructure>;
}

interface ClusterStructure extends Partial<PeerBehavior.DiscoveredClusterShape> {
    kind: "discovered";
    id: ClusterId;
    behavior?: ClusterBehavior.Type;
    store: Datasource.ExternallyMutableStore;
}
