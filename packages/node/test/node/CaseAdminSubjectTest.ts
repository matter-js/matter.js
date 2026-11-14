/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { CommissioningClient } from "#behavior/system/commissioning/CommissioningClient.js";
import { ControllerBehavior } from "#behavior/system/controller/ControllerBehavior.js";
import { ServerNode } from "#node/ServerNode.js";
import { Crypto, ImplementationError, Seconds, Time } from "@matter/general";
import { MockSite } from "@matter/node/testing";
import { CaseAdminSubjectError, ControllerCommissioner, FabricAuthority } from "@matter/protocol";
import { CaseAuthenticatedTag, NodeId } from "@matter/types";
import { AccessControl } from "@matter/types/clusters/access-control";

const ADMIN_CAT = CaseAuthenticatedTag(0x0001_0002);

function mockCryptoOf(node: ServerNode) {
    const crypto = node.env.get(Crypto);
    if (!("entropic" in crypto)) {
        throw new ImplementationError("Test node does not use MockCrypto");
    }
    return crypto;
}

describe("CASE admin subject", () => {
    before(() => {
        MockTime.init();
    });

    let site: MockSite;

    beforeEach(() => {
        site = new MockSite();
    });

    afterEach(async () => {
        await site.close();
    });

    async function commission(
        controller: ServerNode,
        device: ServerNode,
        options: Partial<CommissioningClient.CommissioningOptions> = {},
    ) {
        const controllerCrypto = mockCryptoOf(controller);
        const deviceCrypto = mockCryptoOf(device);
        controllerCrypto.entropic = deviceCrypto.entropic = true;

        try {
            if (!controller.lifecycle.isOnline) {
                await controller.start();
            }
            const { passcode, discriminator } = device.state.commissioning;
            await MockTime.resolve(
                controller.peers.commission({ passcode, discriminator, timeout: Seconds(90), ...options }),
                { macrotasks: true },
            );
        } finally {
            controllerCrypto.entropic = deviceCrypto.entropic = false;
        }
    }

    function expectAdminSubject(device: ServerNode, subject: NodeId) {
        const { acl } = device.state.accessControl;
        expect(acl.length).equal(1);
        expect(acl[0].privilege).equal(AccessControl.AccessControlEntryPrivilege.Administer);
        expect(acl[0].authMode).equal(AccessControl.AccessControlEntryAuthMode.Case);
        expect(acl[0].subjects).deep.equal([subject]);
    }

    it("sends caseAdminSubject in AddNOC", async () => {
        const adminSubject = NodeId.fromCaseAuthenticatedTag(ADMIN_CAT);
        const controller = await site.addController({ controller: { caseAuthenticatedTags: [ADMIN_CAT] } });
        const device = await site.addDevice();

        await commission(controller, device, { caseAdminSubject: adminSubject });

        expectAdminSubject(device, adminSubject);
    });

    it("uses the controller's default and accepts a lower version of our CAT", async () => {
        const adminSubject = NodeId.fromCaseAuthenticatedTag(CaseAuthenticatedTag(0x0001, 1));
        const controller = await site.addController({
            controller: { caseAuthenticatedTags: [ADMIN_CAT], caseAdminSubject: adminSubject },
        });
        const device = await site.addDevice();

        await commission(controller, device);

        expectAdminSubject(device, adminSubject);
    });

    it("sends our node ID as caseAdminSubject", async () => {
        const nodeId = NodeId(0x1234n);
        const controller = await site.addController({ controller: { adminNodeId: nodeId } });
        const device = await site.addDevice();

        await commission(controller, device, { caseAdminSubject: nodeId });

        expectAdminSubject(device, nodeId);
    });

    describe("refuses at the first device found", () => {
        async function expectRefused(caseAdminSubject: NodeId) {
            const controller = await site.addController({ controller: { caseAuthenticatedTags: [ADMIN_CAT] } });
            const device = await site.addDevice();
            const before = Time.nowMs;

            await expect(commission(controller, device, { caseAdminSubject })).rejectedWith(
                CaseAdminSubjectError,
                /CASE admin subject/,
            );
            expect(Time.nowMs - before).lessThan(Seconds(90));
            expect(device.state.accessControl.acl).deep.equal([]);
        }

        it("a CAT with another identifier", async () => {
            await expectRefused(NodeId.fromCaseAuthenticatedTag(CaseAuthenticatedTag(0x0002, 1)));
        });

        it("a CAT with a higher version than ours", async () => {
            await expectRefused(NodeId.fromCaseAuthenticatedTag(CaseAuthenticatedTag(0x0001, 3)));
        });

        it("another node ID", async () => {
            await expectRefused(NodeId(0x1234n));
        });

        it("a CAT with version 0", async () => {
            await expectRefused(NodeId(0xffff_fffd_0001_0000n));
        });
    });

    it("refuses before PASE when the commissioner is called directly", async () => {
        const controller = await site.addController({ controller: { caseAuthenticatedTags: [ADMIN_CAT] } });
        await site.addDevice();
        await controller.start();
        await controller.act(agent => agent.load(ControllerBehavior));
        const config = await controller.act(agent => agent.get(ControllerBehavior).fabricAuthorityConfig);
        const fabric = await controller.env.get(FabricAuthority).defaultFabric(config);

        // A wrong passcode fails PASE, so only a check before PASE reports the subject
        await expect(
            MockTime.resolve(
                controller.env.get(ControllerCommissioner).commission({
                    fabric,
                    passcode: 11112222,
                    addresses: [{ ip: "abcd::2", port: 5540 }],
                    caseAdminSubject: NodeId.fromCaseAuthenticatedTag(CaseAuthenticatedTag(0x0002, 1)),
                }),
                { macrotasks: true },
            ),
        ).rejectedWith(CaseAdminSubjectError, /CASE admin subject/);
    });

    it("refuses a malformed subject also when another node finishes commissioning", async () => {
        const controller = await site.addController();
        const device = await site.addDevice();
        let finalized = false;

        await expect(
            commission(controller, device, {
                caseAdminSubject: NodeId(0xffff_fffd_0001_0000n),
                finalizeCommissioning: async () => {
                    finalized = true;
                },
            }),
        ).rejectedWith(CaseAdminSubjectError, /neither an operational node ID nor a valid/);
        expect(finalized).false;
    });

    it("does not check the subject when another node finishes commissioning", async () => {
        const adminSubject = NodeId.fromCaseAuthenticatedTag(CaseAuthenticatedTag(0x0002, 1));
        const controller = await site.addController();
        const device = await site.addDevice();
        let finalized = false;

        await commission(controller, device, {
            caseAdminSubject: adminSubject,
            finalizeCommissioning: async () => {
                finalized = true;
            },
        });

        expect(finalized).true;
    });
});
