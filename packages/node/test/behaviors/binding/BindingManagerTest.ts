/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { AsyncObservable, Bytes, Diagnostic, LogDestination, Logger, LogLevel } from "@matter/general";
import { MockServerNode } from "@matter/node/testing";
import { Fabric, FabricManager, TestFabric } from "@matter/protocol";
import { ClusterId, EndpointNumber, FabricIndex, GroupId, NodeId } from "@matter/types";
import { Binding } from "@matter/types/clusters/binding";
import { GroupKeyManagement } from "@matter/types/clusters/group-key-management";
import { LocalActorContext } from "../../../src/behavior/context/server/LocalActorContext.js";
import { BindingManager, BindingResolution } from "../../../src/behaviors/binding/BindingManager.js";
import { BindingServer } from "../../../src/behaviors/binding/BindingServer.js";
import { GroupsClient } from "../../../src/behaviors/groups/GroupsClient.js";
import { IdentifyClient } from "../../../src/behaviors/identify/IdentifyClient.js";
import { OnOffClient } from "../../../src/behaviors/on-off/OnOffClient.js";
import { OnOffServer } from "../../../src/behaviors/on-off/OnOffServer.js";
import { OtaSoftwareUpdateProviderClient } from "../../../src/behaviors/ota-software-update-provider/OtaSoftwareUpdateProviderClient.js";
import { WebRtcTransportProviderClient } from "../../../src/behaviors/web-rtc-transport-provider/WebRtcTransportProviderClient.js";
import { CameraControllerDevice } from "../../../src/devices/camera-controller.js";
import { OnOffLightSwitchDevice } from "../../../src/devices/on-off-light-switch.js";
import { OnOffLightDevice } from "../../../src/devices/on-off-light.js";
import type { EndpointType } from "../../../src/endpoint/type/EndpointType.js";
import { ClientGroup } from "../../../src/node/ClientGroup.js";
import { ClientNode } from "../../../src/node/ClientNode.js";

interface FakeEvents {
    established: AsyncObservable<[BindingResolution]> & { emitted: BindingResolution[] };
    removed: AsyncObservable<[BindingResolution]> & { removed: BindingResolution[] };
}

/** A fake whose `established` has an observer unless {@link listening} is false; see {@link listen}. */
function makeFakeBindingServer({ listening = true } = {}): BindingServer {
    const establishedObs = AsyncObservable<[BindingResolution]>() as AsyncObservable<[BindingResolution]> & {
        emitted: BindingResolution[];
    };
    establishedObs.emitted = new Array<BindingResolution>();

    const removedObs = AsyncObservable<[BindingResolution]>() as AsyncObservable<[BindingResolution]> & {
        removed: BindingResolution[];
    };
    removedObs.removed = new Array<BindingResolution>();
    removedObs.on(r => void removedObs.removed.push(r));

    const fake = {
        events: { established: establishedObs, removed: removedObs } as unknown as FakeEvents,
        endpoint: {
            number: 0,
            eventsOf: (_: unknown) => ({ established: establishedObs }),
            type: { clientClusters: {} },
        },
    };
    const server = fake as unknown as BindingServer;
    if (listening) {
        listen(server);
    }
    return server;
}

/** Attaches the observer that records emissions of `established`. */
function listen(server: BindingServer) {
    const established = (server as unknown as { events: FakeEvents }).events.established;
    established.on(r => void established.emitted.push(r));
}

function fakeEmitted(server: BindingServer): Array<BindingResolution> {
    return ((server as unknown as { events: FakeEvents }).events.established as { emitted: BindingResolution[] })
        .emitted;
}

function fakeRemoved(server: BindingServer): Array<BindingResolution> {
    return ((server as unknown as { events: FakeEvents }).events.removed as { removed: BindingResolution[] }).removed;
}

/** Maps `group` to a key set the fabric holds, as GroupKeyManagement KeySetWrite and GroupKeyMap do. */
async function provisionGroupKey(fabric: Fabric, group: GroupId, keySetId = 0x1a1) {
    await fabric.groups.setFromGroupKeySet({
        groupKeySetId: keySetId,
        groupKeySecurityPolicy: GroupKeyManagement.GroupKeySecurityPolicy.TrustFirst,
        epochKey0: Bytes.fromHex("d0d1d2d3d4d5d6d7d8d9dadbdcdddedf"),
        epochStartTime0: 1n,
        epochKey1: null,
        epochStartTime1: null,
        epochKey2: null,
        epochStartTime2: null,
    });
    fabric.groups.groupKeyIdMap.set(group, keySetId);
}

