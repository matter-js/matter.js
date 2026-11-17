/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { IcdClient } from "#behavior/system/icd/IcdClient.js";
import { NetworkClient } from "#behavior/system/network/NetworkClient.js";
import { IcdManagementServer } from "#behaviors/icd-management";
import { ClientNode } from "#node/ClientNode.js";
import { NodeConnectionState } from "#node/ClientNodeLifecycle.js";
import { ServerNode } from "#node/ServerNode.js";
import { ServerNodeStore } from "#storage/server/ServerNodeStore.js";
import {
    createPromise,
    Crypto,
    ImplementationError,
    MatterAggregateError,
    MockCrypto,
    MockNetwork,
    Network,
    Seconds,
    Time,
} from "@matter/general";
import { MockSite, settled, subscribedPeer } from "@matter/node/testing";
import { Peer, SustainedSubscription } from "@matter/protocol";

const RootWithIcd = ServerNode.RootEndpoint.with(IcdManagementServer);

/** Drive the peer offline (subscription loses liveness) and settle the resulting recompute. */
async function loseSubscription(peer: ClientNode, device: ServerNode) {
    const subscription = peer.behaviors.internalsOf(NetworkClient).activeSubscription!;
    SustainedSubscription.assert(subscription);
    await MockTime.resolve(device.stop());
    await MockTime.resolve(subscription.inactive);
    await settled(peer);
    return subscription;
}

/** Hold the node mutex of {@link node} until the returned release is called. */
async function blockMutexOf(node: ServerNode | ClientNode) {
    const { promise: entered, resolver: enter } = createPromise<void>();
    const { promise: released, resolver: release } = createPromise<void>();
    const blocking = node.lifecycle.mutex.hold("blocking", async () => {
        enter();
        await released;
    });
    await entered;
    return { blocking, release };
}

const MDNS_PORT = 5353;

