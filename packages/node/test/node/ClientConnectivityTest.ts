/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { OnOffClient } from "#behaviors/on-off";
import { NetworkClient } from "#index.js";
import { causedBy, Crypto, Minutes, MockCrypto, Seconds, Time } from "@matter/general";
import { ClientSubscription, PeerUnreachableError, SustainedSubscription } from "@matter/protocol";
import { MockSite } from "./mock-site.js";
import { subscribedPeer } from "./node-helpers.js";

describe("ClientConnectivityTest", () => {
    before(() => {
        MockTime.init();

        // Required for crypto to succeed
        MockTime.macrotasks = true;
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

    it.only("reconnects and updates connection status", async () => {
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
});

async function expectUnreachable(promise: Promise<any>) {
    try {
        return await MockTime.resolve(promise);
    } catch (e) {
        expect(causedBy(e, PeerUnreachableError));
    }
}
