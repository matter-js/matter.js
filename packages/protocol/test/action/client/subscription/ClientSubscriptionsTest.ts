/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { ClientSubscriptions } from "#action/client/subscription/ClientSubscriptions.js";
import { PeerSubscription } from "#action/client/subscription/PeerSubscription.js";
import { PeerAddress } from "#peer/PeerAddress.js";
import type { SecureSession } from "#session/SecureSession.js";
import { Duration, ImplementationError, Lifetime, Seconds, Time, Timestamp } from "@matter/general";
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

    describe("reportStarted", () => {
        const SESSION = {} as SecureSession;

        it("announces a report with its peer and session", () => {
            const subscriptions = new ClientSubscriptions(Lifetime("test client subscriptions"));
            const announced = new Array<[PeerAddress, SecureSession]>();
            subscriptions.reportStarted.on((peer, session) => {
                announced.push([peer, session]);
            });

            subscriptions.noteReportStarted(PEER, SESSION);

            expect(announced.length).equal(1);
            expect(announced[0][0]).equal(PEER);
            expect(announced[0][1]).equal(SESSION);
        });

        it("survives a listener that throws", () => {
            const subscriptions = new ClientSubscriptions(Lifetime("test client subscriptions"));
            let reached = 0;
            subscriptions.reportStarted.on(() => {
                throw new ImplementationError("listener is broken");
            });
            subscriptions.reportStarted.on(() => {
                reached++;
            });

            // A listener must not be able to abort the report the caller is in the middle of reading.
            expect(() => subscriptions.noteReportStarted(PEER, SESSION)).not.throw();
            expect(reached).equal(1);
        });

        it("drops listeners once closed", async () => {
            const subscriptions = new ClientSubscriptions(Lifetime("test client subscriptions"));
            let announced = 0;
            subscriptions.reportStarted.on(() => {
                announced++;
            });

            await subscriptions.close();
            subscriptions.noteReportStarted(PEER, SESSION);

            expect(announced).equal(0);
        });
    });
});
