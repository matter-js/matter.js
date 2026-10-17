/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { ClusterBehavior } from "#behavior/cluster/ClusterBehavior.js";
import type { ClusterBehaviorType } from "#behavior/cluster/ClusterBehaviorType.js";
import { Datasource } from "#behavior/state/managed/Datasource.js";
import { memberValueOf } from "#behavior/state/managed/MemberKeys.js";
import { memberKeyFor } from "#behavior/state/managed/MemberKeys.js";
import type { ValReference } from "#behavior/state/managed/ValReference.js";
import { Endpoint } from "#endpoint/Endpoint.js";
import { EndpointType } from "#endpoint/type/EndpointType.js";
import { RootEndpoint } from "#endpoints/root";
import type { StateStream } from "#node/integration/StateStream.js";
import type { Node } from "#node/Node.js";
import { DatasourceCache } from "#storage/client/DatasourceCache.js";
import {
    capitalize,
    DestroyedDependencyError,
    Diagnostic,
    hex,
    InternalError,
    isDeepEqual,
    Logger,
    MaybePromise,
    Mutex,
    Observable,
} from "@matter/general";
import {
    AcceptedCommandList,
    AttributeList,
    ClusterModel,
    ClusterRevision,
    DeviceClassification,
    EndpointComposition,
    FeatureMap,
    GeneratedCommandList,
    type FeatureBitmap,
} from "@matter/model";
import { ReadScope, Val, type Read, type ReadResult } from "@matter/protocol";
import { AttributeId, EndpointNumber } from "@matter/types";
import type { ClusterId, CommandId, DataVersionFilter, EventNumber } from "@matter/types";
import { Status } from "@matter/types";
import { Descriptor } from "@matter/types/clusters/descriptor";
import type { ClientEventEmitter } from "./ClientEventEmitter.js";
import { ClientStructureEvents } from "./ClientStructureEvents.js";
import { PeerBehavior } from "./PeerBehavior.js";

/** The endpoint the peer's root `PartsList` is read from (Matter Core § 9.2). */
const ROOT_ENDPOINT_NUMBER = EndpointNumber(0);

const logger = Logger.get("ClientStructure");

/** Max deferred persist/emit jobs allowed in flight before the decode loop applies back-pressure. */
const MAX_PENDING_JOBS = 100;

interface MutateContext {
    enqueue(job: () => Promise<void>): void;
    endpointsWithData: Set<EndpointNumber>;
    /**
     * Clusters the peer sent data for in this interaction, which a descriptor later in it must not delete. Scoped to
     * the interaction because reads run concurrently with the sustained subscription's reports.
     */
    clustersWithData: Set<ClusterStructure>;
    /** Events held back until the interaction's attribute data and structural changes are applied. */
    delayedEvents: ReadResult.EventValue[];
    /** Whether the interaction's events go to the node's event observers at this moment. */
    emitsEvents(): boolean;
    /** Called with the number of each event the interaction emits to the node's event observers. */
    eventEmitted?: (number: EventNumber) => void;
    /** The {@link ClientStructure.Epoch} of the cache the interaction's data versions belong to. */
    epoch: ClientStructure.Epoch;
}

const DESCRIPTOR_ID = Descriptor.id;
const DEVICE_TYPE_LIST_ATTR_ID = Descriptor.attributes.deviceTypeList.id;
const SERVER_LIST_ATTR_ID = Descriptor.attributes.serverList.id;
const PARTS_LIST_ATTR_ID = Descriptor.attributes.partsList.id;

const DEVICE_TYPE_LIST_ATTR_NAME = "deviceTypeList";
const SERVER_LIST_ATTR_NAME = "serverList";
const PARTS_LIST_ATTR_NAME = "partsList";

/**
 * Read a value from store initial values, preferring the numeric attribute ID slot over the property name slot.
 */
function getStoreValue(values: Record<string | number, unknown> | undefined, id: number, name: string): unknown {
    if (values === undefined) {
        return undefined;
    }
    return memberValueOf(values, id, name);
}

/**
 * Whether a key of an id-keyed cluster store addresses an attribute by its numeric ID rather than its property name.
 */
function isIdKey(key: string) {
    return /^\d+$/.test(key);
}

/**
 * The attribute list a peer reported, if it describes the attribute set.
 *
 * A non-empty AttributeList is authoritative.  An empty list is ignored so it doesn't churn against the
 * received-attribute fallback some devices need.
 */
