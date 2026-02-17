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
import { DclCertificateService } from "#dcl/DclCertificateService.js";
import {
    Bytes,
    Environment,
    MockFetch,
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

    let fetchMock: MockFetch;
    let environment: Environment;
    let storage: StorageBackendMemory;
    let storageManager: StorageManager;
    let service: DclCertificateService | undefined;
    let certManager: AttestationCertificateManager;
    let paiDer: Bytes;
    let dacDer: Bytes;
    let dacPublicKey: Bytes;

    before(async () => {
        // Create the cert manager and generate PAI and DAC
        certManager = await AttestationCertificateManager.create(crypto, vendorId);
        paiDer = await certManager.getPAICert();
        const dacResult = await certManager.getDACert(productId);
        dacDer = dacResult.dac;
        dacPublicKey = dacResult.keyPair.publicKey;
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

    /** Build a DeviceAttestationData object. */
    function buildData(overrides?: Partial<DeviceAttestationValidator.DeviceAttestationData>): DeviceAttestationValidator.DeviceAttestationData {
        return {
            dac: dacDer,
            pai: paiDer,
            attestationElements: Bytes.fromHex("00"),
            attestationSignature: Bytes.fromHex("00"),
            attestationNonce: Bytes.fromHex("00"),
            vendorId,
            productId,
            ...overrides,
        };
    }

    describe("valid chain passes validation", () => {
        it("passes validation for a valid certificate chain", async () => {
            const dclService = await setupDclService();

            const context: DeviceAttestationValidator.Context = {
                crypto,
                dclCertificateService: dclService,
                attestationChallenge: Bytes.fromHex("00"),
            };

            // Should not throw
            await DeviceAttestationValidator.validate(context, buildData());
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

            const context: DeviceAttestationValidator.Context = {
                crypto,
                dclCertificateService: service,
                attestationChallenge: Bytes.fromHex("00"),
            };

            await expect(DeviceAttestationValidator.validate(context, buildData())).to.be.rejectedWith(
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

            const context: DeviceAttestationValidator.Context = {
                crypto,
                dclCertificateService: dclService,
                attestationChallenge: Bytes.fromHex("00"),
            };

            await expect(
                DeviceAttestationValidator.validate(context, buildData({ pai: tamperedPai })),
            ).to.be.rejectedWith(DeviceAttestationError, /PAI signature verification failed/);
        });

        it("throws CertificateChainInvalid for tampered DAC", async () => {
            const dclService = await setupDclService();

            // Create a tampered DAC by flipping a byte near the end
            const tamperedDac = Bytes.of(dacDer).slice();
            tamperedDac[tamperedDac.length - 5] ^= 0xff;

            const context: DeviceAttestationValidator.Context = {
                crypto,
                dclCertificateService: dclService,
                attestationChallenge: Bytes.fromHex("00"),
            };

            await expect(
                DeviceAttestationValidator.validate(context, buildData({ dac: tamperedDac })),
            ).to.be.rejectedWith(DeviceAttestationError, /DAC signature verification failed/);
        });

        it("throws CertificateChainInvalid when DAC is signed by wrong PAI", async () => {
            // Create a second cert manager with different PAI keys (same PAA)
            const otherManager = await AttestationCertificateManager.create(crypto, vendorId);
            const otherPai = await otherManager.getPAICert();

            const dclService = await setupDclService();

            const context: DeviceAttestationValidator.Context = {
                crypto,
                dclCertificateService: dclService,
                attestationChallenge: Bytes.fromHex("00"),
            };

            // Use our DAC (signed by our PAI key) with the other manager's PAI
            // The DAC signature won't verify against the other PAI's public key
            await expect(
                DeviceAttestationValidator.validate(context, buildData({ pai: otherPai })),
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

            const context: DeviceAttestationValidator.Context = {
                crypto,
                dclCertificateService: dclService,
                attestationChallenge: Bytes.fromHex("00"),
            };

            await expect(
                DeviceAttestationValidator.validate(context, buildData({ dac: wrongVendorDac })),
            ).to.be.rejectedWith(DeviceAttestationError, /DAC vendorId.*does not match PAI vendorId/);
        });
    });
});
