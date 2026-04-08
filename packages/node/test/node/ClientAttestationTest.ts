/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { Bytes, Crypto, MockCrypto, MockFetch, Pem, Seconds } from "@matter/general";
import {
    AttestationFinding,
    DclCertificateService,
    DeviceAttestationCheck,
    DeviceAttestationValidator,
    Paa,
    TestCert_PAA_FFF1_Cert,
    TestCert_PAA_NoVID_Cert,
} from "@matter/protocol";
import { MockSite } from "./mock-site.js";

/** Format a hex SKID string with colon separators (e.g., "AABB" → "AA:BB"). */
function formatSkidWithColons(hexSkid: string): string {
    return hexSkid
        .match(/.{1,2}/g)!
        .join(":")
        .toUpperCase();
}

/** Set up MockFetch with DCL API responses for a given PAA certificate. */
function setupDclFetchMock(fetchMock: MockFetch, paaCert: Bytes) {
    const paa = Paa.fromAsn1(paaCert);
    const skid = Bytes.toHex(paa.cert.extensions.subjectKeyIdentifier).toUpperCase();
    const skidWithColons = formatSkidWithColons(skid);
    const vid = paa.cert.subject.vendorId ?? 0;
    const subject = Bytes.toBase64(Bytes.fromString("test-subject"));

    fetchMock.addResponse("/dcl/pki/root-certificates", {
        approvedRootCertificates: { schemaVersion: 0, certs: [{ subject, subjectKeyId: skidWithColons }] },
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
                        pemCert: Pem.encode(paaCert),
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
    fetchMock.addResponse("/dcl/pki/revocation-points", { PkiRevocationDistributionPoint: [] });
}

/**
 * Options for a commissioning attestation test case.
 */
interface AttestationTestOptions {
    /** PAA cert to register in DCL trust store. undefined = no DclCertificateService. */
    dclPaaCert?: Bytes;

    /** The onAttestationFailure commissioning option. */
    onAttestationFailure?: DeviceAttestationValidator.OnAttestationFailure;

    /** If set, commissioning is expected to be rejected with this pattern. */
    expectRejection?: RegExp;

    /** Assertions to run on the findings captured by the callback (if callback was used). */
    assertFindings?: (findings: AttestationFinding[]) => void;

    /** Additional assertions on device/controller state after commissioning. */
    assertResult?: (
        device: { state: { commissioning: { commissioned: boolean } } },
        controllerPeerCount: number,
    ) => void;
}

/**
 * Run a commissioning test with the given attestation options.
 * Handles MockSite setup, entropy, DCL service lifecycle, and cleanup.
 */
async function runAttestationTest(options: AttestationTestOptions) {
    const fetchMock = new MockFetch();
    let dclService: DclCertificateService | undefined;

    try {
        if (options.dclPaaCert !== undefined) {
            setupDclFetchMock(fetchMock, options.dclPaaCert);
            fetchMock.install();
        }

        await using site = new MockSite();
        const { controller, device } = await site.addUncommissionedPair();

        if (options.dclPaaCert !== undefined) {
            dclService = new DclCertificateService(controller.env, { updateInterval: null });
            await dclService.construction;
        }

        const controllerCrypto = controller.env.get(Crypto) as MockCrypto;
        const deviceCrypto = device.env.get(Crypto) as MockCrypto;
        controllerCrypto.entropic = deviceCrypto.entropic = true;

        // Wrap the callback to capture findings
        let receivedFindings = new Array<AttestationFinding>();
        let callbackInvoked = false;
        let commissioningOptions: { onAttestationFailure?: DeviceAttestationValidator.OnAttestationFailure } = {};

        if (typeof options.onAttestationFailure === "function") {
            const userCallback = options.onAttestationFailure;
            commissioningOptions.onAttestationFailure = findings => {
                callbackInvoked = true;
                receivedFindings = findings;
                return userCallback(findings);
            };
        } else {
            commissioningOptions.onAttestationFailure = options.onAttestationFailure;
        }

        const { passcode, discriminator } = device.state.commissioning;
        const commissionPromise = MockTime.resolve(
            controller.peers.commission({
                passcode,
                discriminator,
                timeout: Seconds(90),
                ...commissioningOptions,
            }),
            { macrotasks: true },
        );

        if (options.expectRejection !== undefined) {
            await expect(commissionPromise).to.be.rejectedWith(options.expectRejection);
        } else {
            await commissionPromise;
        }

        controllerCrypto.entropic = deviceCrypto.entropic = false;

        if (options.assertFindings !== undefined) {
            expect(callbackInvoked).equals(true, "onAttestationFailure callback was not invoked");
            options.assertFindings(receivedFindings);
        }

        if (options.assertResult !== undefined) {
            options.assertResult(device, controller.peers.size);
        }
    } finally {
        if (dclService !== undefined) {
            await dclService.close();
        }
        fetchMock.uninstall();
    }
}

describe("device attestation during commissioning", () => {
    before(() => {
        MockTime.init();
    });

    describe("backward compatibility (no DclCertificateService)", () => {
        it("commissions with default policy (undefined)", () =>
            runAttestationTest({
                assertResult: (device, peers) => {
                    expect(device.state.commissioning.commissioned).equals(true);
                    expect(peers).equals(1);
                },
            }));

        it("commissions with onAttestationFailure=true", () =>
            runAttestationTest({
                onAttestationFailure: true,
                assertResult: (device, peers) => {
                    expect(device.state.commissioning.commissioned).equals(true);
                    expect(peers).equals(1);
                },
            }));

        it("rejects with onAttestationFailure=false", () =>
            runAttestationTest({
                onAttestationFailure: false,
                expectRejection: /DclCertificateService is not available/,
            }));

        it("custom callback receives DclServiceUnavailable finding and accepts", () =>
            runAttestationTest({
                onAttestationFailure: () => true,
                assertFindings: findings => {
                    expect(findings).to.have.length(1);
                    expect(findings[0].type).equals(DeviceAttestationCheck.DclServiceUnavailable);
                    expect(findings[0].level).equals("error");
                },
                assertResult: (device, peers) => {
                    expect(device.state.commissioning.commissioned).equals(true);
                    expect(peers).equals(1);
                },
            }));

        it("custom callback receives DclServiceUnavailable finding and rejects", () =>
            runAttestationTest({
                onAttestationFailure: () => false,
                expectRejection: /DclCertificateService is not available/,
                assertFindings: findings => {
                    expect(findings).to.have.length(1);
                    expect(findings[0].type).equals(DeviceAttestationCheck.DclServiceUnavailable);
                    expect(findings[0].level).equals("error");
                },
            }));
    });

    describe("with DCL trust store (correct PAA)", () => {
        it("commissions with default policy", () =>
            runAttestationTest({
                dclPaaCert: TestCert_PAA_NoVID_Cert,
                assertResult: (device, peers) => {
                    expect(device.state.commissioning.commissioned).equals(true);
                    expect(peers).equals(1);
                },
            }));

        it("callback receives CertificationTypeTest and other expected findings", () =>
            runAttestationTest({
                dclPaaCert: TestCert_PAA_NoVID_Cert,
                onAttestationFailure: () => true,
                assertFindings: findings => {
                    const types = findings.map(f => f.type);
                    expect(types).to.include(DeviceAttestationCheck.CertificationTypeTest);
                    expect(types).to.include(DeviceAttestationCheck.CdSignerVerificationSkipped);
                    expect(types).to.include(DeviceAttestationCheck.RevocationCheckSkipped);

                    const certType = findings.find(f => f.type === DeviceAttestationCheck.CertificationTypeTest);
                    expect(certType!.level).equals("info");
                },
                assertResult: device => {
                    expect(device.state.commissioning.commissioned).equals(true);
                },
            }));

        it("rejects with onAttestationFailure=false despite valid chain", () =>
            runAttestationTest({
                dclPaaCert: TestCert_PAA_NoVID_Cert,
                onAttestationFailure: false,
                expectRejection: /finding\(s\) and was rejected by policy/,
            }));
    });

    describe("with DCL trust store (wrong PAA)", () => {
        it("PaaNotTrusted error finding, callback rejects", () =>
            runAttestationTest({
                dclPaaCert: TestCert_PAA_FFF1_Cert,
                onAttestationFailure: () => false,
                expectRejection: /PAA/i,
                assertFindings: findings => {
                    expect(findings).to.have.length(1);
                    expect(findings[0].type).equals(DeviceAttestationCheck.PaaNotTrusted);
                    expect(findings[0].level).equals("error");
                },
            }));

        it("PaaNotTrusted error finding, callback accepts → commissioning proceeds", () =>
            runAttestationTest({
                dclPaaCert: TestCert_PAA_FFF1_Cert,
                onAttestationFailure: () => true,
                assertFindings: findings => {
                    expect(findings).to.have.length(1);
                    expect(findings[0].type).equals(DeviceAttestationCheck.PaaNotTrusted);
                    expect(findings[0].level).equals("error");
                },
                assertResult: (device, peers) => {
                    expect(device.state.commissioning.commissioned).equals(true);
                    expect(peers).equals(1);
                },
            }));
    });
});
