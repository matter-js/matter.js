/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { IcdManagementServer } from "#behaviors/icd-management";
import { ClientNodePhysicalProperties } from "#node/client/ClientNodePhysicalProperties.js";
import { ServerNode } from "#node/index.js";
import { Crypto, MockCrypto, Seconds } from "@matter/general";
import { IcdManagement } from "@matter/types/clusters/icd-management";
import { MockSite } from "../mock-site.js";
import { subscribedPeer } from "../node-helpers.js";

async function commission(controller: ServerNode, device: ServerNode) {
    const controllerCrypto = controller.env.get(Crypto) as MockCrypto;
    const deviceCrypto = device.env.get(Crypto) as MockCrypto;
    controllerCrypto.entropic = deviceCrypto.entropic = true;

    if (!controller.lifecycle.isOnline) {
        await controller.start();
    }

    const { passcode, discriminator } = device.state.commissioning;
    await MockTime.resolve(controller.peers.commission({ passcode, discriminator, timeout: Seconds(90) }), {
        macrotasks: true,
    });

    controllerCrypto.entropic = deviceCrypto.entropic = false;
}

const RootWithCipIcd = ServerNode.RootEndpoint.with(IcdManagementServer);

const LitIcdServer = IcdManagementServer.with(
    IcdManagement.Feature.CheckInProtocolSupport,
    IcdManagement.Feature.LongIdleTimeSupport,
    IcdManagement.Feature.DynamicSitLitSupport,
);
const RootWithLitIcd = ServerNode.RootEndpoint.with(LitIcdServer);

const LIT_CONFIG = {
    operatingMode: IcdManagement.OperatingMode.Sit,
    activeModeThreshold: 5000,
    idleModeDuration: 3600,
    activeModeDuration: 1000,
    maximumCheckInBackoff: 3600,
};

describe("ClientNodePhysicalProperties ICD operating mode", () => {
    before(() => {
        MockTime.init();
    });

    it("reports isLongIdleTimeOperating true for a peer operating in LIT mode", async () => {
        await using site = new MockSite();
        const { controller, device } = await site.addUncommissionedPair({
            device: { type: RootWithLitIcd, icdManagement: LIT_CONFIG },
        });

        // Put the peer in LIT mode before the controller subscribes so the first structure read sees it.
        await device.act(agent => agent.get(LitIcdServer).setOperatingMode(IcdManagement.OperatingMode.Lit));

        await commission(controller, device);
        const peer1 = await subscribedPeer(controller, "peer1");

        const properties = ClientNodePhysicalProperties(peer1);
        expect(properties.isIntermittentlyConnected).true;
        expect(properties.isLongIdleTimeOperating).true;
    });

    it("reports isLongIdleTimeOperating false for a LIT-capable peer still operating in SIT mode", async () => {
        await using site = new MockSite();
        const { controller } = await site.addCommissionedPair({
            device: { type: RootWithLitIcd, icdManagement: LIT_CONFIG },
        });
        const peer1 = await subscribedPeer(controller, "peer1");

        const properties = ClientNodePhysicalProperties(peer1);
        expect(properties.isIntermittentlyConnected).true;
        expect(properties.isLongIdleTimeOperating).false;
    });

    it("reports isLongIdleTimeOperating false for a CIP-only (SIT) ICD peer", async () => {
        await using site = new MockSite();
        const { controller } = await site.addCommissionedPair({
            device: { type: RootWithCipIcd },
        });
        const peer1 = await subscribedPeer(controller, "peer1");

        const properties = ClientNodePhysicalProperties(peer1);
        expect(properties.isIntermittentlyConnected).true;
        expect(properties.isLongIdleTimeOperating).false;
    });

    it("reports isLongIdleTimeOperating false for a non-ICD peer", async () => {
        await using site = new MockSite();
        const { controller } = await site.addCommissionedPair();
        const peer1 = await subscribedPeer(controller, "peer1");

        const properties = ClientNodePhysicalProperties(peer1);
        expect(properties.isIntermittentlyConnected).false;
        expect(properties.isLongIdleTimeOperating).false;
    });
});
