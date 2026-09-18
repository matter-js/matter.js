/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { ClientSubscriptions } from "#action/client/subscription/ClientSubscriptions.js";
import { PeerSubscription } from "#action/client/subscription/PeerSubscription.js";
import { FabricManager } from "#fabric/FabricManager.js";
import { PeerAddress } from "#peer/PeerAddress.js";
import type { NodeSession } from "#session/NodeSession.js";
import type { SecureSession } from "#session/SecureSession.js";
import { SessionManager } from "#session/SessionManager.js";
import { SessionParameters } from "#session/SessionParameters.js";
import {
    createPromise,
    Duration,
    ImplementationError,
    Lifetime,
    MemoryStorageDriver,
    Seconds,
    StandardCrypto,
    StorageContext,
    Time,
    Timestamp,
} from "@matter/general";
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

    describe("onReport", () => {
        async function aSession(): Promise<NodeSession> {
            const storage = new MemoryStorageDriver();
            storage.initialize();

            const sessions = new SessionManager({
                parameters: SessionParameters.defaults,
                fabrics: new FabricManager(new StandardCrypto()),
                storage: new StorageContext(storage, ["sessions"]),
            });
            await sessions.construction.ready;

            return sessions.createSecureSession({
                id: 100,
                fabric: undefined,
                peerNodeId: PEER.nodeId,
                peerSessionId: 0x8d4b,
                sharedSecret: new Uint8Array(),
                salt: new Uint8Array(),
                isInitiator: false,
                isResumption: false,
            });
        }

        it("announces a report with its peer and session", async () => {
            const session = await aSession();
            const subscriptions = new ClientSubscriptions(Lifetime("test client subscriptions"));
            const announced = new Array<[PeerAddress, SecureSession]>();
            subscriptions.onReport((peer, reported) => {
                announced.push([peer, reported]);
            });

            subscriptions.noteReportStarted(PEER, session);

            expect(announced.length).equal(1);
            expect(announced[0][0]).equal(PEER);
            expect(announced[0][1]).equal(session);
        });

        it("survives a listener that throws", async () => {
            const session = await aSession();
            const subscriptions = new ClientSubscriptions(Lifetime("test client subscriptions"));
            let reached = 0;
            subscriptions.onReport(() => {
                throw new ImplementationError("listener is broken");
            });
            subscriptions.onReport(() => {
                reached++;
            });

            // A listener must not be able to abort the report the caller is in the middle of reading.
            expect(() => subscriptions.noteReportStarted(PEER, session)).not.throw();
            expect(reached).equal(1);
        });

        it("does not wait for an asynchronous listener before reaching the rest", async () => {
            const session = await aSession();
            const subscriptions = new ClientSubscriptions(Lifetime("test client subscriptions"));
            let reached = 0;
            const { promise, resolver } = createPromise<void>();
            subscriptions.onReport(() => promise);
            subscriptions.onReport(() => {
                reached++;
            });

            subscriptions.noteReportStarted(PEER, session);

            expect(reached).equal(1);
            resolver();
            await promise;
        });

        it("survives an asynchronous listener that rejects", async () => {
            const session = await aSession();
            const subscriptions = new ClientSubscriptions(Lifetime("test client subscriptions"));
            let reached = 0;
            subscriptions.onReport(async () => {
                throw new ImplementationError("listener is broken");
            });
            subscriptions.onReport(() => {
                reached++;
            });

            expect(() => subscriptions.noteReportStarted(PEER, session)).not.throw();
            expect(reached).equal(1);

            // The rejection settles after this turn and must be handled by then, not raised at the process.
            await MockTime.yield();
        });

        it("drops listeners once closed", async () => {
            const session = await aSession();
            const subscriptions = new ClientSubscriptions(Lifetime("test client subscriptions"));
            let announced = 0;
            subscriptions.onReport(() => {
                announced++;
            });

            await subscriptions.close();
            subscriptions.noteReportStarted(PEER, session);

            expect(announced).equal(0);
        });
    });
});
