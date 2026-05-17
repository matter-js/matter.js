/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { ClusterBehavior } from "#behavior/cluster/ClusterBehavior.js";
import type { ActionContext } from "#behavior/context/ActionContext.js";
import { Endpoint } from "#endpoint/Endpoint.js";
import { ClientGroup } from "#node/ClientGroup.js";
import { ClientNode } from "#node/ClientNode.js";
import { Node } from "#node/Node.js";
import { ServerNode } from "#node/ServerNode.js";
import { BasicMultiplex, Diagnostic, Environment, Environmental, InternalError, Logger } from "@matter/general";
import { FabricManager, PeerAddress, PeerSet } from "@matter/protocol";
import { FabricIndex, NodeId } from "@matter/types";
import { Binding } from "@matter/types/clusters/binding";
import type { BindingServer } from "./BindingServer.js";

const logger = Logger.get("BindingManager");

type QueueItem = { server: BindingServer; endpoint: Endpoint; entry: Binding.Target };

/** Stable string key for a {@link Binding.Target} — shared by BindingServer cache and BindingManager maps. */
export function bindingEntryKey(entry: Binding.Target): string {
    return [entry.fabricIndex, entry.node ?? "", entry.group ?? "", entry.endpoint ?? "", entry.cluster ?? ""].join(
        "/",
    );
}

export type BindingResolution =
    | { kind: "client"; node: ClientNode; endpoint: Endpoint; entry: Binding.Target }
    | { kind: "group"; node: ClientGroup; endpoint: Endpoint; entry: Binding.Target }
    | { kind: "server"; node: Node; endpoint: Endpoint; entry: Binding.Target };

type PendingEntry = { cancel: () => void };

type EstablishedEntry = { resolution: BindingResolution; ref: string | undefined };

/**
 * Node-scoped service that manages the lifecycle of Matter binding connections.
 */
