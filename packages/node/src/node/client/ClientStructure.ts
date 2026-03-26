/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { ClusterBehavior } from "#behavior/cluster/ClusterBehavior.js";
import type { ClusterBehaviorType } from "#behavior/cluster/ClusterBehaviorType.js";
import { Datasource } from "#behavior/state/managed/Datasource.js";
import { Endpoint } from "#endpoint/Endpoint.js";
import { EndpointType } from "#endpoint/type/EndpointType.js";
import { RootEndpoint } from "#endpoints/root";
import type { Node } from "#node/Node.js";
import type { StateStream } from "#node/integration/StateStream.js";
import { DatasourceCache } from "#storage/client/DatasourceCache.js";
import {
    capitalize,
    Diagnostic,
    hex,
    InternalError,
    isDeepEqual,
    Lifecycle,
    Logger,
    MaybePromise,
    Observable,
} from "@matter/general";
import {
    AcceptedCommandList,
    AttributeList,
    ClusterRevision,
    DeviceClassification,
    FeatureMap,
    GeneratedCommandList,
    Matter,
    type FeatureBitmap,
} from "@matter/model";
import { ReadScope, Val, type Read, type ReadResult } from "@matter/protocol";
import type { AttributeId, ClusterId, CommandId, EndpointNumber } from "@matter/types";
import { Status } from "@matter/types";
import { Descriptor } from "@matter/types/clusters/descriptor";
import type { ClientEventEmitter } from "./ClientEventEmitter.js";
import { ClientStructureEvents } from "./ClientStructureEvents.js";
import { PeerBehavior } from "./PeerBehavior.js";

const logger = Logger.get("ClientStructure");

const DESCRIPTOR_ID = Descriptor.id;
const DEVICE_TYPE_LIST_ATTR_ID = Descriptor.attributes.deviceTypeList.id;
const SERVER_LIST_ATTR_ID = Descriptor.attributes.serverList.id;
const PARTS_LIST_ATTR_ID = Descriptor.attributes.partsList.id;

const DEVICE_TYPE_LIST_ATTR_NAME = "deviceTypeList";
const SERVER_LIST_ATTR_NAME = "serverList";
const PARTS_LIST_ATTR_NAME = "partsList";

/**
 * Read a value from store initial values using either numeric attribute ID or property name.
 */
function getStoreValue(values: Record<string | number, unknown> | undefined, id: number, name: string): unknown {
    if (values === undefined) {
        return undefined;
    }
    return id in values ? values[id] : values[name];
}

/**
 * Manages endpoint and behavior structure for the local representation of a local node.
 *
 * This class supports update via data sourced from the Matter protocol or from matter.js's remote APIs.
 */
export class ClientStructure {
    #storeFactory: ClientStructure.StoreFactory;
    #endpoints = new Map<EndpointNumber, EndpointStructure>();
    #node: Node;
    #subscribedFabricFiltered?: boolean;
    #pendingChanges = new Map<EndpointStructure, PendingChange>();
    #pendingStructureEvents = Array<PendingEvent>();
    #delayedClusterEvents = new Array<ReadResult.EventValue>();
    #events: ClientStructureEvents;
    #changed = Observable<[void]>();
    #commandFactory?: ClusterBehaviorType.CommandFactory;

    /**
     * Optional event emitter for Matter protocol events.  Set after construction.
     */
    eventEmitter?: ClientEventEmitter;

