/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { ServerNode } from "#node/ServerNode.js";
import {
    Bytes,
    Crypto,
    EcdsaSignature,
    ImplementationError,
    MockCrypto,
    PublicKey,
    Seconds,
    Time,
    TimeoutError,
} from "@matter/general";
import { MockSite } from "@matter/node/testing";
import {
    Certificate,
    CertificateAuthority,
    Dac,
    FabricManager,
    Pai,
    Noc,
    TlvAttestation,
    TlvCertSigningRequest,
} from "@matter/protocol";

function isMockCrypto(crypto: Crypto): crypto is MockCrypto {
    return "entropic" in crypto;
}

function mockCryptoOf(node: ServerNode) {
    const crypto = node.env.get(Crypto);
    if (!isMockCrypto(crypto)) {
        throw new ImplementationError("Test node does not use MockCrypto");
    }
    return crypto;
}

describe("Commissioning with an external issuer", () => {
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
     * Adds an uncommissioned controller and device.  The controller's CA has an external issuer; a local CA stands in
     * for the remote signer, and every request it receives is recorded.
     */
    async function addPairWithExternalIssuer(
        options: {
            intermediateCert?: boolean;
            /** Replaces the issuer; {@link signer} is the local CA standing in for the remote one. */
            issueNoc?: (
                request: CertificateAuthority.Issuer.NocRequest,
                signer: CertificateAuthority,
            ) => Promise<CertificateAuthority.Issuer.IssuedNoc>;
        } = {},
    ) {
        const { controller, device } = await site.addUncommissionedPair();

        const crypto = controller.env.get(Crypto);
        // Without entropy the mock gives the root and the ICAC the same key pair.
        const signerCrypto = mockCryptoOf(controller);
        signerCrypto.entropic = true;
        const signer = await CertificateAuthority.create(crypto, options.intermediateCert ?? false);
        signerCrypto.entropic = false;
        const requests = new Array<CertificateAuthority.Issuer.NocRequest>();
        controller.env.set(
            CertificateAuthority,
            await CertificateAuthority.create(crypto, {
                rootCert: signer.rootCert,
                issueNoc(request) {
                    requests.push(request);
                    return options.issueNoc?.(request, signer) ?? signer.issueNoc(request);
                },
            }),
        );

        return { controller, device, signer, requests };
    }

    async function commission(controller: ServerNode, device: ServerNode) {
        const controllerCrypto = mockCryptoOf(controller);
        const deviceCrypto = mockCryptoOf(device);
        controllerCrypto.entropic = deviceCrypto.entropic = true;

        try {
            await controller.start();

            const { passcode, discriminator } = device.state.commissioning;
            await MockTime.resolve(controller.peers.commission({ passcode, discriminator, timeout: Seconds(90) }), {
                macrotasks: true,
            });
        } finally {
            controllerCrypto.entropic = deviceCrypto.entropic = false;
        }
    }

    function deviceNodeIdOf(device: ServerNode) {
        const [deviceFabric] = device.env.get(FabricManager).fabrics;
        return { deviceFabric, nodeId: Noc.fromTlv(deviceFabric.operationalCert).cert.subject.nodeId };
    }

    it("installs a device NOC issued by the external issuer", async () => {
        const { controller, device, signer, requests } = await addPairWithExternalIssuer();

        await commission(controller, device);

        const { deviceFabric, nodeId } = deviceNodeIdOf(device);
        expect(deviceFabric.rootCert).deep.equal(signer.rootCert);
        expect(requests.map(request => request.nodeId)).contains(nodeId);
    });

    it("installs the ICAC issued with the device NOC", async () => {
        const { controller, device, signer } = await addPairWithExternalIssuer({ intermediateCert: true });

        await commission(controller, device);

        const { deviceFabric } = deviceNodeIdOf(device);
        expect(deviceFabric.intermediateCACert).deep.equal(signer.icacCert);
    });

    it("passes the device's attestation and CSR responses to the external issuer", async () => {
        const { controller, device, requests } = await addPairWithExternalIssuer();

        await commission(controller, device);

        const { nodeId } = deviceNodeIdOf(device);
        const deviceRequest = requests.find(request => request.nodeId === nodeId);
        const evidence = deviceRequest?.evidence;
        expect(evidence).not.undefined;
        if (deviceRequest === undefined || evidence === undefined) {
            return;
        }

        const crypto = controller.env.get(Crypto);
        const dac = Dac.fromAsn1(evidence.dac);
        expect(dac.cert.issuer).deep.equal(Pai.fromAsn1(evidence.pai).cert.subject);
        const dacKey = PublicKey(dac.cert.ellipticCurvePublicKey);
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
        expect(Bytes.toHex(csrPublicKey)).equal(Bytes.toHex(deviceRequest.publicKey));

        const controllerRequests = requests.filter(request => request.nodeId !== nodeId);
        expect(controllerRequests.length).greaterThan(0);
        expect(controllerRequests.every(request => request.evidence === undefined)).true;
    });

    it("extends the device's fail-safe for a slow issuer", async () => {
        const { controller, device } = await addPairWithExternalIssuer({
            async issueNoc(request, signer) {
                if (request.evidence !== undefined) {
                    await Time.sleep("slow issuer", Seconds(25));
                }
                return await signer.issueNoc(request);
            },
        });
        await device.set({
            generalCommissioning: {
                basicCommissioningInfo: { failSafeExpiryLengthSeconds: 20, maxCumulativeFailsafeSeconds: 900 },
            },
        });

        await commission(controller, device);

        expect(device.env.get(FabricManager).fabrics.length).equal(1);
    });

    it("stops waiting for the issuer when the issue time ends", async () => {
        let deviceRequestAbort: AbortSignal | undefined;
        const { controller, device } = await addPairWithExternalIssuer({
            issueNoc(request, signer) {
                if (request.evidence === undefined) {
                    return signer.issueNoc(request);
                }
                deviceRequestAbort = request.abort;
                return new Promise(() => {});
            },
        });

        await expect(commission(controller, device)).rejected;

        expect(deviceRequestAbort?.aborted).true;
        expect(deviceRequestAbort?.reason).instanceOf(TimeoutError);
    });
});
