/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { ServerNode } from "#node/ServerNode.js";
import { Bytes, Crypto, EcdsaSignature, MockCrypto, PublicKey, Seconds } from "@matter/general";
import { MockSite } from "@matter/node/testing";
import {
    Certificate,
    CertificateAuthority,
    Dac,
    FabricManager,
    Noc,
    TlvAttestation,
    TlvCertSigningRequest,
} from "@matter/protocol";
import { CaseAuthenticatedTag, NodeId } from "@matter/types";
import { AccessControl } from "@matter/types/clusters/access-control";

describe("Commissioning with a remote signer", () => {
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

    /**
     * Adds an uncommissioned controller and device.  The controller's CA is external; a local CA stands in for the
     * remote signer and records every request it receives.
     */
    async function addPairWithExternalCa() {
        const { controller, device } = await site.addUncommissionedPair();

        const signer = await CertificateAuthority.create(controller.env.get(Crypto));
        const requests = new Array<CertificateAuthority.Issuer.NocRequest>();
        controller.env.set(
            CertificateAuthority,
            CertificateAuthority.external(controller.env.get(Crypto), {
                rootCert: signer.rootCert,
                issueNoc(request) {
                    requests.push(request);
                    const { publicKey, fabricId, nodeId, caseAuthenticatedTags } = request;
                    return signer.generateNoc(publicKey, fabricId, nodeId, caseAuthenticatedTags);
                },
            }),
        );

        return { controller, device, signer, requests };
    }

    async function commission(controller: ServerNode, device: ServerNode, options?: { caseAdminSubject?: NodeId }) {
        const controllerCrypto = controller.env.get(Crypto) as MockCrypto;
        const deviceCrypto = device.env.get(Crypto) as MockCrypto;
        controllerCrypto.entropic = deviceCrypto.entropic = true;

        await controller.start();

        const { passcode, discriminator } = device.state.commissioning;
        await MockTime.resolve(
            controller.peers.commission({ passcode, discriminator, timeout: Seconds(90), ...options }),
            { macrotasks: true },
        );

        controllerCrypto.entropic = deviceCrypto.entropic = false;
    }

    it("installs a device NOC issued by the external issuer", async () => {
        const { controller, device, signer, requests } = await addPairWithExternalCa();

        await commission(controller, device);

        const [deviceFabric] = device.env.get(FabricManager).fabrics;
        expect(deviceFabric.rootCert).deep.equal(signer.rootCert);

        const deviceNodeId = Noc.fromTlv(deviceFabric.operationalCert).cert.subject.nodeId;
        expect(requests.map(({ nodeId }) => nodeId)).contains(deviceNodeId);
    });

    it("passes the device's attestation and CSR responses to the external issuer", async () => {
        const { controller, device, requests } = await addPairWithExternalCa();

        await commission(controller, device);

        const [deviceFabric] = device.env.get(FabricManager).fabrics;
        const deviceNodeId = Noc.fromTlv(deviceFabric.operationalCert).cert.subject.nodeId;
        const deviceRequest = requests.find(({ nodeId }) => nodeId === deviceNodeId);
        if (deviceRequest?.commissioning === undefined) {
            throw new Error("The device's NOC request carries no commissioning evidence");
        }
        const { publicKey, commissioning: evidence } = deviceRequest;

        const crypto = controller.env.get(Crypto);
        const dacKey = PublicKey(Dac.fromAsn1(evidence.dac).cert.ellipticCurvePublicKey);
        await crypto.verifyEcdsa(
            dacKey,
            Bytes.concat(evidence.attestationElements, evidence.attestationChallenge),
            new EcdsaSignature(evidence.attestationSignature),
        );
        await crypto.verifyEcdsa(
            dacKey,
            Bytes.concat(evidence.nocsrElements, evidence.attestationChallenge),
            new EcdsaSignature(evidence.nocsrSignature),
        );

        const attestation = TlvAttestation.decode(evidence.attestationElements);
        expect(Bytes.toHex(attestation.attestationNonce)).equal(Bytes.toHex(evidence.attestationNonce));

        const nocsr = TlvCertSigningRequest.decode(evidence.nocsrElements);
        expect(Bytes.toHex(nocsr.csrNonce)).equal(Bytes.toHex(evidence.csrNonce));
        const csrPublicKey = await Certificate.getPublicKeyFromCsr(crypto, nocsr.certSigningRequest);
        expect(Bytes.toHex(csrPublicKey)).equal(Bytes.toHex(publicKey));

        const controllerRequests = requests.filter(({ nodeId }) => nodeId !== deviceNodeId);
        expect(controllerRequests.every(({ commissioning }) => commissioning === undefined)).true;
    });

    it("sends caseAdminSubject in AddNOC", async () => {
        const adminCat = CaseAuthenticatedTag(0x0001_0001);
        const adminSubject = NodeId.fromCaseAuthenticatedTag(adminCat);
        const controller = await site.addController({ controller: { caseAuthenticatedTags: [adminCat] } });
        const device = await site.addDevice();

        await commission(controller, device, { caseAdminSubject: adminSubject });

        const { acl } = device.state.accessControl;
        expect(acl.length).equal(1);
        expect(acl[0].privilege).equal(AccessControl.AccessControlEntryPrivilege.Administer);
        expect(acl[0].authMode).equal(AccessControl.AccessControlEntryAuthMode.Case);
        expect(acl[0].subjects).deep.equal([adminSubject]);
    });
});
