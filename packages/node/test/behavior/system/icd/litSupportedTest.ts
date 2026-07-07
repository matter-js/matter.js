/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { IcdClient } from "#behavior/system/icd/IcdClient.js";
import { IcdManagementServer } from "#behaviors/icd-management";
import { ServerNode } from "#node/index.js";
import { IcdManagement } from "@matter/types/clusters/icd-management";
import { commission, LIT_CONFIG } from "../../../node/icd-helpers.js";
import { MockSite } from "../../../node/mock-site.js";
import { subscribedPeer } from "../../../node/node-helpers.js";

const { litSupported, MIN_LIT_SPECIFICATION_VERSION } = IcdClient;

const LitIcdServer = IcdManagementServer.with(
    IcdManagement.Feature.CheckInProtocolSupport,
    IcdManagement.Feature.LongIdleTimeSupport,
);
const RootWithLitIcd = ServerNode.RootEndpoint.with(LitIcdServer);

const RootWithCipIcd = ServerNode.RootEndpoint.with(IcdManagementServer);

describe("litSupported", () => {
    before(() => {
        MockTime.init();
    });

    it("exports MIN_LIT_SPECIFICATION_VERSION as 0x01040000", () => {
        expect(MIN_LIT_SPECIFICATION_VERSION).equals(0x01040000);
    });

    it("returns true for a LIT peer with specificationVersion >= 1.4.0 (default)", async () => {
        await using site = new MockSite();
        const { controller } = await site.addCommissionedPair({
            device: { type: RootWithLitIcd, icdManagement: LIT_CONFIG },
        });
        const peer = await subscribedPeer(controller, "peer1");

        // BasicInformationServer defaults specificationVersion to Specification.SPECIFICATION_VERSION >= 1.4.0
        expect(litSupported(peer)).true;
    });

    it("returns true for a LIT peer whose specificationVersion is exactly 1.4.0 (0x01040000)", async () => {
        await using site = new MockSite();
        const { controller, device } = await site.addUncommissionedPair({
            device: {
                type: RootWithLitIcd,
                icdManagement: LIT_CONFIG,
                basicInformation: { specificationVersion: 0x01040000 },
            },
        });
        await commission(controller, device);
        const peer = await subscribedPeer(controller, "peer1");

        expect(litSupported(peer)).true;
    });

    it("returns false for a LIT peer whose specificationVersion is 1.3.0 (0x01030000)", async () => {
        await using site = new MockSite();
        const { controller, device } = await site.addUncommissionedPair({
            device: {
                type: RootWithLitIcd,
                icdManagement: LIT_CONFIG,
                basicInformation: { specificationVersion: 0x01030000 },
            },
        });
        await commission(controller, device);
        const peer = await subscribedPeer(controller, "peer1");

        expect(litSupported(peer)).false;
    });

    it("returns false for a non-ICD peer (no LongIdleTimeSupport feature)", async () => {
        await using site = new MockSite();
        const { controller } = await site.addCommissionedPair({
            device: { type: RootWithCipIcd },
        });
        const peer = await subscribedPeer(controller, "peer1");

        expect(litSupported(peer)).false;
    });

    it("returns false for a peer with no ICD cluster at all", async () => {
        await using site = new MockSite();
        const { controller } = await site.addCommissionedPair();
        const peer = await subscribedPeer(controller, "peer1");

        expect(litSupported(peer)).false;
    });
});
