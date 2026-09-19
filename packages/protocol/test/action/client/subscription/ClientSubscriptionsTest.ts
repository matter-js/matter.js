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
    Duration,
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

    describe("reportStarted", () => {
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
            subscriptions.reportStarted.on((peer, reported) => {
                announced.push([peer, reported]);
            });

            subscriptions.noteReportStarted(PEER, session);

            expect(announced.length).equal(1);
            expect(announced[0][0]).equal(PEER);
            expect(announced[0][1]).equal(session);
        });

        it("drops observers once closed", async () => {
            const session = await aSession();
            const subscriptions = new ClientSubscriptions(Lifetime("test client subscriptions"));
            let announced = 0;
            subscriptions.reportStarted.on(() => {
                announced++;
            });

            await subscriptions.close();
            subscriptions.noteReportStarted(PEER, session);

            expect(announced).equal(0);
        });
    });
});