    constructor(node: Node, storeFactory: ClientStructure.StoreFactory, options?: ClientStructure.Options) {
        this.#node = node;
        this.#storeFactory = storeFactory;
        this.#commandFactory = options?.commandFactory;
        this.#endpoints.set(node.number, {
            endpoint: node,
            clusters: new Map(),
        });
        this.#events = this.#node.env.get(ClientStructureEvents);
    }

    get changed() {
        return this.#changed;
    }

    /**
     * The node this structure manages.
     */
    get node() {
        return this.#node;
    }

    /**
     * Load initial structure from cached endpoint stores.
     *
     * Each entry in {@link endpointStores} must expose an `id` (stringified endpoint number) and `knownBehaviors`
     * (iterable of stringified cluster IDs).
     */
    loadCache(endpointStores: Iterable<{ id: string; knownBehaviors: Iterable<string> }>) {
        for (const store of endpointStores) {
            const id = store.id;

            // Client storage uses the endpoint number as the key for the endpoint
            const number = Number.parseInt(id);
            if (!Number.isFinite(number)) {
                continue;
            }

            const endpoint = this.#endpointFor(number as EndpointNumber);

            const knownBehaviors = [...store.knownBehaviors]
                .map(idStr => Number.parseInt(idStr) as ClusterId)
                .filter(id => Number.isFinite(id));

            // Ensure we process Descriptor cluster first because we trust our storage and extraneous cluster data were
            // there before too, so we simply load them also if they might not be contained in indices
            const descriptorIndex = knownBehaviors.indexOf(DESCRIPTOR_ID);
            if (descriptorIndex !== -1) {
                knownBehaviors.splice(descriptorIndex, 1);
                knownBehaviors.unshift(DESCRIPTOR_ID);
            }

            // Load state for each behavior
            for (const id of knownBehaviors) {
                this.#synchronizeCluster(endpoint, this.#clusterFor(endpoint, id));
            }
        }

        const changes = this.#pendingChanges;
        this.#pendingChanges = new Map();
        for (const [structure, change] of changes.entries()) {
            // Only installs should be queued
            if (!change.install || change.erase || change.rebuild) {
                throw new InternalError(
                    `Unexpected erase and/or rebuild during initialization of ${structure.endpoint}`,
                );
            }

            this.#pendingChanges.delete(structure);
            this.#install(structure);
        }

        this.#emitPendingStructureEvents();
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
     * Inject version filters into a Read or Subscribe request.
     */
    injectVersionFilters<T extends Read>(request: T): T {
        const scope = ReadScope(request);
        let result = request;

        for (const {
            endpoint: { number: endpointId },
            clusters,
        } of this.#endpoints.values()) {
            for (const {
                id: clusterId,
                store: { version },
            } of clusters.values()) {
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
     * Update the node structure by applying attribute changes from a Matter protocol interaction.
     */
    async *mutate(request: Read, changes: ReadResult) {
        // We collect updates and only apply when we transition clusters
        let currentUpdates: AttributeUpdates | undefined;

        // Apply changes
        const scope = ReadScope(request);
        for await (const chunk of changes) {
            const chunkData = new Array<ReadResult.Report>();
            for (const change of chunk) {
                chunkData.push(change);
                switch (change.kind) {
                    case "attr-value":
                        currentUpdates = await this.#mutateAttribute(change, scope, currentUpdates);
                        break;

                    case "event-value":
                        await this.#emitEvent(change, currentUpdates);
                        break;

                    case "attr-status":
                    case "event-status":
                        logger.debug(
                            "Received status for",
                            change.kind === "attr-status" ? "attribute" : "event",
                            Diagnostic.strong(Diagnostic.dict(change.path)),
                            `: ${Status[change.status]}#${change.status}${change.clusterStatus !== undefined ? `/${Status[change.clusterStatus]}#${change.clusterStatus}` : ""}`,
                        );
                        break;
                }
            }

            yield chunkData;
        }

        // The last cluster still needs its changes applied
        if (currentUpdates) {
            await this.#updateCluster(currentUpdates);
        }

        // We don't apply structural changes until we've processed all attribute data if a.) listeners might otherwise
        // see partially initialized endpoints, or b.) the change requires an async operation
        for (const [endpoint, change] of this.#pendingChanges.entries()) {
            this.#pendingChanges.delete(endpoint);

            if (change.erase) {
                await this.#erase(endpoint);
                continue;
            }

            if (change.rebuild) {
                await this.#rebuild(endpoint);
            }

            if (change.install) {
                this.#install(endpoint);
            }
        }

        // Likewise, we don't emit events until we've applied all structural changes
        this.#emitPendingStructureEvents();
        await this.#emitPendingEvents();
    }

    /**
     * Apply {@link StateStream.WireChange}s to the structure.
     *
     * Values are keyed by property name (not attribute ID).
     */
    async applyWireChanges(changes: StateStream.WireChange[]) {
        for (const change of changes) {
            switch (change.kind) {
                case "update": {
                    const endpointNumber = change.endpoint as EndpointNumber;
                    const endpoint = this.#endpointFor(endpointNumber);
                    const cluster = this.#clusterForBehavior(endpoint, change.behavior);

                    // Include version in externalSet values so DatasourceCache can update it
                    const values = new Map(Object.entries(change.changes as Record<string, unknown>)) as Val.StructMap;
                    if (typeof change.version === "number") {
                        values.set(DatasourceCache.VERSION_KEY, change.version);
                    }

                    await cluster.store.externalSet(values);
                    this.#synchronizeCluster(endpoint, cluster);
                    break;
                }

                case "delete": {
                    const endpointNumber = change.endpoint as EndpointNumber;
                    const endpoint = this.#endpoints.get(endpointNumber);
                    if (endpoint) {
                        this.#scheduleStructureChange(endpoint, "erase");
                    }
                    break;
                }
            }
        }

        // Apply pending structural changes
        for (const [endpoint, change] of this.#pendingChanges.entries()) {
            this.#pendingChanges.delete(endpoint);

            if (change.erase) {
                await this.#erase(endpoint);
                continue;
            }

            if (change.rebuild) {
                await this.#rebuild(endpoint);
            }

            if (change.install) {
                this.#install(endpoint);
            }
        }

        this.#emitPendingStructureEvents();
    }

    /**
     * Determines if the subscription is fabric filtered.
     */
    protected get subscribedFabricFiltered(): boolean {
        if (this.#subscribedFabricFiltered === undefined) {
            this.#subscribedFabricFiltered = true;

            // Attempt to read from network behavior if available
            try {
                const state = this.#node.state as Record<string, unknown>;
                const network = state?.network as undefined | Record<string, unknown>;
                const defaultSubscription = network?.defaultSubscription as
                    | undefined
                    | { isFabricFiltered?: boolean; fabricFiltered?: boolean };
                if (defaultSubscription) {
                    this.#subscribedFabricFiltered =
                        ("isFabricFiltered" in defaultSubscription
                            ? defaultSubscription.isFabricFiltered
                            : "fabricFiltered" in defaultSubscription
                              ? defaultSubscription.fabricFiltered
                              : true) ?? true;
                }

                const events = this.#node.events as Record<string, unknown>;
                const networkEvents = events?.network as undefined | Record<string, unknown>;
                const changedEvent = networkEvents?.defaultSubscription$Changed as undefined | Observable;
                changedEvent?.on((newSubscription: undefined | { isFabricFiltered?: boolean }) => {
                    this.#subscribedFabricFiltered = newSubscription?.isFabricFiltered ?? true;
                });
            } catch {
                // Not a ClientNode or network behavior not available; default to true
            }
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
                values: new Map([[attributeId, change.value]]),
            };

            // Update version but only if this was a wildcard read
            if (scope.isWildcard(endpointId, clusterId)) {
                currentUpdates.values.set(DatasourceCache.VERSION_KEY, change.version);
            }
        } else {
            // Add value to change set for current endpoint/cluster
            currentUpdates.values.set(attributeId, change.value);
        }

        return currentUpdates;
    }

    async #emitEvent(occurrence: ReadResult.EventValue, currentUpdates?: AttributeUpdates) {
        if (!this.eventEmitter) {
            return;
        }

        const { endpointId, clusterId } = occurrence.path;

        const endpoint = this.#endpoints.get(endpointId);
        // If we are building updates on the current cluster or endpoint has pending changes, delay event emission
        if (
            (currentUpdates && (currentUpdates.endpointId === endpointId || currentUpdates.clusterId === clusterId)) ||
            (endpoint !== undefined && this.#pendingChanges?.has(endpoint))
        ) {
            this.#delayedClusterEvents.push(occurrence);
        } else {
            await this.eventEmitter(occurrence);
        }
    }

    /**
     * Obtain the cluster namespace for an {@link EndpointNumber} and {@link ClusterId}.
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
        return this.#endpoints.get(endpoint)?.endpoint;
    }

    /**
     * Apply new attribute values for a specific endpoint / cluster.
     *
     * This is invoked in a batch when we've collected all sequential values for the current endpoint/cluster.
     */
    async #updateCluster(attrs: AttributeUpdates) {
        const endpoint = this.#endpointFor(attrs.endpointId);
        const cluster = this.#clusterFor(endpoint, attrs.clusterId);

        if (cluster.behavior && attrs.values.has(FeatureMap.id)) {
            if (!isDeepEqual(cluster.features, attrs.values.get(FeatureMap.id))) {
                cluster.behavior = undefined;
            }
        }

        if (cluster.behavior && attrs.values.has(AttributeList.id)) {
            const attributeList = attrs.values.get(AttributeList.id);
            if (
                Array.isArray(attributeList) &&
                !isDeepEqual(
                    cluster.attributes,
                    attributeList.sort((a, b) => a - b),
                )
            ) {
                cluster.behavior = undefined;
            }
        }

        if (cluster.behavior && attrs.values.has(AcceptedCommandList.id)) {
            const acceptedCommands = attrs.values.get(AcceptedCommandList.id);
            if (
                Array.isArray(acceptedCommands) &&
                !isDeepEqual(
                    cluster.commands,
                    acceptedCommands.sort((a, b) => a - b),
                )
            ) {
                cluster.behavior = undefined;
            }
        }

        await cluster.store.externalSet(attrs.values);
        this.#synchronizeCluster(endpoint, cluster);
    }

    /**
     * If enough attributes are present, installs a behavior on an endpoint.
     *
     * If the cluster is Descriptor, performs additional {@link Endpoint} configuration such as installing parts and
     * device types.
     *
     * Invoked once we've loaded all attributes in an interaction.
     */
    #synchronizeCluster(structure: EndpointStructure, cluster: ClusterStructure) {
        const { endpoint } = structure;

        // Generate a behavior if enough information is available
        if (cluster.behavior === undefined) {
            if (cluster.store.initialValues) {
                const values = cluster.store.initialValues;

                const clusterRevision = getStoreValue(values, ClusterRevision.id, "clusterRevision");
                const features = getStoreValue(values, FeatureMap.id, "featureMap");
                const attributeList = getStoreValue(values, AttributeList.id, "attributeList");
                const commandList = getStoreValue(values, AcceptedCommandList.id, "acceptedCommandList");
                const generatedCommandList = getStoreValue(values, GeneratedCommandList.id, "generatedCommandList");

                if (typeof clusterRevision === "number") {
                    cluster.revision = clusterRevision;
                }

                if (typeof features === "object" && features !== null && !Array.isArray(features)) {
                    cluster.features = features as FeatureBitmap;
                }

                if (Array.isArray(attributeList)) {
                    cluster.attributes = (attributeList.filter(attr => typeof attr === "number") as AttributeId[]).sort(
                        (a, b) => a - b,
                    );
                }

                if (Array.isArray(commandList)) {
                    cluster.commands = (commandList.filter(cmd => typeof cmd === "number") as CommandId[]).sort(
                        (a, b) => a - b,
                    );
                }

                if (Array.isArray(generatedCommandList)) {
                    cluster.generatedCommands = (
                        generatedCommandList.filter(cmd => typeof cmd === "number") as CommandId[]
                    ).sort((a, b) => a - b);
                }
            }

            if (
                // All global attributes have fallbacks, so we can't wait until we're sure we have them all.  Instead,
                // wait until we are sure there is something useful.  We therefore rely on unspecified behavior that all
                // attributes travel consecutively to ensure we initialize fully as we have no other choice
                cluster.attributes?.length ||
                cluster.commands?.length ||
                cluster.generatedCommands?.length
            ) {
                const shape = cluster as PeerBehavior.DiscoveredClusterShape;
                if (this.#commandFactory) {
                    shape.commandFactory = this.#commandFactory;
                }
                const behaviorType = PeerBehavior(shape);

                if (endpoint.lifecycle.isInstalled) {
                    cluster.pendingBehavior = behaviorType;
                    if (cluster.pendingDelete) {
                        // Peer sent data for a cluster absent from its descriptor server list; the device is buggy, but
                        // we tolerate it by cancelling the pending deletion, aka "Schrödinger's cluster".
                        logger.warn(
                            `Cluster 0x${hex.fixed(cluster.id, 8)} on ${endpoint} is absent from` +
                                " descriptor server list but peer sent attribute data for it; keeping cluster",
                        );
                        delete cluster.pendingDelete;
                    }
                    this.#scheduleStructureChange(
                        structure,
                        endpoint.behaviors.supported[behaviorType.id] ? "rebuild" : "install",
                    );
                } else {
                    cluster.behavior = behaviorType;
                    endpoint.behaviors.inject(behaviorType);
                }
            }
        }

        // Special handling for descriptor cluster
        if (cluster.id === Descriptor.id) {
            let attrs;
            if (cluster.behavior && endpoint.behaviors.isActive(cluster.behavior.id)) {
                attrs = endpoint.stateOf(cluster.behavior);
            } else {
                attrs = cluster.store.initialValues ?? {};
            }
            this.#synchronizeDescriptor(structure, attrs);
        }
    }

    #synchronizeDescriptor(structure: EndpointStructure, attrs: Record<string | number, unknown>) {
        const { endpoint } = structure;

        const deviceTypeList = getStoreValue(attrs, DEVICE_TYPE_LIST_ATTR_ID, DEVICE_TYPE_LIST_ATTR_NAME) as
            | Descriptor.DeviceType[]
            | undefined;
        if (Array.isArray(deviceTypeList)) {
            const endpointType = endpoint.type;
            for (const dt of deviceTypeList) {
                if (typeof dt?.deviceType !== "number") {
                    continue;
                }

                let isApp = false;
                const model = Matter.deviceTypes(dt.deviceType);
                if (model !== undefined) {
                    isApp = DeviceClassification.isApplication(model.classification);
                }

                // Root endpoint really needs to be a root endpoint so ignore any noise that would disrupt that
                if (!endpoint.number && endpointType.deviceType !== RootEndpoint.deviceType) {
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
                endpointType.name = model?.name ?? `Unknown#${hex.word(dt.deviceType)}`;

                // If we found a known application device type, we stop because this is the classification we want to
                // report
                if (isApp) {
                    break;
                }
            }
        }

        const serverList = getStoreValue(attrs, SERVER_LIST_ATTR_ID, SERVER_LIST_ATTR_NAME);
        if (Array.isArray(serverList)) {
            const currentlySupported = new Set(
                Object.values(endpoint.behaviors.supported)
                    .map(type => (type as ClusterBehavior.Type).cluster?.id)
                    .filter(id => id !== undefined),
            );

            for (const cluster of serverList) {
                if (typeof cluster === "number") {
                    this.#clusterFor(structure, cluster as ClusterId);
                    currentlySupported.delete(cluster as ClusterId);
                }
            }

            if (currentlySupported.size) {
                let anyPendingDelete = false;
                for (const id of currentlySupported) {
                    const clusterStructure = this.#clusterFor(structure, id);
                    // Only delete it when peer did not sent attribute data for this cluster in the same interaction
                    // despite it not being in the server list; a device is buggy but we tolerate it by skipping the
                    // deletion, aka "Schrödinger's cluster"
                    if (!clusterStructure.pendingBehavior) {
                        clusterStructure.pendingDelete = true;
                        anyPendingDelete = true;
                    }
                }
                if (anyPendingDelete) {
                    this.#scheduleStructureChange(structure, "rebuild");
                }
            }
        }

        // The remaining logic deals with the parts list
        const partsList = getStoreValue(attrs, PARTS_LIST_ATTR_ID, PARTS_LIST_ATTR_NAME);
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
                if (owner === structure) {
                    isAlreadyDescendant = true;
                    break;
                }
            }

            if (isAlreadyDescendant) {
                continue;
            }

            part.pendingOwner = structure;
            // TODO Should we somehow validate that against descriptor serverList because we might load data not in
            // there
            this.#scheduleStructureChange(part, "install");
        }

        // For the root partsList specifically, if an endpoint is no longer present then it has been removed from the
        // node.  Schedule for erase
        if (endpoint.maybeNumber === 0) {
            const numbersUsed = new Set(partsList);
            for (const descendent of (endpoint as Node).endpoints) {
                // Skip root endpoint and uninitialized numbers (though latter shouldn't be possible)
                if (!descendent.maybeNumber) {
                    continue;
                }

                if (!numbersUsed.has(descendent.number)) {
                    const endpoint = this.#endpoints.get(descendent.number);
                    if (endpoint) {
                        this.#scheduleStructureChange(endpoint, "erase");
                    }
                }
            }
        }
    }

    #endpointFor(number: EndpointNumber) {
        let endpoint = this.#endpoints.get(number);
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
            clusters: new Map(),
        };
        this.#endpoints.set(number, endpoint);

        return endpoint;
    }

    #clusterFor(endpoint: EndpointStructure, id: ClusterId) {
        let cluster = endpoint.clusters.get(id);
        if (cluster) {
            return cluster;
        }

        cluster = {
            kind: "discovered",
            id,
            store: this.#storeFactory(endpoint.endpoint, id.toString(), "id"),
            behavior: undefined,
            pendingBehavior: undefined,
            pendingDelete: undefined,
        };
        endpoint.clusters.set(id, cluster);

        return cluster;
    }

    /**
     * Look up or create a cluster structure for a behavior identified by name (for {@link StateStream.WireChange}s).
     *
     * If the behavior name matches a known cluster by camelized name, we map to the cluster ID. Otherwise this creates
     * a name-keyed cluster entry.
     */
    #clusterForBehavior(endpoint: EndpointStructure, behaviorId: string): ClusterStructure {
        // Check if this behavior is already installed on the endpoint — use its cluster ID if so
        const supported = endpoint.endpoint.behaviors.supported[behaviorId] as ClusterBehavior.Type | undefined;
        if (supported?.cluster) {
            return this.#clusterFor(endpoint, supported.cluster.id);
        }

        // Try to find an existing cluster by scanning; the behavior ID might correspond to a cluster name
        for (const cluster of endpoint.clusters.values()) {
            if (cluster.behavior?.id === behaviorId) {
                return cluster;
            }
        }

        // Try to resolve by parsing as a numeric cluster ID
        const numericId = Number.parseInt(behaviorId);
        if (Number.isFinite(numericId)) {
            return this.#clusterFor(endpoint, numericId as ClusterId);
        }

        // Try to resolve by looking up the cluster model by capitalized behavior name (e.g. "onOff" → "OnOff")
        const clusterModel = Matter.clusters(capitalize(behaviorId));
        if (clusterModel) {
            return this.#clusterFor(endpoint, clusterModel.id as ClusterId);
        }

        // This is a new behavior delivered via wire changes; key by name directly
        const existing = endpoint.clusters.get(behaviorId);
        if (existing) {
            return existing;
        }

        const cluster: ClusterStructure = {
            kind: "discovered",
            id: 0 as ClusterId,
            store: this.#storeFactory(endpoint.endpoint, behaviorId, "name"),
            behavior: undefined,
            pendingBehavior: undefined,
            pendingDelete: undefined,
        };
        endpoint.clusters.set(behaviorId, cluster);

        return cluster;
    }

    #ownerOf(endpoint: EndpointStructure) {
        if (endpoint.pendingOwner) {
            return endpoint.pendingOwner;
        }

        // Do not return the owner node if this is the root endpoint
        if (endpoint.endpoint.number === 0) {
            return;
        }

        const ownerNumber = endpoint.endpoint.owner?.maybeNumber;
        if (ownerNumber !== undefined) {
            return this.#endpointFor(ownerNumber);
        }
    }

    /**
     * Erase an endpoint that disappeared from the peer.
     */
    async #erase(structure: EndpointStructure) {
        const { endpoint } = structure;

        logger.debug(
            "Removing endpoint",
            Diagnostic.strong(endpoint.toString()),
            "because it is no longer present on the peer",
        );

        this.#endpoints.delete(endpoint.number);

        // Skip deletion if the endpoint was already destroyed, e.g. because a parent endpoint was erased first and
        // recursively closed its children
        if (endpoint.construction.status === Lifecycle.Status.Destroyed) {
            return;
        }

        try {
            await endpoint.delete();
        } catch (e) {
            logger.error(`Error erasing peer endpoint ${endpoint}:`, e);
        }
    }

    /**
     * Replace clusters after activation because fixed global attributes have changed.
     *
     * Currently, we apply granular updates to clusters.  This will possibly result in subtle errors if peers change in
     * incompatible ways, but the backings are designed to be fairly resilient to this.  This is simpler for API users
     * to deal with in the common case where they can just ignore. If it becomes problematic, we can revert to replacing
     * entire endpoints or behaviors when there are structural changes.
     */
    async #rebuild(structure: EndpointStructure) {
        const { endpoint, clusters } = structure;

        for (const cluster of clusters.values()) {
            const { behavior, pendingBehavior, pendingDelete } = cluster;

            if (pendingDelete) {
                if (!behavior) {
                    continue;
                }

                await endpoint.behaviors.drop(behavior.id);
                try {
                    await MaybePromise.then(
                        (
                            cluster.store as Datasource.ExternallyMutableStore & { erase?(): MaybePromise<void> }
                        ).erase?.(),
                    );
                } catch (e) {
                    logger.error("Error clearing cluster storage:", e);
                }

                this.#pendingStructureEvents.push({
                    kind: "cluster",
                    endpoint: structure,
                    cluster,
                    subkind: "delete",
                });

                continue;
            }

            if (!pendingBehavior) {
                continue;
            }

            const subkind = pendingBehavior.id in endpoint.behaviors.supported ? "replace" : "add";

            endpoint.behaviors.inject(pendingBehavior);

            cluster.behavior = pendingBehavior;
            delete cluster.pendingBehavior;

            this.#pendingStructureEvents.push({
                kind: "cluster",
                subkind,
                endpoint: structure,
                cluster,
            });
        }
    }

    /**
     * Install the endpoint and/or new behaviors.
     */
    #install(structure: EndpointStructure) {
        const { endpoint, pendingOwner, clusters } = structure;

        // Handle endpoint installation
        if (pendingOwner) {
            endpoint.owner = pendingOwner.endpoint;
            structure.pendingOwner = undefined;
            this.#pendingStructureEvents.push({ kind: "endpoint", endpoint: structure });
        }

        // Handle behavior installation
        for (const cluster of clusters.values()) {
            const { pendingBehavior } = cluster;

            // Skip if there is already a behavior even if there's a pending behavior because this needs to be handled
            // by #rebuild
            if (!pendingBehavior || endpoint.behaviors.supported[pendingBehavior.id]) {
                continue;
            }

            // Add support for the cluster
            endpoint.behaviors.inject(pendingBehavior);
            cluster.behavior = pendingBehavior;
            cluster.pendingBehavior = undefined;

            // We emit cluster events during the endpoint event so only add cluster event manually if the endpoint is
            // already installed
            if (!pendingOwner) {
                this.#pendingStructureEvents.push({
                    kind: "cluster",
                    subkind: "add",
                    endpoint: structure,
                    cluster,
                });
            }
        }
    }

    /**
     * Queue a structural change for processing once a read response is fully processed.
     */
    #scheduleStructureChange(endpoint: EndpointStructure, kind: keyof PendingChange) {
        const pending = this.#pendingChanges.get(endpoint);
        if (pending) {
            pending[kind] = true;
        } else {
            this.#pendingChanges.set(endpoint, { [kind]: true });
        }
    }

    /**
     * Emit pending events.
     *
     * We do this after all structural updates are complete so that listeners can expect composed parts and dependent
     * behaviors to be installed.
     */
    #emitPendingStructureEvents() {
        const structureEvents = this.#pendingStructureEvents;
        this.#pendingStructureEvents = [];
        for (const event of structureEvents) {
            switch (event.kind) {
                case "endpoint": {
                    const {
                        endpoint: { endpoint, clusters },
                    } = event;
                    this.#events.emitEndpoint(endpoint);

                    // Emit all cluster events now.  This is a minor optimization
                    for (const { behavior } of clusters.values()) {
                        if (behavior) {
                            this.#events.emitCluster(endpoint, behavior);
                        }
                    }
                    break;
                }

                case "cluster": {
                    const {
                        endpoint: { endpoint },
                        cluster: { behavior },
                    } = event;

                    if (!behavior) {
                        // Shouldn't happen
                        break;
                    }

                    switch (event.subkind) {
                        case "add":
                            this.#events.emitCluster(endpoint, behavior);
                            break;

                        case "delete":
                            this.#events.emitClusterDeleted(endpoint, behavior);
                            break;

                        case "replace":
                            this.#events.emitClusterReplaced(endpoint, behavior);
                    }
                    break;
                }
            }
        }
        this.#changed.emit();
    }

    async #emitPendingEvents() {
        if (!this.eventEmitter) {
            return;
        }

        const clusterEvents = this.#delayedClusterEvents;
        this.#delayedClusterEvents = [];
        for (const occurrence of clusterEvents) {
            await this.eventEmitter(occurrence);
        }
    }
}