/** Lets the manager's asynchronous resolution run until `done` holds, within a bounded number of turns. */
async function settle(done: () => boolean) {
    for (let turn = 0; turn < 500 && !done(); turn++) {
        await Promise.resolve();
    }
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

        // Pre-warm the group ClientGroup so manager.register's forAddress hits the cache.
        await node.peers.forAddress({
            fabricIndex: fabric.fabricIndex,
            nodeId: NodeId.fromGroupId(GroupId(7)),
        });
        await provisionGroupKey(fabric, GroupId(7));

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

        await node.peers.forAddress({
            fabricIndex: fabric.fabricIndex,
            nodeId: NodeId.fromGroupId(GroupId(7)),
        });
        await provisionGroupKey(fabric, GroupId(7));

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

        await node.peers.forAddress({
            fabricIndex: fabric.fabricIndex,
            nodeId: NodeId.fromGroupId(GroupId(8)),
        });
        await provisionGroupKey(fabric, GroupId(8));

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

        await node.peers.forAddress({
            fabricIndex: fabric.fabricIndex,
            nodeId: NodeId.fromGroupId(GroupId(9)),
        });
        await provisionGroupKey(fabric, GroupId(9));

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

    it("kind=group resolves although the source endpoint is not a member of the group", async () => {
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

        await node.peers.forAddress({
            fabricIndex: fabric.fabricIndex,
            nodeId: NodeId.fromGroupId(GroupId(42)),
        });
        await provisionGroupKey(fabric, GroupId(42));

        manager.register(server, sourceEp, entry);
        await Promise.resolve();
        await Promise.resolve();

        const emitted = fakeEmitted(server);
        expect(emitted).has.length(1);
        expect(emitted[0].kind).equals("group");

        await node.close();
    });

    it("kind=group resolves only once the fabric holds a key for the group", async () => {
        const node = await MockServerNode.createOnline(undefined, { device: OnOffLightSwitchDevice });
        const fabric = await node.addFabric();
        const manager = node.env.get(BindingManager);
        const server = makeFakeBindingServer();
        const sourceEp = node.parts.get(1)!;
        const entry = new Binding.Target({
            node: undefined,
            endpoint: undefined,
            cluster: undefined,
            group: GroupId(43),
            fabricIndex: fabric.fabricIndex,
        });

        await node.peers.forAddress({ fabricIndex: fabric.fabricIndex, nodeId: NodeId.fromGroupId(GroupId(43)) });

        manager.register(server, sourceEp, entry);
        await settle(() => false);
        expect(fakeEmitted(server)).has.length(0);

        await provisionGroupKey(fabric, GroupId(43));
        await settle(() => fakeEmitted(server).length > 0);
        expect(fakeEmitted(server)).has.length(1);
        expect(fakeEmitted(server)[0].kind).equals("group");

        await node.close();
    });

    function groupEntry(fabric: Fabric, group: number) {
        return new Binding.Target({
            node: undefined,
            endpoint: undefined,
            cluster: undefined,
            group: GroupId(group),
            fabricIndex: fabric.fabricIndex,
        });
    }

    async function groupSetup(group: number) {
        const node = await MockServerNode.createOnline(undefined, { device: OnOffLightSwitchDevice });
        const fabric = await node.addFabric();
        const manager = node.env.get(BindingManager);
        const server = makeFakeBindingServer();
        const sourceEp = node.parts.get(1)!;
        const entry = groupEntry(fabric, group);
        await node.peers.forAddress({ fabricIndex: fabric.fabricIndex, nodeId: NodeId.fromGroupId(GroupId(group)) });
        return { node, fabric, manager, server, sourceEp, entry };
    }

    it("kind=group stays established when the group's key goes away until the entry is unregistered, and close releases the key watch", async () => {
        const { node, fabric, manager, server, sourceEp, entry } = await groupSetup(44);

        await provisionGroupKey(fabric, GroupId(44));
        manager.register(server, sourceEp, entry);
        await settle(() => fakeEmitted(server).length > 0);
        expect(fakeEmitted(server)).has.length(1);

        fabric.groups.groupKeyIdMap.delete(GroupId(44));
        fabric.groups.removeGroupKeySet(0x1a1);
        await settle(() => false);
        expect(fakeRemoved(server)).has.length(0);

        await provisionGroupKey(fabric, GroupId(44));
        await settle(() => false);
        expect(fakeEmitted(server)).has.length(1);

        await manager.unregister(server, entry);
        expect(fakeRemoved(server)).has.length(1);

        await manager.close();
        expect(fabric.groups.groupKeyIdMap.added.isObserved).false;
        expect(fabric.groups.groupKeyIdMap.deleted.isObserved).false;
        expect(fabric.groups.keySets.added.isObserved).false;
        expect(fabric.groups.keySets.deleted.isObserved).false;

        await node.close();
    });

    it("kind=group establishes once when several key changes arrive together", async () => {
        const { node, fabric, manager, server, sourceEp, entry } = await groupSetup(45);

        manager.register(server, sourceEp, entry);
        await settle(() => false);
        await provisionGroupKey(fabric, GroupId(45));
        fabric.groups.groupKeyIdMap.set(GroupId(45), 0x1a2);
        fabric.groups.groupKeyIdMap.set(GroupId(45), 0x1a1);
        await settle(() => false);

        expect(fakeEmitted(server)).has.length(1);

        await node.close();
    });

    it("kind=group does not resolve a waiting entry after its server was disposed", async () => {
        const { node, fabric, manager, server, sourceEp, entry } = await groupSetup(46);

        manager.register(server, sourceEp, entry);
        await settle(() => false);
        await manager.disposeServer(server);
        await provisionGroupKey(fabric, GroupId(46));
        await settle(() => false);

        expect(fakeEmitted(server)).has.length(0);

        await node.close();
    });

    it("stops watching a fabric's group keys once the fabric is deleted", async () => {
        const { node, fabric, manager, server, sourceEp, entry } = await groupSetup(47);

        manager.register(server, sourceEp, entry);
        await settle(() => false);
        expect(fabric.groups.groupKeyIdMap.added.isObserved).true;

        await fabric.delete();
        await settle(() => false);
        expect(fabric.groups.groupKeyIdMap.added.isObserved).false;

        await node.close();
    });

    it("kind=group does not resolve when the key is withdrawn while the group is being registered", async () => {
        const node = await MockServerNode.createOnline(undefined, { device: OnOffLightSwitchDevice });
        const fabric = await node.addFabric();
        const manager = node.env.get(BindingManager);
        const server = makeFakeBindingServer();
        const sourceEp = node.parts.get(1)!;
        const entry = new Binding.Target({
            node: undefined,
            endpoint: undefined,
            cluster: undefined,
            group: GroupId(47),
            fabricIndex: fabric.fabricIndex,
        });

        await provisionGroupKey(fabric, GroupId(47));
        // No pre-warm: registering the group peer takes turns, during which the key goes away
        manager.register(server, sourceEp, entry);
        fabric.groups.groupKeyIdMap.delete(GroupId(47));
        await node.peers.forAddress({ fabricIndex: fabric.fabricIndex, nodeId: NodeId.fromGroupId(GroupId(47)) });
        await settle(() => false);
        expect(fakeEmitted(server)).has.length(0);

        await node.close();
    });

    it("kind=group does not resolve an entry unregistered while its group is being registered", async () => {
        const node = await MockServerNode.createOnline(undefined, { device: OnOffLightSwitchDevice });
        const fabric = await node.addFabric();
        const manager = node.env.get(BindingManager);
        const server = makeFakeBindingServer();
        const sourceEp = node.parts.get(1)!;
        const entryFor = (group: number) =>
            new Binding.Target({
                node: undefined,
                endpoint: undefined,
                cluster: undefined,
                group: GroupId(group),
                fabricIndex: fabric.fabricIndex,
            });

        await provisionGroupKey(fabric, GroupId(48));
        await provisionGroupKey(fabric, GroupId(49), 0x1a2);
        // The second entry keeps the source endpoint's record alive while the first is withdrawn
        manager.register(server, sourceEp, entryFor(48));
        manager.register(server, sourceEp, entryFor(49));
        await manager.unregister(server, entryFor(48));
        for (const group of [48, 49]) {
            await node.peers.forAddress({
                fabricIndex: fabric.fabricIndex,
                nodeId: NodeId.fromGroupId(GroupId(group)),
            });
        }
        await settle(() => fakeEmitted(server).length > 1);

        expect(fakeEmitted(server).map(({ entry }) => entry.group)).deep.equals([49]);

        await node.close();
    });

    it("kind=group resolves on a key provisioned after its fabric was replaced", async () => {
        const node = await MockServerNode.createOnline(undefined, { device: OnOffLightSwitchDevice });
        const fabric = await node.addFabric();
        const fabrics = node.env.get(FabricManager);
        const manager = node.env.get(BindingManager);
        const server = makeFakeBindingServer();
        const sourceEp = node.parts.get(1)!;
        const entry = new Binding.Target({
            node: undefined,
            endpoint: undefined,
            cluster: undefined,
            group: GroupId(46),
            fabricIndex: fabric.fabricIndex,
        });

        await node.peers.forAddress({ fabricIndex: fabric.fabricIndex, nodeId: NodeId.fromGroupId(GroupId(46)) });
        manager.register(server, sourceEp, entry);
        await settle(() => false);
        expect(fakeEmitted(server)).has.length(0);

        // As UpdateNOC does: the same fabric index, a new Fabric object with its own group key maps
        const replacement = new Fabric(fabrics.crypto, fabric.config);
        await fabrics.replaceFabric(replacement);
        await provisionGroupKey(replacement, GroupId(46));
        await settle(() => fakeEmitted(server).length > 0);
        expect(fakeEmitted(server)).has.length(1);

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

    describe("client selection", () => {
        const switchWithMoreClients = OnOffLightSwitchDevice.withClientClusters(
            GroupsClient,
            OtaSoftwareUpdateProviderClient,
            WebRtcTransportProviderClient,
        );

        async function resolveClientEntry(cluster?: ClusterId) {
            const node = await MockServerNode.createOnline(undefined, { device: switchWithMoreClients });
            const fabric = await node.addFabric();
            const remoteNodeId = NodeId(BigInt(fabric.nodeId) + 1n);
            const server = makeFakeBindingServer();
            const entry = new Binding.Target({
                node: remoteNodeId,
                endpoint: EndpointNumber(1),
                cluster,
                group: undefined,
                fabricIndex: fabric.fabricIndex,
            });

            const peer = await node.peers.forAddress({ fabricIndex: fabric.fabricIndex, nodeId: remoteNodeId });
            node.env.get(BindingManager).register(server, node.parts.get(1)!, entry);
            await Promise.resolve();
            await Promise.resolve();
            await peer.lifecycle.online.emit(LocalActorContext.ReadOnly);

            return { node, emitted: fakeEmitted(server) };
        }

        it("installs every declared client on a bound peer except those whose cluster chooses its peer", async () => {
            const { node, emitted } = await resolveClientEntry();

            expect(emitted).has.length(1);
            const installed = emitted[0].endpoint.behaviors;
            expect(installed.has(IdentifyClient)).true;
            expect(installed.has(GroupsClient)).true;
            expect(installed.has(OnOffClient)).true;
            expect(installed.has(OtaSoftwareUpdateProviderClient)).false;
            expect(installed.has(WebRtcTransportProviderClient)).false;

            await node.close();
        });

        it("installs the utility client an entry filters to", async () => {
            // Characterization: passes without the bindable filter too
            const { node, emitted } = await resolveClientEntry(ClusterId(0x0003));

            expect(emitted).has.length(1);
            const installed = emitted[0].endpoint.behaviors;
            expect(installed.has(IdentifyClient)).true;
            expect(installed.has(OnOffClient)).false;

            await node.close();
        });

        it("rejects an entry filtered to a client whose cluster chooses its peer, saying so", async () => {
            const warnings = new Array<string>();
            Logger.destinations.capture = LogDestination({
                add(message: Diagnostic.Message) {
                    if (message.facility === "BindingManager" && message.level >= LogLevel.WARN) {
                        warnings.push(String(message.values[0]));
                    }
                },
            });

            let node: MockServerNode | undefined;
            try {
                const resolved = await resolveClientEntry(ClusterId(0x0029));
                node = resolved.node;

                expect(resolved.emitted).deep.equals([]);
                expect(warnings).deep.equals([
                    "Ignoring binding entry for cluster OtaSoftwareUpdateProvider: we never use this client through a binding",
                ]);
            } finally {
                delete Logger.destinations.capture;
                await node?.close();
            }
        });

        async function warningsFor(device: EndpointType, cluster?: ClusterId) {
            const warnings = new Array<string>();
            Logger.destinations.capture = LogDestination({
                add(message: Diagnostic.Message) {
                    if (message.facility === "BindingManager" && message.level >= LogLevel.WARN) {
                        warnings.push(String(message.values[0]));
                    }
                },
            });

            const node = await MockServerNode.createOnline(undefined, { device });
            try {
                const fabric = await node.addFabric();
                const entry = new Binding.Target({
                    node: NodeId(BigInt(fabric.nodeId) + 1n),
                    endpoint: EndpointNumber(1),
                    cluster,
                    group: undefined,
                    fabricIndex: fabric.fabricIndex,
                });
                node.env.get(BindingManager).register(makeFakeBindingServer(), node.parts.get(1)!, entry);
                await settle(() => warnings.length > 0);
                return warnings;
            } finally {
                delete Logger.destinations.capture;
                await node.close();
            }
        }

        it("names both clusters when an entry matches only several clients a binding never directs", async () => {
            expect(
                await warningsFor(
                    OnOffLightDevice.with(OtaSoftwareUpdateProviderClient, WebRtcTransportProviderClient),
                ),
            ).deep.equals([
                "Ignoring binding entry for clusters OtaSoftwareUpdateProvider, WebRtcTransportProvider: we never use these clients through a binding",
            ]);
        });

        it("says so when an entry without a cluster reaches an endpoint without client clusters", async () => {
            expect(await warningsFor(OnOffLightDevice)).deep.equals([
                "Ignoring binding entry: endpoint 1 has no client cluster declared",
            ]);
        });

        it("names a cluster the model does not define by its ID", async () => {
            expect(await warningsFor(OnOffLightDevice, ClusterId(0xfff1fc01))).deep.equals([
                "Ignoring binding entry for cluster 0xfff1fc01: endpoint 1 has no client for this cluster declared",
            ]);
        });

        it("rejects an entry for a cluster the endpoint has no client for, naming the cluster", async () => {
            const warnings = new Array<string>();
            Logger.destinations.capture = LogDestination({
                add(message: Diagnostic.Message) {
                    if (message.facility === "BindingManager" && message.level >= LogLevel.WARN) {
                        warnings.push(String(message.values[0]));
                    }
                },
            });

            let node: MockServerNode | undefined;
            try {
                const resolved = await resolveClientEntry(ClusterId(0x0008));
                node = resolved.node;

                expect(resolved.emitted).deep.equals([]);
                expect(warnings).deep.equals([
                    "Ignoring binding entry for cluster LevelControl: endpoint 1 has no client for this cluster declared",
                ]);
            } finally {
                delete Logger.destinations.capture;
                await node?.close();
            }
        });

        it("rejects an entry of an endpoint whose only clients choose their peer, saying so", async () => {
            const warnings = new Array<string>();
            Logger.destinations.capture = LogDestination({
                add(message: Diagnostic.Message) {
                    if (message.facility === "BindingManager" && message.level >= LogLevel.WARN) {
                        warnings.push(String(message.values[0]));
                    }
                },
            });

            let node: MockServerNode | undefined;
            try {
                node = await MockServerNode.createOnline(undefined, {
                    device: CameraControllerDevice,
                });
                const fabric = await node.addFabric();
                const server = makeFakeBindingServer();
                const entry = new Binding.Target({
                    node: NodeId(BigInt(fabric.nodeId) + 1n),
                    endpoint: EndpointNumber(1),
                    cluster: undefined,
                    group: undefined,
                    fabricIndex: fabric.fabricIndex,
                });

                node.env.get(BindingManager).register(server, node.parts.get(1)!, entry);
                await settle(() => warnings.length > 0);

                expect(fakeEmitted(server)).deep.equals([]);
                expect(warnings).deep.equals([
                    "Ignoring binding entry for cluster WebRtcTransportProvider: we never use this client through a binding",
                ]);
            } finally {
                delete Logger.destinations.capture;
                await node?.close();
            }
        });

        it("leaves a client whose cluster chooses its peer off a bound group", async () => {
            const node = await MockServerNode.createOnline(undefined, { device: switchWithMoreClients });
            const fabric = await node.addFabric();
            const server = makeFakeBindingServer();
            const entry = new Binding.Target({
                node: undefined,
                endpoint: undefined,
                cluster: undefined,
                group: GroupId(7),
                fabricIndex: fabric.fabricIndex,
            });
            await node.peers.forAddress({ fabricIndex: fabric.fabricIndex, nodeId: NodeId.fromGroupId(GroupId(7)) });
            await provisionGroupKey(fabric, GroupId(7));

            node.env.get(BindingManager).register(server, node.parts.get(1)!, entry);
            await settle(() => fakeEmitted(server).length > 0);

            const emitted = fakeEmitted(server);
            expect(emitted).has.length(1);
            const installed = emitted[0].endpoint.behaviors;
            expect(installed.has(OnOffClient)).true;
            expect(installed.has(WebRtcTransportProviderClient)).false;

            await node.close();
        });
    });

    describe("without an observer of established", () => {
        function remoteEntry(fabricIndex: FabricIndex, nodeId: NodeId) {
            return new Binding.Target({
                node: nodeId,
                endpoint: EndpointNumber(1),
                cluster: undefined,
                group: undefined,
                fabricIndex,
            });
        }

        it("registers no peer until something observes, then resolves the entry", async () => {
            const node = await MockServerNode.createOnline(undefined, { device: OnOffLightSwitchDevice });
            const fabric = await node.addFabric();
            const peerAddress = { fabricIndex: fabric.fabricIndex, nodeId: NodeId(BigInt(fabric.nodeId) + 1n) };
            const server = makeFakeBindingServer({ listening: false });

            node.env
                .get(BindingManager)
                .register(server, node.parts.get(1)!, remoteEntry(fabric.fabricIndex, peerAddress.nodeId));
            await settle(() => false);
            expect(node.peers.get(peerAddress)).undefined;

            listen(server);
            await settle(() => node.peers.get(peerAddress) !== undefined);
            expect(node.peers.get(peerAddress)).instanceof(ClientNode);

            await node.close();
        });

        it("emits a self-binding once something observes", async () => {
            const node = await MockServerNode.createOnline(undefined, { device: OnOffLightSwitchDevice });
            const fabric = await node.addFabric();
            const server = makeFakeBindingServer({ listening: false });

            node.env
                .get(BindingManager)
                .register(server, node.parts.get(1)!, makeSelfBindingEntry(EndpointNumber(1), fabric.nodeId));
            await settle(() => false);
            listen(server);
            await settle(() => fakeEmitted(server).length > 0);

            expect(fakeEmitted(server).map(({ kind }) => kind)).deep.equals(["server"]);

            await node.close();
        });

        it("registers no group until something observes", async () => {
            const node = await MockServerNode.createOnline(undefined, { device: OnOffLightSwitchDevice });
            const fabric = await node.addFabric();
            const groupAddress = { fabricIndex: fabric.fabricIndex, nodeId: NodeId.fromGroupId(GroupId(7)) };
            await provisionGroupKey(fabric, GroupId(7));
            const server = makeFakeBindingServer({ listening: false });
            const entry = new Binding.Target({
                node: undefined,
                endpoint: undefined,
                cluster: undefined,
                group: GroupId(7),
                fabricIndex: fabric.fabricIndex,
            });

            node.env.get(BindingManager).register(server, node.parts.get(1)!, entry);
            await settle(() => false);
            expect(node.peers.get(groupAddress)).undefined;

            listen(server);
            await settle(() => fakeEmitted(server).length > 0);
            expect(fakeEmitted(server).map(({ kind }) => kind)).deep.equals(["group"]);
            expect(node.peers.get(groupAddress)).instanceof(ClientGroup);

            await node.close();
        });

        it("leaves an entry dormant that arrives after a once observer was used up", async () => {
            const node = await MockServerNode.createOnline(undefined, { device: OnOffLightSwitchDevice });
            const fabric = await node.addFabric();
            const server = makeFakeBindingServer({ listening: false });
            const established = server.endpoint.eventsOf(BindingServer).established;
            const manager = node.env.get(BindingManager);
            const taken = new Array<BindingResolution>();
            established.once(resolution => void taken.push(resolution));

            manager.register(server, node.parts.get(1)!, makeSelfBindingEntry(EndpointNumber(1), fabric.nodeId));
            manager.register(server, node.parts.get(1)!, makeSelfBindingEntry(EndpointNumber(0), fabric.nodeId));
            await settle(() => false);
            expect(taken.map(({ entry }) => entry.endpoint)).deep.equals([EndpointNumber(1)]);

            listen(server);
            await settle(() => fakeEmitted(server).length > 0);
            expect(fakeEmitted(server).map(({ entry }) => entry.endpoint)).deep.equals([EndpointNumber(0)]);

            await node.close();
        });

        it("parks a resolved entry when its once observer was taken while its peer came online", async () => {
            const node = await MockServerNode.createOnline(undefined, { device: OnOffLightSwitchDevice });
            const fabric = await node.addFabric();
            const server = makeFakeBindingServer({ listening: false });
            const established = server.endpoint.eventsOf(BindingServer).established;
            const manager = node.env.get(BindingManager);
            const taken = new Array<BindingResolution>();
            established.once(resolution => void taken.push(resolution));

            const peers = new Array<ClientNode>();
            for (const offset of [1n, 2n]) {
                const nodeId = NodeId(BigInt(fabric.nodeId) + offset);
                const peer = await node.peers.forAddress({ fabricIndex: fabric.fabricIndex, nodeId });
                peer.endpoints.require(1);
                peers.push(peer);
                manager.register(server, node.parts.get(1)!, remoteEntry(fabric.fabricIndex, nodeId));
            }
            await settle(() => false);
            for (const peer of peers) {
                await peer.lifecycle.online.emit(LocalActorContext.ReadOnly);
            }
            expect(taken.map(({ node }) => node)).deep.equals([peers[0]]);

            listen(server);
            await settle(() => fakeEmitted(server).length > 0);
            expect(fakeEmitted(server).map(({ node }) => node)).deep.equals([peers[1]]);

            await node.close();
        });

        it("forgets a dormant entry that is unregistered", async () => {
            const node = await MockServerNode.createOnline(undefined, { device: OnOffLightSwitchDevice });
            const fabric = await node.addFabric();
            const server = makeFakeBindingServer({ listening: false });
            const manager = node.env.get(BindingManager);
            const entry = makeSelfBindingEntry(EndpointNumber(1), fabric.nodeId);

            manager.register(server, node.parts.get(1)!, entry);
            await settle(() => false);
            await manager.unregister(server, entry);
            expect(server.endpoint.eventsOf(BindingServer).established.observed.isObserved).false;
            listen(server);
            await settle(() => false);

            expect(fakeEmitted(server)).deep.equals([]);
            expect(fakeRemoved(server)).deep.equals([]);

            await node.close();
        });

        it("forgets dormant entries of a disposed server", async () => {
            const node = await MockServerNode.createOnline(undefined, { device: OnOffLightSwitchDevice });
            const fabric = await node.addFabric();
            const server = makeFakeBindingServer({ listening: false });
            const manager = node.env.get(BindingManager);

            manager.register(server, node.parts.get(1)!, makeSelfBindingEntry(EndpointNumber(1), fabric.nodeId));
            await settle(() => false);
            await manager.disposeServer(server);
            expect(server.endpoint.eventsOf(BindingServer).established.observed.isObserved).false;
            listen(server);
            await settle(() => false);

            expect(fakeEmitted(server)).deep.equals([]);
            expect(fakeRemoved(server)).deep.equals([]);

            await node.close();
        });

        it("keeps the other dormant entry when one is unregistered", async () => {
            const node = await MockServerNode.createOnline(undefined, { device: OnOffLightSwitchDevice });
            const fabric = await node.addFabric();
            const server = makeFakeBindingServer({ listening: false });
            const manager = node.env.get(BindingManager);
            const kept = makeSelfBindingEntry(EndpointNumber(1), fabric.nodeId);
            const dropped = makeSelfBindingEntry(EndpointNumber(0), fabric.nodeId);

            manager.register(server, node.parts.get(1)!, kept);
            manager.register(server, node.parts.get(1)!, dropped);
            await settle(() => false);
            await manager.unregister(server, dropped);
            listen(server);
            await settle(() => fakeEmitted(server).length > 0);

            expect(fakeEmitted(server).map(({ entry }) => entry.endpoint)).deep.equals([EndpointNumber(1)]);

            await node.close();
        });

        it("waits again for an observer after the observer it woke for went away", async () => {
            const node = await MockServerNode.createOnline(undefined, { device: OnOffLightSwitchDevice });
            const fabric = await node.addFabric();
            const server = makeFakeBindingServer({ listening: false });
            const established = server.endpoint.eventsOf(BindingServer).established;
            const manager = node.env.get(BindingManager);
            const first = new Array<BindingResolution>();
            const observer = (resolution: BindingResolution) => void first.push(resolution);

            manager.register(server, node.parts.get(1)!, makeSelfBindingEntry(EndpointNumber(1), fabric.nodeId));
            await settle(() => false);
            established.on(observer);
            await settle(() => first.length > 0);
            established.off(observer);
            manager.register(server, node.parts.get(1)!, makeSelfBindingEntry(EndpointNumber(0), fabric.nodeId));
            await settle(() => false);
            listen(server);
            await settle(() => fakeEmitted(server).length > 0);

            expect(first.map(({ entry }) => entry.endpoint)).deep.equals([EndpointNumber(1)]);
            expect(fakeEmitted(server).map(({ entry }) => entry.endpoint)).deep.equals([EndpointNumber(0)]);

            await node.close();
        });

        it("resolves no dormant entry after the manager closed", async () => {
            const node = await MockServerNode.createOnline(undefined, { device: OnOffLightSwitchDevice });
            const fabric = await node.addFabric();
            const server = makeFakeBindingServer({ listening: false });
            const manager = node.env.get(BindingManager);

            manager.register(server, node.parts.get(1)!, makeSelfBindingEntry(EndpointNumber(1), fabric.nodeId));
            await settle(() => false);
            await manager.close();
            expect(server.endpoint.eventsOf(BindingServer).established.observed.isObserved).false;
            listen(server);
            await settle(() => false);

            expect(fakeEmitted(server)).deep.equals([]);

            await node.close();
        });

        it("still warns about an entry that can never resolve", async () => {
            const node = await MockServerNode.createOnline(undefined, { device: OnOffLightSwitchDevice });
            const fabric = await node.addFabric();
            const server = makeFakeBindingServer({ listening: false });
            const warnings = new Array<string>();
            Logger.destinations.capture = LogDestination({
                add(message: Diagnostic.Message) {
                    if (message.facility === "BindingManager" && message.level >= LogLevel.WARN) {
                        warnings.push(String(message.values[0]));
                    }
                },
            });

            try {
                node.env
                    .get(BindingManager)
                    .register(server, node.parts.get(1)!, makeSelfBindingEntry(EndpointNumber(9), fabric.nodeId));
                await settle(() => warnings.length > 0);

                expect(warnings).deep.equals(["Self-binding to non-existent endpoint"]);

                warnings.length = 0;
                node.env.get(BindingManager).register(
                    server,
                    node.parts.get(1)!,
                    new Binding.Target({
                        node: NodeId(BigInt(fabric.nodeId) + 1n),
                        endpoint: undefined,
                        cluster: undefined,
                        group: undefined,
                        fabricIndex: fabric.fabricIndex,
                    }),
                );
                await settle(() => warnings.length > 0);

                expect(warnings).deep.equals(["Client binding entry missing endpoint"]);
            } finally {
                delete Logger.destinations.capture;
                await node.close();
            }
        });
    });
});