/** Drop the device's mDNS traffic until the returned handle is released. */
function blockMdnsFrom(device: ServerNode) {
    const network = device.env.get(Network);
    if (!(network instanceof MockNetwork)) {
        expect.fail("Device network is not simulated");
    }
    let blocked = true;
    network.simulator.router.intercept((packet, route) => {
        if (
            blocked &&
            packet.kind === "udp" &&
            packet.destPort === MDNS_PORT &&
            network.shouldReceive(packet.sourceAddress)
        ) {
            return;
        }
        route(packet);
    });
    return {
        release() {
            blocked = false;
        },
    };
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
        await settled(peer1);

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
        await settled(peer1);
        expect(states).deep.equals([NodeConnectionState.Reconnecting, NodeConnectionState.WaitingForDeviceDiscovery]);

        // A repeated establishment-unresponsive emit must not re-emit the transition (idempotent latch).
        protopeer.establishmentUnresponsive.emit();
        protopeer.establishmentUnresponsive.emit();
        await settled(peer1);
        expect(states).deep.equals([NodeConnectionState.Reconnecting, NodeConnectionState.WaitingForDeviceDiscovery]);
    });

    it("recovers WaitingForDeviceDiscovery -> Reconnecting -> Connected", async () => {
        await using site = new MockSite();
        const { controller, device } = await site.addCommissionedPair();
        const peer1 = await subscribedPeer(controller, "peer1");

        const subscription = await loseSubscription(peer1, device);
        peer1.env.get(Peer).establishmentUnresponsive.emit();
        await settled(peer1);
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

        // Disabling goes straight to Disconnected without a spurious Reconnecting flash as the subscription drops.
        const states = new Array<NodeConnectionState>();
        peer1.lifecycle.connectionStateChanged.on(state => void states.push(state));

        await MockTime.resolve(peer1.disable(), { macrotasks: true });

        expect(peer1.lifecycle.connectionState).equals(NodeConnectionState.Disconnected);
        expect(peer1.lifecycle.isConnected).false;
        expect(states).deep.equals([NodeConnectionState.Disconnected]);
    });

    it("transitions to Disconnected when the node loses its commissioning while it should be online", async () => {
        await using site = new MockSite();
        const { controller } = await site.addCommissionedPair();
        const peer1 = await subscribedPeer(controller, "peer1");
        expect(peer1.lifecycle.connectionState).equals(NodeConnectionState.Connected);

        await MockTime.resolve(
            peer1.act(agent => {
                agent.commissioning.state.peerAddress = undefined;
            }),
            { macrotasks: true },
        );
        await settled(peer1);

        expect(peer1.lifecycle.shouldBeOnline).true;
        expect(peer1.lifecycle.connectionState).equals(NodeConnectionState.Disconnected);
    });

    it("reports Disconnected for a peer that should be online while its controller closes", async () => {
        await using site = new MockSite();
        const { controller, device } = await site.addCommissionedPair();
        const peer1 = await subscribedPeer(controller, "peer1");
        await loseSubscription(peer1, device);
        const { blocking, release } = await blockMutexOf(controller);
        const closing = ServerNode.prototype.close.call(controller);

        peer1.env.get(Peer).establishmentUnresponsive.emit();
        await settled(peer1);
        const state = peer1.lifecycle.connectionState;
        release();
        await MockTime.resolve(Promise.all([blocking, closing]), { macrotasks: true });

        expect(state).equals(NodeConnectionState.Disconnected);
    });

    it("reports Disconnected for a peer that should be online while its server node is offline", async () => {
        await using site = new MockSite();
        const { controller, device } = await site.addCommissionedPair();
        const peer1 = await subscribedPeer(controller, "peer1");
        await loseSubscription(peer1, device);
        let observed: { serverOnline: boolean; shouldBeOnline: boolean; state: NodeConnectionState } | undefined;
        const applyIntent = peer1.applyIntent.bind(peer1);
        peer1.applyIntent = async () => {
            peer1.env.get(Peer).establishmentUnresponsive.emit();
            await settled(peer1);
            observed = {
                serverOnline: controller.lifecycle.isOnline,
                shouldBeOnline: peer1.lifecycle.shouldBeOnline,
                state: peer1.lifecycle.connectionState,
            };
            await applyIntent();
        };

        try {
            await MockTime.resolve(controller.stop(), { macrotasks: true });
        } finally {
            Reflect.deleteProperty(peer1, "applyIntent");
        }

        expect(observed).deep.equals({
            serverOnline: false,
            shouldBeOnline: true,
            state: NodeConnectionState.Disconnected,
        });
    });

    // Characterization: the intent stays online, so the next start() or server restart tries again
    it("reports Disconnected for a peer whose start fails when its server node comes online", async () => {
        await using site = new MockSite();
        const { controller } = await site.addCommissionedPair();
        const peer1 = await subscribedPeer(controller, "peer1");
        await MockTime.resolve(controller.stop(), { macrotasks: true });
        const startup = NetworkClient.prototype.startup;
        NetworkClient.prototype.startup = async () => {
            throw new ImplementationError("Network startup refused for test");
        };

        try {
            await MockTime.resolve(controller.start(), { macrotasks: true });
        } finally {
            NetworkClient.prototype.startup = startup;
        }

        expect(peer1.lifecycle.intent.target).equals("online");
        expect(peer1.behaviors.internalsOf(NetworkClient).runtime).undefined;
        expect(peer1.lifecycle.connectionState).equals(NodeConnectionState.Disconnected);
    });

    it("reports Disconnected for a reconnecting peer that fails to go online again after an erase", async () => {
        await using site = new MockSite();
        const { controller, device } = await site.addCommissionedPair();
        const peer1 = await subscribedPeer(controller, "peer1");
        await loseSubscription(peer1, device);
        expect(peer1.lifecycle.connectionState).equals(NodeConnectionState.Reconnecting);
        const startup = NetworkClient.prototype.startup;
        NetworkClient.prototype.startup = async () => {
            throw new ImplementationError("Network startup refused for test");
        };

        try {
            await expect(MockTime.resolve(peer1.erase(), { macrotasks: true })).rejectedWith(MatterAggregateError);
        } finally {
            NetworkClient.prototype.startup = startup;
        }

        expect(peer1.lifecycle.intent.target).equals("online");
        expect(controller.lifecycle.isOnline).equals(true);
        expect(peer1.lifecycle.connectionState).equals(NodeConnectionState.Disconnected);
    });

    it("reports Disconnected once disable() is called, also when that disable() fails", async () => {
        await using site = new MockSite();
        const { controller, device } = await site.addCommissionedPair();
        const peer1 = await subscribedPeer(controller, "peer1");
        await loseSubscription(peer1, device);
        expect(peer1.lifecycle.connectionState).equals(NodeConnectionState.Reconnecting);
        const { blocking, release } = await blockMutexOf(peer1);
        const store = peer1.env.get(ServerNodeStore).clientStores.storeForNode(peer1);
        const recordDisabled = store.recordNodeDisabled.bind(store);
        store.recordNodeDisabled = async () => {
            throw new ImplementationError("Disabled flag write refused for test");
        };

        try {
            const disabling = peer1.disable();
            await settled(peer1);
            expect(peer1.lifecycle.connectionState).equals(NodeConnectionState.Disconnected);
            release();

            await expect(MockTime.resolve(disabling, { macrotasks: true })).rejectedWith(/refused for test/);
            await MockTime.resolve(blocking);
        } finally {
            store.recordNodeDisabled = recordDisabled;
        }
        expect(peer1.isDisabled).equals(false);
        expect(peer1.lifecycle.connectionState).equals(NodeConnectionState.Disconnected);
    });

    it("transitions to Disconnected when the node is stopped", async () => {
        await using site = new MockSite();
        const { controller } = await site.addCommissionedPair();
        const peer1 = await subscribedPeer(controller, "peer1");
        expect(peer1.lifecycle.connectionState).equals(NodeConnectionState.Connected);

        await MockTime.resolve(peer1.stop(), { macrotasks: true });

        expect(peer1.lifecycle.connectionState).equals(NodeConnectionState.Disconnected);
        expect(peer1.lifecycle.isConnected).false;
    });

    it("transitions to Disconnected when its controller goes offline", async () => {
        await using site = new MockSite();
        const { controller } = await site.addCommissionedPair();
        const peer1 = await subscribedPeer(controller, "peer1");

        await MockTime.resolve(controller.stop(), { macrotasks: true });

        expect(peer1.lifecycle.connectionState).equals(NodeConnectionState.Disconnected);
    });

    it("reports Disconnected for a known peer that has not been started", async () => {
        await using site = new MockSite();
        const { controller } = await site.addCommissionedPair();
        await subscribedPeer(controller, "peer1");

        // Reload the controller so the peer is known from storage but never started; a not-started node must read the
        // initial Disconnected, not the enum's numeric default 0 (== Connected).
        await MockTime.resolve(controller.close());
        const controller2 = await site.addController({ index: 1 });

        const peer = controller2.peers.get("peer1")!;
        expect(peer).not.undefined;

        expect(peer.lifecycle.connectionState).equals(NodeConnectionState.Disconnected);
        expect(peer.lifecycle.isConnected).false;
    });

    it("drops out of Connected when the last operational session is lost", async () => {
        await using site = new MockSite();
        const { controller } = await site.addCommissionedPair();
        const peer1 = await subscribedPeer(controller, "peer1");
        expect(peer1.lifecycle.connectionState).equals(NodeConnectionState.Connected);

        // Drop the session without waiting for the subscription to notice — its liveness flag lags real session loss
        // for a sleepy device, so connection state must fall on session loss alone.
        const protopeer = peer1.env.get(Peer);
        for (const session of [...protopeer.sessions]) {
            protopeer.sessions.delete(session);
        }
        await settled(peer1);

        expect(peer1.lifecycle.connectionState).equals(NodeConnectionState.Reconnecting);
        expect(peer1.lifecycle.isConnected).false;
    });

    it("reports WaitingForDeviceDiscovery while a peer has no address to try", async () => {
        await using site = new MockSite();
        const { controller, device } = await site.addCommissionedPair();
        const peer1 = await subscribedPeer(controller, "peer1");
        const peerAddress = peer1.peerAddress!;

        const mdns = blockMdnsFrom(device);
        await MockTime.resolve(peer1.delete());
        await MockTime.resolve(Time.sleep("cached mDNS records expire", Seconds(300)));
        const peer = await MockTime.resolve(controller.peers.forAddress(peerAddress));
        await MockTime.resolve(peer.set({ network: { autoSubscribe: true } }));
        await MockTime.resolve(peer.start());
        await settled(peer);

        const protopeer = peer.env.get(Peer);
        expect(protopeer.descriptor.operationalAddress).undefined;
        expect(protopeer.service.addresses.size).equals(0);
        expect(peer.lifecycle.connectionState).equals(NodeConnectionState.WaitingForDeviceDiscovery);

        mdns.release();
        const subscription = peer.behaviors.internalsOf(NetworkClient).activeSubscription!;
        SustainedSubscription.assert(subscription);
        await MockTime.resolve(subscription.active);
        expect(protopeer.service.addresses.size).greaterThan(0);
        expect(peer.lifecycle.connectionState).equals(NodeConnectionState.Connected);
    });

    it("returns to Reconnecting when discovery finds an address for a peer without a subscription", async () => {
        await using site = new MockSite();
        const { controller, device } = await site.addCommissionedPair();
        const peer1 = await subscribedPeer(controller, "peer1");
        const peerAddress = peer1.peerAddress!;

        const mdns = blockMdnsFrom(device);
        await MockTime.resolve(peer1.delete());
        await MockTime.resolve(Time.sleep("cached mDNS records expire", Seconds(300)));
        const peer = await MockTime.resolve(controller.peers.forAddress(peerAddress));
        await MockTime.resolve(peer.start());
        await settled(peer);
        expect(peer.lifecycle.connectionState).equals(NodeConnectionState.WaitingForDeviceDiscovery);

        mdns.release();
        await MockTime.resolve(peer.lifecycle.connectionStateChanged);
        expect(peer.env.get(Peer).service.addresses.size).greaterThan(0);
        expect(peer.lifecycle.connectionState).equals(NodeConnectionState.Reconnecting);
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
        await settled(peer1);

        expect(peer1.lifecycle.connectionState).equals(NodeConnectionState.WaitingForDeviceDiscovery);
    });
});
