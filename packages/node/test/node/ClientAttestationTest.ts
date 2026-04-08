/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { Bytes, Crypto, MockCrypto, MockFetch, Seconds } from "@matter/general";
import {
    AttestationFinding,
    DclCertificateService,
    DeviceAttestationCheck,
    Paa,
    TestCert_PAA_FFF1_Cert,
    TestCert_PAA_NoVID_Cert,
} from "@matter/protocol";
import { MockSite } from "./mock-site.js";

/**
 * Encode DER bytes as PEM (inlined from protocol test helpers since this is in the node package).
 */
function pemEncode(der: Bytes): string {
    const base64 = Bytes.toBase64(der);
    const lines: string[] = ["-----BEGIN CERTIFICATE-----"];
    for (let i = 0; i < base64.length; i += 64) {
        lines.push(base64.slice(i, i + 64));
    }
    lines.push("-----END CERTIFICATE-----");
    return lines.join("\n");
}

/**
 * Set up MockFetch with DCL API responses for a given PAA certificate so DclCertificateService
 * can initialize its trust store.
 */
function setupDclFetchMock(fetchMock: MockFetch, paaCert: Bytes) {
    const paa = Paa.fromAsn1(paaCert);
    const skid = Bytes.toHex(paa.cert.extensions.subjectKeyIdentifier).toUpperCase();
    const skidWithColons = skid
        .match(/.{1,2}/g)!
        .join(":")
        .toUpperCase();
    const vid = paa.cert.subject.vendorId ?? 0;
    const subject = Bytes.toBase64(Bytes.fromString("test-subject"));

    fetchMock.addResponse("/dcl/pki/root-certificates", {
        approvedRootCertificates: {
            schemaVersion: 0,
            certs: [{ subject, subjectKeyId: skidWithColons }],
        },
    });
    fetchMock.addResponse(
        `/dcl/pki/certificates/${encodeURIComponent(subject)}/${encodeURIComponent(skidWithColons)}`,
        {
            approvedCertificates: {
                subject,
                subjectKeyId: skidWithColons,
                schemaVersion: 0,
                certs: [
                    {
                        pemCert: pemEncode(paaCert),
                        serialNumber: Bytes.toHex(paa.cert.serialNumber),
                        subject,
                        subjectAsText: `CN=${paa.cert.subject.commonName}`,
                        subjectKeyId: skidWithColons,
                        isRoot: true,
                        owner: "cosmos1...",
                        approvals: {} as any,
                        rejects: {} as any,
                        vid,
                        schemaVersion: 0,
                    },
                ],
            },
        },
    );

    // Empty revocation data
    fetchMock.addResponse("/dcl/pki/revocation-points", {
        PkiRevocationDistributionPoint: [],
    });
}

