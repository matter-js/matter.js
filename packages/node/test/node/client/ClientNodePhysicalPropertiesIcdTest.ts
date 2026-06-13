/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { IcdManagementServer } from "#behaviors/icd-management";
import { ClientNodePhysicalProperties } from "#node/client/ClientNodePhysicalProperties.js";
import { ServerNode } from "#node/index.js";
import { IcdManagement } from "@matter/types/clusters/icd-management";
import { commission, LIT_CONFIG } from "../icd-helpers.js";
import { MockSite } from "../mock-site.js";
import { subscribedPeer } from "../node-helpers.js";

const RootWithCipIcd = ServerNode.RootEndpoint.with(IcdManagementServer);

const LitIcdServer = IcdManagementServer.with(
    IcdManagement.Feature.CheckInProtocolSupport,
    IcdManagement.Feature.LongIdleTimeSupport,
    IcdManagement.Feature.DynamicSitLitSupport,
);
const RootWithLitIcd = ServerNode.RootEndpoint.with(LitIcdServer);

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