function authoritativeAttributeList(value: unknown) {
    if (!Array.isArray(value)) {
        return;
    }

    const ids = value.filter((id): id is number => typeof id === "number");
    return ids.length ? ids : undefined;
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
    #cacheRecord: ClientStructure.CacheRecord;
    #epoch = new ClientStructure.Epoch(true);
    #adoptions = new Mutex(this);
    #pendingChanges = new Map<EndpointStructure, PendingChange>();
    #pendingStructureEvents = Array<PendingEvent>();

    // Keyed by cluster ID; a cluster's schema does not change for the life of the structure
    #attributeIds = new Map<ClusterId, Map<string, number>>();

    /**
     * Which endpoints have named each part in a `PartsList`, and what each of those lists contained.
     *
     * Parenthood cannot be decided from a single list, because a device type composing its list of
     * every descendant ({@link EndpointComposition.FullFamily}) says nothing about which endpoint owns
     * a part. A claim stays here until it can be decided; nothing is ever reparented, so an
     * undecidable claim waits for the read that settles it rather than being guessed at.
     */
    #partClaims = new Map<EndpointStructure, Set<EndpointStructure>>();
    #partsListOf = new Map<EndpointStructure, Set<EndpointNumber>>();

    /**
     * How each endpoint composes its `PartsList`, for the endpoints that have said.
     *
     * Absent means the endpoint has not reported its device types yet, which is not the same as
     * composing a tree: a list from an endpoint whose composition is unknown says nothing about who
     * owns what, so claims from it wait rather than being read as a parent's.
     */
    #composition = new Map<EndpointStructure, EndpointComposition>();
    #events: ClientStructureEvents;
    #changed = Observable<[void]>();
    #applying = 0;
    #localFailureKinds = new Set<unknown>();
    #commandFactory?: ClusterBehaviorType.CommandFactory;

    /**
     * Optional event emitter for Matter protocol events.  Set after construction.
     */
    eventEmitter?: ClientEventEmitter;

    constructor(node: Node, storeFactory: ClientStructure.StoreFactory, options: ClientStructure.Options) {
        this.#node = node;
        this.#storeFactory = storeFactory;
        this.#commandFactory = options.commandFactory;
        this.#cacheRecord = options.cacheRecord;
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
     * True while structural changes are being applied and announced, when the endpoint tree and its behaviors may be
     * only partly installed.
     */
    get isApplying() {
        return this.#applying > 0;
    }

    /**
     * Whether the peer has reported the Descriptor list `attribute` (DeviceTypeList or PartsList) of `endpoint`, from
     * the wire or from the cache of an earlier report.
     */
    isDescriptorListReported(endpoint: EndpointNumber, attribute: AttributeId) {
        return this.#endpoints.get(endpoint)?.reportedLists?.has(attribute) ?? false;
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
                const cluster = this.#clusterFor(endpoint, id);
                this.#checkUnlistedSeedValues(cluster);
                this.#noteReportedLists(endpoint, cluster, cluster.store.currentValues ?? {});
                this.#synchronizeCluster(endpoint, cluster, new Set());
            }
        }

        this.#resolvePartClaims();

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
        this.#announceApplied();
    }

    /**
     * Give the clusters of {@link endpoint} new stores once its cache is erased.  An erased store ignores the values the
     * peer reports.
     */
    renewStores(endpoint: Endpoint) {
        const structure = this.#endpoints.get(endpoint.number);
        if (structure === undefined) {
            return;
        }
        for (const [key, cluster] of structure.clusters) {
            cluster.store = this.#storeFactory(endpoint, key.toString(), cluster.primaryKey);
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
     * Add a data version filter for each cluster whose cached data is current, so the peer omits those clusters from
     * its response.  The caller's own filters are kept as given and its array is not modified; a cluster the caller
     * filters gets no injected filter, so the peer sees exactly the caller's filter for that cluster.
     *
     * The cache holds only data of its own fabric filter ({@link cacheFabricFiltered}), so a request with the other
     * fabric filter gets no filters.
     *
     * A subscription does not report changes of an attribute with the changes-omitted quality, so a matching version
     * does not mean such an attribute is current.  With {@link options.refreshChangesOmitted} a cluster in which the
     * peer has one gets no filter, so the response carries its current values.
     */
    injectVersionFilters<T extends Read>(request: T, options?: { refreshChangesOmitted?: boolean }): T {
        const scope = ReadScope(request);
        if (!this.#epoch.trusted || scope.isFabricFiltered !== this.cacheFabricFiltered) {
            return request;
        }

        let filters: DataVersionFilter[] | undefined;
        const callerFiltered = new Set(
            request.dataVersionFilters?.map(({ path: { endpointId, clusterId } }) => `${endpointId}/${clusterId}`),
        );

        for (const {
            endpoint: { number: endpointId },
            clusters,
        } of this.#endpoints.values()) {
            for (const cluster of clusters.values()) {
                const {
                    id: clusterId,
                    store: { version },
                } = cluster;
                if (!scope.isRelevant(endpointId, clusterId)) {
                    continue;
                }

                if (
                    version === Datasource.UNKNOWN_VERSION ||
                    callerFiltered.has(`${endpointId}/${clusterId}`) ||
                    (options?.refreshChangesOmitted && hasChangesOmittedAttribute(cluster))
                ) {
                    continue;
                }

                filters ??= [...(request.dataVersionFilters ?? [])];
                filters.push({ path: { endpointId, clusterId }, dataVersion: version });
            }
        }

        return filters === undefined ? request : { ...request, dataVersionFilters: filters };
    }

    /**
     * The fabric filter of the interactions the cache takes data from.  Only interactions with this filter update
     * cached values and data versions, and only they get versions injected.  Defaults to fabric filtered until
     * {@link adoptFabricFilter} recorded one.
     */
    get cacheFabricFiltered() {
        return this.#cacheRecord.cacheFabricFiltered ?? true;
    }

    /**
     * The epoch an interaction starting now belongs to.  An interaction records the data versions it reports only if
     * its epoch is still the current one and trusted when the data is applied.
     */
    get epoch() {
        return this.#epoch;
    }

    /**
     * Make {@link fabricFiltered} the fabric filter of the cache.  Calls run one after the other.
     *
     * Data versions do not depend on the fabric filter, but cached values of fabric-scoped data do.  So when the cache
     * was filled under the other filter, every cached data version becomes unknown while values stay, and the next
     * full report refreshes them.  A cache without a recorded filter is trusted to hold data of the first filter
     * adopted, which is the configured default subscription's, so that filter is recorded and the versions stay.
     *
     * Each change of the filter starts a new {@link epoch}.  An interaction that started before the change records no
     * data version; its data is still applied if it was received before the change or matches the new filter, and
     * data of the old filter received after the change is dropped.  While the versions are forgotten the epoch is not
     * trusted, so no version is recorded or injected.  Rejects if storage refuses a write; the old record then stays,
     * so the next attempt forgets the versions again.
     */
    adoptFabricFilter(fabricFiltered: boolean) {
        return this.#adoptions.produce(() => this.#adoptFabricFilter(fabricFiltered));
    }

    async #adoptFabricFilter(fabricFiltered: boolean) {
        const record = this.#cacheRecord;
        const recorded = record.cacheFabricFiltered;
        if (recorded === fabricFiltered) {
            return;
        }

        if (recorded === undefined) {
            if (this.cacheFabricFiltered !== fabricFiltered) {
                this.#epoch = new ClientStructure.Epoch(true);
            }
            await record.recordCacheFabricFiltered(fabricFiltered);
            return;
        }

        this.#epoch = new ClientStructure.Epoch(false);
        try {
            for (const { clusters } of this.#endpoints.values()) {
                for (const { store } of clusters.values()) {
                    // Also when unknown in memory only: storage can still hold a version of the old filter
                    await store.forgetVersion();
                }
            }

            // Written last: if forgetting a version fails, the old record makes the next attempt forget them again
            await record.recordCacheFabricFiltered(fabricFiltered);
        } finally {
            this.#epoch = new ClientStructure.Epoch(true);
        }
    }

    /**
     * Update the node structure by applying attribute changes from a Matter protocol interaction.
     *
     * The interaction's events also go to the node's event observers while {@link options.emitEvents} is true or
     * returns true, and {@link options.eventEmitted} receives the number of each.  {@link options.epoch} defaults to
     * the current {@link epoch}.
     *
     * A local failure to apply data, persist it or notify an event observer is logged and does not stop the processing
     * of the interaction's other data and events; it never rejects the iteration.  Failures of {@link changes} itself
     * and of applying structural changes still reject.
     */
    async *mutate(
        request: Read,
        changes: ReadResult,
        options?: {
            emitEvents?: boolean | (() => boolean);
            eventEmitted?: (number: EventNumber) => void;
            epoch?: ClientStructure.Epoch;
        },
    ) {
        const emitEvents = options?.emitEvents ?? false;

        // We collect updates and only apply when we transition clusters
        let currentUpdates: AttributeUpdates | undefined;

        // Serial FIFO for deferred persist/emit so Status.Success is not gated on internal and consumer data processing.
        // Ordering is preserved by insertion order; the Mutex runs one job at a time.
        const queue = new Mutex(this);
        let pendingJobs = 0;
        const q: MutateContext = {
            endpointsWithData: new Set<EndpointNumber>(),
            clustersWithData: new Set<ClusterStructure>(),
            delayedEvents: new Array<ReadResult.EventValue>(),
            emitsEvents: typeof emitEvents === "function" ? emitEvents : () => emitEvents,
            eventEmitted: options?.eventEmitted,
            epoch: options?.epoch ?? this.#epoch,
            enqueue: job => {
                pendingJobs++;
                queue.run(async () => {
                    try {
                        await job();
                    } catch (error) {
                        this.#localFailed(error);
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
                q.enqueue(() => this.#applyUpdates(toFlush, q));
            }
        } finally {
            // Drain deferred jobs on every exit path (normal completion, consumer break/throw, or a `changes`
            // error) so no enqueued persist/emit work runs detached after the interaction ends.  Structural changes
            // below read #pendingChanges, which the drained #updateCluster jobs populate.
            await queue;
        }

        // We don't apply structural changes until we've processed all attribute data if a.) listeners might otherwise
        // see partially initialized endpoints, or b.) the change requires an async operation
        await this.#applyAndAnnounce();
        for (const occurrence of q.delayedEvents) {
            try {
                await this.#emitOccurrence(occurrence, q);
            } catch (error) {
                this.#localFailed(error);
            }
        }
    }

    /**
     * A peer can trigger the same local failure with every report, so only the first of each kind is a warning; a
     * different kind, such as storage refusing writes after an observer failed, warns again.
     */
    #localFailed(error: unknown) {
        const kind = error instanceof Error ? error.constructor : typeof error;
        if (this.#localFailureKinds.has(kind)) {
            logger.debug(`Processing data reported by ${this.#node} failed locally:`, error);
            return;
        }
        this.#localFailureKinds.add(kind);
        logger.warn(`Processing data reported by ${this.#node} failed locally; repeats log at debug level:`, error);
    }

    /**
     * Apply {@link StateStream.WireChange}s to the structure.
     *
     * A wire change addresses members by property name.  A client behavior's container keys them by attribute ID, so
     * this is where the two representations meet: values convert on the way in and {@link StateStream.WireChange}
     * stays name-keyed on the way out.
     */
    async applyWireChanges(changes: StateStream.WireChange[]) {
        const clustersWithData = new Set<ClusterStructure>();

        for (const change of changes) {
            switch (change.kind) {
                case "update": {
                    const endpointNumber = change.endpoint as EndpointNumber;
                    const endpoint = this.#endpointFor(endpointNumber);
                    const cluster = this.#clusterForBehavior(endpoint, change.behavior);

                    const values = this.#canonicalize(cluster, change.changes as Record<string, unknown>);

                    // Include version in externalSet values so DatasourceCache can update it
                    if (typeof change.version === "number") {
                        values.set(DatasourceCache.VERSION_KEY, change.version);
                    }

                    clustersWithData.add(cluster);
                    this.#preserveAbsentCluster(endpoint.endpoint, cluster);

                    this.#pruneUnlistedAttributes(cluster, values);
                    this.#invalidateOnDefinitionChange(cluster, values);

                    const { persistFailure } = await cluster.store.externalSet(values);
                    this.#noteReportedLists(endpoint, cluster, values);
                    this.#synchronizeCluster(endpoint, cluster, clustersWithData);
                    if (persistFailure !== undefined) {
                        this.#localFailed(persistFailure);
                    }
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

        await this.#applyAndAnnounce();
    }

    #mutateAttribute(
        change: ReadResult.AttributeValue,
        scope: ReadScope,
        currentUpdates: undefined | AttributeUpdates,
        q: MutateContext,
    ): AttributeUpdates | undefined {
        // We only store values when the fabric filter matches the cache's
        if (scope.isFabricFiltered !== this.cacheFabricFiltered) {
            return currentUpdates;
        }

        const { endpointId, clusterId, attributeId } = change.path;

        // Record synchronously so #emitEvent can classify events against data touched this interaction,
        // independent of the now-deferred #pendingChanges population.
        q.endpointsWithData.add(endpointId);

        // If we are building updates to a cluster and the cluster/endpoint changes, apply the current update set
        if (currentUpdates && (currentUpdates.endpointId !== endpointId || currentUpdates.clusterId !== clusterId)) {
            const toFlush = currentUpdates;
            q.enqueue(() => this.#applyUpdates(toFlush, q));
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
        if (!this.eventEmitter) {
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
            q.delayedEvents.push(occurrence);
        } else if (q.emitsEvents()) {
            q.enqueue(() => this.#emitOccurrence(occurrence, q));
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

    async #applyUpdates(attrs: AttributeUpdates, q: MutateContext) {
        // Data of an interaction that began before a fabric filter switch is still applied, but its version does not
        // describe the cache under the current filter
        if (q.epoch !== this.#epoch || !q.epoch.trusted) {
            attrs.values.set(DatasourceCache.VERSION_KEY, Datasource.UNKNOWN_VERSION);
        }
        await this.#updateCluster(attrs, q.clustersWithData);
    }

    /**
     * Apply new attribute values for a specific endpoint / cluster.
     *
     * This is invoked in a batch when we've collected all sequential values for the current endpoint/cluster.
     */
    async #updateCluster(attrs: AttributeUpdates, clustersWithData: Set<ClusterStructure>) {
        const endpoint = this.#endpointFor(attrs.endpointId);
        const cluster = this.#clusterFor(endpoint, attrs.clusterId);

        // Receiving attribute data for a cluster is authoritative evidence the peer still has it, even when its
        // descriptor server list omits it.  Record this and cancel any deletion already scheduled by a descriptor
        // processed earlier in this same interaction — "Schrödinger's cluster".
        clustersWithData.add(cluster);
        this.#preserveAbsentCluster(endpoint.endpoint, cluster);

        this.#pruneUnlistedAttributes(cluster, attrs.values);
        this.#invalidateOnDefinitionChange(cluster, attrs.values);

        const { persistFailure } = await cluster.store.externalSet(attrs.values);
        this.#noteReportedLists(endpoint, cluster, attrs.values);
        this.#synchronizeCluster(endpoint, cluster, clustersWithData);
        if (persistFailure !== undefined) {
            this.#localFailed(persistFailure);
        }
    }

    /**
     * Convert values a wire change addresses by property name to the keys the cluster's container uses.
     *
     * A name the cluster's schema does not define is left as it is; it addresses no member and so has no other key.
     * A cluster whose store keys by name converts nothing -- it has no schema to resolve names against.
     */
    #canonicalize(cluster: ClusterStructure, changes: Record<string, unknown>) {
        const ids = cluster.primaryKey === "id" ? this.#attributeIdsFor(cluster.id) : undefined;
        const values = new Map() as Val.StructMap;

        for (const [name, value] of Object.entries(changes)) {
            values.set(memberKeyFor(cluster.primaryKey, name, ids?.get(name)), value);
        }

        return values;
    }

    /**
     * The attribute ID each of a cluster's property names addresses.
     */
    #attributeIdsFor(clusterId: ClusterId) {
        let ids = this.#attributeIds.get(clusterId);
        if (ids !== undefined) {
            return ids;
        }

        ids = new Map<string, number>();
        for (const attr of this.#node.matter.clusters(clusterId)?.attributes ?? []) {
            if (attr.id !== undefined) {
                ids.set(attr.propertyName, attr.id);
            }
        }
        this.#attributeIds.set(clusterId, ids);

        return ids;
    }

    /**
     * Discard a behavior whose schema no longer describes the peer.
     *
     * The discovered schema is built from the cluster revision, the feature map, the attribute list and the accepted
     * command list, so a change to any of them has to regenerate it.
     */
    #invalidateOnDefinitionChange(cluster: ClusterStructure, values: Val.StructMap) {
        if (cluster.behavior === undefined) {
            return;
        }

        const newAttributes = authoritativeAttributeList(values.get(AttributeList.id));
        const attributeSetChanged =
            newAttributes !== undefined &&
            !isDeepEqual(
                cluster.attributes,
                [...newAttributes].sort((a, b) => a - b),
            );

        const acceptedCommands = values.get(AcceptedCommandList.id);

        if (
            attributeSetChanged ||
            (values.has(ClusterRevision.id) && cluster.revision !== values.get(ClusterRevision.id)) ||
            (values.has(FeatureMap.id) && !isDeepEqual(cluster.features, values.get(FeatureMap.id))) ||
            (Array.isArray(acceptedCommands) &&
                !isDeepEqual(
                    cluster.commands,
                    [...acceptedCommands].sort((a, b) => a - b),
                ))
        ) {
            cluster.behavior = undefined;
        }
    }

    /**
     * Mark stored values of attributes a reported attribute list omits for deletion.
     *
     * A value reported alongside the list shows the peer still has the attribute, so only stored values are pruned.
     * Entries added to {@link values} are removed by the pending {@link Datasource.ExternallyMutableStore.externalSet};
     * a value of `undefined` deletes a key.
     */
    #pruneUnlistedAttributes(cluster: ClusterStructure, values: Val.StructMap) {
        const attributeList = authoritativeAttributeList(values.get(AttributeList.id));
        if (attributeList === undefined) {
            return;
        }

        // A key that is undefined in memory has no copy under that key in storage
        const stored = Object.entries(cluster.store.currentValues ?? {})
            .filter(([key, value]) => value !== undefined && !values.has(Number(key)))
            .map(([key]) => key);
        for (const key of this.#unlistedKeys(cluster, attributeList, stored)) {
            values.set(key, undefined);
        }
    }

    /**
     * The value keys of {@link keys} that address an attribute absent from {@link attributeList}.
     *
     * The client store keys attribute values by both numeric attribute ID (protocol updates) and property name (seed
     * data), so both forms resolve to an attribute ID.  Keys that resolve to no attribute, such as metadata, are kept,
     * as are global attributes, which the specification requires in every list and the discovered schema depends on.
     */
    #unlistedKeys(cluster: ClusterStructure, attributeList: readonly number[], keys: Iterable<string>) {
        const unlisted = new Set<string>();
        if (cluster.primaryKey !== "id") {
            return unlisted;
        }

        const listed = new Set(attributeList);
        const ids = this.#attributeIdsFor(cluster.id);

        for (const key of keys) {
            const id = isIdKey(key) ? Number(key) : ids.get(key);
            if (id !== undefined && !listed.has(id) && !AttributeId.isGlobal(id)) {
                unlisted.add(key);
            }
        }

        return unlisted;
    }

    /**
     * Have the peer resend a cluster whose cache holds values for attributes the cached attribute list omits.
     *
     * A cache written before the attribute list change was detected holds such values, and a peer whose data version
     * is unchanged never sends the cluster again.  Forgetting the version makes the next wildcard read fetch the whole
     * cluster, and {@link #pruneUnlistedAttributes} then deletes what the peer no longer sends and keeps what it still
     * does.  Until then the values stay, as the last known state.  A peer that reports a value its own list omits
     * keeps that value, so its cluster is read in full on every load.
     *
     * A value under a property name is legacy residue that the datasource never rewrites and would otherwise migrate
     * to the attribute's ID on each load, so it is hidden here instead and does not make the peer resend.
     */
    #checkUnlistedSeedValues(cluster: ClusterStructure) {
        const values = cluster.store.initialValues;
        if (values === undefined) {
            return;
        }

        const attributeList = authoritativeAttributeList(getStoreValue(values, AttributeList.id, "attributeList"));
        if (attributeList === undefined) {
            return;
        }

        let resend = false;
        for (const key of this.#unlistedKeys(cluster, attributeList, Object.keys(values))) {
            if (isIdKey(key)) {
                resend = true;
            } else {
                values[key] = undefined;
            }
        }

        if (resend) {
            cluster.store.invalidateVersion?.();
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
    #synchronizeCluster(
        structure: EndpointStructure,
        cluster: ClusterStructure,
        clustersWithData: ReadonlySet<ClusterStructure>,
    ) {
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

                const reportedList = Array.isArray(attributeList) && attributeList.length ? attributeList : undefined;
                cluster.attributeListReported = reportedList !== undefined;
                if (reportedList !== undefined) {
                    cluster.attributes = (reportedList.filter(attr => typeof attr === "number") as AttributeId[]).sort(
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
                shape.matter = this.#node.matter;
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
            this.#synchronizeDescriptor(structure, attrs, clustersWithData);
        }
    }

    #noteReportedLists(structure: EndpointStructure, cluster: ClusterStructure, values: Val.StructMap | Val.Struct) {
        if (cluster.id !== Descriptor.id) {
            return;
        }

        const lists = [
            [DEVICE_TYPE_LIST_ATTR_ID, DEVICE_TYPE_LIST_ATTR_NAME],
            [PARTS_LIST_ATTR_ID, PARTS_LIST_ATTR_NAME],
        ] as const;
        for (const [id, name] of lists) {
            const value =
                values instanceof Map ? (values.get(id) ?? values.get(name)) : getStoreValue(values, id, name);
            if (value !== undefined) {
                (structure.reportedLists ??= new Set()).add(id);
            }
        }
    }

    #synchronizeDescriptor(
        structure: EndpointStructure,
        attrs: Record<string | number, unknown>,
        clustersWithData: ReadonlySet<ClusterStructure>,
    ) {
        const { endpoint } = structure;

        const deviceTypeList = getStoreValue(attrs, DEVICE_TYPE_LIST_ATTR_ID, DEVICE_TYPE_LIST_ATTR_NAME) as
            | Descriptor.DeviceType[]
            | undefined;
        if (Array.isArray(deviceTypeList)) {
            this.#noteComposition(structure, deviceTypeList);

            const endpointType = endpoint.type;
            for (const dt of deviceTypeList) {
                if (typeof dt?.deviceType !== "number") {
                    continue;
                }

                let isApp = false;
                const model = this.#node.matter.deviceTypes(dt.deviceType);
                if (model !== undefined) {
                    isApp = DeviceClassification.isApplication(model.classification);
                }

                // Root endpoint really needs to be a root endpoint so ignore any noise that would disrupt that
                if (!endpoint.number && endpointType.deviceType !== RootEndpoint.deviceType) {
                    endpointType.deviceRevision = dt.revision;
                    break;
                }

                // Skip this device type if we've already found one and this one is not an application
                // type. An endpoint the peer merely named as a part starts out carrying the unknown
                // sentinel, which is not one we found — an endpoint whose device types are all utility,
                // as a bridge's composed device is, would otherwise keep the sentinel forever.
                if (
                    endpointType.deviceType !== undefined &&
                    endpointType.deviceType !== EndpointType.UNKNOWN_DEVICE_TYPE &&
                    !isApp
                ) {
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
                    if (!clusterStructure.pendingBehavior && !clustersWithData.has(clusterStructure)) {
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

        // Which claimant owns a part is decided by #resolvePartClaims, once every list this
        // interaction carries is in.
        const named = new Set<EndpointNumber>();
        for (const value of partsList) {
            // The peer's own value, so it is checked rather than trusted; one out of range names no
            // endpoint this could hold
            if (typeof value !== "number" || !EndpointNumber.isValid(value)) {
                continue;
            }

            const partNo = EndpointNumber(value);
            named.add(partNo);

            const part = this.#endpointFor(partNo);
            let claimants = this.#partClaims.get(part);
            if (claimants === undefined) {
                claimants = new Set();
                this.#partClaims.set(part, claimants);
            }
            claimants.add(structure);
        }
        this.#retractClaimsOf(structure, named);
        this.#partsListOf.set(structure, named);

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
                    if (endpoint === undefined) {
                        continue;
                    }

                    // Erasing an endpoint closes everything below it, and nothing can move what it
                    // held elsewhere first. A peer that drops an endpoint while still naming what
                    // hangs from it contradicts itself, and the endpoints it still names are worth
                    // more than a tree that matches its list exactly.
                    const named = new Array<Endpoint>();
                    descendent.visit(below => {
                        if (below !== descendent && below.maybeNumber !== undefined && numbersUsed.has(below.number)) {
                            named.push(below);
                        }
                    });
                    if (named.length) {
                        logger.warn(
                            `Keeping ${descendent} although the peer's root no longer names it:`,
                            `it holds ${named.join(", ")}, which the root does name`,
                        );
                        continue;
                    }

                    this.#scheduleStructureChange(endpoint, "erase");
                }
            }
        }
    }

    #endpointFor(number: EndpointNumber) {
        let endpoint = this.#endpoints.get(number);
        if (endpoint) {
            return endpoint;
        }

        // An endpoint created with ClientNodeEndpoints.require() already holds this number
        const existing = this.#node.endpoints.has(number) ? this.#node.endpoints.for(number) : undefined;

        endpoint = {
            endpoint:
                existing ??
                new Endpoint({
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
            primaryKey: "id",
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
        const clusterModel = this.#node.matter.clusters(capitalize(behaviorId));
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
            primaryKey: "name",
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
        this.#partClaims.delete(structure);
        this.#partsListOf.delete(structure);
        this.#composition.delete(structure);
        for (const [part, claimants] of this.#partClaims) {
            claimants.delete(structure);
            if (claimants.size === 0) {
                this.#partClaims.delete(part);
            }
        }

        try {
            await endpoint.delete();
        } catch (e) {
            // The endpoint is closed already, or it, the node or an ancestor is closing or being deleted
            if (e instanceof DestroyedDependencyError) {
                logger.debug(`Not deleting peer endpoint ${endpoint}:`, e.message);
                return;
            }
            logger.warn(`Error deleting peer endpoint ${endpoint}:`, e);
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
                    await MaybePromise.then(cluster.store.erase?.());
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
     * Decide the owner of every part whose owner is now known, then apply the structural changes that
     * fall out of it.
     */
    async #applyPendingChanges() {
        // A node whose close or delete was requested takes no new structure; its parts are destroyed with it
        if (this.#node.lifecycle.isTerminal) {
            this.#pendingChanges.clear();
            return;
        }

        this.#resolvePartClaims();

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
    }

    /**
     * Give every part whose owner is now known an owner, and schedule its installation.
     *
     * A part named by an ordinary endpoint's list is that endpoint's child. A part named only by
     * full-family lists is a child of the innermost of them — but only once every endpoint those lists
     * name has reported its own parts, because until then a list naming it says no more than that it
     * is somewhere below. A part is placed only below an owner that is itself placed, so it is never
     * installed or announced below an endpoint that is not on the node. A claim that is undecided, or
     * whose owner is not placed yet, stays for a later interaction to settle.
     */
    #resolvePartClaims() {
        let placedAny: boolean;
        do {
            placedAny = false;
            for (const [part, claimants] of [...this.#partClaims]) {
                // Nothing is reparented: an endpoint the peer has already placed keeps its parent, and
                // Matter has no operation that would move it (Core § 9.2.7.3's single-parent requirement)
                if (this.#ownerOf(part) !== undefined) {
                    this.#partClaims.delete(part);
                    continue;
                }

                const decision = this.#ownerFor(claimants);
                if (decision === undefined || !this.#isPlaced(decision.owner)) {
                    continue;
                }
                const { owner, contenders } = decision;

                this.#partClaims.delete(part);

                // The root names every endpoint the peer has, and its removal scan runs while attribute
                // data is read — before this. Installing a part the root no longer names would resurrect
                // an endpoint that scan has already passed over.
                if (!this.#isOnTheNode(part)) {
                    continue;
                }

                if (contenders.length) {
                    logger.warn(
                        `Taking ${owner.endpoint} as the parent of ${part.endpoint}:`,
                        `the peer also named it a part of ${contenders
                            .map(claimant => claimant.endpoint.toString())
                            .join(", ")}, and an endpoint has a single parent`,
                    );
                }

                part.pendingOwner = owner;
                this.#scheduleStructureChange(part, "install");
                placedAny = true;
            }
        } while (placedAny);
    }

    /**
     * Whether `structure` is the root or has an owner, installed or pending. An owner is only ever
     * assigned to a placed endpoint, so its chain of owners reaches the root.
     */
    #isPlaced(structure: EndpointStructure) {
        return structure.endpoint.maybeNumber === 0 || this.#ownerOf(structure) !== undefined;
    }

    /**
     * Whether the peer's root names `structure`, so far as the root has said.
     *
     * A root endpoint composes its `PartsList` of every descendant (Matter Core § 9.2.8), so an
     * endpoint the root does not name is not a descendant of the node at all — whether it has gone
     * away or was never part of the tree the peer describes. Until the root has reported a list there
     * is nothing to judge against and every endpoint is taken as present.
     */
    #isOnTheNode(structure: EndpointStructure) {
        if (structure.endpoint.maybeNumber === 0) {
            return true;
        }

        const root = this.#endpoints.get(ROOT_ENDPOINT_NUMBER);
        const rootParts = root === undefined ? undefined : this.#partsListOf.get(root);
        return rootParts === undefined || rootParts.has(structure.endpoint.number);
    }

    /**
     * The claimant that owns a part, with the claimants that conflict with that choice, or `undefined` while that
     * cannot be told from what has arrived.
     */
    #ownerFor(claimants: Set<EndpointStructure>) {
        const ordinary = new Array<EndpointStructure>();
        const fullFamily = new Array<EndpointStructure>();
        for (const claimant of claimants) {
            // An endpoint the root does not name is not on the node, so it owns nothing. It would
            // otherwise take parts the root does name and hold them below itself, where nothing
            // installs them.
            if (!this.#isOnTheNode(claimant)) {
                continue;
            }

            // What a list means depends on how its endpoint composes one, so a claimant that has not
            // said cannot be weighed against the others yet. Deciding without it would place the part
            // under a parent that a later report cannot correct.
            if (!this.#composition.has(claimant)) {
                return undefined;
            }

            (this.#isFullFamily(claimant) ? fullFamily : ordinary).push(claimant);
        }

        // A list of children names nothing further down, so a claimant composing one is closer to the part than any
        // full-family claimant
        const candidates = ordinary.length ? ordinary : fullFamily;
        if (!candidates.length) {
            return undefined;
        }

        const owner = this.#closestClaimant(candidates, [...ordinary, ...fullFamily]);
        if (!ordinary.length && !this.#partsAccountedFor(owner)) {
            return undefined;
        }

        // Every other full-family claimant of a valid peer is an ancestor of the owner and names it
        const contenders = ordinary.length
            ? ordinary.filter(claimant => claimant !== owner)
            : fullFamily.filter(
                  claimant => claimant !== owner && !this.#partsListOf.get(claimant)?.has(owner.endpoint.number),
              );

        return { owner, contenders };
    }

    /**
     * The candidate closest to the part they all claim: the one naming the fewest of the other claimants, then the one
     * with the shorter `PartsList`, then the one with the lower endpoint number.
     *
     * The choice depends on the lists, not on the order they arrived in.  The matterjs-server Python client ranks by
     * the same criteria.
     */
    #closestClaimant(candidates: EndpointStructure[], claimants: EndpointStructure[]) {
        const rank = (candidate: EndpointStructure) => {
            const parts = this.#partsListOf.get(candidate);
            return [
                claimants.filter(other => other !== candidate && parts?.has(other.endpoint.number)).length,
                parts?.size ?? 0,
                candidate.endpoint.number,
            ];
        };

        let closest = candidates[0];
        let closestRank = rank(closest);
        for (const candidate of candidates.slice(1)) {
            const candidateRank = rank(candidate);
            const index = candidateRank.findIndex((value, i) => value !== closestRank[i]);
            if (index !== -1 && candidateRank[index] < closestRank[index]) {
                closest = candidate;
                closestRank = candidateRank;
            }
        }
        return closest;
    }

    /**
     * Whether every endpoint `structure` names has reported a `PartsList` of its own, which is what
     * makes the parts it names and nobody else's its own children.  An endpoint the root no longer
     * names reports nothing more, so it is not waited for.
     */
    #partsAccountedFor(structure: EndpointStructure) {
        const root = this.#endpoints.get(ROOT_ENDPOINT_NUMBER);
        const rootParts = root === undefined ? undefined : this.#partsListOf.get(root);
        for (const partNo of this.#partsListOf.get(structure) ?? []) {
            if (rootParts !== undefined && !rootParts.has(partNo)) {
                continue;
            }

            const part = this.#endpoints.get(partNo);
            if (part === undefined || this.#partsListOf.get(part) === undefined) {
                return false;
            }
        }
        return true;
    }

    /**
     * Withdraw `structure`'s claim on the parts its previous `PartsList` named and `named` does not.
     *
     * A claim that outlives the list it came from would let an endpoint the peer has dropped be
     * installed later, once the claim became decidable — the peer's current lists are the only
     * statement of what it has.
     */
    #retractClaimsOf(structure: EndpointStructure, named: Set<EndpointNumber>) {
        for (const partNo of this.#partsListOf.get(structure) ?? []) {
            if (named.has(partNo)) {
                continue;
            }

            const part = this.#endpoints.get(partNo);
            if (part === undefined) {
                continue;
            }

            const claimants = this.#partClaims.get(part);
            if (claimants === undefined) {
                continue;
            }

            claimants.delete(structure);
            if (claimants.size === 0) {
                this.#partClaims.delete(part);
            }
        }
    }

    /**
     * Record how `structure` composes its `PartsList`, from every device type it reports.
     *
     * Any one of them composing a full family makes the endpoint's list a full-family one, as
     * `DescriptorServer` decides for an endpoint of our own — the two have to agree about the same
     * endpoint. A list carrying nothing usable leaves the composition unknown rather than assuming a
     * tree, so what depends on it waits.
     */
    #noteComposition(structure: EndpointStructure, deviceTypeList: Descriptor.DeviceType[]) {
        let known = false;
        let composesFullFamily = false;

        for (const dt of deviceTypeList) {
            if (typeof dt?.deviceType !== "number") {
                continue;
            }

            known = true;
            if (this.#node.matter.deviceTypes(dt.deviceType)?.effectiveComposition === EndpointComposition.FullFamily) {
                composesFullFamily = true;
            }
        }

        if (known) {
            this.#composition.set(
                structure,
                composesFullFamily ? EndpointComposition.FullFamily : EndpointComposition.Tree,
            );
        }
    }

    /** Whether `structure`'s `PartsList` names every descendant rather than its own children. */
    #isFullFamily(structure: EndpointStructure) {
        return this.#composition.get(structure) === EndpointComposition.FullFamily;
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
    }

    /**
     * Apply pending structural changes, then emit their events, so no listener sees a partly applied structure.
     */
    async #applyAndAnnounce() {
        // A count because interactions are not serialized and one may apply while another awaits
        this.#applying++;
        try {
            await this.#applyPendingChanges();
            this.#emitPendingStructureEvents();
        } finally {
            this.#applying--;
        }
        this.#announceApplied();
    }

    #announceApplied() {
        this.#changed.emit();
        this.#events.emitStructureApplied(this.#node);
    }

    async #emitOccurrence(occurrence: ReadResult.EventValue, q: MutateContext) {
        if (!this.eventEmitter || !q.emitsEvents()) {
            return;
        }

        // A report can still arrive while the node is deleted, also when a leave event triggered the deletion
        if (this.#node.lifecycle.isGone) {
            logger.debug(
                `Ignoring event ${occurrence.path.clusterId}/${occurrence.path.eventId} for ${this.#node} because it is closing, being deleted or crashed`,
            );
            return;
        }

        // Counted before the emit, so a successor starting while observers run does not request the event again
        q.eventEmitted?.(occurrence.number);
        await this.eventEmitter(occurrence);
    }
}

