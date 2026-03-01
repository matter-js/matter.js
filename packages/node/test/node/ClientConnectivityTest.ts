/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { CommissioningClient } from "#behavior/system/commissioning/CommissioningClient.js";
import { OnOffClient } from "#behaviors/on-off";
import {
    causedBy,
    Crypto,
    Forever,
    LogDestination,
    Logger,
    LogLevel,
    Minutes,
    MockCrypto,
    MockNetwork,
    Network,
    Seconds,
    Time,
} from "#general";
import { NetworkClient, ServerNode } from "#index.js";
import { ClientSubscription, Peer, PeerUnreachableError, SustainedSubscription } from "#protocol";
import { MockServerNode } from "./mock-server-node.js";
import { MockSite } from "./mock-site.js";
import { subscribedPeer } from "./node-helpers.js";

describe("ClientConnectivityTest", () => {
    before(() => {
        MockTime.init();

        // Required for crypto to succeed
        MockTime.forceMacrotasks = true;
    });

    it("throws error if node cannot be reached", async () => {
        // *** SETUP ***

        await using site = new MockSite();
        const { controller, device } = await site.addCommissionedPair();
        const peer1 = controller.peers.get("peer1")!;
        const ep1 = peer1.parts.get("ep1")!;
        await MockTime.resolve(device.close());

        // *** INVOCATION ***

        (ep1.env.get(Crypto) as MockCrypto).entropic = true;

        await expectUnreachable(ep1.commandsOf(OnOffClient).toggle());
    });

    it("reconnects and updates connection status", async () => {
        // *** SETUP ***

        await using site = new MockSite();
        const { controller, device } = await site.addCommissionedPair();
        const peer1 = controller.peers.get("peer1")!;
        const ep1 = peer1.parts.get("ep1")!;
        await MockTime.resolve(device.stop());

        // *** INVOKE ***

        (ep1.env.get(Crypto) as MockCrypto).entropic = true;

        // We detected the device as offline, and so we get a failure on execution
        await expectUnreachable(ep1.commandsOf(OnOffClient).toggle());

        // Delay
        await MockTime.resolve(Time.sleep("waiting to start device", Seconds(5)));

        // Bring the device online again
        await MockTime.resolve(device.start());

        // Toggle should now complete
        await MockTime.resolve(ep1.commandsOf(OnOffClient).toggle(undefined, { connectionTimeout: Minutes(5) }));
    });

    it("connects to second address after delay when first is unreachable", async () => {
        // *** SETUP ***

        await using site = new MockSite();
        const { controller, device } = await site.addCommissionedPair();
        const peer1 = controller.peers.get("peer1")!;
        const ep1 = peer1.parts.get("ep1")!;
        await MockTime.resolve(device.stop());

        // *** FIRST ATTEMPT FAILS (device offline) ***

        (ep1.env.get(Crypto) as MockCrypto).entropic = true;

        await expectUnreachable(ep1.commandsOf(OnOffClient).toggle());

        // *** BLOCK DEVICE IPv6 ADDRESS ***

        // Install interceptor to drop packets to device's IPv6 address (higher priority than IPv4).
        // MDNS multicast discovery still works since it uses multicast addresses, not unicast.
        const deviceNetwork = device.env.get(Network) as MockNetwork;
        deviceNetwork.simulator.router.intercept((packet, route) => {
            if (packet.destAddress === "abcd::2") {
                return;
            }
            route(packet);
        });

        // *** RECONNECT VIA SECOND ADDRESS ***

        await MockTime.resolve(Time.sleep("waiting to start device", Seconds(5)));
        await MockTime.resolve(device.start());

        // PeerConnection discovers both addresses via MDNS, tries IPv6 first (blocked by interceptor),
        // waits delayBeforeNextAddress (60s), then tries IPv4 (10.10.10.2) which succeeds
        await MockTime.resolve(ep1.commandsOf(OnOffClient).toggle(undefined, { connectionTimeout: Minutes(5) }));

        // Verify the connection used the IPv4 address
        const addresses = peer1.stateOf(CommissioningClient).addresses;
        expect(addresses).not.undefined;
        expect(addresses).length(1);
        expect(addresses![0].type).equals("udp");
        expect((addresses![0] as { ip: string }).ip).equals("10.10.10.2");
    });

    it("connects via last known address when MDNS records expire", async () => {
        // *** SETUP ***

        await using site = new MockSite();
        const { controller, device } = await site.addCommissionedPair();
        const peer1 = controller.peers.get("peer1")!;
        const ep1 = peer1.parts.get("ep1")!;

        // *** EXPIRE MDNS RECORDS ***

        // Block MDNS while session is still active so records can't be refreshed
        const deviceNetwork = device.env.get(Network) as MockNetwork;
        deviceNetwork.simulator.router.intercept((packet, route) => {
            if (packet.destPort === 5353) {
                return;
            }
            route(packet);
        });

        // Advance time well past MDNS TTL (default 120s); the active session keeps
        // working but MDNS records expire since refreshes are blocked
        await MockTime.resolve(Time.sleep("waiting for records to expire", Minutes(5)));

        // *** DEVICE GOES OFFLINE AND RESTARTS ***

        // Cancel device - goodbye messages are also blocked by the MDNS interceptor
        await MockTime.resolve(device.stop());

        (ep1.env.get(Crypto) as MockCrypto).entropic = true;

        await MockTime.resolve(Time.sleep("waiting to start device", Seconds(5)));
        await MockTime.resolve(device.start());

        // PeerConnection finds no discovered addresses (all expired, MDNS blocked),
        // falls back to last known operational address
        await MockTime.resolve(ep1.commandsOf(OnOffClient).toggle(undefined, { connectionTimeout: Forever }));

        // Verify connection succeeded
        const addresses = peer1.stateOf(CommissioningClient).addresses;
        expect(addresses).not.undefined;
        expect(addresses).length(1);
        expect(addresses![0].type).equals("udp");
    });

    it("connects via last known address when MDNS is unavailable", async () => {
        // *** SETUP ***

        await using site = new MockSite();
        const { controller, device } = await site.addCommissionedPair();

        // *** VALIDATE MDNS STATE ***

        let peer1 = controller.peers.get("peer1")!;
        expect(peer1).not.undefined;

        let protopeer = peer1.env.get(Peer);
        expect(protopeer.service.addresses.size).equals(2);

        // *** STOP AND BLOCK MDNS ***

        await MockTime.resolve(controller.stop());
        await MockTime.resolve(device.stop());

        // Block all MDNS traffic to simulate MDNS outage
        const deviceNetwork = device.env.get(Network) as MockNetwork;
        deviceNetwork.simulator.router.intercept((packet, route) => {
            if (packet.destPort === 5353) {
                return;
            }
            route(packet);
        });

        // *** RESTART AND CONNECT VIA FALLBACK ***

        await device.start();
        (controller.env.get(Crypto) as MockCrypto).entropic = true;
        await controller.start();

        peer1 = controller.peers.get("peer1")!;
        const ep1 = peer1.parts.get("ep1")!;

        protopeer = peer1.env.get(Peer);
        expect(protopeer.service.addresses.size).equals(0);

        // PeerConnection can't discover addresses via MDNS, so it uses the last known
        // operational address (fallback) to establish the session
        await MockTime.resolve(ep1.commandsOf(OnOffClient).toggle(undefined, { connectionTimeout: Minutes(5) }));

        // Verify connection succeeded using the fallback address
        const addresses = peer1.stateOf(CommissioningClient).addresses;
        expect(addresses).not.undefined;
        expect(addresses).length(1);
        expect(addresses![0].type).equals("udp");

        // Confirm that we still haven't discovered addresses
        expect(protopeer.service.addresses.size).equals(0);
    });

    it("reconnects after device address change with expired records", async () => {
        // *** SETUP ***

        await using site = new MockSite();
        const { controller, device } = await site.addCommissionedPair();
        const peer1 = controller.peers.get("peer1")!;
        const ep1 = peer1.parts.get("ep1")!;

        // *** DEVICE GOES OFFLINE ***

        await MockTime.resolve(device.stop());

        (ep1.env.get(Crypto) as MockCrypto).entropic = true;

        await expectUnreachable(ep1.commandsOf(OnOffClient).toggle());

        // *** EXPIRE MDNS RECORDS ***

        // Advance time past MDNS TTL (default 120s) so all records fully expire
        await MockTime.resolve(Time.sleep("waiting for MDNS records to expire", Minutes(3)));

        // *** CHANGE DEVICE ADDRESSES ***

        const deviceNetwork = device.env.get(Network) as MockNetwork;
        deviceNetwork.deleteAddr("abcd::2", "10.10.10.2");
        deviceNetwork.addAddr("abcd::3", "10.10.10.3");

        // *** RECONNECT AT NEW ADDRESSES ***

        await MockTime.resolve(device.start());

        // PeerConnection initially falls back to old operational address (fails because
        // device no longer responds there), discovers new addresses via MDNS, connects
        await MockTime.resolve(ep1.commandsOf(OnOffClient).toggle(undefined, { connectionTimeout: Forever }));

        // Verify connection used a new address
        const addresses = peer1.stateOf(CommissioningClient).addresses;
        expect(addresses).not.undefined;
        expect(addresses).length(1);
        expect(addresses![0].type).equals("udp");
        const ip = (addresses![0] as { ip: string }).ip;
        expect(ip === "abcd::3" || ip === "10.10.10.3").true;
    });

    it("reconnects after device address change with stale MDNS records", async () => {
        // *** SETUP ***

        await using site = new MockSite();
        const { controller, device } = await site.addCommissionedPair();
        const peer1 = controller.peers.get("peer1")!;
        const ep1 = peer1.parts.get("ep1")!;

        // *** BLOCK MDNS AND TAKE DEVICE OFFLINE ***

        // Block MDNS to prevent goodbye messages from reaching controller
        const deviceNetwork = device.env.get(Network) as MockNetwork;
        let blockMdns = true;
        deviceNetwork.simulator.router.intercept((packet, route) => {
            if (blockMdns && packet.destPort === 5353) {
                return;
            }
            route(packet);
        });

        // Cancel device — goodbyes blocked, so controller retains stale MDNS records
        await MockTime.resolve(device.stop());

        (ep1.env.get(Crypto) as MockCrypto).entropic = true;

        await expectUnreachable(ep1.commandsOf(OnOffClient).toggle());

        // *** UNBLOCK MDNS AND CHANGE ADDRESSES ***

        blockMdns = false;

        deviceNetwork.deleteAddr("abcd::2", "10.10.10.2");
        deviceNetwork.addAddr("abcd::3", "10.10.10.3");

        // *** RECONNECT AT NEW ADDRESSES ***

        await MockTime.resolve(device.start());

        // Controller has stale records (old IPs) AND discovers new records (new IPs).
        // PeerConnection may try old addresses (fail) and new addresses (succeed).
        await MockTime.resolve(ep1.commandsOf(OnOffClient).toggle(undefined, { connectionTimeout: Forever }));

        // Verify connection used a new address
        const addresses = peer1.stateOf(CommissioningClient).addresses;
        expect(addresses).not.undefined;
        expect(addresses).length(1);
        expect(addresses![0].type).equals("udp");
        const ip = (addresses![0] as { ip: string }).ip;
        expect(ip === "abcd::3" || ip === "10.10.10.3").true;
    });

    it("resubscribes on timeout", async () => {
        // *** SETUP ***

        await using site = new MockSite();
        const { controller, device } = await site.addCommissionedPair();
        const peer1 = await subscribedPeer(controller, "peer1");
        const ep1 = peer1.parts.get("ep1")!;

        // *** INITIAL SUBSCRIPTION ***

        const subscription = peer1.behaviors.internalsOf(NetworkClient).activeSubscription!;
        expect(subscription).not.undefined;
        const initialSubscriptionId = subscription.subscriptionId;
        expect(initialSubscriptionId).not.equals(ClientSubscription.NO_SUBSCRIPTION);

        SustainedSubscription.assert(subscription);
        expect(subscription.active.value).equals(true);

        // *** SUBSCRIPTION TIMEOUT ***

        // Close peer
        await MockTime.resolve(device.stop());

        // Wait for subscription to timeout
        await MockTime.resolve(subscription.inactive);

        // Ensure subscription ID is gone
        expect(subscription.subscriptionId).equals(ClientSubscription.NO_SUBSCRIPTION);

        // *** NEW SUBSCRIPTION ***

        // Need entropy for this bit so we can verify we have a new subscription ID
        const crypto = device.env.get(Crypto) as MockCrypto;
        crypto.entropic = true;

        // Bring peer back online
        await MockTime.resolve(device.start());

        // Wait for subscription to establish
        await MockTime.resolve(subscription.active);
        crypto.entropic = false;

        expect(subscription.subscriptionId).not.equals(ClientSubscription.NO_SUBSCRIPTION);
        expect(subscription.subscriptionId).not.equals(initialSubscriptionId);

        // *** CONFIRM SUBSCRIPTION FUNCTIONS ***

        expect(ep1.stateOf(OnOffClient).onOff).false;
        const toggled = new Promise(resolve => {
            ep1.eventsOf(OnOffClient).onOff$Changed.once(resolve);
        });

        await MockTime.resolve(ep1.commandsOf(OnOffClient).toggle());

        await MockTime.resolve(toggled);

        expect(ep1.stateOf(OnOffClient).onOff).true;
    });

    it("shuts down without errors whilst establishing exchange", async () => {
        await using site = new MockSite();
        let { controller, device } = await site.addCommissionedPair();
        await subscribedPeer(controller, "peer1");

        await MockTime.resolve(controller.stop());
        await MockTime.resolve(device.stop());

        // Need entropy to initiate session establishment
        (controller.env.get(Crypto) as MockCrypto).entropic = true;

        await controller.start();
        await MockTime.advance(Minutes(30));

        let errorsLogged = 0;
        try {
            Logger.destinations.capture = LogDestination({
                add(message) {
                    if (message.level >= LogLevel.ERROR) {
                        errorsLogged++;
                    }
                },
            });

            await site[Symbol.asyncDispose]();
        } finally {
            delete Logger.destinations.capture;
        }

        expect(errorsLogged).equals(0);
    });

    it("subscribes to a peer that is not initially available (start/stop)", async () => {
        await testEventualSubscription(async ({ controller, device }) => {
            await controller.stop();
            await device.stop();
            return { controller, device };
        });
    });

    it("subscribes to a peer that is not initially available (recreate)", async () => {
        await testEventualSubscription(async ({ site, controller, device }) => {
            await controller.close();
            await device.close();

            controller = await site.addController({ index: 1 });
            (controller.env.get(Crypto) as MockCrypto).entropic = true;

            device = await site.addDevice({ index: 2, online: false });

            return { controller, device };
        });
    });
});

async function testEventualSubscription(
    restart: (inputs: {
        site: MockSite;
        controller: ServerNode<MockServerNode.RootEndpoint>;
        device: ServerNode<MockServerNode.RootEndpoint>;
    }) => Promise<{
        controller: ServerNode<MockServerNode.RootEndpoint>;
        device: ServerNode<MockServerNode.RootEndpoint>;
    }>,
) {
    await using site = new MockSite();
    let { controller, device } = await site.addCommissionedPair();
    await subscribedPeer(controller, "peer1");

    ({ controller, device } = await MockTime.resolve(restart({ site, controller, device })));

    await controller.start();
    await MockTime.resolve(Time.sleep("delaying before device start", Minutes(5)));

    expect(device.lifecycle.isOnline).false;
    await device.start();

    await subscribedPeer(controller, "peer1");
}

async function expectUnreachable(promise: Promise<any>) {
    try {
        return await MockTime.resolve(promise);
    } catch (e) {
        expect(causedBy(e, PeerUnreachableError));
    }
}