export class BindingManager {
    readonly #env: Environment;
    #cachedNode: ServerNode | undefined;
    #cachedFabrics: FabricManager | undefined;
    readonly #queue = new Array<QueueItem>();
    readonly #pending = new Map<BindingServer, Map<string, PendingEntry>>();
    readonly #refcounts = new Map<string, number>();
    readonly #established = new Map<BindingServer, Map<string, EstablishedEntry>>();
    readonly #multiplex = new BasicMultiplex();
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
        this.#cachedFabrics = this.#env.get(FabricManager);
    }

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

    register(server: BindingServer, sourceEndpoint: Endpoint, entry: Binding.Target): void {
        if (!this.#flushed) {
            this.#queue.push({ server, endpoint: sourceEndpoint, entry });
            return;
        }
        this.#multiplex.add(this.#resolveAndEmit({ server, endpoint: sourceEndpoint, entry }), "binding resolve");
    }

    unregister(server: BindingServer, _sourceEndpoint: Endpoint, entry: Binding.Target): void {
        if (this.#clearPending(server, entry)) {
            return;
        }

        const perServer = this.#established.get(server);
        if (perServer === undefined) {
            return;
        }
        const key = this.#entryKey(entry);
        const established = perServer.get(key);
        if (established === undefined) {
            return;
        }
        perServer.delete(key);
        if (perServer.size === 0) {
            this.#established.delete(server);
        }

        const { resolution, ref } = established;
        if (ref !== undefined) {
            const count = (this.#refcounts.get(ref) ?? 0) - 1;
            if (count <= 0) {
                this.#refcounts.delete(ref);
            } else {
                this.#refcounts.set(ref, count);
            }
        }

        this.#multiplex.add(server.emitRemoved(resolution), "binding removed");
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

        // Verify source endpoint declares at least one matching client cluster.
        const declaredClients = this.#selectClientClusters(sourceEp, entry.cluster);
        if (declaredClients === undefined) {
            logger.warn(
                "Binding source endpoint declares no matching client cluster",
                Diagnostic.dict({ entry, sourceEndpoint: sourceEp.number }),
            );
            return;
        }

        if (hasGroup) {
            if (!this.#fabrics.has(entry.fabricIndex)) {
                logger.warn("Group binding fabric unknown", Diagnostic.dict({ entry }));
                return;
            }
            const fabric = this.#fabrics.for(entry.fabricIndex);
            const memberEndpoints = fabric.groups.endpoints.get(entry.group!) ?? [];
            if (!memberEndpoints.includes(sourceEp.number)) {
                logger.warn(
                    "Group binding source endpoint is not a member of the bound group",
                    Diagnostic.dict({ entry, sourceEndpoint: sourceEp.number }),
                );
                return;
            }
            const addr = PeerAddress({
                fabricIndex: entry.fabricIndex,
                nodeId: NodeId.fromGroupId(entry.group!),
            });
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
            resolution = { kind: "group", node: group, endpoint, entry };
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

        this.#recordEstablished(server, resolution);
        await server.emitEstablished(resolution);
    }

    #endpointHasClusterServer(endpoint: Endpoint, clusterId: number): boolean {
        const behaviors = endpoint.type.behaviors;
        if (behaviors === undefined) {
            return false;
        }
        return Object.values(behaviors).some(b => ClusterBehavior.is(b) && b.cluster.id === clusterId);
    }

    #selectClientClusters(sourceEp: Endpoint, filterCluster: number | undefined): ClusterBehavior.Type[] | undefined {
        const declared = sourceEp.type.clientClusters;
        if (declared === undefined) {
            return undefined;
        }
        const clients = Object.values(declared).filter(b => ClusterBehavior.is(b)) as ClusterBehavior.Type[];
        if (clients.length === 0) {
            return undefined;
        }
        const selected = filterCluster === undefined ? clients : clients.filter(c => c.cluster.id === filterCluster);
        if (selected.length === 0) {
            return undefined;
        }
        return selected;
    }

    #installClientBehaviors(endpoint: Endpoint, clients: ClusterBehavior.Type[]): void {
        for (const client of clients) {
            endpoint.behaviors.require(client);
        }
    }

    #entryKey(entry: Binding.Target): string {
        return bindingEntryKey(entry);
    }

    #establishClientKind(server: BindingServer, resolution: BindingResolution & { kind: "client" }): void {
        this.#multiplex.add(resolution.node.start(), `start peer ${resolution.node}`);

        try {
            const peerAddress = resolution.node.peerAddress;
            if (peerAddress !== undefined) {
                const peer = this.#node.env.get(PeerSet).for(peerAddress);
                this.#multiplex.add(peer.connect(), `CASE connect for ${this.#peerKey(peerAddress)}`);
            }
        } catch (err) {
            logger.warn("PeerSet lookup failed", Diagnostic.error(err));
        }

        const observable = resolution.node.lifecycle.online;
        const handler = async (_ctx: ActionContext) => {
            this.#clearPending(server, resolution.entry);
            this.#recordEstablished(server, resolution);
            await server.emitEstablished(resolution);
        };
        observable.once(handler);

        const cancel = () => observable.off(handler);
        const key = this.#entryKey(resolution.entry);
        const perServer = this.#pending.get(server) ?? new Map<string, PendingEntry>();
        perServer.get(key)?.cancel();
        perServer.set(key, { cancel });
        this.#pending.set(server, perServer);
    }

    #clearPending(server: BindingServer, entry: Binding.Target): boolean {
        const perServer = this.#pending.get(server);
        if (perServer === undefined) {
            return false;
        }
        const key = this.#entryKey(entry);
        const pending = perServer.get(key);
        if (pending === undefined) {
            return false;
        }
        pending.cancel();
        perServer.delete(key);
        if (perServer.size === 0) {
            this.#pending.delete(server);
        }
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
        const key = this.#entryKey(resolution.entry);
        const perServer = this.#established.get(server) ?? new Map<string, EstablishedEntry>();
        perServer.set(key, { resolution, ref });
        this.#established.set(server, perServer);

        if (ref !== undefined) {
            this.#refcounts.set(ref, (this.#refcounts.get(ref) ?? 0) + 1);
        }
    }

    async close(): Promise<void> {
        this.#flushed = true;
        this.#queue.length = 0;
        for (const perServer of this.#pending.values()) {
            for (const { cancel } of perServer.values()) {
                cancel();
            }
        }
        this.#pending.clear();
        await this.#multiplex.close();
        this.#established.clear();
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
