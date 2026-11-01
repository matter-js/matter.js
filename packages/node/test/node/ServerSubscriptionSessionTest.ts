/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { SessionsBehavior } from "#behavior/system/sessions/SessionsBehavior.js";
import { BasicInformationClient, BasicInformationServer } from "#behaviors/basic-information";
import type { ClientNode } from "#node/ClientNode.js";
import type { ServerNode } from "#node/ServerNode.js";
import { Seconds, UnexpectedDataError } from "@matter/general";
import { MockSite, subscribedPeer } from "@matter/node/testing";
import {
    CaseServerMessenger,
    ClientSubscriptions,
    NodeSession,
    PeerAddress,
    PeerSet,
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

/** The sessions the device creates in the establishing state, which it does for each resumption as responder. */
function resumedSessionsOf(device: ServerNode) {
    const resumed = new Array<NodeSession>();
    device.env.get(SessionManager).sessions.added.on(session => {
        if (session.isEstablishing) {
            resumed.push(session);
        }
    });
    return resumed;
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
        const resumed = resumedSessionsOf(device);
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
        const resumed = resumedSessionsOf(device);

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
        const resumed = resumedSessionsOf(device);

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

    // Characterization: a full CASE session is established when the device sends SigmaFinished, not once it is acked
    it("moves to a new full CASE session before SigmaFinished is acknowledged", async () => {
        await using site = new MockSite();
        const { controller, device } = await site.addCommissionedPair();
        const peer = await subscribedPeer(controller, "peer1");
        const address = peer.peerAddress!;
        const [formerSession] = openSessionsOf(device);
        const [subscription] = formerSession.subscriptions;
        await device.env.get(SessionManager).deleteResumptionRecord(formerSession.peerAddress);
        const resumed = resumedSessionsOf(device);

        const holderAtSigmaFinished = new Array<NodeSession | undefined>();
        const { sendSuccess } = CaseServerMessenger.prototype;
        CaseServerMessenger.prototype.sendSuccess = async function (
            this: CaseServerMessenger,
            ...args: Parameters<typeof sendSuccess>
        ) {
            holderAtSigmaFinished.push(openSessionsOf(device).find(session => session.subscriptions.has(subscription)));
            return sendSuccess.apply(this, args);
        };
        try {
            await reconnect(controller, address);
        } finally {
            CaseServerMessenger.prototype.sendSuccess = sendSuccess;
        }

        const newSession = await newSessionOf(device, formerSession);
        expect(newSession).not.undefined;
        expect(resumed).length(0);
        expect(holderAtSigmaFinished).deep.equals([newSession]);
        expect([...newSession!.subscriptions]).deep.equals([subscription]);
    });
});
