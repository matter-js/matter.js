/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { SessionsBehavior } from "#behavior/system/sessions/SessionsBehavior.js";
import { BasicInformationClient, BasicInformationServer } from "#behaviors/basic-information";
import type { ClientNode } from "#node/ClientNode.js";
import type { ServerNode } from "#node/ServerNode.js";
import { Bytes, CryptoError, Seconds, UnexpectedDataError } from "@matter/general";
import { MockSite, subscribedPeer } from "@matter/node/testing";
import {
    CaseServerMessenger,
    ClientSubscriptions,
    FabricManager,
    NodeSession,
    PeerAckMissingError,
    PeerAddress,
    PeerSet,
    RESUME2_MIC_NONCE,
    SessionClosedError,
    SessionManager,
} from "@matter/protocol";

function openSessionsOf(device: ServerNode) {
    return device.env.get(SessionManager).sessions.filter(session => !session.isClosing);
}

async function newSessionOf(device: ServerNode, formerSession: NodeSession, accepts = (_session: NodeSession) => true) {
    const find = () =>
        openSessionsOf(device).find(
            session => session !== formerSession && !session.isEstablishing && accepts(session),
        );
    for (let i = 0; i < 30 && find() === undefined; i++) {
        await MockTime.resolve(MockTime.sleep("wait for session", Seconds(1)));
    }
    return find();
}

/** The sessions the device creates in the establishing state, which it does for each session as CASE responder. */
function establishingSessionsOf(device: ServerNode) {
    const establishing = new Array<NodeSession>();
    device.env.get(SessionManager).registeredSessions.added.on(session => {
        if (session.isEstablishing) {
            establishing.push(session);
        }
    });
    return establishing;
}

/** The sessions the device's peer for {@link address} announces, in order. */
function peerSessionsAddedOf(device: ServerNode, address: PeerAddress) {
    const added = new Array<NodeSession>();
    device.env
        .get(PeerSet)
        .get(address)
        ?.sessions.added.on(session => {
            added.push(session);
        });
    return added;
}

/** The device's peer for {@link address}. */
function peerOf(device: ServerNode, address: PeerAddress) {
    const peer = device.env.get(PeerSet).get(address);
    expect(peer).not.undefined;
    return peer!;
}

/**
 * Replaces `CaseServerMessenger.prototype.sendSuccess`, which sends SigmaFinished for a new session, with
 * {@link send} until the returned function restores it.
 */
function replaceSendSuccess(
    send: (
        this: CaseServerMessenger,
        original: CaseServerMessenger["sendSuccess"],
        ...args: Parameters<CaseServerMessenger["sendSuccess"]>
    ) => Promise<void>,
) {
    const { sendSuccess } = CaseServerMessenger.prototype;
    CaseServerMessenger.prototype.sendSuccess = function (this: CaseServerMessenger, ...args) {
        return send.call(this, sendSuccess.bind(this), ...args);
    };
    return () => {
        CaseServerMessenger.prototype.sendSuccess = sendSuccess;
    };
}

function activeSubscriptionsOf(device: ServerNode, session: NodeSession) {
    return device.stateOf(SessionsBehavior).sessions[session.id]?.numberOfActiveSubscriptions;
}

async function nodeLabelReachesController(device: ServerNode, peer: ClientNode, nodeLabel: string) {
    await device.setStateOf(BasicInformationServer, { nodeLabel });
    for (let i = 0; i < 5 && peer.stateOf(BasicInformationClient).nodeLabel !== nodeLabel; i++) {
        await MockTime.resolve(MockTime.sleep("wait for report", Seconds(1)));
    }
    expect(peer.stateOf(BasicInformationClient).nodeLabel).equals(nodeLabel);
}

/** Close the controller's sessions with the device without telling the device. */
async function dropSessionsOnController(controller: ServerNode, address: PeerAddress) {
    await MockTime.resolve(controller.env.get(PeerSet).for(address).disconnect(new SessionClosedError("test")));
}

/** Drop the controller's sessions and let it connect again, which resumes the session if both sides kept the record. */
async function reconnect(controller: ServerNode, address: PeerAddress) {
    await dropSessionsOnController(controller, address);
    await MockTime.resolve(controller.env.get(PeerSet).for(address).connect());
}

