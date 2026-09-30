/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { isClientBehavior } from "#behavior/cluster/cluster-behavior-utils.js";
import { ClusterBehavior } from "#behavior/cluster/ClusterBehavior.js";
import { Endpoint } from "#endpoint/Endpoint.js";
import { ClientGroup } from "#node/ClientGroup.js";
import { ClientNode } from "#node/ClientNode.js";
import { Node } from "#node/Node.js";
import { ServerNode } from "#node/ServerNode.js";
import { BasicMultiplex, Diagnostic, Environment, Environmental, InternalError, Logger } from "@matter/general";
import { Fabric, FabricManager, PeerAddress, PeerSet } from "@matter/protocol";
import { FabricIndex, NodeId } from "@matter/types";
import { Binding } from "@matter/types/clusters/binding";
import { BindingServer } from "./BindingServer.js";

const logger = Logger.get("BindingManager");

type QueueItem = { server: BindingServer; endpoint: Endpoint; entry: Binding.Target };

export type BindingResolution =
    | { kind: "client"; node: ClientNode; endpoint: Endpoint; entry: Binding.Target }
    | { kind: "group"; node: ClientGroup; endpoint: Endpoint; entry: Binding.Target }
    | { kind: "server"; node: Node; endpoint: Endpoint; entry: Binding.Target };

type PendingEntry = { cancel: () => void };

type EstablishedEntry = { resolution: BindingResolution; ref: string | undefined };

/** Per-source-endpoint tracking record stored in #serverMap. */
type ServerRecord = {
    server: BindingServer;
    pending: Map<string, PendingEntry>;
    established: Map<string, EstablishedEntry>;
    /** Every registered group entry, resolved or waiting for the fabric to hold a key for its group. */
    groups: Map<string, QueueItem>;
};

/**
 * Node-scoped service that manages the lifecycle of Matter binding connections.
 */
export class BindingManager {
    readonly #env: Environment;
    #cachedNode: ServerNode | undefined;
    #cachedFabrics: FabricManager | undefined;
    readonly #queue = new Array<QueueItem>();
    /**
     * Keyed by the source endpoint (stable object identity across behavior proxy contexts).
     * Stores both pending and established state plus the canonical server reference for event emission.
     */
    readonly #serverMap = new Map<Endpoint, ServerRecord>();
    readonly #refcounts = new Map<string, number>();
    readonly #multiplex = new BasicMultiplex();
    /** Releases the watch on each fabric's group keys, per fabric index. */
    readonly #groupKeyWatches = new Map<FabricIndex, () => void>();
    #flushed = false;

    constructor(env: Environment) {
        this.#env = env;
        const node = env.get(Node);
        if (node.lifecycle.isOnline) {
            this.#captureRefs(node);
            this.#flushed = true;
        }
        node.lifecycle.online.on(() => this.#onOnline(node));
    }

    #onOnline(node: Node): void {
        this.#captureRefs(node);
        this.#multiplex.add(this.#flushQueue(), "binding queue flush");
    }

    #captureRefs(node: Node): void {
        if (!(node instanceof ServerNode)) {
            throw new InternalError("BindingManager requires a ServerNode environment");
        }
        this.#cachedNode = node;
        const fabrics = this.#env.get(FabricManager);
        this.#cachedFabrics = fabrics;
        fabrics.events.replaced.on(this.#fabricReplaced);
        fabrics.events.deleted.on(this.#fabricDeleted);
    }

    /**
     * A fabric update (UpdateNOC) replaces the Fabric object, and with it the group key maps a watch observes; the event
     * also fires when a fabric is persisted unchanged.
     */
    readonly #fabricReplaced = (fabric: Fabric) => {
        const release = this.#groupKeyWatches.get(fabric.fabricIndex);
        if (release === undefined) {
            return;
        }
        release();
        this.#groupKeyWatches.delete(fabric.fabricIndex);
        this.#watchGroupKeys(fabric.fabricIndex);
        this.#scheduleGroupRecheck(fabric.fabricIndex);
    };