export namespace ClientStructure {
    /**
     * A period in which the cache's fabric filter does not change.  Data versions are recorded only for interactions
     * of the current epoch, and only if it is trusted, which it is not while versions are being forgotten.
     */
    export class Epoch {
        constructor(readonly trusted: boolean) {}
    }

    /**
     * The persisted record of the fabric filter the cache was filled under.
     */
    export interface CacheRecord {
        readonly cacheFabricFiltered?: boolean;
        recordCacheFabricFiltered(fabricFiltered: boolean): Promise<void>;
    }

    /**
     * Creates a {@link Datasource.ExternallyMutableStore} for a behavior on an endpoint.
     */
    export type StoreFactory = (
        endpoint: Endpoint,
        behaviorId: string,
        primaryKey: ValReference.PrimaryKey,
    ) => Datasource.ExternallyMutableStore;

    export interface Options {
        /**
         * Factory for command implementations used when generating peer behaviors.
         */
        commandFactory?: ClusterBehaviorType.CommandFactory;

        /**
         * Where the fabric filter of the cache is recorded.
         */
        cacheRecord: CacheRecord;
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

    /**
     * The Descriptor lists the peer has reported for this endpoint.  A mandatory list it has not reported still reads
     * as empty from the behavior's state.
     */
    reportedLists?: Set<AttributeId>;
}

interface ClusterStructure extends Partial<PeerBehavior.DiscoveredClusterShape> {
    kind: "discovered";
    id: ClusterId;

