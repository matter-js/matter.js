/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { ClientSubscriptions } from "#action/client/subscription/ClientSubscriptions.js";
import { PeerSubscription } from "#action/client/subscription/PeerSubscription.js";
import { PeerAddress } from "#peer/PeerAddress.js";
import { Duration, Lifetime, Seconds, Time, Timestamp } from "@matter/general";
import { FabricIndex, NodeId } from "@matter/types";

const PEER = PeerAddress({ fabricIndex: FabricIndex(1), nodeId: NodeId(1) });

function fakePeerSub(timeout: Duration, timedOut: () => void): PeerSubscription {
    return {
        peer: PEER,
        subscriptionId: 1,
        isReading: false,
        timeout,
        timedOut,
    } as unknown as PeerSubscription;
}

describe("ClientSubscriptions", () => {
    beforeEach(() => MockTime.reset());

    describe("resetTimer", () => {
        it("expires a subscription that times out at the current instant", async () => {
            const subscriptions = new ClientSubscriptions(Lifetime("test client subscriptions"));
            let timedOutCount = 0;
            const subscription = fakePeerSub(Seconds(10), () => timedOutCount++);

            subscriptions.addPeer(subscription);
            expect(subscription.timeoutAt).equal(Timestamp(Time.nowMs + Seconds(10)));

            await MockTime.advance(Seconds(10));

            expect(timedOutCount).equal(1);
        });
    });
});