describe("device attestation during commissioning", () => {
    before(() => {
        MockTime.init();
    });

    describe("backward compatibility", () => {
        it("commissions successfully without DclCertificateService", async () => {
            // When no DclCertificateService is set up, attestation validation is skipped entirely.
            // This tests backward compatibility: existing users who have not set up a DCL trust store
            // should still be able to commission devices without any errors.
            await using site = new MockSite();
            const { controller, device } = await site.addUncommissionedPair();

            const controllerCrypto = controller.env.get(Crypto) as MockCrypto;
            const deviceCrypto = device.env.get(Crypto) as MockCrypto;
            controllerCrypto.entropic = deviceCrypto.entropic = true;

            const { passcode, discriminator } = device.state.commissioning;
            await MockTime.resolve(controller.peers.commission({ passcode, discriminator, timeout: Seconds(90) }), {
                macrotasks: true,
            });

            controllerCrypto.entropic = deviceCrypto.entropic = false;

            expect(device.state.commissioning.commissioned).equals(true);
            expect(controller.peers.size).equals(1);
        });

        it("commissions successfully with onAttestationFailure=true", async () => {
            // When onAttestationFailure is set to true, commissioning should proceed even if
            // attestation validation encounters issues. Without DclCertificateService, validation
            // is skipped entirely, but this test verifies the option flows through without error.
            await using site = new MockSite();
            const { controller, device } = await site.addUncommissionedPair();

            const controllerCrypto = controller.env.get(Crypto) as MockCrypto;
            const deviceCrypto = device.env.get(Crypto) as MockCrypto;
            controllerCrypto.entropic = deviceCrypto.entropic = true;

            const { passcode, discriminator } = device.state.commissioning;
            await MockTime.resolve(
                controller.peers.commission({
                    passcode,
                    discriminator,
                    timeout: Seconds(90),
                    onAttestationFailure: true,
                }),
                { macrotasks: true },
            );

            controllerCrypto.entropic = deviceCrypto.entropic = false;

            expect(device.state.commissioning.commissioned).equals(true);
            expect(controller.peers.size).equals(1);
        });

        it("rejects commissioning with onAttestationFailure=false when no DclCertificateService", async () => {
            // When onAttestationFailure is set to false but no DclCertificateService is available,
            // commissioning should fail because strict attestation was requested but can't be performed.
            await using site = new MockSite();
            const { controller, device } = await site.addUncommissionedPair();

            const controllerCrypto = controller.env.get(Crypto) as MockCrypto;
            const deviceCrypto = device.env.get(Crypto) as MockCrypto;
            controllerCrypto.entropic = deviceCrypto.entropic = true;

            const { passcode, discriminator } = device.state.commissioning;
            await expect(
                MockTime.resolve(
                    controller.peers.commission({
                        passcode,
                        discriminator,
                        timeout: Seconds(90),
                        onAttestationFailure: false,
                    }),
                    { macrotasks: true },
                ),
            ).to.be.rejectedWith(/DclCertificateService is not available/);

            controllerCrypto.entropic = deviceCrypto.entropic = false;
        });

        it("commissions with custom onAttestationFailure callback that accepts when no DclCertificateService", async () => {
            // A custom callback that returns true should allow commissioning even without
            // DclCertificateService — the "unavailable" finding is routed through the callback.
            await using site = new MockSite();
            const { controller, device } = await site.addUncommissionedPair();

            const controllerCrypto = controller.env.get(Crypto) as MockCrypto;
            const deviceCrypto = device.env.get(Crypto) as MockCrypto;
            controllerCrypto.entropic = deviceCrypto.entropic = true;

            let callbackInvoked = false;
            let receivedFindings: AttestationFinding[] = [];

            const { passcode, discriminator } = device.state.commissioning;
            await MockTime.resolve(
                controller.peers.commission({
                    passcode,
                    discriminator,
                    timeout: Seconds(90),
                    onAttestationFailure: findings => {
                        callbackInvoked = true;
                        receivedFindings = findings;
                        return true;
                    },
                }),
                { macrotasks: true },
            );

            controllerCrypto.entropic = deviceCrypto.entropic = false;

            expect(device.state.commissioning.commissioned).equals(true);
            expect(controller.peers.size).equals(1);

            // Verify the callback was invoked with a DclServiceUnavailable finding
            expect(callbackInvoked).equals(true);
            expect(receivedFindings).to.have.length(1);
            expect(receivedFindings[0].type).equals(DeviceAttestationCheck.DclServiceUnavailable);
            expect(receivedFindings[0].level).equals("error");
        });

        it("rejects commissioning with custom onAttestationFailure callback that rejects", async () => {
            // A custom callback that returns false should reject commissioning.
            await using site = new MockSite();
            const { controller, device } = await site.addUncommissionedPair();

            const controllerCrypto = controller.env.get(Crypto) as MockCrypto;
            const deviceCrypto = device.env.get(Crypto) as MockCrypto;
            controllerCrypto.entropic = deviceCrypto.entropic = true;

            let callbackInvoked = false;
            let receivedFindings: AttestationFinding[] = [];

            const { passcode, discriminator } = device.state.commissioning;
            await expect(
                MockTime.resolve(
                    controller.peers.commission({
                        passcode,
                        discriminator,
                        timeout: Seconds(90),
                        onAttestationFailure: findings => {
                            callbackInvoked = true;
                            receivedFindings = findings;
                            return false;
                        },
                    }),
                    { macrotasks: true },
                ),
            ).to.be.rejectedWith(/DclCertificateService is not available/);

            controllerCrypto.entropic = deviceCrypto.entropic = false;

            // Verify the callback was invoked with the correct finding before rejection
            expect(callbackInvoked).equals(true);
            expect(receivedFindings).to.have.length(1);
            expect(receivedFindings[0].type).equals(DeviceAttestationCheck.DclServiceUnavailable);
            expect(receivedFindings[0].level).equals("error");
        });
    });

    describe("attestation with DCL trust store", () => {
        let fetchMock: MockFetch;

        beforeEach(() => {
            fetchMock = new MockFetch();
        });

        afterEach(() => {
            fetchMock.uninstall();
        });

        it("commissions successfully with DCL trust store containing the test PAA", async () => {
            // Set up DCL trust store with the test PAA that AttestationCertificateManager uses.
            // The device's cert chain (auto-generated) is signed by TestCert_PAA_NoVID, so the
            // chain should validate successfully. Info/warning findings (test CD type, skipped checks)
            // are accepted by the default policy.
            setupDclFetchMock(fetchMock, TestCert_PAA_NoVID_Cert);
            fetchMock.install();

            await using site = new MockSite();
            const { controller, device } = await site.addUncommissionedPair();

            // MockCrypto extends StandardCrypto and has all real crypto operations needed
            // by DclCertificateService for PAA certificate parsing
            const dclService = new DclCertificateService(controller.env, { updateInterval: null });
            await dclService.construction;

            const controllerCrypto = controller.env.get(Crypto) as MockCrypto;
            const deviceCrypto = device.env.get(Crypto) as MockCrypto;
            controllerCrypto.entropic = deviceCrypto.entropic = true;

            const { passcode, discriminator } = device.state.commissioning;
            await MockTime.resolve(controller.peers.commission({ passcode, discriminator, timeout: Seconds(90) }), {
                macrotasks: true,
            });

            controllerCrypto.entropic = deviceCrypto.entropic = false;

            expect(device.state.commissioning.commissioned).equals(true);
            expect(controller.peers.size).equals(1);

            await dclService.close();
        });

        it("onAttestationFailure callback receives findings including CertificationTypeTest", async () => {
            // With the DCL trust store set up, validation will succeed but produce info-level findings:
            // - CertificationTypeTest (the test CD has certification_type=0)
            // - CdSignerVerificationSkipped (no CD signer keys provided)
            // - RevocationCheckSkipped (no revocation data available)
            setupDclFetchMock(fetchMock, TestCert_PAA_NoVID_Cert);
            fetchMock.install();

            await using site = new MockSite();
            const { controller, device } = await site.addUncommissionedPair();

            const dclService = new DclCertificateService(controller.env, { updateInterval: null });
            await dclService.construction;

            const controllerCrypto = controller.env.get(Crypto) as MockCrypto;
            const deviceCrypto = device.env.get(Crypto) as MockCrypto;
            controllerCrypto.entropic = deviceCrypto.entropic = true;

            let receivedFindings: AttestationFinding[] = [];

            const { passcode, discriminator } = device.state.commissioning;
            await MockTime.resolve(
                controller.peers.commission({
                    passcode,
                    discriminator,
                    timeout: Seconds(90),
                    onAttestationFailure: findings => {
                        receivedFindings = findings;
                        return true;
                    },
                }),
                { macrotasks: true },
            );

            controllerCrypto.entropic = deviceCrypto.entropic = false;

            expect(device.state.commissioning.commissioned).equals(true);

            // Verify CertificationTypeTest finding is present (test CD produces info-level finding)
            const certTypeFinding = receivedFindings.find(f => f.type === DeviceAttestationCheck.CertificationTypeTest);
            expect(certTypeFinding).not.undefined;
            expect(certTypeFinding!.level).equals("info");

            // Verify other expected findings are present
            const findingTypes = receivedFindings.map(f => f.type);
            expect(findingTypes).to.include(DeviceAttestationCheck.CdSignerVerificationSkipped);
            expect(findingTypes).to.include(DeviceAttestationCheck.RevocationCheckSkipped);

            await dclService.close();
        });

        it("onAttestationFailure=false rejects even with valid chain when findings exist", async () => {
            // Even though the cert chain validates, the test CD produces findings (CertificationTypeTest,
            // CdSignerVerificationSkipped, RevocationCheckSkipped). With onAttestationFailure=false,
            // any findings cause rejection.
            setupDclFetchMock(fetchMock, TestCert_PAA_NoVID_Cert);
            fetchMock.install();

            await using site = new MockSite();
            const { controller, device } = await site.addUncommissionedPair();

            const dclService = new DclCertificateService(controller.env, { updateInterval: null });
            await dclService.construction;

            const controllerCrypto = controller.env.get(Crypto) as MockCrypto;
            const deviceCrypto = device.env.get(Crypto) as MockCrypto;
            controllerCrypto.entropic = deviceCrypto.entropic = true;

            const { passcode, discriminator } = device.state.commissioning;
            await expect(
                MockTime.resolve(
                    controller.peers.commission({
                        passcode,
                        discriminator,
                        timeout: Seconds(90),
                        onAttestationFailure: false,
                    }),
                    { macrotasks: true },
                ),
            ).to.be.rejectedWith(/finding\(s\) and was rejected by policy/);

            controllerCrypto.entropic = deviceCrypto.entropic = false;

            await dclService.close();
        });
    });

    describe("attestation failure scenarios", () => {
        let fetchMock: MockFetch;

        beforeEach(() => {
            fetchMock = new MockFetch();
        });

        afterEach(() => {
            fetchMock.uninstall();
        });

        it("PAA not in trust store produces PaaNotTrusted error finding", async () => {
            // Set up DCL trust store with a DIFFERENT PAA (TestCert_PAA_FFF1_Cert) than the one
            // the device uses (TestCert_PAA_NoVID_Cert). The PAA authority key identifier in the
            // device's PAI won't match any trusted PAA, producing a PaaNotTrusted error.
            setupDclFetchMock(fetchMock, TestCert_PAA_FFF1_Cert);
            fetchMock.install();

            await using site = new MockSite();
            const { controller, device } = await site.addUncommissionedPair();

            const dclService = new DclCertificateService(controller.env, { updateInterval: null });
            await dclService.construction;

            const controllerCrypto = controller.env.get(Crypto) as MockCrypto;
            const deviceCrypto = device.env.get(Crypto) as MockCrypto;
            controllerCrypto.entropic = deviceCrypto.entropic = true;

            let receivedFindings: AttestationFinding[] = [];

            const { passcode, discriminator } = device.state.commissioning;
            await expect(
                MockTime.resolve(
                    controller.peers.commission({
                        passcode,
                        discriminator,
                        timeout: Seconds(90),
                        onAttestationFailure: findings => {
                            receivedFindings = findings;
                            return false;
                        },
                    }),
                    { macrotasks: true },
                ),
            ).to.be.rejectedWith(/PAA/i);

            controllerCrypto.entropic = deviceCrypto.entropic = false;

            // Verify PaaNotTrusted error finding was produced
            expect(receivedFindings).to.have.length(1);
            expect(receivedFindings[0].type).equals(DeviceAttestationCheck.PaaNotTrusted);
            expect(receivedFindings[0].level).equals("error");

            await dclService.close();
        });

        it("PAA not in trust store but callback accepts allows commissioning to proceed", async () => {
            // The DCL trust store has a DIFFERENT PAA (TestCert_PAA_FFF1_Cert), but the callback
            // returns true. The device should still be commissioned despite the PaaNotTrusted error,
            // verifying that the callback's return value controls the commissioning outcome.
            setupDclFetchMock(fetchMock, TestCert_PAA_FFF1_Cert);
            fetchMock.install();

            await using site = new MockSite();
            const { controller, device } = await site.addUncommissionedPair();

            const dclService = new DclCertificateService(controller.env, { updateInterval: null });
            await dclService.construction;

            const controllerCrypto = controller.env.get(Crypto) as MockCrypto;
            const deviceCrypto = device.env.get(Crypto) as MockCrypto;
            controllerCrypto.entropic = deviceCrypto.entropic = true;

            let receivedFindings: AttestationFinding[] = [];

            const { passcode, discriminator } = device.state.commissioning;
            await MockTime.resolve(
                controller.peers.commission({
                    passcode,
                    discriminator,
                    timeout: Seconds(90),
                    onAttestationFailure: findings => {
                        receivedFindings = findings;
                        return true;
                    },
                }),
                { macrotasks: true },
            );

            controllerCrypto.entropic = deviceCrypto.entropic = false;

            // Commissioning succeeded despite the untrusted PAA
            expect(device.state.commissioning.commissioned).equals(true);
            expect(controller.peers.size).equals(1);

            // Verify the PaaNotTrusted finding was surfaced to the callback
            expect(receivedFindings).to.have.length(1);
            expect(receivedFindings[0].type).equals(DeviceAttestationCheck.PaaNotTrusted);
            expect(receivedFindings[0].level).equals("error");

            await dclService.close();
        });
    });
});
