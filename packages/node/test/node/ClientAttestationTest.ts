/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { Bytes, Crypto, DerCodec, DerType, MockCrypto, MockFetch, ObjectId, Pem, Seconds } from "@matter/general";
import {
    AttestationFinding,
    CertificationDeclaration,
    DclCertificateService,
    DeviceAttestationCheck,
    DeviceAttestationValidator,
    Paa,
    TestCert_PAA_FFF1_Cert,
    TestCert_PAA_NoVID_Cert,
    TestCert_PAA_NoVID_SKID,
} from "@matter/protocol";
import { MockSite } from "./mock-site.js";

/** Build a minimal DER-encoded CRL with the given revoked serial numbers (hex strings). */
function buildTestCrl(revokedSerialHexes: string[], issuerDnDer?: Bytes): Uint8Array {
    const entries: Record<string, any> = {};
    for (let i = 0; i < revokedSerialHexes.length; i++) {
        entries[`e${i}`] = {
            serial: { _tag: DerType.Integer, _bytes: Bytes.fromHex(revokedSerialHexes[i]) },
            date: { _tag: DerType.UtcDate, _bytes: Bytes.fromString("250101000000Z") },
        } as any;
    }
    const sig = { _objectId: ObjectId("2a8648ce3d040302") };
    const tbs: Record<string, any> = {
        version: { _tag: DerType.Integer, _bytes: Uint8Array.of(1) },
        signature: sig,
        issuer: issuerDnDer !== undefined ? DerCodec.decode(issuerDnDer) : { cn: ["Test Issuer"] },
        thisUpdate: { _tag: DerType.UtcDate, _bytes: Bytes.fromString("250101000000Z") },
    };
    if (revokedSerialHexes.length > 0) tbs.revokedCertificates = entries;
    return Bytes.of(
        DerCodec.encode({
            tbs,
            sig2: sig,
            sigVal: { _tag: DerType.BitString, _bytes: new Uint8Array(0), _padding: 0 },
        } as any),
    );
}

/** Format a hex SKID string with colon separators (e.g., "AABB" → "AA:BB"). */
function formatSkidWithColons(hexSkid: string): string {
    return hexSkid
        .match(/.{1,2}/g)!
        .join(":")
        .toUpperCase();
}

/** Set up MockFetch with DCL API responses for a PAA certificate and optional revocation data. */
function setupDclFetchMock(
    fetchMock: MockFetch,
    paaCert: Bytes,
    revocation?: { issuerSkid: string; revokedSerials: string[]; signerCertPem: string; issuerDnDer?: Bytes },
) {
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
    if (revocation !== undefined) {
        const normalizedSkid = revocation.issuerSkid.replace(/:/g, "").toUpperCase();
        fetchMock.addResponse(`/dcl/pki/revocation-points/${normalizedSkid}`, {
            pkiRevocationDistributionPointsByIssuerSubjectKeyID: {
                issuerSubjectKeyID: normalizedSkid,
                points: [
                    {
                        vid: 0xfff1,
                        pid: 0,
                        isPAA: false,
                        label: "test-revocation",
                        crlSignerDelegator: "",
                        crlSignerCertificate: revocation.signerCertPem,
                        issuerSubjectKeyID: normalizedSkid,
                        dataURL: "https://example.com/test.crl",
                        dataFileSize: "",
                        dataDigest: "",
                        dataDigestType: 0,
                        revocationType: 1,
                        schemaVersion: 0,
                    },
                ],
                schemaVersion: 0,
            },
        });
        fetchMock.addResponse(
            "https://example.com/test.crl",
            buildTestCrl(revocation.revokedSerials, revocation.issuerDnDer),
            { binary: true },
        );
    }
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

    /** Called after site + DCL setup but before commissioning. Use to add revocation mocks. */
    setupBeforeCommission?: (context: { fetchMock: MockFetch }) => void | Promise<void>;
}

/**
 * Run a commissioning test with the given attestation options.
 * Handles MockSite setup, entropy, DCL service lifecycle, and cleanup.
 */
