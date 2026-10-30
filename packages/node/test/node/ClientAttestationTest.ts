/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import {
    Bytes,
    ContextTagged,
    Crypto,
    DerCodec,
    DerType,
    MockCrypto,
    MockFetch,
    Pem,
    PrivateKey,
    Seconds,
    StandardCrypto,
    StorageService,
    X509,
    X962,
} from "@matter/general";
import { MockServerNode, MockSite } from "@matter/node/testing";
import {
    AttestationFinding,
    CertificationDeclaration,
    CommissioningError,
    DclCertificateService,
    DeviceAttestationCheck,
    DeviceAttestationError,
    DeviceAttestationValidator,
    Paa,
    TestCert_PAA_FFF1_Cert,
    TestCert_PAA_NoVID_Cert,
    TestCert_PAA_NoVID_PrivateKey,
    TestCert_PAA_NoVID_PublicKey,
    TestCert_PAA_NoVID_SKID,
} from "@matter/protocol";

/**
 * Build a CRL of the CHIP test PAA without vendor ID with the given revoked serial numbers (hex strings), signed and
 * naming the PAA in its Authority Key Identifier as Matter Core §6.2.6.1 requires.
 */
async function buildTestCrl(revokedSerialHexes: string[], issuerDnDer?: Bytes): Promise<Uint8Array> {
    const entries: Record<string, any> = {};
    for (let i = 0; i < revokedSerialHexes.length; i++) {
        entries[`e${i}`] = {
            serial: { _tag: DerType.Integer, _bytes: Bytes.fromHex(revokedSerialHexes[i]) },
            date: { _tag: DerType.UtcDate, _bytes: Bytes.fromString("250101000000Z") },
        } as any;
    }
    const tbs: Record<string, any> = {
        version: { _tag: DerType.Integer, _bytes: Uint8Array.of(1) },
        signature: X962.EcdsaWithSHA256,
        issuer: DerCodec.decode(
            issuerDnDer ?? Paa.fromAsn1(TestCert_PAA_NoVID_Cert).cert.subjectDer ?? new Uint8Array(),
        ),
        thisUpdate: { _tag: DerType.UtcDate, _bytes: Bytes.fromString("250101000000Z") },
    };
    if (revokedSerialHexes.length > 0) tbs.revokedCertificates = entries;
    tbs.crlExtensions = ContextTagged(0, {
        authorityKeyIdentifier: X509.AuthorityKeyIdentifier(TestCert_PAA_NoVID_SKID),
    });

    const paaKey = PrivateKey(TestCert_PAA_NoVID_PrivateKey, { publicKey: TestCert_PAA_NoVID_PublicKey });
    const signature = await new StandardCrypto().signEcdsa(paaKey, DerCodec.encode(tbs));
    return Bytes.of(
        DerCodec.encode({
            tbs,
            sig2: X962.EcdsaWithSHA256,
            sigVal: { _tag: DerType.BitString, _bytes: signature.der, _padding: 0 },
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
    revocation?: { issuerSkid: string; signerCertPem: string; crl: Bytes },
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
                        approvals: [],
                        rejects: [],
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
                        isPAA: true,
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
        fetchMock.addResponse("https://example.com/test.crl", revocation.crl, { binary: true });
    }
}

/**
 * CHIP test vector struct_dac_ext_basic_ca_wrong (connectedhomeip credentials/development/commissioner_dut): a DAC with cA set to TRUE,
 * which violates the DAC profile, with its key, PAI and Certification Declaration for VendorID 0xFFF1 and ProductID
 * 0x8000.
 */
const DAC_PROFILE_VIOLATION = {
    privateKey: "0b693783a3c15e1ac0edb2285d8dfd9c862d82e4708c420f6071e78a1a96ecfe",
    certificate:
        "308201d130820177a00302010202083b56a43ddd336667300a06082a8648ce3d04030230303118301606035504030c0f4d617474657220546573742050414931143012060a2b0601040182a27c02010c04464646313020170d3232303932333030303030305a180f39393939313233313233353935395a30463118301606035504030c0f4d617474657220546573742044414331143012060a2b0601040182a27c02010c044646463131143012060a2b0601040182a27c02020c04383030303059301306072a8648ce3d020106082a8648ce3d0301070342000445b4b2be47ed9b260dcb3e7083b62d826a65d798f5173daae437d43a44ebc471cdfa6f77259262643041936522f0ec35c84a3eb9589ed95279eba9afa8d81bbda3633061300f0603551d130101ff040530030101ff300e0603551d0f0101ff040403020780301d0603551d0e04160414da0e770aa51514be235842ba34494867f0a87d35301f0603551d230418301680145d227b7af2389dfcf038be059d03a8845fa5958e300a06082a8648ce3d0403020348003045022100f4d16c045c3b94aa44b4515ffe0db0af003a2edf98742c161401bb1223a6aee7022023a97ffc1d72704122ec036e9404b79a363d25bd9dd75e1420bcab33e724c4d7",
    intermediateCertificate:
        "308201be30820164a0030201020208399cc990009060a3300a06082a8648ce3d04030230303118301606035504030c0f4d617474657220546573742050414131143012060a2b0601040182a27c02010c04464646313020170d3232303932333030303030305a180f39393939313233313233353935395a30303118301606035504030c0f4d617474657220546573742050414931143012060a2b0601040182a27c02010c04464646313059301306072a8648ce3d020106082a8648ce3d0301070342000436323ffb940179b7795f28f7b0777d5e92c8ab8fc258e2fab5efd7dc095402111c4d9ab60a9b3bcd761ff0c97ea88c39491a7e110efb2167407a0c1d95eaf95da366306430120603551d130101ff040830060101ff020100300e0603551d0f0101ff040403020106301d0603551d0e041604145d227b7af2389dfcf038be059d03a8845fa5958e301f0603551d230418301680146afd22771f511fecbf1641976710dcdc31a1717e300a06082a8648ce3d04030203480030450220038b785c2d8a1e213660b860d781b49794399a852bb303f5bbb34c5e6b247cc6022100e63ba37ecb72f10f8cb01075923a3f006808ff84cf8b8c997da657d7e1a6e3f0",
    declaration:
        "3081e906092a864886f70d010702a081db3081d8020103310d300b0609608648016503040201304506092a864886f70d010701a0380436152400012501f1ff360205008018250334122c04135a494732303134315a423333303030312d32342405002406002507769824080018317d307b020103801462fa823359acfaa9963e1cfa140addf504f37160300b0609608648016503040201300a06082a8648ce3d04030204473045022028cc0043c6f627c9aaef3441800fa99746c1a5728157df2aeb4946fc6c071ffe022100b03185ac043cbb929dcdb20274350c5290128b214027235e4b5480d3ee559e8c",
};

/**
 * Options for a commissioning attestation test case.
 */
interface AttestationTestOptions {
    /** PAA cert to register in DCL trust store. undefined = no DclCertificateService. */
    dclPaaCert?: Bytes;

    /**
     * When true, inject `dclPaaCert` directly as a test-only PAA (isProduction: false) and
     * skip the production DCL fetch mock. Used to exercise the `TrustedAsTestCertificate` finding.
     */
    paaAsTestOnly?: boolean;

    /** The onAttestationFailure commissioning option. */
    onAttestationFailure?: DeviceAttestationValidator.OnAttestationFailure;

    /**
     * If set, commissioning is expected to be rejected. `RegExp` matches the thrown error's message;
     * a function receives the thrown error for arbitrary inspection (instance type, `cause` chain, etc.).
     */
    expectRejection?: RegExp | ((err: unknown) => void | Promise<void>);

    /** Assertions to run on the findings captured by the callback (if callback was used). */
    assertFindings?: (findings: AttestationFinding[]) => void;

    /** Additional assertions on device/controller state after commissioning. */
    assertResult?: (
        device: { state: { commissioning: { commissioned: boolean } } },
        controllerPeerCount: number,
    ) => void;

    /** Called after site + DCL setup but before commissioning. Use to add revocation mocks. */
    setupBeforeCommission?: (context: { fetchMock: MockFetch }) => void | Promise<void>;

    /**
     * After the DCL trust store is populated, overwrite the cached PAA at this SKID with unparseable
     * bytes. With re-fetch available this exercises the storage self-heal; combined with
     * {@link blockCachedPaaRefetch} it exercises the unexpected-error → finding path.
     */
    corruptCachedPaaSkid?: Bytes | string;

    /** Block the DCL root-certificate re-fetch so a corrupted cache cannot self-heal. */
    blockCachedPaaRefetch?: boolean;

    /** Hex encoded certification the device presents instead of a generated one. */
    deviceCertification?: typeof DAC_PROFILE_VIOLATION;
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
            if (options.paaAsTestOnly) {
                fetchMock.addResponse("/dcl/pki/root-certificates", {
                    approvedRootCertificates: { schemaVersion: 0, certs: [] },
                });
            } else {
                setupDclFetchMock(fetchMock, options.dclPaaCert);
            }
            fetchMock.install();
        }

        await using site = new MockSite();
        const certification = options.deviceCertification;
        const { controller, device } = await site.addUncommissionedPair(
            certification === undefined
                ? undefined
                : {
                      device: {
                          type: MockServerNode.RootEndpoint,
                          operationalCredentials: {
                              certification: {
                                  privateKey: Bytes.fromHex(certification.privateKey),
                                  certificate: Bytes.fromHex(certification.certificate),
                                  intermediateCertificate: Bytes.fromHex(certification.intermediateCertificate),
                                  declaration: Bytes.fromHex(certification.declaration),
                              },
                          },
                      },
                  },
        );

        // setupBeforeCommission sets up its own DCL mocks (e.g., with revocation data)
        if (options.setupBeforeCommission !== undefined) {
            await options.setupBeforeCommission({ fetchMock });
        }

        if (options.dclPaaCert !== undefined) {
            dclService = new DclCertificateService(controller.env, { updateInterval: null });
            await dclService.construction;
            if (options.paaAsTestOnly) {
                await dclService.addCertificate(options.dclPaaCert, "PAA", { isProduction: false });
            }
            // Inject the Matter test CD signer so CD signature verification works for test CDs
            await dclService.addCertificate(CertificationDeclaration.testSignerCertificate(), "CDSigner");

            if (options.corruptCachedPaaSkid !== undefined) {
                const normalizedSkid =
                    typeof options.corruptCachedPaaSkid === "string"
                        ? options.corruptCachedPaaSkid.replace(/:/g, "").toUpperCase()
                        : Bytes.toHex(options.corruptCachedPaaSkid).toUpperCase();
                const storage = await controller.env.get(StorageService).open("certificates");
                await storage.createContext("root").set(normalizedSkid, Bytes.fromHex("3003010203"));
                if (options.blockCachedPaaRefetch) {
                    // Empty root list wins on reverse-order match, so the corrupt cache cannot self-heal.
                    fetchMock.addResponse("/dcl/pki/root-certificates", {
                        approvedRootCertificates: { schemaVersion: 0, certs: [] },
                    });
                }
            }
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
            if (options.expectRejection instanceof RegExp) {
                await expect(commissionPromise).to.be.rejectedWith(options.expectRejection);
            } else {
                let thrown: unknown;
                try {
                    await commissionPromise;
                } catch (err) {
                    thrown = err;
                }
                expect(thrown, "commissioning was expected to reject but resolved").to.not.be.undefined;
                await options.expectRejection(thrown);
            }
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
    });

    describe("DAC that violates the DAC profile", () => {
        it("reports the DAC as unparseable and rejects when policy rejects", () =>
            runAttestationTest({
                deviceCertification: DAC_PROFILE_VIOLATION,
                onAttestationFailure: () => false,
                expectRejection: /DAC certificate that cannot be parsed/,
                assertFindings: findings => {
                    expect(findings.map(({ type }) => type)).deep.equals([
                        DeviceAttestationCheck.CertificateUnparseable,
                    ]);
                },
            }));

        it("commissions when policy accepts", () =>
            runAttestationTest({
                deviceCertification: DAC_PROFILE_VIOLATION,
                onAttestationFailure: () => true,
                assertFindings: findings => {
                    expect(findings.map(({ type }) => type)).deep.equals([
                        DeviceAttestationCheck.CertificateUnparseable,
                    ]);
                },
                assertResult: (device, peers) => {
                    expect(device.state.commissioning.commissioned).equals(true);
                    expect(peers).equals(1);
                },
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

    describe("corrupt cached PAA", () => {
        it("self-heals a corrupt cached PAA by re-fetching from DCL", () =>
            runAttestationTest({
                dclPaaCert: TestCert_PAA_NoVID_Cert,
                corruptCachedPaaSkid: TestCert_PAA_NoVID_SKID,
                onAttestationFailure: () => true,
                assertFindings: findings => {
                    // Recovered, so the normal chain runs — no unexpected ValidationError.
                    expect(findings.map(f => f.type)).to.not.include(DeviceAttestationCheck.ValidationError);
                },
                assertResult: device => {
                    expect(device.state.commissioning.commissioned).equals(true);
                },
            }));

        it("surfaces an unrecoverable corrupt cached PAA as a judgeable finding", () =>
            runAttestationTest({
                dclPaaCert: TestCert_PAA_NoVID_Cert,
                corruptCachedPaaSkid: TestCert_PAA_NoVID_SKID,
                blockCachedPaaRefetch: true,
                onAttestationFailure: () => true,
                assertFindings: findings => {
                    expect(findings.map(f => f.type)).to.include(DeviceAttestationCheck.ValidationError);
                },
                assertResult: device => {
                    expect(device.state.commissioning.commissioned).equals(true);
                },
            }));

        it("rejects an unrecoverable corrupt cached PAA when policy rejects, surfacing the cause", () =>
            runAttestationTest({
                dclPaaCert: TestCert_PAA_NoVID_Cert,
                corruptCachedPaaSkid: TestCert_PAA_NoVID_SKID,
                blockCachedPaaRefetch: true,
                onAttestationFailure: false,
                expectRejection: /DER data is truncated/,
            }));
    });

    describe("with DCL trust store (test-only PAA)", () => {
        it("emits TrustedAsTestCertificate finding, callback rejects", () =>
            runAttestationTest({
                dclPaaCert: TestCert_PAA_NoVID_Cert,
                paaAsTestOnly: true,
                onAttestationFailure: () => false,
                expectRejection: /finding\(s\) and was rejected by policy/,
                assertFindings: findings => {
                    const trusted = findings.find(f => f.type === DeviceAttestationCheck.TrustedAsTestCertificate);
                    expect(trusted).to.not.be.undefined;
                    expect(trusted!.level).equals("error");
                },
            }));

        it("emits TrustedAsTestCertificate finding, callback accepts → commissioning proceeds", () =>
            runAttestationTest({
                dclPaaCert: TestCert_PAA_NoVID_Cert,
                paaAsTestOnly: true,
                onAttestationFailure: () => true,
                assertFindings: findings => {
                    const types = findings.map(f => f.type);
                    expect(types).to.include(DeviceAttestationCheck.TrustedAsTestCertificate);
                },
                assertResult: (device, peers) => {
                    expect(device.state.commissioning.commissioned).equals(true);
                    expect(peers).equals(1);
                },
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
                setupBeforeCommission: async ({ fetchMock }) => {
                    const paaSkid = Bytes.toHex(TestCert_PAA_NoVID_SKID).toUpperCase();
                    // PAI's issuer DN = PAA's subject DN. For the self-signed PAA, issuerDer = subjectDer.
                    const paa = Paa.fromAsn1(TestCert_PAA_NoVID_Cert);
                    // PAI serial is 01 (from toHex(BigInt(1)) in AttestationCertificateManager)
                    setupDclFetchMock(fetchMock, TestCert_PAA_NoVID_Cert, {
                        issuerSkid: paaSkid,
                        signerCertPem: Pem.encode(TestCert_PAA_NoVID_Cert),
                        crl: await buildTestCrl(["01"], paa.cert.issuerDer),
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
                setupBeforeCommission: async ({ fetchMock }) => {
                    const paaSkid = Bytes.toHex(TestCert_PAA_NoVID_SKID).toUpperCase();
                    setupDclFetchMock(fetchMock, TestCert_PAA_NoVID_Cert, {
                        issuerSkid: paaSkid,
                        signerCertPem: Pem.encode(TestCert_PAA_NoVID_Cert),
                        crl: await buildTestCrl(["DEADBEEF", "CAFEBABE"]),
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
                setupBeforeCommission: async ({ fetchMock }) => {
                    capturedFetchMock = fetchMock;
                    setupDclFetchMock(fetchMock, TestCert_PAA_NoVID_Cert, {
                        issuerSkid: paaSkid,
                        signerCertPem: Pem.encode(TestCert_PAA_NoVID_Cert),
                        crl: await buildTestCrl([]),
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

    describe("onAttestationFailure callback contract", () => {
        it("string return on success-path findings wraps the synthesized error as cause", () =>
            runAttestationTest({
                dclPaaCert: TestCert_PAA_NoVID_Cert,
                onAttestationFailure: () => "operator declined: test attestation",
                expectRejection: err => {
                    expect(err).to.be.instanceOf(CommissioningError);
                    expect((err as CommissioningError).message).to.equal("operator declined: test attestation");
                    const cause = (err as Error).cause;
                    expect(cause).to.be.instanceOf(CommissioningError);
                    expect((cause as CommissioningError).message).to.match(/finding\(s\) and was rejected by policy/);
                },
            }));

        it("string return on hard-error finding wraps the original DeviceAttestationError as cause", () =>
            runAttestationTest({
                dclPaaCert: TestCert_PAA_FFF1_Cert,
                onAttestationFailure: () => "operator declined: untrusted PAA",
                expectRejection: err => {
                    expect(err).to.be.instanceOf(CommissioningError);
                    expect((err as CommissioningError).message).to.equal("operator declined: untrusted PAA");
                    const cause = (err as Error).cause;
                    expect(cause).to.be.instanceOf(DeviceAttestationError);
                    expect((cause as DeviceAttestationError).failure).to.equal(DeviceAttestationCheck.PaaNotTrusted);
                },
            }));

        it("callback throw propagates verbatim (no wrapping)", () => {
            class CustomRejection extends Error {}
            return runAttestationTest({
                dclPaaCert: TestCert_PAA_FFF1_Cert,
                onAttestationFailure: () => {
                    throw new CustomRejection("custom rejection");
                },
                expectRejection: err => {
                    expect(err).to.be.instanceOf(CustomRejection);
                    expect((err as Error).message).to.equal("custom rejection");
                    expect((err as Error).cause).to.be.undefined;
                },
            });
        });

        it("callback throwing DeviceAttestationError on success-path findings propagates without re-invocation", () => {
            let invocations = 0;
            return runAttestationTest({
                dclPaaCert: TestCert_PAA_NoVID_Cert,
                onAttestationFailure: () => {
                    invocations++;
                    throw new DeviceAttestationError(
                        DeviceAttestationCheck.AttestationSignatureInvalid,
                        "from callback",
                    );
                },
                expectRejection: err => {
                    expect(err).to.be.instanceOf(DeviceAttestationError);
                    expect((err as DeviceAttestationError).failure).to.equal(
                        DeviceAttestationCheck.AttestationSignatureInvalid,
                    );
                    expect((err as Error).message).to.equal("from callback");
                    expect(invocations).to.equal(1);
                },
            });
        });

        it("callback throwing DeviceAttestationError on hard-error finding propagates without re-invocation", () => {
            let invocations = 0;
            return runAttestationTest({
                dclPaaCert: TestCert_PAA_FFF1_Cert,
                onAttestationFailure: () => {
                    invocations++;
                    throw new DeviceAttestationError(
                        DeviceAttestationCheck.AttestationSignatureInvalid,
                        "from callback",
                    );
                },
                expectRejection: err => {
                    expect(err).to.be.instanceOf(DeviceAttestationError);
                    expect((err as DeviceAttestationError).failure).to.equal(
                        DeviceAttestationCheck.AttestationSignatureInvalid,
                    );
                    expect((err as Error).message).to.equal("from callback");
                    expect(invocations).to.equal(1);
                },
            });
        });
    });
});
