/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { IcdClient } from "#behavior/system/icd/IcdClient.js";
import { NetworkClient } from "#behavior/system/network/NetworkClient.js";
import { IcdManagementServer } from "#behaviors/icd-management";
import { ClientNode } from "#node/ClientNode.js";
import { NodeConnectionState } from "#node/NodeLifecycle.js";
import { ServerNode } from "#node/ServerNode.js";
import { Crypto, MockCrypto } from "@matter/general";
import { Peer, SustainedSubscription } from "@matter/protocol";
import { MockSite } from "../../../node/mock-site.js";
import { subscribedPeer } from "../../../node/node-helpers.js";

const RootWithIcd = ServerNode.RootEndpoint.with(IcdManagementServer);

/** Drive the peer offline (subscription loses liveness) and settle the resulting recompute. */
async function loseSubscription(peer: ClientNode, device: ServerNode) {
    const subscription = peer.behaviors.internalsOf(NetworkClient).activeSubscription!;
    SustainedSubscription.assert(subscription);
    await MockTime.resolve(device.stop());
    await MockTime.resolve(subscription.inactive);
    await MockTime.resolve(Promise.resolve(), { macrotasks: true });
    return subscription;
}

describe("ConnectionState", () => {
    before(() => {
        MockTime.init();
    });

    it("reports Connected with an active subscription", async () => {
        await using site = new MockSite();
        const { controller } = await site.addCommissionedPair();
        const peer1 = await subscribedPeer(controller, "peer1");

        expect(peer1.lifecycle.connectionState).equals(NodeConnectionState.Connected);
        expect(peer1.lifecycle.isConnected).true;
    });

    it("transitions to Reconnecting when the subscription is lost", async () => {
        await using site = new MockSite();
        const { controller, device } = await site.addCommissionedPair();
        const peer1 = await subscribedPeer(controller, "peer1");

        await loseSubscription(peer1, device);

        expect(peer1.lifecycle.connectionState).equals(NodeConnectionState.Reconnecting);
        expect(peer1.lifecycle.isConnected).false;
    });

    it("transitions to WaitingForDeviceDiscovery on an establishment-unresponsive signal", async () => {
        await using site = new MockSite();
        const { controller, device } = await site.addCommissionedPair();
        const peer1 = await subscribedPeer(controller, "peer1");

        await loseSubscription(peer1, device);
        expect(peer1.lifecycle.connectionState).equals(NodeConnectionState.Reconnecting);

        peer1.env.get(Peer).establishmentUnresponsive.emit();
        await MockTime.resolve(Promise.resolve(), { macrotasks: true });

        expect(peer1.lifecycle.connectionState).equals(NodeConnectionState.WaitingForDeviceDiscovery);
        expect(peer1.lifecycle.isConnected).false;
    });

    it("emits connectionStateChanged once per transition and is idempotent under repeated signals", async () => {
        await using site = new MockSite();
        const { controller, device } = await site.addCommissionedPair();
        const peer1 = await subscribedPeer(controller, "peer1");

        const states = new Array<NodeConnectionState>();
        peer1.lifecycle.connectionStateChanged.on(state => void states.push(state));

        await loseSubscription(peer1, device);
        expect(states).deep.equals([NodeConnectionState.Reconnecting]);

        const protopeer = peer1.env.get(Peer);
        protopeer.establishmentUnresponsive.emit();
        await MockTime.resolve(Promise.resolve(), { macrotasks: true });
        expect(states).deep.equals([NodeConnectionState.Reconnecting, NodeConnectionState.WaitingForDeviceDiscovery]);

        // A repeated establishment-unresponsive emit must not re-emit the transition (idempotent latch).
        protopeer.establishmentUnresponsive.emit();
        protopeer.establishmentUnresponsive.emit();
        await MockTime.resolve(Promise.resolve(), { macrotasks: true });
        expect(states).deep.equals([NodeConnectionState.Reconnecting, NodeConnectionState.WaitingForDeviceDiscovery]);
    });

    it("recovers WaitingForDeviceDiscovery -> Reconnecting -> Connected", async () => {
        await using site = new MockSite();
        const { controller, device } = await site.addCommissionedPair();
        const peer1 = await subscribedPeer(controller, "peer1");

        const subscription = await loseSubscription(peer1, device);
        peer1.env.get(Peer).establishmentUnresponsive.emit();
        await MockTime.resolve(Promise.resolve(), { macrotasks: true });
        expect(peer1.lifecycle.connectionState).equals(NodeConnectionState.WaitingForDeviceDiscovery);

        const states = new Array<NodeConnectionState>();
        peer1.lifecycle.connectionStateChanged.on(state => void states.push(state));

        const crypto = device.env.get(Crypto) as MockCrypto;
        crypto.entropic = true;
        await MockTime.resolve(device.start());
        await MockTime.resolve(subscription.active);
        crypto.entropic = false;

        expect(peer1.lifecycle.connectionState).equals(NodeConnectionState.Connected);
        expect(peer1.lifecycle.isConnected).true;
        expect(states).contains(NodeConnectionState.Reconnecting);
        expect(states[states.length - 1]).equals(NodeConnectionState.Connected);
    });

    it("transitions to Disconnected when disabled", async () => {
        await using site = new MockSite();
        const { controller } = await site.addCommissionedPair();
        const peer1 = await subscribedPeer(controller, "peer1");
        expect(peer1.lifecycle.connectionState).equals(NodeConnectionState.Connected);

        await MockTime.resolve(peer1.disable(), { macrotasks: true });

        expect(peer1.lifecycle.connectionState).equals(NodeConnectionState.Disconnected);
        expect(peer1.lifecycle.isConnected).false;
    });

    it("transitions to WaitingForDeviceDiscovery when a registered ICD misses its check-in", async () => {
        await using site = new MockSite();
        const { controller, device } = await site.addCommissionedPair({
            device: { type: RootWithIcd },
        });
        const peer1 = await subscribedPeer(controller, "peer1");
        expect(peer1.behaviors.has(IcdClient)).true;

        await loseSubscription(peer1, device);
        expect(peer1.lifecycle.connectionState).equals(NodeConnectionState.Reconnecting);

        peer1.eventsOf(IcdClient).checkInMissed.emit();
        await MockTime.resolve(Promise.resolve(), { macrotasks: true });

        expect(peer1.lifecycle.connectionState).equals(NodeConnectionState.WaitingForDeviceDiscovery);
    });
});