describe("ServerSubscriptionSession", () => {
    before(() => {
        MockTime.init();
    });

    it("reports on its own session when a session the controller dropped was active at the same time", async () => {
        await using site = new MockSite();
        const { controller, device } = await site.addCommissionedPair();
        const peer = await subscribedPeer(controller, "peer1");
        const address = peer.peerAddress!;
        const [formerSession] = openSessionsOf(device);

        await dropSessionsOnController(controller, address);
        controller.env.get(ClientSubscriptions).closeForPeer(address);

        const newSession = await newSessionOf(device, formerSession, session => session.subscriptions.size > 0);
        expect(newSession).not.undefined;
        expect(formerSession.isClosing).false;

        // The state an update of the operational certificate left behind: equal activity on both sessions
        formerSession.activeTimestamp = newSession!.activeTimestamp;

        await nodeLabelReachesController(device, peer, "after unannounced drop");
    });

    it("moves to each resumed session once the controller confirms it, announced once", async () => {
        await using site = new MockSite();
        const { controller, device } = await site.addCommissionedPair();
        const peer = await subscribedPeer(controller, "peer1");
        const address = peer.peerAddress!;
        const [formerSession] = openSessionsOf(device);
        const [subscription] = formerSession.subscriptions;
        const resumed = establishingSessionsOf(device);
        let added = 0;
        device.eventsOf(SessionsBehavior).subscriptionAdded.on(() => {
            added++;
        });

        // The session the device would use for the controller while the first resumption awaits its confirmation
        const sessionsInUse = new Array<NodeSession | undefined>();
        const { waitForSuccess } = CaseServerMessenger.prototype;
        CaseServerMessenger.prototype.waitForSuccess = async function (
            this: CaseServerMessenger,
            ...args: Parameters<typeof waitForSuccess>
        ) {
            if (args[0]?.description === "Sigma2Resume-Success" && !sessionsInUse.length) {
                sessionsInUse.push(device.env.get(SessionManager).maybeSessionFor(formerSession.peerAddress));
            }
            return waitForSuccess.apply(this, args);
        };
        try {
            await reconnect(controller, address);
            await MockTime.yield3();
        } finally {
            CaseServerMessenger.prototype.waitForSuccess = waitForSuccess;
        }

        expect(resumed).length(1);
        expect(resumed[0].activeTimestamp).greaterThan(formerSession.activeTimestamp);
        expect(sessionsInUse).deep.equals([formerSession]);
        const [first] = resumed;
        expect(first.isEstablishing).false;
        expect([...first.subscriptions]).deep.equals([subscription]);
        expect([...formerSession.subscriptions]).deep.equals([]);
        expect(activeSubscriptionsOf(device, formerSession)).equals(0);
        expect(activeSubscriptionsOf(device, first)).equals(1);

        await reconnect(controller, address);
        await MockTime.yield3();

        expect(resumed).length(2);
        const second = resumed[1];
        expect([...second.subscriptions]).deep.equals([subscription]);
        expect(activeSubscriptionsOf(device, first)).equals(0);
        expect(activeSubscriptionsOf(device, second)).equals(1);
        expect(added).equals(0);

        await formerSession.initiateForceClose({ cause: new SessionClosedError("test") });
        await first.initiateForceClose({ cause: new SessionClosedError("test") });
        expect(subscription.isTerminated).false;

        await nodeLabelReachesController(device, peer, "after former sessions closed");
        expect(added).equals(0);
    });

    it("closes a resumed session the controller does not confirm and leaves the subscriptions on their session", async () => {
        await using site = new MockSite();
        const { controller, device } = await site.addCommissionedPair();
        const peer = await subscribedPeer(controller, "peer1");
        const address = peer.peerAddress!;
        const [formerSession] = openSessionsOf(device);
        const [subscription] = formerSession.subscriptions;
        const resumed = establishingSessionsOf(device);

        let refused = 0;
        const { waitForSuccess } = CaseServerMessenger.prototype;
        CaseServerMessenger.prototype.waitForSuccess = async function (
            this: CaseServerMessenger,
            ...args: Parameters<typeof waitForSuccess>
        ) {
            if (args[0]?.description === "Sigma2Resume-Success") {
                refused++;
                throw new UnexpectedDataError("test: no confirmation of the resumption");
            }
            return waitForSuccess.apply(this, args);
        };
        try {
            await reconnect(controller, address);
            await MockTime.yield3();
        } finally {
            CaseServerMessenger.prototype.waitForSuccess = waitForSuccess;
        }

        expect(refused).equals(1);
        expect(resumed).length(1);
        expect(resumed[0].isClosing).true;
        expect(device.env.get(SessionManager).sessions.has(resumed[0])).false;
        expect([...formerSession.subscriptions]).deep.equals([subscription]);
        expect(subscription.isTerminated).false;
    });

    it("closes a resumed session when Sigma2Resume cannot be sent", async () => {
        await using site = new MockSite();
        const { controller, device } = await site.addCommissionedPair();
        const peer = await subscribedPeer(controller, "peer1");
        const address = peer.peerAddress!;
        const [formerSession] = openSessionsOf(device);
        const [subscription] = formerSession.subscriptions;
        const resumed = establishingSessionsOf(device);

        // Only the first attempt fails, so the controller's next attempt resumes
        let failed = 0;
        const { sendSigma2Resume } = CaseServerMessenger.prototype;
        CaseServerMessenger.prototype.sendSigma2Resume = async function (
            this: CaseServerMessenger,
            ...args: Parameters<typeof sendSigma2Resume>
        ) {
            if (failed++ === 0) {
                throw new UnexpectedDataError("test: Sigma2Resume not sent");
            }
            return sendSigma2Resume.apply(this, args);
        };
        try {
            await reconnect(controller, address);
            await MockTime.yield3();
        } finally {
            CaseServerMessenger.prototype.sendSigma2Resume = sendSigma2Resume;
        }

        expect(failed).equals(2);
        expect(resumed).length(2);
        expect(device.env.get(SessionManager).sessions.has(resumed[0])).false;
        expect([...resumed[1].subscriptions]).deep.equals([subscription]);
        expect(subscription.isTerminated).false;
    });

    it("closes a resumed session when its Sigma2Resume cannot be built", async () => {
        await using site = new MockSite();
        const { controller, device } = await site.addCommissionedPair();
        const peer = await subscribedPeer(controller, "peer1");
        const address = peer.peerAddress!;
        const [formerSession] = openSessionsOf(device);
        const [subscription] = formerSession.subscriptions;
        const resumed = establishingSessionsOf(device);

        // Only the first attempt fails, so the controller's next attempt resumes
        const crypto = device.env.get(FabricManager).crypto;
        const { encrypt } = crypto;
        let failed = 0;
        crypto.encrypt = (...args: Parameters<typeof encrypt>) => {
            if (Bytes.areEqual(args[2], RESUME2_MIC_NONCE) && failed++ === 0) {
                throw new CryptoError("test: Sigma2Resume MIC not computed");
            }
            return encrypt.apply(crypto, args);
        };
        try {
            await reconnect(controller, address);
            await MockTime.yield3();
        } finally {
            crypto.encrypt = encrypt;
        }

        expect(failed).greaterThan(0);
        const [failedSession] = resumed;
        expect(failedSession.isClosing).true;
        expect(device.env.get(SessionManager).registeredSessions.has(failedSession)).false;
        expect(subscription.isTerminated).false;
    });

    it("does not complete a resumption whose session closed during the handshake", async () => {
        await using site = new MockSite();
        const { controller, device } = await site.addCommissionedPair();
        const peer = await subscribedPeer(controller, "peer1");
        const address = peer.peerAddress!;
        const [formerSession] = openSessionsOf(device);
        const [subscription] = formerSession.subscriptions;
        const sessions = device.env.get(SessionManager);
        const established = establishingSessionsOf(device);

        let saved = 0;
        const { saveResumptionRecord } = sessions;
        sessions.saveResumptionRecord = async (...args) => {
            saved++;
            return saveResumptionRecord.apply(sessions, args);
        };
        const { waitForSuccess } = CaseServerMessenger.prototype;
        CaseServerMessenger.prototype.waitForSuccess = async function (
            this: CaseServerMessenger,
            ...args: Parameters<typeof waitForSuccess>
        ) {
            const result = await waitForSuccess.apply(this, args);
            if (args[0]?.description === "Sigma2Resume-Success" && established.length === 1) {
                await established[0].initiateForceClose({ cause: new SessionClosedError("test") });
            }
            return result;
        };
        try {
            await reconnect(controller, address);
            await MockTime.yield3();
        } finally {
            CaseServerMessenger.prototype.waitForSuccess = waitForSuccess;
            sessions.saveResumptionRecord = saveResumptionRecord;
        }

        const [closedSession] = established;
        expect(closedSession.isEstablishing).true;
        expect(saved).equals(established.length - 1);
        expect([
            ...formerSession.subscriptions,
            ...established.flatMap(session => [...session.subscriptions]),
        ]).deep.equals([subscription]);
        expect(closedSession.subscriptions.size).equals(0);
    });

    it("moves to a new full CASE session once SigmaFinished went out, before its ack", async () => {
        await using site = new MockSite();
        const { controller, device } = await site.addCommissionedPair();
        const peer = await subscribedPeer(controller, "peer1");
        const address = peer.peerAddress!;
        const [formerSession] = openSessionsOf(device);
        const [subscription] = formerSession.subscriptions;
        await device.env.get(SessionManager).deleteResumptionRecord(formerSession.peerAddress);
        const established = establishingSessionsOf(device);
        const holder = () =>
            device.env.get(SessionManager).sessions.find(session => session.subscriptions.has(subscription));

        const holders = new Array<{ at: string; session?: NodeSession; unacked?: boolean }>();
        const restore = replaceSendSuccess(async function (original, abort, onTransmitted) {
            holders.push({ at: "send", session: holder() });
            await original(abort, () => {
                holders.push({ at: "transmitted", session: holder(), unacked: this.exchange.hasUnackedMessage });
                onTransmitted?.();
                holders.push({ at: "established", session: holder() });
            });
        });
        try {
            await reconnect(controller, address);
        } finally {
            restore();
        }

        expect(established).length(1);
        const [newSession] = established;
        expect(holders).deep.equals([
            { at: "send", session: formerSession },
            { at: "transmitted", session: formerSession, unacked: true },
            { at: "established", session: newSession },
        ]);
        expect(newSession.isEstablishing).false;
        expect([...newSession.subscriptions]).deep.equals([subscription]);
    });

    it("keeps a new full CASE session whose SigmaFinished went out but was not acknowledged", async () => {
        await using site = new MockSite();
        const { controller, device } = await site.addCommissionedPair();
        const peer = await subscribedPeer(controller, "peer1");
        const address = peer.peerAddress!;
        const [formerSession] = openSessionsOf(device);
        const [subscription] = formerSession.subscriptions;
        const sessions = device.env.get(SessionManager);
        await sessions.deleteResumptionRecord(formerSession.peerAddress);
        const established = establishingSessionsOf(device);

        const restore = replaceSendSuccess(async function (original, abort, onTransmitted) {
            await original(abort, onTransmitted);
            throw new PeerAckMissingError();
        });
        try {
            await reconnect(controller, address);
            await MockTime.yield3();
        } finally {
            restore();
        }

        expect(established).length(1);
        const [newSession] = established;
        expect(newSession.isClosing).false;
        expect(sessions.sessions.has(newSession)).true;
        expect([...newSession.subscriptions]).deep.equals([subscription]);
        expect(sessions.findResumptionRecordByAddress(formerSession.peerAddress)).not.undefined;

        await nodeLabelReachesController(device, peer, "after missing ack");
    });

    it("saves no resumption record when the send of SigmaFinished fails after it went out for another reason than a missing ack", async () => {
        await using site = new MockSite();
        const { controller, device } = await site.addCommissionedPair();
        const peer = await subscribedPeer(controller, "peer1");
        const address = peer.peerAddress!;
        const [formerSession] = openSessionsOf(device);
        const sessions = device.env.get(SessionManager);
        await sessions.deleteResumptionRecord(formerSession.peerAddress);
        const established = establishingSessionsOf(device);

        const restore = replaceSendSuccess(async function (original, abort, onTransmitted) {
            await original(abort, onTransmitted);
            throw new SessionClosedError("test: session closing while SigmaFinished waits for its ack");
        });
        try {
            await reconnect(controller, address);
            await MockTime.yield3();
        } finally {
            restore();
        }

        expect(established).length(1);
        expect(established[0].isEstablishing).false;
        expect(sessions.findResumptionRecordByAddress(formerSession.peerAddress)).undefined;
    });

    it("does not complete a new full CASE session that closed before SigmaFinished went out", async () => {
        await using site = new MockSite();
        const { controller, device } = await site.addCommissionedPair();
        const peer = await subscribedPeer(controller, "peer1");
        const address = peer.peerAddress!;
        const [formerSession] = openSessionsOf(device);
        const sessions = device.env.get(SessionManager);
        await sessions.deleteResumptionRecord(formerSession.peerAddress);
        const established = establishingSessionsOf(device);

        let saved = 0;
        const { saveResumptionRecord } = sessions;
        sessions.saveResumptionRecord = async (...args) => {
            saved++;
            return saveResumptionRecord.apply(sessions, args);
        };
        const restore = replaceSendSuccess(async function (original, abort, onTransmitted) {
            if (established.length === 1) {
                await established[0].initiateForceClose({ cause: new SessionClosedError("test") });
            }
            await original(abort, onTransmitted);
        });
        try {
            await reconnect(controller, address);
            await MockTime.yield3();
        } finally {
            restore();
            sessions.saveResumptionRecord = saveResumptionRecord;
        }

        const [closedSession] = established;
        expect(closedSession.isEstablishing).true;
        expect(sessions.sessions.has(closedSession)).false;
        expect(closedSession.subscriptions.size).equals(0);
        expect(saved).equals(established.length - 1);
    });

    it("serves a subscribe that arrives on a resumed session before the controller confirms it", async () => {
        await using site = new MockSite();
        const { controller, device } = await site.addCommissionedPair();
        const peer = await subscribedPeer(controller, "peer1");
        const address = peer.peerAddress!;
        const resumed = establishingSessionsOf(device);

        // Hold back the confirmation of the resumption until the controller's new subscription arrived
        const subscriptionsWhileEstablishing = new Array<number>();
        const { waitForSuccess } = CaseServerMessenger.prototype;
        CaseServerMessenger.prototype.waitForSuccess = async function (
            this: CaseServerMessenger,
            ...args: Parameters<typeof waitForSuccess>
        ) {
            const result = await waitForSuccess.apply(this, args);
            if (args[0]?.description === "Sigma2Resume-Success" && resumed.length === 1) {
                const [session] = resumed;
                for (let i = 0; i < 60 && session.subscriptions.size === 0; i++) {
                    await MockTime.sleep("wait for subscribe", Seconds(1));
                }
                expect(session.isEstablishing).true;
                subscriptionsWhileEstablishing.push(session.subscriptions.size);
            }
            return result;
        };
        try {
            await dropSessionsOnController(controller, address);
            controller.env.get(ClientSubscriptions).closeForPeer(address);
            for (let i = 0; i < 60 && !subscriptionsWhileEstablishing.length; i++) {
                await MockTime.resolve(MockTime.sleep("wait for resumption", Seconds(1)));
            }
        } finally {
            CaseServerMessenger.prototype.waitForSuccess = waitForSuccess;
        }

        expect(subscriptionsWhileEstablishing).deep.equals([1]);
        const [session] = resumed;
        await MockTime.yield3();
        expect(session.isEstablishing).false;
        expect(device.env.get(SessionManager).sessions.has(session)).true;
        expect(session.subscriptions.size).equals(1);
        await nodeLabelReachesController(device, peer, "subscribed while establishing");
    });

    it("closes a new full CASE session whose SigmaFinished cannot be sent", async () => {
        await using site = new MockSite();
        const { controller, device } = await site.addCommissionedPair();
        const peer = await subscribedPeer(controller, "peer1");
        const address = peer.peerAddress!;
        const [formerSession] = openSessionsOf(device);
        const [subscription] = formerSession.subscriptions;
        await device.env.get(SessionManager).deleteResumptionRecord(formerSession.peerAddress);
        const established = establishingSessionsOf(device);

        // Only the first attempt fails, so the controller's next attempt sets up a session
        let failed = 0;
        const restore = replaceSendSuccess(async function (original, abort, onTransmitted) {
            if (failed++ === 0) {
                throw new UnexpectedDataError("test: SigmaFinished not sent");
            }
            await original(abort, onTransmitted);
        });
        try {
            await reconnect(controller, address);
            await MockTime.yield3();
        } finally {
            restore();
        }

        expect(failed).greaterThan(1);
        const [failedSession] = established;
        expect(failedSession.isClosing).true;
        expect(device.env.get(SessionManager).sessions.has(failedSession)).false;
        expect(failedSession.subscriptions.size).equals(0);
        expect(subscription.isTerminated).false;
    });

    it("adds a resumed session to its peer only once the controller confirms it", async () => {
        await using site = new MockSite();
        const { controller, device } = await site.addCommissionedPair();
        const peer = await subscribedPeer(controller, "peer1");
        const address = peer.peerAddress!;
        const [formerSession] = openSessionsOf(device);
        const devicePeer = peerOf(device, formerSession.peerAddress);
        const added = peerSessionsAddedOf(device, formerSession.peerAddress);
        const established = establishingSessionsOf(device);

        const whileEstablishing = new Array<{ newest?: NodeSession; held: boolean }>();
        const { waitForSuccess } = CaseServerMessenger.prototype;
        CaseServerMessenger.prototype.waitForSuccess = async function (
            this: CaseServerMessenger,
            ...args: Parameters<typeof waitForSuccess>
        ) {
            if (args[0]?.description === "Sigma2Resume-Success") {
                whileEstablishing.push({
                    newest: devicePeer.newestSession(),
                    held: established.some(session => devicePeer.sessions.has(session)),
                });
            }
            return waitForSuccess.apply(this, args);
        };
        try {
            await reconnect(controller, address);
            await MockTime.yield3();
        } finally {
            CaseServerMessenger.prototype.waitForSuccess = waitForSuccess;
        }

        expect(established).length(1);
        expect(whileEstablishing).deep.equals([{ newest: formerSession, held: false }]);
        expect(added).deep.equals(established);
        expect(devicePeer.newestSession()).equals(established[0]);
    });

    it("does not mark its peer connected by a session whose handshake fails", async () => {
        await using site = new MockSite();
        const { controller, device } = await site.addCommissionedPair();
        const peer = await subscribedPeer(controller, "peer1");
        const address = peer.peerAddress!;
        const [formerSession] = openSessionsOf(device);
        const devicePeer = peerOf(device, formerSession.peerAddress);
        await MockTime.resolve(devicePeer.disconnect(new SessionClosedError("test")));
        expect(devicePeer.hasSession).false;
        const added = peerSessionsAddedOf(device, formerSession.peerAddress);
        const established = establishingSessionsOf(device);
        const openedNames = new Array<string>();
        device.eventsOf(SessionsBehavior).opened.on(session => {
            openedNames.push(session.name);
        });

        const hasSessionWhileEstablishing = new Array<boolean>();
        const { waitForSuccess } = CaseServerMessenger.prototype;
        CaseServerMessenger.prototype.waitForSuccess = async function (
            this: CaseServerMessenger,
            ...args: Parameters<typeof waitForSuccess>
        ) {
            if (args[0]?.description === "Sigma2Resume-Success") {
                hasSessionWhileEstablishing.push(devicePeer.hasSession);
                throw new UnexpectedDataError("test: no confirmation of the resumption");
            }
            return waitForSuccess.apply(this, args);
        };
        try {
            await reconnect(controller, address);
            await MockTime.yield3();
        } finally {
            CaseServerMessenger.prototype.waitForSuccess = waitForSuccess;
        }

        const [failedSession] = established;
        expect(failedSession.isClosing).true;
        expect(hasSessionWhileEstablishing).deep.equals([false]);
        expect(added).not.include(failedSession);
        expect(openedNames).not.include(`${failedSession.via}`);
        expect(device.stateOf(SessionsBehavior).sessions[failedSession.id]).undefined;
    });
});
