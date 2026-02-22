/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { OnOffClient } from "#behaviors/on-off";
import { causedBy, Crypto, LogDestination, Logger, LogLevel, Minutes, MockCrypto, Seconds, Time } from "#general";
import { NetworkClient, ServerNode } from "#index.js";
import { ClientSubscription, PeerUnreachableError, SustainedSubscription } from "#protocol";
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
        await MockTime.resolve(device.cancel());

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
        await MockTime.resolve(device.cancel());

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
