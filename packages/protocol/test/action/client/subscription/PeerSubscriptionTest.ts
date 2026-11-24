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

    const lossLogs = () => logged.filter(line => line.includes("lost:"));

    describe("reportInterrupted", () => {
        it("closes the subscription and logs the loss", () => {
            let closed = 0;
            const subscription = aSubscription({ onClosed: () => closed++ });

            subscription.reportInterrupted(subscription.nextReportNumber(), "final-unacknowledged");

            expect(closed).equal(1);
            expect(subscription.isClosed).true;
            expect(lossLogs().length).equal(1);
        });

        it("keeps a subscription without compact priming after an unacknowledged final status", () => {
            const subscription = aSubscription({ compactPriming: false });

            subscription.reportInterrupted(subscription.nextReportNumber(), "final-unacknowledged");

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

            subscription.reportInterrupted(subscription.nextReportNumber(), "final-unacknowledged");

            expect(subscription.isClosed).false;
        });

        it("closes a subscription without compact priming after an unacknowledged chunk status", () => {
            const subscription = aSubscription({ compactPriming: false });

            subscription.reportInterrupted(subscription.nextReportNumber(), "chunk-unacknowledged");

            expect(subscription.isClosed).true;
        });

        it("closes a subscription without compact priming after a missing chunk and logs the loss", () => {
            const subscription = aSubscription({ compactPriming: false });

            subscription.reportInterrupted(subscription.nextReportNumber(), "chunk-missing");

            expect(subscription.isClosed).true;
            expect(lossLogs().filter(line => line.includes("did not send the next chunk")).length).equal(1);
        });

        it("keeps a subscription on which a newer report started", () => {
            const subscription = aSubscription();
            const unacknowledged = subscription.nextReportNumber();
            subscription.nextReportNumber();

            subscription.reportInterrupted(unacknowledged, "chunk-unacknowledged");

            expect(subscription.isClosed).false;
        });

        it("logs nothing for a subscription that is already closed", () => {
            const subscription = aSubscription();
            subscription.close();

            subscription.reportInterrupted(subscription.nextReportNumber(), "final-unacknowledged");

            expect(lossLogs()).deep.equal([]);
        });
    });
});