export namespace ClientStructure {
    /**
     * Creates a {@link Datasource.ExternallyMutableStore} for a behavior on an endpoint.
     */
    export type StoreFactory = (
        endpoint: Endpoint,
        behaviorId: string,
        primaryKey: "id" | "name",
    ) => Datasource.ExternallyMutableStore;

    export interface Options {
        /**
         * Factory for command implementations used when generating peer behaviors.
         */
        commandFactory?: ClusterBehaviorType.CommandFactory;
    }
}

interface AttributeUpdates {
    endpointId: EndpointNumber;
    clusterId: ClusterId;
    values: Val.StructMap;
}

interface EndpointStructure {
    pendingOwner?: EndpointStructure;
    endpoint: Endpoint;
    clusters: Map<ClusterId | string, ClusterStructure>;
}

interface ClusterStructure extends Partial<PeerBehavior.DiscoveredClusterShape> {
    kind: "discovered";
    id: ClusterId;
    behavior?: ClusterBehavior.Type;
    pendingBehavior?: ClusterBehavior.Type;
    pendingDelete?: boolean;
    store: Datasource.ExternallyMutableStore;
}

/**
 * Queue entry for structural changes.
 */
interface PendingChange {
    /**
     * Erase an endpoint.
     */
    erase?: boolean;

    /**
     * Install new endpoint and/or behaviors.
     */
    install?: boolean;

    /**
     * Handle replacement or deletion of behaviors on active endpoint.
     */
    rebuild?: boolean;
}

/**
 * Queue entry for pending notifications.
 */
export type PendingEvent = EndpointEvent | ClusterEvent;

interface EndpointEvent {
    kind: "endpoint";
    endpoint: EndpointStructure;
}

interface ClusterEvent {
    kind: "cluster";
    subkind: "add" | "delete" | "replace";
    endpoint: EndpointStructure;
    cluster: ClusterStructure;
}
