/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { AttestationCertificateManager } from "#certificate/AttestationCertificateManager.js";
import { TestCert_PAA_NoVID_Cert } from "#certificate/ChipPAAuthorities.js";
import {
    DeviceAttestationCheck,
    DeviceAttestationError,
    DeviceAttestationValidator,
} from "#certificate/DeviceAttestationValidator.js";
import { Dac, Paa, Pai } from "#certificate/kinds/AttestationCertificates.js";
import { CertificationDeclaration } from "#certificate/kinds/CertificationDeclaration.js";
import { TlvAttestation } from "#common/OperationalCredentialsTypes.js";
import { DclCertificateService } from "#dcl/DclCertificateService.js";
import {
    Bytes,
    Crypto,
    Environment,
    MockFetch,
    MockStorageService,
    PrivateKey,
    PublicKey,
    StandardCrypto,
} from "@matter/general";
import { VendorId } from "@matter/types";
import { buildTestCrl, pemEncode } from "./TestHelpers.js";

describe("DeviceAttestationValidator", () => {
    const crypto = new StandardCrypto();
    const vendorId = VendorId(0xfff1);
    const productId = 0x8000;

    // Fixed attestation challenge (16 bytes) and nonce (32 bytes) for tests
    const attestationChallenge = crypto.randomBytes(16);
    const attestationNonce = crypto.randomBytes(32);

    // CD signer info for tests
    const cdSigner = CertificationDeclaration.testSignerInfo();
    const cdSignerPublicKeys = new Map<string, PublicKey>([
        [Bytes.toHex(cdSigner.subjectKeyId), PublicKey(cdSigner.publicKey)],
    ]);

    let fetchMock: MockFetch;
    let environment: Environment;
    let service: DclCertificateService | undefined;
    let certManager: AttestationCertificateManager;
    let paiDer: Bytes;
    let dacDer: Bytes;
    let dacPublicKey: Bytes;
    let dacPrivateKey: PrivateKey;

    // Pre-computed valid attestation elements and signature
    let validCdBytes: Bytes;
    let validAttestationElements: Bytes;
    let validAttestationSignature: Bytes;

    // Pre-generated DAC with wrong vendor ID (generated at same time as PAI to avoid date mismatch)
    let wrongVendorDacDer: Bytes;

    before(async () => {
        // Create the cert manager and generate PAI and DAC
        certManager = await AttestationCertificateManager.create(crypto, vendorId);
        paiDer = await certManager.getPAICert();
        const dacResult = await certManager.getDACert(productId);
        dacDer = dacResult.dac;
        dacPublicKey = dacResult.keyPair.publicKey;
        dacPrivateKey = PrivateKey(dacResult.keyPair);

        // Generate a DAC with wrong vendorId at the same time as PAI to avoid validity period mismatch
        const wrongVendorId = VendorId(0xfff2);
        wrongVendorDacDer = await certManager.generateDaCert(dacPublicKey, wrongVendorId, productId);

        // Generate a valid Certification Declaration
        validCdBytes = await CertificationDeclaration.generate(crypto, vendorId, productId);

        // Build valid attestation elements (TLV-encoded) with real CD
        validAttestationElements = TlvAttestation.encode({
            declaration: validCdBytes,
            attestationNonce,
            timestamp: 0,
        });

        // Sign [attestationElements, attestationChallenge] with DAC private key
        // This mirrors how the device signs in DeviceCertification.ts
        const sig = await crypto.signEcdsa(dacPrivateKey, [validAttestationElements, attestationChallenge]);
        validAttestationSignature = sig.bytes;
    });

    beforeEach(async () => {
        fetchMock = new MockFetch();
        environment = new Environment("test");

        new MockStorageService(environment);
        environment.set(Crypto, crypto);

        MockTime.reset();
        service = undefined;
    });

    afterEach(async () => {
        fetchMock.uninstall();
        if (service) {
            await service.close();
        }
    });

    /**
     * Set up DclCertificateService with a PAA cert in its trust store.
     * Uses MockFetch to simulate DCL API responses.
     * Optionally includes revocation data for the specified issuer SKID and serial numbers.
     */
    async function setupDclService(
        paaCert: Bytes = TestCert_PAA_NoVID_Cert,
        revocation?: { issuerSkid: string; revokedSerials: string[] },
    ) {
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

        if (revocation) {
            const issuerSkidWithColons = revocation.issuerSkid
                .match(/.{1,2}/g)!
                .join(":")
                .toUpperCase();
            const testCrl = buildTestCrl(revocation.revokedSerials);

            fetchMock.addResponse("/dcl/pki/revocation-points", {
                PkiRevocationDistributionPoint: [
                    {
                        vid: 0xfff1,
                        pid: 0,
                        isPAA: false,
                        label: "test-revocation",
                        crlSignerDelegator: "",
                        crlSignerCertificate: pemEncode(paiDer),
                        issuerSubjectKeyID: issuerSkidWithColons,
                        dataURL: "https://example.com/test.crl",
                        dataFileSize: "",
                        dataDigest: "",
                        dataDigestType: 0,
                        revocationType: 1,
                        schemaVersion: 0,
                    },
                ],
            });
            fetchMock.addResponse("https://example.com/test.crl", testCrl, { binary: true });
        } else {
            // Default empty revocation response
            fetchMock.addResponse("/dcl/pki/revocation-points", {
                PkiRevocationDistributionPoint: [],
            });
        }

        fetchMock.install();

        service = new DclCertificateService(environment, { updateInterval: null });
        await service.construction;
        return service;
    }

    /**
     * Build attestation elements and signature from a custom CD.
     * Re-signs with the DAC private key so the attestation signature is valid.
     */
    async function buildAttestationWithCd(cdBytes: Bytes) {
        const attestationElements = TlvAttestation.encode({
            declaration: cdBytes,
            attestationNonce,
            timestamp: 0,
        });
        const sig = await crypto.signEcdsa(dacPrivateKey, [attestationElements, attestationChallenge]);
        return { attestationElements, attestationSignature: sig.bytes };
    }

    /** Build a DeviceAttestationData object with valid attestation data by default. */
    function buildData(
        overrides?: Partial<DeviceAttestationValidator.DeviceAttestationData>,
    ): DeviceAttestationValidator.DeviceAttestationData {
        return {
            dac: dacDer,
            pai: paiDer,
            attestationElements: validAttestationElements,
            attestationSignature: validAttestationSignature,
            attestationNonce,
            vendorId,
            productId,
            ...overrides,
        };
    }

    /** Build a Context object with valid attestation challenge and CD signer keys by default. */
    function buildContext(
        dclService: DclCertificateService,
        overrides?: Partial<DeviceAttestationValidator.Context>,
    ): DeviceAttestationValidator.Context {
        return {
            crypto,
            dclCertificateService: dclService,
            attestationChallenge,
            cdSignerPublicKeys,
            ...overrides,
        };
    }

    describe("valid chain passes validation", () => {
        it("passes validation with valid chain, nonce, signature, and CD", async () => {
            const dclService = await setupDclService();

            // Should not throw
            await DeviceAttestationValidator.validate(buildContext(dclService), buildData());
        });
    });

    describe("PAA trust store", () => {
        it("throws PaaNotTrusted when PAA is not in trust store", async () => {
            // Set up service with empty trust store
            fetchMock.addResponse("/dcl/pki/root-certificates", {
                approvedRootCertificates: { schemaVersion: 0, certs: [] },
            });
            fetchMock.install();

            service = new DclCertificateService(environment, { updateInterval: null });
            await service.construction;

            await expect(DeviceAttestationValidator.validate(buildContext(service), buildData())).to.be.rejectedWith(
                DeviceAttestationError,
                /PAA not found in trust store/,
            );
        });
    });

    describe("certificate chain verification", () => {
        it("throws CertificateChainInvalid for tampered PAI", async () => {
            const dclService = await setupDclService();

            // Create a tampered PAI by flipping a byte near the end (in the signature area)
            const tamperedPai = Bytes.of(paiDer).slice();
            tamperedPai[tamperedPai.length - 5] ^= 0xff;

            await expect(
                DeviceAttestationValidator.validate(buildContext(dclService), buildData({ pai: tamperedPai })),
            ).to.be.rejectedWith(DeviceAttestationError, /PAI signature verification failed/);
        });

        it("throws CertificateChainInvalid for tampered DAC", async () => {
            const dclService = await setupDclService();

            // Create a tampered DAC by flipping a byte near the end
            const tamperedDac = Bytes.of(dacDer).slice();
            tamperedDac[tamperedDac.length - 5] ^= 0xff;

            await expect(
                DeviceAttestationValidator.validate(buildContext(dclService), buildData({ dac: tamperedDac })),
            ).to.be.rejectedWith(DeviceAttestationError, /DAC signature verification failed/);
        });

        it("throws CertificateChainInvalid when DAC is signed by wrong PAI", async () => {
            // Create a second cert manager with different PAI keys (same PAA)
            const otherManager = await AttestationCertificateManager.create(crypto, vendorId);
            const otherPai = await otherManager.getPAICert();

            const dclService = await setupDclService();

            // Use our DAC (signed by our PAI key) with the other manager's PAI
            // The DAC signature won't verify against the other PAI's public key
            await expect(
                DeviceAttestationValidator.validate(buildContext(dclService), buildData({ pai: otherPai })),
            ).to.be.rejectedWith(DeviceAttestationError, /DAC signature verification failed/);
        });
    });

    describe("certificate validity period (Step 3b)", () => {
        it("passes when DAC notBefore is within PAI and PAA validity window", async () => {
            const dclService = await setupDclService();

            // The default test chain has overlapping validity periods (all created at approx same time
            // with notBefore = now-1year, notAfter = now+10years). This exercises the Step 3b code path.
            await DeviceAttestationValidator.validate(buildContext(dclService), buildData());
        });

        it("validates that test chain has expected overlapping dates", () => {
            // Parse the certs and verify dates are consistent - ensures Step 3b is meaningful
            const dac = Dac.fromAsn1(dacDer);
            const pai = Pai.fromAsn1(paiDer);
            const paa = Paa.fromAsn1(TestCert_PAA_NoVID_Cert);

            // DAC notBefore should be >= PAI notBefore (both generated with now-1y)
            expect(dac.cert.notBefore).to.be.greaterThanOrEqual(pai.cert.notBefore);
            // DAC notBefore should be >= PAA notBefore
            expect(dac.cert.notBefore).to.be.greaterThanOrEqual(paa.cert.notBefore);

            // PAI notAfter should be > DAC notBefore (PAI is still valid at DAC's start)
            if (pai.cert.notAfter !== 0) {
                expect(pai.cert.notAfter).to.be.greaterThan(dac.cert.notBefore);
            }
            // PAA notAfter should be > DAC notBefore (PAA is still valid at DAC's start)
            if (paa.cert.notAfter !== 0) {
                expect(paa.cert.notAfter).to.be.greaterThan(dac.cert.notBefore);
            }
        });
    });

    describe("VendorID matching", () => {
        it("throws VendorIdMismatch when DAC vendorId does not match PAI vendorId", async () => {
            const dclService = await setupDclService();

            // Use the pre-generated DAC with wrong vendorId (created at same time as PAI in before())
            await expect(
                DeviceAttestationValidator.validate(buildContext(dclService), buildData({ dac: wrongVendorDacDer })),
            ).to.be.rejectedWith(DeviceAttestationError, /DAC vendorId.*does not match PAI vendorId/);
        });
    });

    describe("attestation nonce verification", () => {
        it("passes when attestation nonce matches", async () => {
            const dclService = await setupDclService();

            // Should not throw - valid nonce is already in buildData defaults
            await DeviceAttestationValidator.validate(buildContext(dclService), buildData());
        });

        it("throws AttestationNonceMismatch when nonce does not match", async () => {
            const dclService = await setupDclService();

            // Use a different nonce than what's in the attestation elements
            const wrongNonce = crypto.randomBytes(32);

            await expect(
                DeviceAttestationValidator.validate(
                    buildContext(dclService),
                    buildData({ attestationNonce: wrongNonce }),
                ),
            ).to.be.rejectedWith(DeviceAttestationError, /AttestationNonce in response does not match/);
        });
    });

    describe("attestation signature verification", () => {
        it("passes with valid signature", async () => {
            const dclService = await setupDclService();

            // Should not throw - valid signature is already in buildData defaults
            await DeviceAttestationValidator.validate(buildContext(dclService), buildData());
        });

        it("throws AttestationSignatureInvalid for tampered signature", async () => {
            const dclService = await setupDclService();

            // Tamper with the signature bytes (flip a byte)
            const tamperedSignature = Bytes.of(validAttestationSignature).slice();
            tamperedSignature[10] ^= 0xff;

            await expect(
                DeviceAttestationValidator.validate(
                    buildContext(dclService),
                    buildData({ attestationSignature: tamperedSignature }),
                ),
            ).to.be.rejectedWith(DeviceAttestationError, /Attestation signature verification failed/);
        });

        it("throws AttestationSignatureInvalid when signed with wrong attestation challenge", async () => {
            const dclService = await setupDclService();

            // Sign with a different attestation challenge
            const wrongChallenge = crypto.randomBytes(16);
            const sig = await crypto.signEcdsa(dacPrivateKey, [validAttestationElements, wrongChallenge]);

            // The signature was made with wrongChallenge, but the context has the original challenge
            await expect(
                DeviceAttestationValidator.validate(
                    buildContext(dclService),
                    buildData({ attestationSignature: sig.bytes }),
                ),
            ).to.be.rejectedWith(DeviceAttestationError, /Attestation signature verification failed/);
        });

        it("throws AttestationSignatureInvalid when signed with wrong key", async () => {
            const dclService = await setupDclService();

            // Sign with a completely different key pair
            const otherKey = await crypto.createKeyPair();
            const sig = await crypto.signEcdsa(otherKey, [validAttestationElements, attestationChallenge]);

            await expect(
                DeviceAttestationValidator.validate(
                    buildContext(dclService),
                    buildData({ attestationSignature: sig.bytes }),
                ),
            ).to.be.rejectedWith(DeviceAttestationError, /Attestation signature verification failed/);
        });
    });

    describe("Certification Declaration signature verification", () => {
        it("passes with valid CD signature when signer key is provided", async () => {
            const dclService = await setupDclService();

            // Should not throw - valid CD with matching signer key
            await DeviceAttestationValidator.validate(buildContext(dclService), buildData());
        });

        it("skips CD signature verification when cdSignerPublicKeys is not provided", async () => {
            const dclService = await setupDclService();

            // No cdSignerPublicKeys in context - should still pass (skips verification with warning)
            await DeviceAttestationValidator.validate(
                buildContext(dclService, { cdSignerPublicKeys: undefined }),
                buildData(),
            );
        });

        it("throws CertificationDeclarationSignatureInvalid for CD signed with wrong key", async () => {
            const dclService = await setupDclService();

            // Create a CD signed with a different key but using the same SKID as the test signer.
            // This ensures the SKID lookup succeeds but the signature verification fails.
            const wrongKey = await crypto.createKeyPair();
            const wrongSignedCd = new CertificationDeclaration(
                {
                    formatVersion: 1,
                    vendorId,
                    produceIdArray: [productId],
                    deviceTypeId: 22,
                    certificateId: "CSA00000SWC00000-00",
                    securityLevel: 0,
                    securityInformation: 0,
                    versionNumber: 1,
                    certificationType: 0,
                },
                cdSigner.subjectKeyId,
            );
            const wrongSignedCdBytes = await wrongSignedCd.asSignedAsn1(crypto, wrongKey);

            const { attestationElements, attestationSignature } = await buildAttestationWithCd(wrongSignedCdBytes);

            await expect(
                DeviceAttestationValidator.validate(
                    buildContext(dclService),
                    buildData({ attestationElements, attestationSignature }),
                ),
            ).to.be.rejectedWith(DeviceAttestationError, /Certification Declaration signature verification failed/);
        });
    });

    describe("Certification Declaration field validation", () => {
        it("passes with matching vendorId and productId", async () => {
            const dclService = await setupDclService();

            // Should not throw - valid CD matches vendorId and productId
            await DeviceAttestationValidator.validate(buildContext(dclService), buildData());
        });

        it("throws CertificationDeclarationFieldMismatch when CD vendorId does not match BasicInformation", async () => {
            const dclService = await setupDclService();

            // Generate CD with a different vendorId
            const wrongVendorCd = await CertificationDeclaration.generate(crypto, VendorId(0xfff2), productId);
            const { attestationElements, attestationSignature } = await buildAttestationWithCd(wrongVendorCd);

            await expect(
                DeviceAttestationValidator.validate(
                    buildContext(dclService),
                    buildData({ attestationElements, attestationSignature }),
                ),
            ).to.be.rejectedWith(DeviceAttestationError, /CD vendor_id.*does not match BasicInformation VendorID/);
        });

        it("throws CertificationDeclarationFieldMismatch when productId not in CD product_id_array", async () => {
            const dclService = await setupDclService();

            // Generate CD with a different productId (our productId 0x8000 won't be in the array)
            const wrongProductCd = await CertificationDeclaration.generate(crypto, vendorId, 0x9999);
            const { attestationElements, attestationSignature } = await buildAttestationWithCd(wrongProductCd);

            await expect(
                DeviceAttestationValidator.validate(
                    buildContext(dclService),
                    buildData({ attestationElements, attestationSignature }),
                ),
            ).to.be.rejectedWith(
                DeviceAttestationError,
                /CD product_id_array does not contain BasicInformation ProductID/,
            );
        });

        it("throws CertificationDeclarationFieldMismatch when CD vendorId does not match DAC vendorId", async () => {
            const dclService = await setupDclService();

            // Use a DAC with vendorId 0xFFF1 but CD with vendorId matching BasicInformation but not DAC.
            // We need a DAC with a different vendorId but same PAI vendorId - this would fail at step 4.
            // Instead, set data.vendorId to match the CD but differ from DAC/PAI vendorId:
            // Generate CD matching wrong vendorId, and set BasicInformation vendorId to match CD
            const altVendorId = VendorId(0xfff2);
            const altCd = await CertificationDeclaration.generate(crypto, altVendorId, productId);
            const { attestationElements, attestationSignature } = await buildAttestationWithCd(altCd);

            // BasicInformation vendorId matches CD, but DAC/PAI vendorId is 0xFFF1
            await expect(
                DeviceAttestationValidator.validate(
                    buildContext(dclService),
                    buildData({ attestationElements, attestationSignature, vendorId: altVendorId }),
                ),
            ).to.be.rejectedWith(DeviceAttestationError, /DAC vendorId does not match CD vendor_id/);
        });
    });

    describe("certificate revocation checks", () => {
        it("throws CertificateRevoked when DAC serial is in revocation list", async () => {
            // Parse DAC to get its serial number and authority key identifier
            const dac = Dac.fromAsn1(dacDer);
            const dacSerial = Bytes.toHex(dac.cert.serialNumber).toUpperCase();
            const dacAkid = Bytes.toHex(dac.cert.extensions.authorityKeyIdentifier).toUpperCase();

            // Set up service with revocation data containing the DAC serial
            const dclService = await setupDclService(TestCert_PAA_NoVID_Cert, {
                issuerSkid: dacAkid,
                revokedSerials: [dacSerial],
            });

            await expect(DeviceAttestationValidator.validate(buildContext(dclService), buildData())).to.be.rejectedWith(
                DeviceAttestationError,
                /Device Attestation Certificate has been revoked/,
            );
        });

        it("throws CertificateRevoked when PAI serial is in revocation list", async () => {
            // Parse PAI to get its serial number and authority key identifier
            const pai = Pai.fromAsn1(paiDer);
            const paiSerial = Bytes.toHex(pai.cert.serialNumber).toUpperCase();
            const paiAkid = Bytes.toHex(pai.cert.extensions.authorityKeyIdentifier).toUpperCase();

            // Set up service with revocation data containing the PAI serial
            const dclService = await setupDclService(TestCert_PAA_NoVID_Cert, {
                issuerSkid: paiAkid,
                revokedSerials: [paiSerial],
            });

            await expect(DeviceAttestationValidator.validate(buildContext(dclService), buildData())).to.be.rejectedWith(
                DeviceAttestationError,
                /Product Attestation Intermediate certificate has been revoked/,
            );
        });

        it("passes when revocation data exists but does not contain DAC or PAI serials", async () => {
            // Parse DAC to get its authority key identifier (for the issuer SKID)
            const dac = Dac.fromAsn1(dacDer);
            const dacAkid = Bytes.toHex(dac.cert.extensions.authorityKeyIdentifier).toUpperCase();

            // Set up service with revocation data that does NOT contain our certificate serials
            const dclService = await setupDclService(TestCert_PAA_NoVID_Cert, {
                issuerSkid: dacAkid,
                revokedSerials: ["DEADBEEF"],
            });

            // Should not throw - our certificates are not revoked
            await DeviceAttestationValidator.validate(buildContext(dclService), buildData());
        });

        it("passes when no revocation data is available", async () => {
            // Set up service without any revocation data (no revocation endpoints mocked)
            const dclService = await setupDclService();

            // Should not throw - no revocation data means we skip the check
            await DeviceAttestationValidator.validate(buildContext(dclService), buildData());
        });
    });

    describe("findings model", () => {
        it("returns findings alongside dacPublicKey on successful validation", async () => {
            const dclService = await setupDclService();

            const result = await DeviceAttestationValidator.validate(buildContext(dclService), buildData());

            expect(result.dacPublicKey).to.not.be.undefined;
            expect(result.findings).to.be.an("array");
        });

        it("returns RevocationCheckSkipped warning when no revocation data is available", async () => {
            const dclService = await setupDclService();

            const result = await DeviceAttestationValidator.validate(buildContext(dclService), buildData());

            const revocationFinding = result.findings.find(
                f => f.type === DeviceAttestationCheck.RevocationCheckSkipped,
            );
            expect(revocationFinding).to.not.be.undefined;
            expect(revocationFinding!.level).to.equal("warning");
        });

        it("returns CdSignerVerificationSkipped warning when no cdSignerPublicKeys provided", async () => {
            const dclService = await setupDclService();

            const result = await DeviceAttestationValidator.validate(
                buildContext(dclService, { cdSignerPublicKeys: undefined }),
                buildData(),
            );

            const cdFinding = result.findings.find(f => f.type === DeviceAttestationCheck.CdSignerVerificationSkipped);
            expect(cdFinding).to.not.be.undefined;
            expect(cdFinding!.level).to.equal("warning");
        });

        it("still throws DeviceAttestationError for hard failures", async () => {
            const dclService = await setupDclService();
            const wrongNonce = crypto.randomBytes(32);

            await expect(
                DeviceAttestationValidator.validate(
                    buildContext(dclService),
                    buildData({ attestationNonce: wrongNonce }),
                ),
            ).to.be.rejectedWith(DeviceAttestationError);
        });
    });

    describe("certification_type findings", () => {
        it("returns CertificationTypeProvisional warning for provisional CD (type=1)", async () => {
            const dclService = await setupDclService();

            // Generate a provisional CD
            const provisionalCd = await CertificationDeclaration.generate(crypto, vendorId, productId, true);
            const { attestationElements, attestationSignature } = await buildAttestationWithCd(provisionalCd);

            const result = await DeviceAttestationValidator.validate(
                buildContext(dclService),
                buildData({ attestationElements, attestationSignature }),
            );

            const finding = result.findings.find(f => f.type === DeviceAttestationCheck.CertificationTypeProvisional);
            expect(finding).to.not.be.undefined;
            expect(finding!.level).to.equal("warning");
            expect(finding!.message).to.include("provisional");
        });

        it("returns CertificationTypeTest info for test CD (type=0)", async () => {
            const dclService = await setupDclService();

            // Default CD is type=0 (test)
            const result = await DeviceAttestationValidator.validate(buildContext(dclService), buildData());

            const finding = result.findings.find(f => f.type === DeviceAttestationCheck.CertificationTypeTest);
            expect(finding).to.not.be.undefined;
            expect(finding!.level).to.equal("info");
            expect(finding!.message).to.include("test");
        });
    });

    describe("time-based PAA trust store check", () => {
        it("returns PaaTrustStoreTimeMismatch info when PAA was fetched after DAC notBefore", async () => {
            const dclService = await setupDclService();

            // Manually update the PAA metadata to have a fetchedAt far in the future
            const paiAkid = Pai.fromAsn1(paiDer).cert.extensions.authorityKeyIdentifier;
            const paaMetadata = dclService.getCertificate(paiAkid);
            expect(paaMetadata).to.not.be.undefined;

            // Set fetchedAt to a time well after DAC's notBefore (year 2099)
            // Matter epoch: 2000-01-01, so DAC notBefore is typically ~now in Matter seconds
            paaMetadata!.fetchedAt = new Date("2099-01-01").getTime();

            const result = await DeviceAttestationValidator.validate(buildContext(dclService), buildData());

            const finding = result.findings.find(f => f.type === DeviceAttestationCheck.PaaTrustStoreTimeMismatch);
            expect(finding).to.not.be.undefined;
            expect(finding!.level).to.equal("info");
            expect(finding!.message).to.include("PAA was fetched at");
        });

        it("does not report PaaTrustStoreTimeMismatch when PAA was fetched before DAC notBefore", async () => {
            const dclService = await setupDclService();

            const paiAkid = Pai.fromAsn1(paiDer).cert.extensions.authorityKeyIdentifier;
            const paaMetadata = dclService.getCertificate(paiAkid);
            expect(paaMetadata).to.not.be.undefined;

            // Set fetchedAt to epoch (well before any DAC notBefore)
            paaMetadata!.fetchedAt = 0;

            const result = await DeviceAttestationValidator.validate(buildContext(dclService), buildData());

            const finding = result.findings.find(f => f.type === DeviceAttestationCheck.PaaTrustStoreTimeMismatch);
            expect(finding).to.be.undefined;
        });
    });
});
