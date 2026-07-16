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
    Mutex,
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

/** Max deferred persist/emit jobs allowed in flight before the decode loop applies back-pressure. */
const MAX_PENDING_JOBS = 100;

interface MutateContext {
    enqueue(job: () => Promise<void>): void;
    endpointsWithData: Set<EndpointNumber>;
}

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
    #clustersWithDataThisInteraction = new Set<ClusterStructure>();
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
        // Track which clusters the peer sends data for so a descriptor omitting them doesn't delete them.  Reset at the
        // start so a prior interaction that threw mid-stream can't leave stale entries blocking a legitimate deletion.
        this.#clustersWithDataThisInteraction.clear();

        // We collect updates and only apply when we transition clusters
        let currentUpdates: AttributeUpdates | undefined;

        // Serial FIFO for deferred persist/emit so Status.Success is not gated on internal and consumer data processing.
        // Ordering is preserved by insertion order; the Mutex runs one job at a time.
        const queue = new Mutex(this);
        const jobErrors = new Array<unknown>();
        let pendingJobs = 0;
        const q: MutateContext = {
            endpointsWithData: new Set<EndpointNumber>(),
            enqueue: job => {
                pendingJobs++;
                queue.run(async () => {
                    try {
                        await job();
                    } catch (error) {
                        jobErrors.push(error);
                        logger.warn("Deferred data report job failed:", error);
                    } finally {
                        pendingJobs--;
                    }
                });
            },
        };

        // Apply changes
        const scope = ReadScope(request);
        try {
            for await (const chunk of changes) {
                const chunkData = new Array<ReadResult.Report>();
                for await (const change of chunk) {
                    chunkData.push(change);
                    switch (change.kind) {
                        case "attr-value":
                            currentUpdates = this.#mutateAttribute(change, scope, currentUpdates, q);
                            break;

                        case "event-value":
                            this.#emitEvent(change, q);
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

                    if (pendingJobs > MAX_PENDING_JOBS) {
                        await queue;
                    }
                }

                yield chunkData;
            }

            // The last cluster still needs its changes applied
            if (currentUpdates) {
                const toFlush = currentUpdates;
                q.enqueue(() => this.#updateCluster(toFlush));
            }
        } finally {
            // Drain deferred jobs on every exit path (normal completion, consumer break/throw, or a `changes`
            // error) so no enqueued persist/emit work runs detached after the interaction ends.  Structural changes
            // below read #pendingChanges, which the drained #updateCluster jobs populate.
            await queue;
        }

        if (jobErrors.length) {
            logger.warn(`${jobErrors.length} deferred data report job(s) failed during interaction`);
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
        this.#clustersWithDataThisInteraction.clear();

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

                    this.#clustersWithDataThisInteraction.add(cluster);
                    this.#preserveAbsentCluster(endpoint.endpoint, cluster);

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
    get subscribedFabricFiltered(): boolean {
        if (this.#subscribedFabricFiltered === undefined) {
            this.#subscribedFabricFiltered = true;

            // Attempt to read from network behavior if available
            try {
                const state = this.#node.state as Record<string, unknown>;
                const network = state?.network as undefined | Record<string, unknown>;
                const defaultSubscription = network?.defaultSubscription as
                    undefined | { isFabricFiltered?: boolean; fabricFiltered?: boolean };
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

    #mutateAttribute(
        change: ReadResult.AttributeValue,
        scope: ReadScope,
        currentUpdates: undefined | AttributeUpdates,
        q: MutateContext,
    ): AttributeUpdates | undefined {
        // We only store values when an initial subscription is defined and the fabric filter matches
        if (this.subscribedFabricFiltered !== scope.isFabricFiltered) {
            return currentUpdates;
        }

        const { endpointId, clusterId, attributeId } = change.path;

        // Record synchronously so #emitEvent can classify events against data touched this interaction,
        // independent of the now-deferred #pendingChanges population.
        q.endpointsWithData.add(endpointId);

        // If we are building updates to a cluster and the cluster/endpoint changes, apply the current update set
        if (currentUpdates && (currentUpdates.endpointId !== endpointId || currentUpdates.clusterId !== clusterId)) {
            const toFlush = currentUpdates;
            q.enqueue(() => this.#updateCluster(toFlush));
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

    #emitEvent(occurrence: ReadResult.EventValue, q: MutateContext): void {
        const emitter = this.eventEmitter;
        if (!emitter) {
            return;
        }

        const { endpointId } = occurrence.path;

        const endpoint = this.#endpoints.get(endpointId);
        // Delay emission until end-of-interaction (after persist + structural changes) when this endpoint received
        // attribute data this interaction, has a pending structural change, or is not yet installed — events must not
        // arrive before the endpoint exists or before its own attribute state is applied.
        if (
            endpoint === undefined ||
            !endpoint.endpoint.lifecycle.isInstalled ||
            q.endpointsWithData.has(endpointId) ||
            this.#pendingChanges?.has(endpoint)
        ) {
            this.#delayedClusterEvents.push(occurrence);
        } else {
            q.enqueue(() => Promise.resolve(emitter(occurrence)));
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
     * Cancel a deletion scheduled for a cluster the peer is still sending data for.
     *
     * A peer that omits a cluster from its descriptor server list but continues to report the cluster's attributes is
     * buggy, but we tolerate it by keeping the cluster — aka "Schrödinger's cluster".
     */
    #preserveAbsentCluster(endpoint: Endpoint, cluster: ClusterStructure) {
        if (!cluster.pendingDelete) {
            return;
        }

        logger.info(
            `Cluster 0x${hex.fixed(cluster.id, 8)} on ${endpoint} is absent from descriptor server list but peer` +
                " sent attribute data for it; keeping cluster",
        );
        delete cluster.pendingDelete;
    }

    /**
     * Apply new attribute values for a specific endpoint / cluster.
     *
     * This is invoked in a batch when we've collected all sequential values for the current endpoint/cluster.
     */
    async #updateCluster(attrs: AttributeUpdates) {
        const endpoint = this.#endpointFor(attrs.endpointId);
        const cluster = this.#clusterFor(endpoint, attrs.clusterId);

        // Receiving attribute data for a cluster is authoritative evidence the peer still has it, even when its
        // descriptor server list omits it.  Record this and cancel any deletion already scheduled by a descriptor
        // processed earlier in this same interaction — "Schrödinger's cluster".
        this.#clustersWithDataThisInteraction.add(cluster);
        this.#preserveAbsentCluster(endpoint.endpoint, cluster);

        // A non-empty AttributeList is authoritative for the attribute set.  An empty list is ignored so it doesn't
        // churn against the received-attribute fallback.  Detect the change up front, before any feature comparison
        // clears the behavior, so the outgoing behavior's schema is still available to prune dropped attributes.
        const attributeList = attrs.values.get(AttributeList.id);
        const newAttributes = Array.isArray(attributeList) && attributeList.length ? attributeList : undefined;
        const attributeSetChanged =
            !!cluster.behavior &&
            newAttributes !== undefined &&
            !isDeepEqual(
                cluster.attributes,
                [...newAttributes].sort((a, b) => a - b),
            );

        if (attributeSetChanged) {
            this.#pruneDroppedAttributes(cluster, newAttributes, attrs.values);
        }

        if (cluster.behavior && attrs.values.has(FeatureMap.id)) {
            if (!isDeepEqual(cluster.features, attrs.values.get(FeatureMap.id))) {
                cluster.behavior = undefined;
            }
        }

        if (attributeSetChanged) {
            cluster.behavior = undefined;
        }

        if (cluster.behavior && attrs.values.has(AcceptedCommandList.id)) {
            const acceptedCommands = attrs.values.get(AcceptedCommandList.id);
            if (
                Array.isArray(acceptedCommands) &&
                !isDeepEqual(
                    cluster.commands,
                    [...acceptedCommands].sort((a, b) => a - b),
                )
            ) {
                cluster.behavior = undefined;
            }
        }

        await cluster.store.externalSet(attrs.values);
        this.#synchronizeCluster(endpoint, cluster);
    }

    /**
     * Mark values for attributes dropped by a new attribute list for deletion.
     *
     * The client store keys attribute values by both numeric attribute ID (protocol updates) and property name (seed
     * data), so we clear both forms.  Entries added to {@link values} are removed by the pending
     * {@link Datasource.ExternallyMutableStore.externalSet}; a value of `undefined` deletes a key.
     */
    #pruneDroppedAttributes(cluster: ClusterStructure, newAttributeList: readonly unknown[], values: Val.StructMap) {
        if (!cluster.attributes) {
            return;
        }

        const retained = new Set(newAttributeList);
        const oldAttributes = cluster.behavior?.cluster?.attributes;

        for (const id of cluster.attributes) {
            if (retained.has(id)) {
                continue;
            }

            values.set(id, undefined);

            if (oldAttributes) {
                for (const [name, def] of Object.entries(oldAttributes)) {
                    if (def.id === id) {
                        values.set(name, undefined);
                        break;
                    }
                }
            }
        }
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
            const values = cluster.store.currentValues;
            if (values) {
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

                if (Array.isArray(attributeList) && attributeList.length) {
                    cluster.attributes = (attributeList.filter(attr => typeof attr === "number") as AttributeId[]).sort(
                        (a, b) => a - b,
                    );
                } else {
                    // Some devices report an empty (or omit the) AttributeList despite returning attribute data.  Fall
                    // back to the attribute IDs we actually received so the discovered schema reflects the device
                    // rather than "supports nothing", which would mark mandatory globals unsupported.
                    const received = Object.keys(values)
                        .map(Number)
                        .filter(id => Number.isInteger(id) && id >= 0) as AttributeId[];
                    if (received.length) {
                        cluster.attributes = received.sort((a, b) => a - b);
                    }
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
                    this.#preserveAbsentCluster(endpoint, cluster);
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
                attrs = cluster.store.currentValues ?? {};
            }
            this.#synchronizeDescriptor(structure, attrs);
        }
    }

    #synchronizeDescriptor(structure: EndpointStructure, attrs: Record<string | number, unknown>) {
        const { endpoint } = structure;

        const deviceTypeList = getStoreValue(attrs, DEVICE_TYPE_LIST_ATTR_ID, DEVICE_TYPE_LIST_ATTR_NAME) as
            Descriptor.DeviceType[] | undefined;
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
                    // Only delete it when peer did not send attribute data for this cluster in the same interaction
                    // despite it not being in the server list; a device is buggy but we tolerate it by skipping the
                    // deletion, aka "Schrödinger's cluster".  Data arriving later in the interaction cancels the
                    // deletion via #preserveAbsentCluster; data already seen is skipped here.
                    if (
                        !clusterStructure.pendingBehavior &&
                        !this.#clustersWithDataThisInteraction.has(clusterStructure)
                    ) {
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
            logger.warn(`Error erasing peer endpoint ${endpoint}:`, e);
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

        for (const [key, cluster] of clusters.entries()) {
            const { behavior, pendingBehavior, pendingDelete } = cluster;

            if (pendingDelete) {
                // Discard the structure entirely so a later re-appearance rebuilds it from scratch with a fresh store
                // and a fresh behavior.  Keeping a dropped cluster's structure around leaves a stale behavior reference
                // that suppresses regeneration in #synchronizeCluster, so the cluster never re-installs.
                clusters.delete(key);

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
                    logger.warn("Error clearing cluster storage:", e);
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
