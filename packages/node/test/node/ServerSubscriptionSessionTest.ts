/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { SessionsBehavior } from "#behavior/system/sessions/SessionsBehavior.js";
import { BasicInformationClient, BasicInformationServer } from "#behaviors/basic-information";
import type { ClientNode } from "#node/ClientNode.js";
import type { ServerNode } from "#node/ServerNode.js";
import { Seconds } from "@matter/general";
import { MockSite, subscribedPeer } from "@matter/node/testing";
import {
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
    const find = () => openSessionsOf(device).find(session => session !== formerSession && accepts(session));
    for (let i = 0; i < 30 && find() === undefined; i++) {
        await MockTime.resolve(MockTime.sleep("wait for session", Seconds(1)));
    }
    return find();
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

    it("keeps reporting on a newer session after the session the subscription started on closes", async () => {
        await using site = new MockSite();
        const { controller, device } = await site.addCommissionedPair();
        const peer = await subscribedPeer(controller, "peer1");
        const address = peer.peerAddress!;
        const [formerSession] = openSessionsOf(device);
        const [subscription] = formerSession.subscriptions;
        let added = 0;
        device.eventsOf(SessionsBehavior).subscriptionAdded.on(() => {
            added++;
        });

        await dropSessionsOnController(controller, address);
        await MockTime.resolve(controller.env.get(PeerSet).for(address).connect());

        const newSession = await newSessionOf(device, formerSession);
        expect(newSession).not.undefined;
        expect([...newSession!.subscriptions]).deep.equals([subscription]);
        await MockTime.yield3();
        expect(added).equals(0);

        await formerSession.initiateForceClose({ cause: new SessionClosedError("test") });
        expect(subscription.isTerminated).false;

        await nodeLabelReachesController(device, peer, "after former session closed");
    });
});
