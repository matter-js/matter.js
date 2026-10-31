/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { CommissioningClient } from "#behavior/system/commissioning/CommissioningClient.js";
import { SubscriptionStore } from "#behavior/system/subscriptions/SubscriptionStore.js";
import { ServerNode } from "#node/ServerNode.js";
import { Crypto, Entropy, Environment, Millis, MockCrypto } from "@matter/general";
import { MockServerNode, MockSite, subscribedPeer } from "@matter/node/testing";
import { ClientSubscribe, PeerAddress, SessionManager, Subscribe } from "@matter/protocol";
import { NodeId } from "@matter/types";
import { commission } from "../../../node/icd-helpers.js";

function activeSubscriptionsOf(node: ServerNode) {
    return Object.values(node.state.sessions.sessions).reduce(
        (count, { numberOfActiveSubscriptions }) => count + numberOfActiveSubscriptions,
        0,
    );
}

describe("SubscriptionsServer", () => {
    before(() => {
        MockTime.init();
    });

    it("re-establishes a subscription after the first restart of a freshly commissioned node", async () => {
        await using site = new MockSite();
        const { controller, device } = await site.addCommissionedPair();
        await subscribedPeer(controller, "peer1");
        expect(activeSubscriptionsOf(device)).equals(1);

        await MockTime.resolve(device.close());
        const restarted = await MockTime.resolve(site.addDevice({ index: 2 }));

        // Right after start only the node itself can have restored the subscription; the controller resubscribes only
        // once its subscription times out
        expect(activeSubscriptionsOf(restarted)).equals(1);
    });

    it("re-establishes a subscription after the first restart of a node commissioned again after a factory reset", async () => {
        await using site = new MockSite();
        const { controller, device } = await site.addCommissionedPair();
        await subscribedPeer(controller, "peer1");

        await MockTime.resolve(device.erase());
        await commission(controller, device);
        await subscribedPeer(controller, "peer2");
        expect(activeSubscriptionsOf(device)).equals(1);

        await MockTime.resolve(device.close());
        const restarted = await MockTime.resolve(site.addDevice({ index: 2 }));

        expect(activeSubscriptionsOf(restarted)).equals(1);
    });

    it("re-establishes a subscription after each stop() and start()", async () => {
        await using site = new MockSite();
        const { controller, device } = await site.addCommissionedPair();
        await subscribedPeer(controller, "peer1");

        for (let run = 0; run < 2; run++) {
            await MockTime.resolve(device.stop());
            await MockTime.resolve(device.start());

            expect(activeSubscriptionsOf(device)).equals(1);
            expect(await storedSubscriptionsOf(device)).length(1);
        }
    });

    it("drops a subscription it could not re-establish after stop() and start()", async () => {
        await using site = new MockSite();
        const environment = new Environment("device2");
        const crypto = MockCrypto(2);
        environment.set(Entropy, crypto);
        environment.set(Crypto, crypto);
        const { controller, device } = await site.addCommissionedPair({
            device: { type: MockServerNode.RootEndpoint, environment },
        });
        await subscribedPeer(controller, "peer1");
        expect(await storedSubscriptionsOf(device)).length(1);

        // Without entropy the controller's new subscription gets the id of the one it replaces
        crypto.entropic = true;
        await MockTime.resolve(device.stop());
        await MockTime.resolve(controller.stop());
        await MockTime.resolve(device.start());
        await MockTime.resolve(controller.start());
        await subscribedPeer(controller, "peer1");

        expect(activeSubscriptionsOf(device)).equals(1);
        expect(await storedSubscriptionsOf(device)).length(1);
    });

    it("drops the stored subscription when the peer closes its session while the node keeps running", async () => {
        await using site = new MockSite();
        const { controller, device } = await site.addCommissionedPair();
        const peer1 = await subscribedPeer(controller, "peer1");
        const [{ subscriptionId }] = await storedSubscriptionsOf(device);

        const peerAddress = peer1.stateOf(CommissioningClient).peerAddress!;
        for (const session of controller.env.get(SessionManager).sessionsFor(peerAddress)) {
            await MockTime.resolve(session.initiateClose());
        }
        await MockTime.resolve(MockTime.sleep("close handled", Millis(100)));

        expect(await storedIdsOf(device)).not.includes(subscriptionId);
    });

    it("drops every stored subscription of a session the peer closes", async () => {
        await using site = new MockSite();
        const { controller, device } = await site.addCommissionedPair();
        const peer1 = await subscribedPeer(controller, "peer1");
        const request: ClientSubscribe = { ...Subscribe({ attributes: [{}] }), sustain: false };
        await MockTime.resolve(peer1.interaction.subscribe(request));
        const created = await storedIdsOf(device);
        expect(created).length(2);

        const peerAddress = peer1.stateOf(CommissioningClient).peerAddress!;
        for (const session of controller.env.get(SessionManager).sessionsFor(peerAddress)) {
            await MockTime.resolve(session.initiateClose());
        }
        await MockTime.resolve(MockTime.sleep("close handled", Millis(100)));

        expect((await storedIdsOf(device)).filter(id => created.includes(id))).deep.equals([]);
    });

    it("drops the stored subscription when the node closes the session while it keeps running", async () => {
        await using site = new MockSite();
        const { controller, device } = await site.addCommissionedPair();
        await subscribedPeer(controller, "peer1");
        const [{ subscriptionId }] = await storedSubscriptionsOf(device);

        for (const session of [...device.env.get(SessionManager).sessions]) {
            await MockTime.resolve(session.initiateClose());
        }
        await MockTime.resolve(MockTime.sleep("close handled", Millis(100)));

        expect(await storedIdsOf(device)).not.includes(subscriptionId);
    });

    it("re-establishes the newest stored subscription of a peer first", async () => {
        await using site = new MockSite();
        const { controller, device } = await site.addCommissionedPair();
        await subscribedPeer(controller, "peer1");
        const [live] = await storedSubscriptionsOf(device);

        // An older entry the controller no longer knows, as left by a restart before the node noticed it was gone
        const stale = { ...live, subscriptionId: live.subscriptionId ^ 1 };
        await device.env.get(SubscriptionStore).save(live.peerAddress, [stale, live]);

        await MockTime.resolve(device.stop());
        await MockTime.resolve(device.start());

        expect(activeSubscriptionsOf(device)).equals(1);
        expect(await storedIdsOf(device)).deep.equals([live.subscriptionId]);
    });
    it("keeps the stored subscriptions of a peer in creation order across restarts", async () => {
        await using site = new MockSite();
        const { controller, device } = await site.addCommissionedPair();
        const peer1 = await subscribedPeer(controller, "peer1");
        const request: ClientSubscribe = { ...Subscribe({ attributes: [{}] }), sustain: false };
        await MockTime.resolve(peer1.interaction.subscribe(request));
        const created = await storedIdsOf(device);
        expect(created).length(2);

        for (let run = 0; run < 2; run++) {
            await MockTime.resolve(device.stop());
            await MockTime.resolve(device.start());

            expect(activeSubscriptionsOf(device)).equals(2);
            expect(await storedIdsOf(device)).deep.equals(created);
        }
    });

    it("drops the stored subscriptions of a peer that does not return after a restart", async () => {
        await using site = new MockSite();
        const { controller, device } = await site.addCommissionedPair();
        await subscribedPeer(controller, "peer1");
        const [live] = await storedSubscriptionsOf(device);
        const gone = PeerAddress({ ...live.peerAddress, nodeId: NodeId(0x999) });
        await device.env.get(SubscriptionStore).save(gone, [{ ...live, subscriptionId: live.subscriptionId ^ 1 }]);

        await MockTime.resolve(device.stop());
        await MockTime.resolve(device.start());

        expect(await storedIdsOf(device)).deep.equals([live.subscriptionId]);
    });

    it("stores the subscriptions of a peer under that peer's own key", async () => {
        await using site = new MockSite();
        const { controller, device } = await site.addCommissionedPair();
        await subscribedPeer(controller, "peer1");
        const [live] = await storedSubscriptionsOf(device);
        const { fabricIndex, nodeId } = live.peerAddress;

        const storage = site.storageFor(device);

        expect(Object.keys(storage[`subscriptions.${fabricIndex}`])).deep.equals([nodeId.toString(16)]);
        expect(storage["root.subscriptions"]?.subscriptions).undefined;
    });

    it("clears stored subscriptions and the old state list at start when persistence is off", async () => {
        await using site = new MockSite();
        const { controller, device } = await site.addCommissionedPair();
        await subscribedPeer(controller, "peer1");
        const [live] = await storedSubscriptionsOf(device);
        await MockTime.resolve(device.close());

        const storage = site.storageFor(device);
        const { peerAddress: _peerAddress, ...legacy } = live;
        storage["root.subscriptions"] = { subscriptions: [legacy] };

        const restarted = await MockTime.resolve(
            site.addDevice({ index: 2, subscriptions: { persistenceEnabled: false } }),
        );

        expect(activeSubscriptionsOf(restarted)).equals(0);
        expect(await storedIdsOf(restarted)).deep.equals([]);
        expect(storage["root.subscriptions"]?.subscriptions).undefined;
    });

    it("starts and deletes a stored entry that is not a list of subscriptions", async () => {
        await using site = new MockSite();
        const { controller, device } = await site.addCommissionedPair();
        await subscribedPeer(controller, "peer1");
        const [live] = await storedSubscriptionsOf(device);
        await MockTime.resolve(device.close());

        const storage = site.storageFor(device);
        storage[`subscriptions.${live.peerAddress.fabricIndex}`]["999"] = "corrupt";

        const restarted = await MockTime.resolve(site.addDevice({ index: 2 }));

        expect(storage[`subscriptions.${live.peerAddress.fabricIndex}`]).not.have.property("999");
        expect(await storedIdsOf(restarted)).deep.equals([live.subscriptionId]);
    });

    it("clears the stored subscriptions on factory reset", async () => {
        await using site = new MockSite();
        const { controller, device } = await site.addCommissionedPair();
        await subscribedPeer(controller, "peer1");
        const [live] = await storedSubscriptionsOf(device);
        await MockTime.resolve(device.stop());
        await device.env.get(SubscriptionStore).save(live.peerAddress, [live]);

        await MockTime.resolve(device.erase());

        expect(Object.keys(site.storageFor(device)).filter(key => key.startsWith("subscriptions."))).deep.equals([]);
    });

    it("erases the subscription list that older versions stored in the behavior state", async () => {
        await using site = new MockSite();
        const { controller, device } = await site.addCommissionedPair();
        await subscribedPeer(controller, "peer1");
        const [live] = await storedSubscriptionsOf(device);
        await MockTime.resolve(device.close());

        const storage = site.storageFor(device);
        const { peerAddress: _peerAddress, ...legacy } = live;
        storage["root.subscriptions"] = { subscriptions: [{ ...legacy, subscriptionId: live.subscriptionId ^ 1 }] };

        const restarted = await MockTime.resolve(site.addDevice({ index: 2 }));

        expect(storage["root.subscriptions"]?.subscriptions).undefined;
        expect(await storedIdsOf(restarted)).deep.equals([live.subscriptionId]);
    });
});

function storedSubscriptionsOf(node: ServerNode) {
    return node.env.get(SubscriptionStore).load();
}

async function storedIdsOf(node: ServerNode) {
    return (await storedSubscriptionsOf(node)).map(({ subscriptionId }) => subscriptionId);
}
