/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { AsyncObservable } from "@matter/general";
import { FabricManager, TestFabric } from "@matter/protocol";
import { ClusterId, EndpointNumber, FabricIndex, GroupId, NodeId } from "@matter/types";
import { Binding } from "@matter/types/clusters/binding";
import { LocalActorContext } from "../../../src/behavior/context/server/LocalActorContext.js";
import { BindingManager, BindingResolution } from "../../../src/behaviors/binding/BindingManager.js";
import type { BindingServer } from "../../../src/behaviors/binding/BindingServer.js";
import { OnOffClient } from "../../../src/behaviors/on-off/OnOffClient.js";
import { OnOffServer } from "../../../src/behaviors/on-off/OnOffServer.js";
import { OnOffLightSwitchDevice } from "../../../src/devices/on-off-light-switch.js";
import { ClientGroup } from "../../../src/node/ClientGroup.js";
import { ClientNode } from "../../../src/node/ClientNode.js";
import { MockServerNode } from "../../node/mock-server-node.js";

interface FakeEvents {
    established: AsyncObservable<[BindingResolution]> & { emitted: BindingResolution[] };
    removed: AsyncObservable<[BindingResolution]> & { removed: BindingResolution[] };
}

function makeFakeBindingServer(): BindingServer {
    const establishedObs = AsyncObservable<[BindingResolution]>() as AsyncObservable<[BindingResolution]> & {
        emitted: BindingResolution[];
    };
    establishedObs.emitted = new Array<BindingResolution>();
    establishedObs.on(r => void establishedObs.emitted.push(r));

    const removedObs = AsyncObservable<[BindingResolution]>() as AsyncObservable<[BindingResolution]> & {
        removed: BindingResolution[];
    };
    removedObs.removed = new Array<BindingResolution>();
    removedObs.on(r => void removedObs.removed.push(r));

    const fake = {
        events: { established: establishedObs, removed: removedObs } as unknown as FakeEvents,
        // Provide a minimal endpoint stub so #warnNoSubscriber doesn't throw.
        endpoint: {
            number: 0,
            eventsOf: (_: unknown) => ({ established: { isObserved: true } }),
            type: { clientClusters: {} },
        },
    };
    return fake as unknown as BindingServer;
}

function fakeEmitted(server: BindingServer): Array<BindingResolution> {
    return ((server as unknown as { events: FakeEvents }).events.established as { emitted: BindingResolution[] })
        .emitted;
}

function fakeRemoved(server: BindingServer): Array<BindingResolution> {
    return ((server as unknown as { events: FakeEvents }).events.removed as { removed: BindingResolution[] }).removed;
}

function makeSelfBindingEntry(endpointNum: EndpointNumber, nodeId: NodeId): Binding.Target {
    return new Binding.Target({
        node: nodeId,
        endpoint: endpointNum,
        cluster: undefined,
        group: undefined,
        fabricIndex: FabricIndex(1),
    });
}

