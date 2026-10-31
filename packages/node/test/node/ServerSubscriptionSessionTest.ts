/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { BasicInformationClient, BasicInformationServer } from "#behaviors/basic-information";
import type { ClientNode } from "#node/ClientNode.js";
import type { ServerNode } from "#node/ServerNode.js";
import { Millis, Seconds } from "@matter/general";
import { MockSite, subscribedPeer } from "@matter/node/testing";
import { ClientSubscriptions, NodeSession, PeerSet, SessionClosedError, SessionManager } from "@matter/protocol";

function openSessionsOf(device: ServerNode) {
    return device.env.get(SessionManager).sessions.filter(session => !session.isClosing);
}

async function resubscribedSession(device: ServerNode, formerSession: NodeSession) {
    const find = () =>
        openSessionsOf(device).find(session => session !== formerSession && session.subscriptions.size > 0);
    for (let i = 0; i < 30 && find() === undefined; i++) {
        await MockTime.resolve(MockTime.sleep("wait for resubscribe", Seconds(1)));
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

describe("ServerSubscriptionSession", () => {
    before(() => {
        MockTime.init();
    });

    it("reports on the newest session when the controller dropped an older one without telling the device", async () => {
        await using site = new MockSite();
        const { controller, device } = await site.addCommissionedPair();
        const peer = await subscribedPeer(controller, "peer1");
        const address = peer.peerAddress!;

        const sessions = openSessionsOf(device);
        expect(sessions.length).equals(1);
        const [formerSession] = sessions;

        // Only the controller forgets its sessions, so the device keeps the former session open
        await MockTime.resolve(controller.env.get(PeerSet).for(address).disconnect(new SessionClosedError("test")));
        controller.env.get(ClientSubscriptions).closeForPeer(address);

        const newSession = await resubscribedSession(device, formerSession);
        expect(newSession).not.undefined;
        expect(formerSession.isClosing).false;

        // The controller's last message reached the device on the former session before the controller dropped it
        await MockTime.advance(Millis(1));
        formerSession.notifyActivity(true);
        expect(formerSession.activeTimestamp).greaterThan(newSession!.activeTimestamp);

        await nodeLabelReachesController(device, peer, "after unannounced drop");
    });
});
