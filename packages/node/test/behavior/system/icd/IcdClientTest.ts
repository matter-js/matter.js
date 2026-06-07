/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { IcdClient } from "#behavior/system/icd/IcdClient.js";
import { IcdManagementServer } from "#behaviors/icd-management";
import { ServerNode } from "#node/index.js";
import { MockSite } from "../../../node/mock-site.js";

const RootWithIcd = ServerNode.RootEndpoint.with(IcdManagementServer);

describe("IcdClient", () => {
    before(() => {
        MockTime.init();
    });

    it("auto-installs on a ClientNode when the peer exposes IcdManagement", async () => {
        await using site = new MockSite();
        const { controller } = await site.addCommissionedPair({
            device: { type: RootWithIcd },
        });

        const peer1 = controller.peers.get("peer1")!;
        expect(peer1).not.undefined;

        expect(peer1.behaviors.has(IcdClient)).true;
    });

    it("defaults to unregistered with no Check-In timestamp", async () => {
        await using site = new MockSite();
        const { controller } = await site.addCommissionedPair({
            device: { type: RootWithIcd },
        });

        const peer1 = controller.peers.get("peer1")!;
        const state = peer1.stateOf(IcdClient);
        expect(state.registered).false;
        expect(state.lastCheckInReceivedAt).undefined;
    });

    it("exposes isRegistered reflecting state.registered", async () => {
        await using site = new MockSite();
        const { controller } = await site.addCommissionedPair({
            device: { type: RootWithIcd },
        });

        const peer1 = controller.peers.get("peer1")!;
        const isRegistered = await peer1.act(agent => agent.get(IcdClient).isRegistered);
        expect(isRegistered).false;
    });
});