async function runAttestationTest(options: AttestationTestOptions) {
    const fetchMock = new MockFetch();
    let dclService: DclCertificateService | undefined;

    try {
        if (options.dclPaaCert !== undefined && options.setupBeforeCommission === undefined) {
            setupDclFetchMock(fetchMock, options.dclPaaCert);
            fetchMock.install();
        }

        await using site = new MockSite();
        const { controller, device } = await site.addUncommissionedPair();

        // setupBeforeCommission sets up its own DCL mocks (e.g., with revocation data)
        if (options.setupBeforeCommission !== undefined) {
            await options.setupBeforeCommission({ fetchMock });
        }

        if (options.dclPaaCert !== undefined) {
            dclService = new DclCertificateService(controller.env, { updateInterval: null });
            await dclService.construction;
            // Inject the Matter test CD signer so CD signature verification works for test CDs
            await dclService.addCertificate(CertificationDeclaration.testSignerCertificate(), "CDSigner");
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
                expectRejection: /finding\(s\) and was rejected by policy/,
            }));

        it("custom callback receives DclServiceUnavailable warning and other findings", () =>
            runAttestationTest({
                onAttestationFailure: () => true,
                assertFindings: findings => {
                    // Local checks run even without DCL — we get warning + info findings
                    const types = findings.map(f => f.type);
                    expect(types).to.include(DeviceAttestationCheck.DclServiceUnavailable);
                    expect(types).to.include(DeviceAttestationCheck.CertificationTypeTest);

                    const dclFinding = findings.find(f => f.type === DeviceAttestationCheck.DclServiceUnavailable);
                    expect(dclFinding!.level).equals("warning");
                },
                assertResult: (device, peers) => {
                    expect(device.state.commissioning.commissioned).equals(true);
                    expect(peers).equals(1);
                },
            }));

        it("custom callback receives findings and rejects", () =>
            runAttestationTest({
                onAttestationFailure: () => false,
                expectRejection: /finding\(s\) and was rejected by policy/,
                assertFindings: findings => {
                    const types = findings.map(f => f.type);
                    expect(types).to.include(DeviceAttestationCheck.DclServiceUnavailable);
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
                    // CD signer is auto-injected from the well-known Matter test signer, so CD
                    // signature verification succeeds (no CdSignerVerificationSkipped expected)
                    expect(types).to.not.include(DeviceAttestationCheck.CdSignerVerificationSkipped);

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

    describe("certificate revocation", () => {
        // PAI revocation is testable because the PAI's AKID = PAA SKID (well-known)
        // and PAI serial is deterministic (0000000000000001).
        // DAC revocation requires the PAI SKID which is random per device instance,
        // so it's covered by unit tests in DeviceAttestationValidatorTest instead.

        it("rejects when PAI serial is in revocation list", () =>
            runAttestationTest({
                dclPaaCert: TestCert_PAA_NoVID_Cert,
                onAttestationFailure: () => false,
                expectRejection: /revoked/i,
                setupBeforeCommission: ({ fetchMock }) => {
                    const paaSkid = Bytes.toHex(TestCert_PAA_NoVID_SKID).toUpperCase();
                    // PAI's issuer DN = PAA's subject DN. For the self-signed PAA, issuerDer = subjectDer.
                    const paa = Paa.fromAsn1(TestCert_PAA_NoVID_Cert);
                    // PAI serial is 01 (from toHex(BigInt(1)) in AttestationCertificateManager)
                    setupDclFetchMock(fetchMock, TestCert_PAA_NoVID_Cert, {
                        issuerSkid: paaSkid,
                        revokedSerials: ["01"],
                        signerCertPem: Pem.encode(TestCert_PAA_NoVID_Cert),
                        issuerDnDer: paa.cert.issuerDer,
                    });
                    fetchMock.install();
                },
                assertFindings: findings => {
                    expect(findings).to.have.length(1);
                    expect(findings[0].type).equals(DeviceAttestationCheck.CertificateRevoked);
                    expect(findings[0].level).equals("error");
                },
            }));

        it("passes when revocation list has different serial numbers", () =>
            runAttestationTest({
                dclPaaCert: TestCert_PAA_NoVID_Cert,
                onAttestationFailure: () => true,
                setupBeforeCommission: ({ fetchMock }) => {
                    const paaSkid = Bytes.toHex(TestCert_PAA_NoVID_SKID).toUpperCase();
                    setupDclFetchMock(fetchMock, TestCert_PAA_NoVID_Cert, {
                        issuerSkid: paaSkid,
                        revokedSerials: ["DEADBEEF", "CAFEBABE"],
                        signerCertPem: Pem.encode(TestCert_PAA_NoVID_Cert),
                    });
                    fetchMock.install();
                },
                assertFindings: findings => {
                    const revoked = findings.find(f => f.type === DeviceAttestationCheck.CertificateRevoked);
                    expect(revoked).to.be.undefined;
                },
                assertResult: (device, peers) => {
                    expect(device.state.commissioning.commissioned).equals(true);
                    expect(peers).equals(1);
                },
            }));

        it("dynamically fetches revocation data from DCL during commissioning", () => {
            let capturedFetchMock: MockFetch | undefined;
            const paaSkid = Bytes.toHex(TestCert_PAA_NoVID_SKID).toUpperCase();

            return runAttestationTest({
                dclPaaCert: TestCert_PAA_NoVID_Cert,
                onAttestationFailure: () => true,
                setupBeforeCommission: ({ fetchMock }) => {
                    capturedFetchMock = fetchMock;
                    setupDclFetchMock(fetchMock, TestCert_PAA_NoVID_Cert, {
                        issuerSkid: paaSkid,
                        revokedSerials: [],
                        signerCertPem: Pem.encode(TestCert_PAA_NoVID_Cert),
                    });
                    fetchMock.install();
                },
                assertResult: () => {
                    // Verify that the by-issuer revocation endpoint was called on-demand during commissioning
                    const callLog = capturedFetchMock!.getCallLog();
                    const revocationCalls = callLog.filter(call =>
                        call.url.includes(`/dcl/pki/revocation-points/${paaSkid}`),
                    );
                    expect(revocationCalls.length).to.be.greaterThan(
                        0,
                        "Expected on-demand DCL revocation lookup during commissioning",
                    );
                },
            });
        });
    });
});
