/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { OperationalCredentialsClient } from "#behaviors/operational-credentials";
import { ClientNode } from "#node/ClientNode.js";
import { Bytes, Crypto } from "@matter/general";
import { FAILSAFE_LENGTH_S, MockServerNode, MockSite } from "@matter/node/testing";
import { Certificate, TestFabric, TlvCertSigningRequest } from "@matter/protocol";
import { FabricId, FabricIndex, NodeId, Status, StatusResponseError, SubjectId, VendorId } from "@matter/types";
import { OperationalCredentials } from "@matter/types/clusters/operational-credentials";

describe("OperationalCredentialsServer", () => {
    before(() => {
        MockTime.init();
    });

    async function statusOf(call: (peer: ClientNode) => Promise<unknown>) {
        await using site = new MockSite();
        const { controller } = await site.addCommissionedPair();
        const peer = controller.peers.get("peer1")!;
        const error = await call(peer).then(
            () => undefined,
            (error: unknown) => error,
        );
        return error instanceof StatusResponseError ? error.code : error;
    }

    function addNocWith(adminVendorId: VendorId) {
        return statusOf(peer =>
            peer.commandsOf(OperationalCredentialsClient).addNoc({
                nocValue: Bytes.of(new Uint8Array(10)),
                ipkValue: Bytes.of(new Uint8Array(16)),
                caseAdminSubject: NodeId(1n),
                adminVendorId,
            }),
        );
    }

    describe("addNoc", () => {
        it("refuses the Matter Standard vendor ID as admin vendor ID", async () => {
            expect(await addNocWith(VendorId(0))).equals(Status.InvalidCommand);
        });

        it("refuses a reserved vendor ID as admin vendor ID", async () => {
            expect(await addNocWith(VendorId(0xfff5, false))).equals(Status.InvalidCommand);
        });

        it("checks the fail-safe after a valid admin vendor ID", async () => {
            expect(await addNocWith(VendorId(0xfff1))).equals(Status.FailsafeRequired);
        });
    });

    describe("addNoc certificate checks", () => {
        async function addNocStatus({
            nocNodeId,
            caseAdminSubject,
        }: {
            nocNodeId: NodeId;
            caseAdminSubject: SubjectId;
        }) {
            const authority = await TestFabric.Authority({ index: 1 });
            const fabric = await authority.createFabric({
                adminFabricLabel: "test",
                adminVendorId: VendorId(0xfff1),
                adminFabricIndex: FabricIndex(1),
                adminFabricId: FabricId(1),
            });
            await using node = await MockServerNode.createOnline();
            const context = { exchange: await node.createExchange(), command: true };
            const crypto = node.env.get(Crypto);

            await node.online(context, agent =>
                agent.generalCommissioning.armFailSafe({ expiryLengthSeconds: FAILSAFE_LENGTH_S, breadcrumb: 1 }),
            );
            const { nocsrElements } = await node.online(context, agent =>
                agent.operationalCredentials.csrRequest({ csrNonce: crypto.randomBytes(32) }),
            );
            await node.online(context, agent =>
                agent.operationalCredentials.addTrustedRootCertificate({ rootCaCertificate: authority.ca.rootCert }),
            );

            const { certSigningRequest } = TlvCertSigningRequest.decode(nocsrElements);
            const publicKey = await Certificate.getPublicKeyFromCsr(crypto, certSigningRequest);
            const noc = await authority.ca.generateNoc(publicKey, fabric.fabricId, nocNodeId);

            const { statusCode } = await node.online(context, agent =>
                agent.operationalCredentials.addNoc({
                    nocValue: noc,
                    icacValue: fabric.intermediateCACert,
                    ipkValue: fabric.identityProtectionKey,
                    caseAdminSubject,
                    adminVendorId: VendorId(0xfff1),
                }),
            );
            return statusCode;
        }

        it("answers InvalidNodeOpId for a NOC whose node ID is outside the operational range", async () => {
            const status = await addNocStatus({
                nocNodeId: NodeId(0xffff_ffff_0000_0001n),
                caseAdminSubject: NodeId(100),
            });

            expect(status).equals(OperationalCredentials.NodeOperationalCertStatus.InvalidNodeOpId);
        });

        it("answers InvalidAdminSubject for a CAT admin subject with version 0", async () => {
            const status = await addNocStatus({
                nocNodeId: NodeId(1),
                caseAdminSubject: NodeId(0xffff_fffd_0001_0000n),
            });

            expect(status).equals(OperationalCredentials.NodeOperationalCertStatus.InvalidAdminSubject);
        });

        it("adds the fabric for a valid NOC and admin subject", async () => {
            const status = await addNocStatus({ nocNodeId: NodeId(1), caseAdminSubject: NodeId(100) });

            expect(status).equals(OperationalCredentials.NodeOperationalCertStatus.Ok);
        });
    });

    describe("setVidVerificationStatement", () => {
        it("refuses the Matter Standard vendor ID", async () => {
            const status = await statusOf(peer =>
                peer.commandsOf(OperationalCredentialsClient).setVidVerificationStatement({ vendorId: VendorId(0) }),
            );

            expect(status).equals(Status.ConstraintError);
        });
    });
});