    /**
     * The keying convention {@link store} uses.  A cluster the peer names but we cannot resolve to a schema has no
     * attribute IDs to key by, so its store keys members by property name.
     */
    primaryKey: "id" | "name";
    behavior?: ClusterBehavior.Type;
    pendingBehavior?: ClusterBehavior.Type;
    pendingDelete?: boolean;
    store: Datasource.ExternallyMutableStore;

    /** Whether {@link attributes} is the peer's `AttributeList` rather than the IDs of the values it sent. */
    attributeListReported?: boolean;
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

const changesOmittedIdsOf = new WeakMap<ClusterModel, Set<number>>();

/**
 * Whether the peer has an attribute with the changes-omitted quality in {@link cluster}. Without the peer's
 * `AttributeList` every such attribute of the model counts.
 */
function hasChangesOmittedAttribute(cluster: ClusterStructure) {
    const schema = cluster.behavior?.schema;
    if (!(schema instanceof ClusterModel)) {
        return false;
    }

    let ids = changesOmittedIdsOf.get(schema);
    if (ids === undefined) {
        ids = new Set(
            schema.attributes.filter(attribute => attribute.changesOmitted === true).map(attribute => attribute.id),
        );
        changesOmittedIdsOf.set(schema, ids);
    }

    if (!ids.size) {
        return false;
    }
    return !cluster.attributeListReported || !!cluster.attributes?.some(id => ids.has(id));
}
