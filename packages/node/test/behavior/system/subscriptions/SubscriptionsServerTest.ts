/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { ServerNode } from "#node/ServerNode.js";
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
});
