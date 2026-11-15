/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { PeerSubscription } from "#action/client/subscription/PeerSubscription.js";
import { Subscribe } from "#action/request/Subscribe.js";
import { PeerAddress } from "#peer/PeerAddress.js";
import { Lifetime, LogDestination, Logger, Seconds } from "@matter/general";
import { FabricIndex, NodeId } from "@matter/types";

function aSubscription({ compactPriming = true, onClosed = () => {} } = {}) {
    return new PeerSubscription({
        request: Subscribe({}),
        peer: PeerAddress({ fabricIndex: FabricIndex(1), nodeId: NodeId(1) }),
        closed: onClosed,
        lifetime: Lifetime("test peer subscription"),
        response: { subscriptionId: 1, interactionModelRevision: 12, maxInterval: 60 },
        maxPeerResponseTime: Seconds(10),
        compactPriming,
    });
}

describe("PeerSubscription", () => {
    let logged: Array<string>;

    beforeEach(() => {
        logged = new Array<string>();
        Logger.destinations.capture = LogDestination({
            add(message) {
                logged.push(message.values.join(" "));
            },
        });
    });

    afterEach(() => {
        delete Logger.destinations.capture;
    });

    const lossLogs = () => logged.filter(line => line.includes("did not acknowledge"));

    describe("reportStatusUnacknowledged", () => {
        it("closes the subscription and logs the loss", () => {
            let closed = 0;
            const subscription = aSubscription({ onClosed: () => closed++ });

            subscription.reportStatusUnacknowledged(subscription.nextReportNumber(), "final");

            expect(closed).equal(1);
            expect(subscription.isClosed).true;
            expect(lossLogs().length).equal(1);
        });

        it("keeps a subscription without compact priming after an unacknowledged final status", () => {
            const subscription = aSubscription({ compactPriming: false });

            subscription.reportStatusUnacknowledged(subscription.nextReportNumber(), "final");

            expect(subscription.isClosed).false;
        });

        it("keeps a subscription created without a compact priming flag after an unacknowledged final status", () => {
            const subscription = new PeerSubscription({
                request: Subscribe({}),
                peer: PeerAddress({ fabricIndex: FabricIndex(1), nodeId: NodeId(1) }),
                closed: () => {},
                lifetime: Lifetime("test peer subscription"),
                response: { subscriptionId: 1, interactionModelRevision: 12, maxInterval: 60 },
                maxPeerResponseTime: Seconds(10),
            });

            subscription.reportStatusUnacknowledged(subscription.nextReportNumber(), "final");

            expect(subscription.isClosed).false;
        });

        it("closes a subscription without compact priming after an unacknowledged chunk status", () => {
            const subscription = aSubscription({ compactPriming: false });

            subscription.reportStatusUnacknowledged(subscription.nextReportNumber(), "chunk");

            expect(subscription.isClosed).true;
        });

        it("keeps a subscription on which a newer report started", () => {
            const subscription = aSubscription();
            const unacknowledged = subscription.nextReportNumber();
            subscription.nextReportNumber();

            subscription.reportStatusUnacknowledged(unacknowledged, "chunk");

            expect(subscription.isClosed).false;
        });

        it("logs nothing for a subscription that is already closed", () => {
            const subscription = aSubscription();
            subscription.close();

            subscription.reportStatusUnacknowledged(subscription.nextReportNumber(), "final");

            expect(lossLogs()).deep.equal([]);
        });
    });
});