describe("BindingManager", () => {
    it("lazy-installs into node.env on first get", async () => {
        const node = await MockServerNode.createOnline(undefined, { device: OnOffLightSwitchDevice });
        const manager = node.env.get(BindingManager);
        expect(manager).instanceof(BindingManager);
        expect(node.env.get(BindingManager)).equals(manager);
        await node.close();
    });

    it("queues register calls before node online; flushes after online", async () => {
        const node = await MockServerNode.createOnline(undefined, { online: false, device: OnOffLightSwitchDevice });

        // Install a fabric so the manager can resolve our nodeId against FabricManager.
        const fabricManager = node.env.get(FabricManager);
        const fabric = await TestFabric({ fabrics: fabricManager });
        const ourNodeId = fabric.nodeId;

        const manager = node.env.get(BindingManager);
        const server = makeFakeBindingServer();

        // endpoint 1 is the OnOffLightDevice added by createOnline.
        const endpoint = node.parts.get(1)!;
        const entry = makeSelfBindingEntry(endpoint.number, ourNodeId);

        manager.register(server, endpoint, entry);
        expect(fakeEmitted(server)).deep.equals([]); // nothing emitted before online

        await node.start();
        await Promise.resolve(); // online observable microtask
        await Promise.resolve(); // #flushQueue + #resolveAndEmit settle

        const emitted = fakeEmitted(server);
        expect(emitted).has.length(1);
        expect(emitted[0].kind).equals("server");

        await node.close();
    });

    it("resolves kind=server for self-binding (entry.node === ourNodeId)", async () => {
        const node = await MockServerNode.createOnline(undefined, { device: OnOffLightSwitchDevice });

        const fabric = await node.addFabric();
        const ourNodeId = fabric.nodeId;

        const manager = node.env.get(BindingManager);
        const server = makeFakeBindingServer();

        // endpoint 1 is the OnOffLightDevice added by createOnline.
        const sourceEp = node.parts.get(1)!;
        const entry = new Binding.Target({
            node: ourNodeId,
            endpoint: sourceEp.number,
            cluster: undefined,
            group: undefined,
            fabricIndex: fabric.fabricIndex,
        });

        manager.register(server, sourceEp, entry);
        await Promise.resolve();
        await Promise.resolve();

        const emitted = fakeEmitted(server) as Array<BindingResolution>;
        expect(emitted).has.length(1);
        expect(emitted[0].kind).equals("server");
        expect((emitted[0] as BindingResolution & { kind: "server" }).node).equals(node);
        expect((emitted[0] as BindingResolution & { kind: "server" }).endpoint).equals(sourceEp);

        await node.close();
    });

    it("resolves kind=client for remote nodeId — no emission until peer lifecycle.online fires", async () => {
        const node = await MockServerNode.createOnline(undefined, { device: OnOffLightSwitchDevice });

        const fabric = await node.addFabric();
        // A nodeId on our fabric but different from our own node — a remote peer.
        const remoteNodeId = NodeId(BigInt(fabric.nodeId) + 1n);

        const manager = node.env.get(BindingManager);
        const server = makeFakeBindingServer();

        const sourceEp = node.parts.get(1)!;
        const entry = new Binding.Target({
            node: remoteNodeId,
            endpoint: EndpointNumber(1),
            cluster: undefined,
            group: undefined,
            fabricIndex: fabric.fabricIndex,
        });

        // register() calls #resolveAndEmit as fire-and-forget.
        manager.register(server, sourceEp, entry);

        // Allow the async chain to start but client kind returns early before emitting.
        await Promise.resolve();
        await Promise.resolve();

        // Peer not yet online — subscription is pending, nothing emitted.
        expect(fakeEmitted(server)).deep.equals([]);

        await node.close();
    });

    it("client kind: emits established only after peer lifecycle.online fires", async () => {
        const node = await MockServerNode.createOnline(undefined, { device: OnOffLightSwitchDevice });
        const fabric = await node.addFabric();
        const remoteNodeId = NodeId(BigInt(fabric.nodeId) + 1n);

        const manager = node.env.get(BindingManager);
        const server = makeFakeBindingServer();

        const sourceEp = node.parts.get(1)!;
        const entry = new Binding.Target({
            node: remoteNodeId,
            endpoint: EndpointNumber(1),
            cluster: undefined,
            group: undefined,
            fabricIndex: fabric.fabricIndex,
        });

        // Pre-create the peer and add endpoint so the binding reaches #trackPending.
        const peerAddress = { fabricIndex: fabric.fabricIndex, nodeId: remoteNodeId };
        await node.peers.forAddress(peerAddress);
        const peer = node.peers.get(peerAddress) as ClientNode;
        expect(peer).instanceof(ClientNode);
        peer.endpoints.require(1);

        manager.register(server, sourceEp, entry);
        await Promise.resolve();
        await Promise.resolve();

        // Peer not yet online — subscription is pending, nothing emitted.
        expect(fakeEmitted(server)).deep.equals([]);

        // Simulate peer coming online.
        await peer.lifecycle.online.emit(LocalActorContext.ReadOnly);

        const emitted = fakeEmitted(server) as Array<BindingResolution>;
        expect(emitted).has.length(1);
        expect(emitted[0].kind).equals("client");
        expect((emitted[0] as BindingResolution & { kind: "client" }).node).equals(peer);

        await node.close();
    });

    it("client kind: unregister while pending cancels subscription (no event)", async () => {
        const node = await MockServerNode.createOnline(undefined, { device: OnOffLightSwitchDevice });
        const fabric = await node.addFabric();
        const remoteNodeId = NodeId(BigInt(fabric.nodeId) + 1n);

        const manager = node.env.get(BindingManager);
        const server = makeFakeBindingServer();

        const sourceEp = node.parts.get(1)!;
        const entry = new Binding.Target({
            node: remoteNodeId,
            endpoint: EndpointNumber(1),
            cluster: undefined,
            group: undefined,
            fabricIndex: fabric.fabricIndex,
        });

        // Pre-create the peer and add endpoint so #trackPending is reached.
        const peerAddress = { fabricIndex: fabric.fabricIndex, nodeId: remoteNodeId };
        await node.peers.forAddress(peerAddress);
        const peer = node.peers.get(peerAddress) as ClientNode;
        peer.endpoints.require(1);

        manager.register(server, sourceEp, entry);
        await Promise.resolve();
        await Promise.resolve();

        // Subscription is now pending — cancel it.
        await manager.unregister(server, entry);

        // Simulate peer coming online.
        await peer.lifecycle.online.emit(LocalActorContext.ReadOnly);

        // Subscription was cancelled — no event.
        expect(fakeEmitted(server)).deep.equals([]);

        await node.close();
    });

    it("resolves kind=group for groupId set", async () => {
        const node = await MockServerNode.createOnline(undefined, { device: OnOffLightSwitchDevice });
        const fabric = await node.addFabric();

        const manager = node.env.get(BindingManager);
        const server = makeFakeBindingServer();

        const sourceEp = node.parts.get(1)!;
        const entry = new Binding.Target({
            node: undefined,
            endpoint: undefined,
            cluster: undefined,
            group: GroupId(7),
            fabricIndex: fabric.fabricIndex,
        });

        // Source endpoint must be a member of the bound group on the fabric.
        fabric.groups.endpoints.set(GroupId(7), [sourceEp.number]);

        // Pre-warm the group ClientGroup so manager.register's forAddress hits the cache.
        await node.peers.forAddress({
            fabricIndex: fabric.fabricIndex,
            nodeId: NodeId.fromGroupId(GroupId(7)),
        });

        manager.register(server, sourceEp, entry);
        await Promise.resolve();
        await Promise.resolve();

        const emitted = fakeEmitted(server) as Array<BindingResolution>;
        expect(emitted).has.length(1);
        expect(emitted[0].kind).equals("group");
        expect((emitted[0] as BindingResolution & { kind: "group" }).node).instanceof(ClientGroup);

        await node.close();
    });

    it("group kind: two registrations against the same groupId share the same ClientGroup", async () => {
        const node = await MockServerNode.createOnline(undefined, { device: OnOffLightSwitchDevice });
        const fabric = await node.addFabric();
        const manager = node.env.get(BindingManager);
        const s1 = makeFakeBindingServer();
        const s2 = makeFakeBindingServer();
        const sourceEp = node.parts.get(1)!;
        const entry = new Binding.Target({
            node: undefined,
            endpoint: undefined,
            cluster: undefined,
            group: GroupId(7),
            fabricIndex: fabric.fabricIndex,
        });

        fabric.groups.endpoints.set(GroupId(7), [sourceEp.number]);

        await node.peers.forAddress({
            fabricIndex: fabric.fabricIndex,
            nodeId: NodeId.fromGroupId(GroupId(7)),
        });

        manager.register(s1, sourceEp, entry);
        manager.register(s2, sourceEp, entry);
        await Promise.resolve();
        await Promise.resolve();

        const e1 = fakeEmitted(s1) as Array<BindingResolution>;
        const e2 = fakeEmitted(s2) as Array<BindingResolution>;
        expect(e1).has.length(1);
        expect(e2).has.length(1);
        expect((e1[0] as BindingResolution & { kind: "group" }).node).equals(
            (e2[0] as BindingResolution & { kind: "group" }).node,
        );

        await node.close();
    });

    it("unregister after established fires removed (group kind)", async () => {
        const node = await MockServerNode.createOnline(undefined, { device: OnOffLightSwitchDevice });
        const fabric = await node.addFabric();
        const manager = node.env.get(BindingManager);
        const server = makeFakeBindingServer();
        const sourceEp = node.parts.get(1)!;
        const entry = new Binding.Target({
            node: undefined,
            endpoint: undefined,
            cluster: undefined,
            group: GroupId(8),
            fabricIndex: fabric.fabricIndex,
        });

        fabric.groups.endpoints.set(GroupId(8), [sourceEp.number]);

        await node.peers.forAddress({
            fabricIndex: fabric.fabricIndex,
            nodeId: NodeId.fromGroupId(GroupId(8)),
        });

        manager.register(server, sourceEp, entry);
        for (let i = 0; i < 10 && fakeEmitted(server).length === 0; i++) {
            await Promise.resolve();
        }
        expect(fakeEmitted(server)).has.length(1);

        const removedEvents = fakeRemoved(server);
        await manager.unregister(server, entry);
        for (let i = 0; i < 10 && removedEvents.length === 0; i++) {
            await Promise.resolve();
        }
        expect(removedEvents).has.length(1);

        await node.close();
    });

    it("close clears queue, pending subscriptions, and maps without emitting", async () => {
        const node = await MockServerNode.createOnline(undefined, { device: OnOffLightSwitchDevice });
        const fabric = await node.addFabric();
        const manager = node.env.get(BindingManager);
        const server = makeFakeBindingServer();
        const sourceEp = node.parts.get(1)!;
        const entry = new Binding.Target({
            node: undefined,
            endpoint: undefined,
            cluster: undefined,
            group: GroupId(9),
            fabricIndex: fabric.fabricIndex,
        });

        fabric.groups.endpoints.set(GroupId(9), [sourceEp.number]);

        await node.peers.forAddress({
            fabricIndex: fabric.fabricIndex,
            nodeId: NodeId.fromGroupId(GroupId(9)),
        });

        manager.register(server, sourceEp, entry);
        for (let i = 0; i < 10 && fakeEmitted(server).length === 0; i++) {
            await Promise.resolve();
        }
        expect(fakeEmitted(server)).has.length(1);

        const removedBefore = fakeRemoved(server).length;
        await manager.close();
        expect(fakeRemoved(server).length).equals(removedBefore);

        await node.close();
    });

    it("rejects entry with both node and group set", async () => {
        const node = await MockServerNode.createOnline(undefined, { device: OnOffLightSwitchDevice });
        const fabric = await node.addFabric();
        const manager = node.env.get(BindingManager);
        const server = makeFakeBindingServer();
        const sourceEp = node.parts.get(1)!;
        const entry = new Binding.Target({
            node: fabric.nodeId,
            endpoint: sourceEp.number,
            cluster: undefined,
            group: GroupId(7),
            fabricIndex: fabric.fabricIndex,
        });

        manager.register(server, sourceEp, entry);
        await Promise.resolve();
        await Promise.resolve();
        expect(fakeEmitted(server)).deep.equals([]);

        await node.close();
    });

    it("rejects entry with neither node nor group set", async () => {
        const node = await MockServerNode.createOnline(undefined, { device: OnOffLightSwitchDevice });
        const fabric = await node.addFabric();
        const manager = node.env.get(BindingManager);
        const server = makeFakeBindingServer();
        const sourceEp = node.parts.get(1)!;
        const entry = new Binding.Target({
            node: undefined,
            endpoint: sourceEp.number,
            cluster: undefined,
            group: undefined,
            fabricIndex: fabric.fabricIndex,
        });

        manager.register(server, sourceEp, entry);
        await Promise.resolve();
        await Promise.resolve();
        expect(fakeEmitted(server)).deep.equals([]);

        await node.close();
    });

    it("rejects entry whose cluster filter is not in source's declared clientClusters", async () => {
        const node = await MockServerNode.createOnline(undefined, { device: OnOffLightSwitchDevice });
        const fabric = await node.addFabric();
        const manager = node.env.get(BindingManager);
        const server = makeFakeBindingServer();
        const sourceEp = node.parts.get(1)!;
        const entry = new Binding.Target({
            node: fabric.nodeId,
            endpoint: sourceEp.number,
            cluster: ClusterId(0x1234), // not declared as client on OnOffLightSwitch
            group: undefined,
            fabricIndex: fabric.fabricIndex,
        });

        manager.register(server, sourceEp, entry);
        await Promise.resolve();
        await Promise.resolve();
        expect(fakeEmitted(server)).deep.equals([]);

        await node.close();
    });

    it("kind=server rejects when target endpoint lacks the cluster server", async () => {
        const node = await MockServerNode.createOnline(undefined, { device: OnOffLightSwitchDevice });
        const fabric = await node.addFabric();
        const manager = node.env.get(BindingManager);
        const server = makeFakeBindingServer();
        const sourceEp = node.parts.get(1)!;
        // OnOffLightSwitch endpoint 1 declares OnOffClient (so combi check passes),
        // but does NOT install OnOffServer — the target lookup must warn-and-skip.
        const entry = new Binding.Target({
            node: fabric.nodeId,
            endpoint: sourceEp.number,
            cluster: ClusterId(OnOffServer.cluster.id),
            group: undefined,
            fabricIndex: fabric.fabricIndex,
        });

        manager.register(server, sourceEp, entry);
        await Promise.resolve();
        await Promise.resolve();
        expect(fakeEmitted(server)).deep.equals([]);

        await node.close();
    });

    it("kind=server accepts a cluster server added to the endpoint at runtime via behaviors.require", async () => {
        const node = await MockServerNode.createOnline(undefined, { device: OnOffLightSwitchDevice });
        const fabric = await node.addFabric();
        const manager = node.env.get(BindingManager);
        const server = makeFakeBindingServer();
        const sourceEp = node.parts.get(1)!;

        // OnOffServer is not part of OnOffLightSwitchDevice's type — install it dynamically. This lands in
        // endpoint.behaviors.supported but never in endpoint.type.behaviors, so the resolver must consult the former.
        sourceEp.behaviors.require(OnOffServer);

        const entry = new Binding.Target({
            node: fabric.nodeId,
            endpoint: sourceEp.number,
            cluster: ClusterId(OnOffServer.cluster.id),
            group: undefined,
            fabricIndex: fabric.fabricIndex,
        });

        manager.register(server, sourceEp, entry);
        await Promise.resolve();
        await Promise.resolve();

        const emitted = fakeEmitted(server) as Array<BindingResolution>;
        expect(emitted).has.length(1);
        expect(emitted[0].kind).equals("server");
        expect((emitted[0] as BindingResolution & { kind: "server" }).endpoint).equals(sourceEp);

        await node.close();
    });

    it("kind=server rejects when the endpoint only has the cluster as a client, not a server", async () => {
        const node = await MockServerNode.createOnline(undefined, { device: OnOffLightSwitchDevice });
        const fabric = await node.addFabric();
        const manager = node.env.get(BindingManager);
        const server = makeFakeBindingServer();
        const sourceEp = node.parts.get(1)!;

        // A client behavior shares the cluster id of its server counterpart, but a self-binding target must serve the
        // cluster. behaviors.supported holds both client and server behaviors, so the server check must exclude clients.
        sourceEp.behaviors.require(OnOffClient);

        const entry = new Binding.Target({
            node: fabric.nodeId,
            endpoint: sourceEp.number,
            cluster: ClusterId(OnOffServer.cluster.id),
            group: undefined,
            fabricIndex: fabric.fabricIndex,
        });

        manager.register(server, sourceEp, entry);
        await Promise.resolve();
        await Promise.resolve();
        expect(fakeEmitted(server)).deep.equals([]);

        await node.close();
    });

    it("kind=group rejects when source endpoint is not a group member", async () => {
        const node = await MockServerNode.createOnline(undefined, { device: OnOffLightSwitchDevice });
        const fabric = await node.addFabric();
        const manager = node.env.get(BindingManager);
        const server = makeFakeBindingServer();
        const sourceEp = node.parts.get(1)!;
        const entry = new Binding.Target({
            node: undefined,
            endpoint: undefined,
            cluster: undefined,
            group: GroupId(42),
            fabricIndex: fabric.fabricIndex,
        });

        // Deliberately do NOT register sourceEp as member of group 42.

        manager.register(server, sourceEp, entry);
        await Promise.resolve();
        await Promise.resolve();
        expect(fakeEmitted(server)).deep.equals([]);

        await node.close();
    });

    it("kind=client installs declared client behaviors on the materialized endpoint", async () => {
        const node = await MockServerNode.createOnline(undefined, { device: OnOffLightSwitchDevice });
        const fabric = await node.addFabric();
        const remoteNodeId = NodeId(BigInt(fabric.nodeId) + 1n);
        const manager = node.env.get(BindingManager);
        const server = makeFakeBindingServer();
        const sourceEp = node.parts.get(1)!;
        const entry = new Binding.Target({
            node: remoteNodeId,
            endpoint: EndpointNumber(1),
            cluster: undefined,
            group: undefined,
            fabricIndex: fabric.fabricIndex,
        });

        const peerAddress = { fabricIndex: fabric.fabricIndex, nodeId: remoteNodeId };
        await node.peers.forAddress(peerAddress);
        const peer = node.peers.get(peerAddress) as ClientNode;
        manager.register(server, sourceEp, entry);
        await Promise.resolve();
        await Promise.resolve();
        await peer.lifecycle.online.emit(LocalActorContext.ReadOnly);

        const emitted = fakeEmitted(server) as Array<BindingResolution>;
        expect(emitted).has.length(1);
        const installedEndpoint = (emitted[0] as BindingResolution & { kind: "client" }).endpoint;
        // OnOffLightSwitch declares OnOffClient; manager should have called behaviors.require for it.
        expect(installedEndpoint.behaviors.has(OnOffClient)).true;

        await node.close();
    });
});
