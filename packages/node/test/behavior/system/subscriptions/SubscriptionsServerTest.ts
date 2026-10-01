/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { SubscriptionsServer } from "#behavior/system/subscriptions/SubscriptionsServer.js";
import { ServerNode } from "#node/ServerNode.js";
import { Crypto, Entropy, Environment, MockCrypto } from "@matter/general";
import { commission } from "../../../node/icd-helpers.js";
import { MockServerNode } from "../../../node/mock-server-node.js";
import { MockSite } from "../../../node/mock-site.js";
import { subscribedPeer } from "../../../node/node-helpers.js";

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
            expect(device.stateOf(SubscriptionsServer).subscriptions.length).equals(1);
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
        expect(device.stateOf(SubscriptionsServer).subscriptions.length).equals(1);

        // Without entropy the controller's new subscription gets the id of the one it replaces
        crypto.entropic = true;
        await MockTime.resolve(device.stop());
        await MockTime.resolve(controller.stop());
        await MockTime.resolve(device.start());
        await MockTime.resolve(controller.start());
        await subscribedPeer(controller, "peer1");

        expect(activeSubscriptionsOf(device)).equals(1);
        expect(device.stateOf(SubscriptionsServer).subscriptions.length).equals(1);
    });
});
