/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { AttestationCertificateManager } from "#certificate/AttestationCertificateManager.js";
import { TestCert_PAA_NoVID_Cert } from "#certificate/ChipPAAuthorities.js";
import {
    DeviceAttestationError,
    DeviceAttestationValidator,
} from "#certificate/DeviceAttestationValidator.js";
import { Paa } from "#certificate/kinds/AttestationCertificates.js";
import { CertificationDeclaration, testCdSignerInfo } from "#certificate/kinds/CertificationDeclaration.js";
import { TlvAttestation } from "#common/OperationalCredentialsTypes.js";
import { DclCertificateService } from "#dcl/DclCertificateService.js";
import {
    Bytes,
    Environment,
    MockFetch,
    PrivateKey,
    PublicKey,
    StandardCrypto,
    StorageBackendMemory,
    StorageManager,
    StorageService,
} from "#general";
import { VendorId } from "#types";

// Helper function to encode DER as PEM
function pemEncode(der: Bytes): string {
    const base64 = Bytes.toBase64(der);
    const lines: string[] = ["-----BEGIN CERTIFICATE-----"];
    for (let i = 0; i < base64.length; i += 64) {
        lines.push(base64.slice(i, i + 64));
    }
    lines.push("-----END CERTIFICATE-----");
    return lines.join("\n");
}

describe("DeviceAttestationValidator", () => {
    const crypto = new StandardCrypto();
    const vendorId = VendorId(0xfff1);
    const productId = 0x8000;

    // Fixed attestation challenge (16 bytes) and nonce (32 bytes) for tests
    const attestationChallenge = crypto.randomBytes(16);
    const attestationNonce = crypto.randomBytes(32);

    // CD signer info for tests
    const cdSigner = testCdSignerInfo();
    const cdSignerPublicKeys = new Map<string, PublicKey>([
        [Bytes.toHex(cdSigner.subjectKeyId), PublicKey(cdSigner.publicKey)],
    ]);

    let fetchMock: MockFetch;
    let environment: Environment;
    let storage: StorageBackendMemory;
    let storageManager: StorageManager;
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

    before(async () => {
        // Create the cert manager and generate PAI and DAC
        certManager = await AttestationCertificateManager.create(crypto, vendorId);
        paiDer = await certManager.getPAICert();
        const dacResult = await certManager.getDACert(productId);
        dacDer = dacResult.dac;
        dacPublicKey = dacResult.keyPair.publicKey;
        dacPrivateKey = PrivateKey(dacResult.keyPair);

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

        // Set up storage
        storage = new StorageBackendMemory();
        storageManager = new StorageManager(storage);
        await storageManager.initialize();
        new StorageService(environment, (_namespace: string) => storage);

        MockTime.reset();
        service = undefined;
    });

    afterEach(async () => {
        fetchMock.uninstall();
        if (service) {
            await service.close();
        }
        await storageManager.close();
    });

    /**
     * Set up DclCertificateService with a PAA cert in its trust store.
     * Uses MockFetch to simulate DCL API responses.
     */
    async function setupDclService(paaCert: Bytes = TestCert_PAA_NoVID_Cert) {
        const paa = Paa.fromAsn1(paaCert);
        const skid = Bytes.toHex(paa.cert.extensions.subjectKeyIdentifier).toUpperCase();
        const skidWithColons = skid.match(/.{1,2}/g)!.join(":").toUpperCase();
        const vid = paa.cert.subject.vendorId ?? 0;
        const subject = Bytes.toBase64(Bytes.fromString("test-subject"));

        fetchMock.addResponse("/dcl/pki/root-certificates", {
            approvedRootCertificates: {
                schemaVersion: 0,
                certs: [{ subject, subjectKeyId: skidWithColons }],
            },
        });
        fetchMock.addResponse(`/dcl/pki/certificates/${encodeURIComponent(subject)}/${encodeURIComponent(skidWithColons)}`, {
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
        });
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
    function buildData(overrides?: Partial<DeviceAttestationValidator.DeviceAttestationData>): DeviceAttestationValidator.DeviceAttestationData {
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
    function buildContext(dclService: DclCertificateService, overrides?: Partial<DeviceAttestationValidator.Context>): DeviceAttestationValidator.Context {
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

    describe("VendorID matching", () => {
        it("throws VendorIdMismatch when DAC vendorId does not match PAI vendorId", async () => {
            // Use generateDaCert to create a DAC with a different vendorId
            // but signed by the correct PAI key
            const wrongVendorId = VendorId(0xfff2);
            const wrongVendorDac = await certManager.generateDaCert(dacPublicKey, wrongVendorId, productId);

            const dclService = await setupDclService();

            await expect(
                DeviceAttestationValidator.validate(buildContext(dclService), buildData({ dac: wrongVendorDac })),
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
            ).to.be.rejectedWith(
                DeviceAttestationError,
                /AttestationNonce in response does not match/,
            );
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
            ).to.be.rejectedWith(
                DeviceAttestationError,
                /Attestation signature verification failed/,
            );
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
            ).to.be.rejectedWith(
                DeviceAttestationError,
                /Attestation signature verification failed/,
            );
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
            ).to.be.rejectedWith(
                DeviceAttestationError,
                /Attestation signature verification failed/,
            );
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
            ).to.be.rejectedWith(
                DeviceAttestationError,
                /Certification Declaration signature verification failed/,
            );
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
            ).to.be.rejectedWith(
                DeviceAttestationError,
                /CD vendor_id.*does not match BasicInformation VendorID/,
            );
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
            ).to.be.rejectedWith(
                DeviceAttestationError,
                /DAC vendorId does not match CD vendor_id/,
            );
        });
    });
});