    readonly #fabricDeleted = (fabric: Fabric) => {
        this.#groupKeyWatches.get(fabric.fabricIndex)?.();
        this.#groupKeyWatches.delete(fabric.fabricIndex);
    };

    get #node(): ServerNode {
        if (this.#cachedNode === undefined) {
            throw new InternalError("BindingManager.node accessed before node online");
        }
        return this.#cachedNode;
    }

    get #fabrics(): FabricManager {
        if (this.#cachedFabrics === undefined) {
            throw new InternalError("BindingManager.fabrics accessed before node online");
        }
        return this.#cachedFabrics;
    }

    #record(server: BindingServer): ServerRecord {
        const ep = server.endpoint;
        let rec = this.#serverMap.get(ep);
        if (rec === undefined) {
            rec = { server, pending: new Map(), established: new Map(), groups: new Map() };
            this.#serverMap.set(ep, rec);
        }
        return rec;
    }

    register(server: BindingServer, sourceEndpoint: Endpoint, entry: Binding.Target): void {
        const item = { server, endpoint: sourceEndpoint, entry };
        if (entry.group !== undefined && entry.node === undefined) {
            this.#record(server).groups.set(BindingManager.entryKey(entry), item);
        }
        if (!this.#flushed) {
            this.#queue.push(item);
            return;
        }
        this.#multiplex.add(this.#resolveAndEmit(item), "binding resolve");
    }

    async unregister(server: BindingServer, entry: Binding.Target): Promise<void> {
        const key = BindingManager.entryKey(entry);
        const groupRec = this.#serverMap.get(server.endpoint);
        if (groupRec?.groups.delete(key)) {
            this.#forgetIfEmpty(groupRec);
        }
        if (this.#clearPending(server, entry)) {
            return;
        }
        await this.#dropEstablished(server, key);
    }

    #forgetIfEmpty(rec: ServerRecord) {
        if (rec.established.size === 0 && rec.pending.size === 0 && rec.groups.size === 0) {
            this.#serverMap.delete(rec.server.endpoint);
        }
    }

    /** Removes an established entry and emits `removed` for it. */
    async #dropEstablished(server: BindingServer, key: string): Promise<void> {
        const rec = this.#serverMap.get(server.endpoint);
        if (rec === undefined) {
            return;
        }
        const established = rec.established.get(key);
        if (established === undefined) {
            return;
        }
        rec.established.delete(key);
        this.#forgetIfEmpty(rec);

        const { resolution, ref } = established;
        if (ref !== undefined) {
            const count = (this.#refcounts.get(ref) ?? 0) - 1;
            if (count <= 0) {
                this.#refcounts.delete(ref);
            } else {
                this.#refcounts.set(ref, count);
            }
        }

        logger.debug(
            "Binding removed",
            Diagnostic.dict({
                endpoint: rec.server.endpoint.number,
                kind: resolution.kind,
                entry: resolution.entry,
            }),
        );
        try {
            await rec.server.events.removed.emit(resolution);
        } catch (err) {
            logger.warn(
                "Binding removed handler failed",
                Diagnostic.dict({ endpoint: rec.server.endpoint.number, kind: resolution.kind }),
                Diagnostic.error(err),
            );
        }
    }

    async disposeServer(server: BindingServer): Promise<void> {
        const rec = this.#serverMap.get(server.endpoint);
        if (rec === undefined) return;
        const snapshot = [...rec.established.values()];
        this.#serverMap.delete(server.endpoint);
        for (const { cancel } of rec.pending.values()) {
            cancel();
        }
        rec.pending.clear();
        for (const { ref } of snapshot) {
            if (ref !== undefined) {
                const count = (this.#refcounts.get(ref) ?? 0) - 1;
                if (count <= 0) this.#refcounts.delete(ref);
                else this.#refcounts.set(ref, count);
            }
        }
        for (const { resolution } of snapshot) {
            logger.debug(
                "Binding removed",
                Diagnostic.dict({
                    endpoint: rec.server.endpoint.number,
                    kind: resolution.kind,
                    entry: resolution.entry,
                }),
            );
            try {
                await rec.server.events.removed.emit(resolution);
            } catch (err) {
                logger.error(
                    "Binding removed handler failed",
                    Diagnostic.dict({ endpoint: rec.server.endpoint.number, kind: resolution.kind }),
                    Diagnostic.error(err),
                );
            }
        }
    }

    async #flushQueue(): Promise<void> {
        this.#flushed = true;
        const items = [...this.#queue];
        this.#queue.length = 0;
        for (const item of items) {
            await this.#resolveAndEmit(item);
        }
    }

    async #resolveAndEmit(item: QueueItem): Promise<void> {
        const { server, endpoint: sourceEp, entry } = item;

        const hasNode = entry.node !== undefined;
        const hasGroup = entry.group !== undefined;
        if (hasNode === hasGroup) {
            logger.warn("Binding entry must have exactly one of node/group", Diagnostic.dict({ entry }));
            return;
        }

        let resolution: BindingResolution;

        const { clients: declaredClients, unbindable } = this.#selectClientClusters(sourceEp, entry.cluster);
        if (!declaredClients.length) {
            logger.warn(
                unbindable
                    ? "Binding entry matches only client clusters that choose their peer themselves, so a binding never directs them"
                    : "Binding source endpoint declares no matching client cluster",
                Diagnostic.dict({ entry, sourceEndpoint: sourceEp.number }),
            );
            return;
        }

        if (hasGroup) {
            if (!this.#fabrics.has(entry.fabricIndex)) {
                logger.warn("Group binding fabric unknown", Diagnostic.dict({ entry }));
                return;
            }
            if (!this.#isRegisteredGroup(item)) {
                return;
            }
            this.#watchGroupKeys(entry.fabricIndex);
            if (!this.#holdsGroupKey(entry)) {
                logger.info(
                    "Group binding waits for the fabric to hold a key for the group",
                    Diagnostic.dict({ group: entry.group, sourceEndpoint: sourceEp.number }),
                );
                return;
            }
            const group = await this.#resolveGroup(item, declaredClients);
            if (group === undefined) {
                return;
            }
            resolution = group;
        } else if (this.#isOurNode(entry.node!, entry.fabricIndex)) {
            if (entry.endpoint === undefined || !this.#node.endpoints.has(entry.endpoint)) {
                logger.warn("Self-binding to non-existent endpoint", Diagnostic.dict({ endpoint: entry.endpoint }));
                return;
            }
            const endpoint = this.#node.endpoints.for(entry.endpoint);
            if (entry.cluster !== undefined && !this.#endpointHasClusterServer(endpoint, entry.cluster)) {
                logger.warn(
                    "Self-binding references cluster not installed as server on target endpoint",
                    Diagnostic.dict({ entry }),
                );
                return;
            }
            resolution = { kind: "server", node: this.#node, endpoint, entry };
        } else {
            if (entry.endpoint === undefined) {
                logger.warn("Client binding entry missing endpoint", Diagnostic.dict({ entry }));
                return;
            }
            const addr = PeerAddress({ fabricIndex: entry.fabricIndex, nodeId: entry.node! });
            let peer: ClientNode;
            try {
                peer = await this.#node.peers.forAddress(addr);
            } catch (error) {
                logger.warn("Client binding peer registration failed", Diagnostic.dict({ entry }), error);
                return;
            }
            const endpoint = peer.endpoints.require(entry.endpoint);
            this.#installClientBehaviors(endpoint, declaredClients);
            resolution = { kind: "client", node: peer, endpoint, entry };
        }

        if (resolution.kind === "client") {
            this.#establishClientKind(server, resolution);
            return;
        }

        // Nothing awaits between this check and recording, so an unregister or a withdrawn key cannot slip in between
        if (resolution.kind === "group" && (!this.#isRegisteredGroup(item) || !this.#holdsGroupKey(entry))) {
            return;
        }
        this.#recordEstablished(server, resolution);
        const { server: canonicalServer } = this.#record(server);
        if (!this.#shouldEmitEstablished(canonicalServer, resolution)) {
            return;
        }
        logger.debug(
            "Binding established",
            Diagnostic.dict({
                endpoint: canonicalServer.endpoint.number,
                kind: resolution.kind,
                entry: resolution.entry,
            }),
        );
        try {
            await canonicalServer.events.established.emit(resolution);
        } catch (err) {
            logger.warn(
                "Binding established handler failed",
                Diagnostic.dict({ endpoint: sourceEp.number, kind: resolution.kind }),
                Diagnostic.error(err),
            );
        }
    }

    /** Resolves a group entry to its {@link ClientGroup}, or `undefined` where it cannot or no longer should. */
    async #resolveGroup(
        item: QueueItem,
        declaredClients: ClusterBehavior.Type[],
    ): Promise<(BindingResolution & { kind: "group" }) | undefined> {
        const { endpoint: sourceEp, entry } = item;
        const addr = PeerAddress({ fabricIndex: entry.fabricIndex, nodeId: NodeId.fromGroupId(entry.group!) });
        let group: ClientNode;
        try {
            group = await this.#node.peers.forAddress(addr);
        } catch (error) {
            logger.warn("Group binding peer registration failed", Diagnostic.dict({ entry }), error);
            return;
        }
        if (!(group instanceof ClientGroup)) {
            logger.warn("Group binding did not resolve to a ClientGroup", Diagnostic.dict({ entry }));
            return;
        }

        const endpoint = group.endpoints.require(sourceEp.number);
        this.#installClientBehaviors(endpoint, declaredClients);
        return { kind: "group", node: group, endpoint, entry };
    }

    /**
     * A group binding is usable once the fabric maps the group to a key set it holds; membership of the source endpoint
     * is not needed, because it governs receiving only.
     *
     * @see {@link MatterSpecification.v161.Core} § 4.16.2
     */
    #holdsGroupKey(entry: Binding.Target): boolean {
        const fabrics = this.#cachedFabrics;
        if (fabrics === undefined || !fabrics.has(entry.fabricIndex)) {
            return false;
        }
        const { groups } = fabrics.for(entry.fabricIndex);
        const keySetId = groups.groupKeyIdMap.get(entry.group!);
        return keySetId !== undefined && groups.keySets.forId(keySetId) !== undefined;
    }

    /** Watches a fabric's group key mapping and key sets once, for all group entries on that fabric. */
    #watchGroupKeys(fabricIndex: FabricIndex): void {
        if (this.#groupKeyWatches.has(fabricIndex) || !this.#fabrics.has(fabricIndex)) {
            return;
        }
        const { groupKeyIdMap, keySets } = this.#fabrics.for(fabricIndex).groups;
        const changed = () => this.#scheduleGroupRecheck(fabricIndex);
        groupKeyIdMap.added.on(changed);
        groupKeyIdMap.changed.on(changed);
        groupKeyIdMap.deleted.on(changed);
        keySets.added.on(changed);
        keySets.deleted.on(changed);
        this.#groupKeyWatches.set(fabricIndex, () => {
            groupKeyIdMap.added.off(changed);
            groupKeyIdMap.changed.off(changed);
            groupKeyIdMap.deleted.off(changed);
            keySets.added.off(changed);
            keySets.deleted.off(changed);
        });
    }

    #scheduleGroupRecheck(fabricIndex: FabricIndex): void {
        // The group key map emits before it applies a change, and rewriting a key set removes it before adding it again,
        // so the check runs once the change is complete
        this.#multiplex.add(
            Promise.resolve().then(() => this.#recheckGroups(fabricIndex)),
            "group binding key change",
        );
    }

    /**
     * Resolves registered group entries whose group now has a key. An established entry stays until it is unregistered:
     * after its key is gone, a send through it fails with a `NoUsableGroupKeyError`.
     */
    #recheckGroups(fabricIndex: FabricIndex): void {
        if (this.#cachedNode === undefined) {
            return;
        }
        for (const rec of this.#serverMap.values()) {
            for (const [key, item] of rec.groups) {
                if (
                    item.entry.fabricIndex === fabricIndex &&
                    !rec.established.has(key) &&
                    this.#holdsGroupKey(item.entry)
                ) {
                    this.#multiplex.add(this.#resolveAndEmit(item), "group binding resolve");
                }
            }
        }
    }

    /** Whether `item` is the registered group entry of its server, which is not yet established. */
    #isRegisteredGroup(item: QueueItem): boolean {
        const rec = this.#serverMap.get(item.server.endpoint);
        const key = BindingManager.entryKey(item.entry);
        return rec?.groups.get(key) === item && !rec.established.has(key);
    }

    #endpointHasClusterServer(endpoint: Endpoint, clusterId: number): boolean {
        return Object.values(endpoint.behaviors.supported).some(
            b => ClusterBehavior.is(b) && !isClientBehavior(b) && b.cluster.id === clusterId,
        );
    }

    /**
     * The client behaviors of {@link sourceEp} a binding entry installs on its target: those of the cluster
     * {@link filterCluster} names, or all without a filter, except those whose cluster model is not
     * `effectiveBindable`.
     *
     * @returns the selected clients, and whether a client the entry matches is left out as not bindable
     */
    #selectClientClusters(sourceEp: Endpoint, filterCluster: number | undefined) {
        const clients = new Array<ClusterBehavior.Type>();
        let unbindable = false;
        for (const client of ClusterBehavior.typesOf(Object.values(sourceEp.type.clientClusters))) {
            if (filterCluster !== undefined && client.cluster.id !== filterCluster) {
                continue;
            }
            if (client.schema.effectiveBindable) {
                clients.push(client);
            } else {
                unbindable = true;
            }
        }
        return { clients, unbindable };
    }

    #installClientBehaviors(endpoint: Endpoint, clients: ClusterBehavior.Type[]): void {
        for (const client of clients) {
            endpoint.behaviors.require(client);
        }
    }

    #establishClientKind(server: BindingServer, resolution: BindingResolution & { kind: "client" }): void {
        this.#multiplex.add(resolution.node.start(), `start peer ${resolution.node}`);

        try {
            const peerAddress = resolution.node.peerAddress;
            if (peerAddress !== undefined) {
                logger.info(
                    "Initiating CASE session for bound peer",
                    Diagnostic.dict({
                        peer: this.#peerKey(peerAddress),
                        sourceEndpoint: server.endpoint.number,
                        entry: resolution.entry,
                    }),
                );
                const peer = this.#node.env.get(PeerSet).for(peerAddress);
                this.#multiplex.add(peer.connect(), `CASE connect for ${this.#peerKey(peerAddress)}`);
            }
        } catch (err) {
            logger.warn("PeerSet lookup failed", Diagnostic.error(err));
        }

        const observable = resolution.node.lifecycle.online;
        const rec = this.#record(server);
        const handler = async () => {
            this.#clearPending(server, resolution.entry);
            this.#recordEstablished(server, resolution);
            if (!this.#shouldEmitEstablished(rec.server, resolution)) {
                return;
            }
            logger.debug(
                "Binding established",
                Diagnostic.dict({
                    endpoint: rec.server.endpoint.number,
                    kind: resolution.kind,
                    entry: resolution.entry,
                }),
            );
            try {
                await rec.server.events.established.emit(resolution);
            } catch (err) {
                logger.error(
                    "Binding established handler failed",
                    Diagnostic.dict({ endpoint: server.endpoint.number, kind: resolution.kind }),
                    Diagnostic.error(err),
                );
            }
        };

        // lifecycle.online is edge-triggered.  If the peer is already online (e.g. an earlier
        // binding entry brought it online), fire the handler directly via the multiplex so this
        // entry resolves promptly.  Otherwise wait for the next transition.
        if (resolution.node.lifecycle.isOnline) {
            this.#multiplex.add(handler(), "binding established (online)");
            return;
        }
        observable.once(handler);

        const cancel = () => observable.off(handler);
        const key = BindingManager.entryKey(resolution.entry);
        rec.pending.get(key)?.cancel();
        rec.pending.set(key, { cancel });
    }

    /** Returns true when emission should proceed.  Warns and returns false when no subscriber is attached. */
    #shouldEmitEstablished(server: BindingServer, resolution: BindingResolution): boolean {
        if (server.endpoint.eventsOf(BindingServer).established.isObserved) {
            return true;
        }
        if (Object.keys(server.endpoint.type.clientClusters).length > 0) {
            logger.warn(
                "Binding established on endpoint with declared client clusters but no subscriber attached",
                Diagnostic.dict({ endpoint: server.endpoint.number, kind: resolution.kind }),
            );
        }
        return false;
    }

    #clearPending(server: BindingServer, entry: Binding.Target): boolean {
        const rec = this.#serverMap.get(server.endpoint);
        if (rec === undefined) {
            return false;
        }
        const key = BindingManager.entryKey(entry);
        const pending = rec.pending.get(key);
        if (pending === undefined) {
            return false;
        }
        pending.cancel();
        rec.pending.delete(key);
        this.#forgetIfEmpty(rec);
        return true;
    }

    #isOurNode(nodeId: NodeId, fabricIndex: FabricIndex): boolean {
        if (!this.#fabrics.has(fabricIndex)) {
            return false;
        }
        return this.#fabrics.for(fabricIndex).nodeId === nodeId;
    }

    #peerKey(addr: PeerAddress): string {
        return `p:${addr.fabricIndex}:${addr.nodeId}`;
    }

    #refKey(resolution: BindingResolution): string | undefined {
        switch (resolution.kind) {
            case "client":
            case "group": {
                const addr = resolution.node.peerAddress;
                return addr !== undefined ? this.#peerKey(addr) : undefined;
            }
            case "server":
                return undefined;
        }
    }

    #recordEstablished(server: BindingServer, resolution: BindingResolution): void {
        const ref = this.#refKey(resolution);
        const key = BindingManager.entryKey(resolution.entry);
        const rec = this.#record(server);
        rec.established.set(key, { resolution, ref });

        if (ref !== undefined) {
            this.#refcounts.set(ref, (this.#refcounts.get(ref) ?? 0) + 1);
        }
    }

    async close(): Promise<void> {
        this.#flushed = true;
        this.#queue.length = 0;
        for (const rec of this.#serverMap.values()) {
            for (const { cancel } of rec.pending.values()) {
                cancel();
            }
            rec.pending.clear();
            rec.groups.clear();
        }
        for (const release of this.#groupKeyWatches.values()) {
            release();
        }
        this.#groupKeyWatches.clear();
        this.#cachedFabrics?.events.replaced.off(this.#fabricReplaced);
        this.#cachedFabrics?.events.deleted.off(this.#fabricDeleted);
        await this.#multiplex.close();
        this.#serverMap.clear();
        this.#refcounts.clear();
        this.#cachedNode = undefined;
        this.#cachedFabrics = undefined;
        this.#env.delete(BindingManager, this);
    }

    static [Environmental.create](env: Environment) {
        const instance = new BindingManager(env);
        env.set(BindingManager, instance);
        return instance;
    }
}

export namespace BindingManager {
    /** Stable string key for a {@link Binding.Target} — shared by BindingServer and BindingManager maps. */
    export function entryKey(entry: Binding.Target): string {
        return [entry.fabricIndex, entry.node ?? "", entry.group ?? "", entry.endpoint ?? "", entry.cluster ?? ""].join(
            "/",
        );
    }
}
