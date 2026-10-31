/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import {
    TestCert_PAA_FFF1_Cert,
    TestCert_PAA_FFF1_SKID,
    TestCert_PAA_NoVID_Cert,
    TestCert_PAA_NoVID_SKID,
} from "#certificate/ChipPAAuthorities.js";
import {
    DeviceAttestationCheck,
    DeviceAttestationError,
    DeviceAttestationValidator,
} from "#certificate/DeviceAttestationValidator.js";
import { TlvAttestation } from "#common/OperationalCredentialsTypes.js";
import { DclCertificateService } from "#dcl/DclCertificateService.js";
import type { CertSeedEntry, SeedSource } from "#dcl/SeedTypes.js";
import { Bytes, Crypto, Environment, MockStorageService, PrivateKey, StandardCrypto } from "@matter/general";
import { VendorId } from "@matter/types";
import {
    ChipCdAcceptedVectors,
    ChipCdRefusedVectors,
    ChipCdTestVector,
    ChipCdTestVectors,
    ChipCsaSignedCdVector,
} from "./ChipCdTestVectors.js";

function seedOf(entries: CertSeedEntry[]): SeedSource<CertSeedEntry> {
    return {
        builtAt: new Date(0).toISOString(),
        expectedCount: entries.length,
        entries: (async function* () {
            yield* entries;
        })(),
    };
}

const chipTestPaas = () =>
    seedOf(
        [
            { der: TestCert_PAA_FFF1_Cert, skid: TestCert_PAA_FFF1_SKID },
            { der: TestCert_PAA_NoVID_Cert, skid: TestCert_PAA_NoVID_SKID },
        ].map(({ der, skid }) => ({ subjectKeyId: Bytes.toHex(skid), derHex: Bytes.toHex(der), kind: "test" })),
    );

/**
 * Drives the validator with CHIP's commissioner DUT test vectors, each an attestation whose CD breaks or keeps one
 * rule. The services are offline, so the PAA trust store is exactly the CHIP test PAAs and the CD signers are the
 * built-in ones.
 */
describe("DeviceAttestationValidator with CHIP CD test vectors", () => {
    const crypto = new StandardCrypto();
    const attestationChallenge = crypto.randomBytes(16);
    const attestationNonce = crypto.randomBytes(32);

    let service: DclCertificateService | undefined;

    afterEach(async () => {
        await service?.close();
        service = undefined;
    });

    async function offlineService(options: { acceptTestCertificates?: boolean } = {}) {
        const environment = new Environment("test");
        environment.set(Crypto, crypto);
        new MockStorageService(environment);
        service = new DclCertificateService(environment, {
            seed: { paaRoots: chipTestPaas() },
            fetchTestCertificates: true,
            acceptTestCertificates: options.acceptTestCertificates ?? true,
            updateInterval: null,
            offline: true,
        });
        await service.construction;
        return service;
    }

    async function validate(vector: ChipCdTestVector, dclCertificateService?: DclCertificateService) {
        const attestationElements = TlvAttestation.encode({
            declaration: Bytes.fromHex(vector.certificationDeclaration),
            attestationNonce,
            timestamp: 0,
        });
        const signature = await crypto.signEcdsa(PrivateKey(Bytes.fromHex(vector.dacPrivateKey)), [
            attestationElements,
            attestationChallenge,
        ]);
        return DeviceAttestationValidator.validate(
            { crypto, dclCertificateService, attestationChallenge },
            {
                dac: Bytes.fromHex(vector.dac),
                pai: Bytes.fromHex(vector.pai),
                attestationElements,
                attestationSignature: signature.bytes,
                attestationNonce,
                vendorId: VendorId(0xfff1),
                productId: vector.productId,
            },
        );
    }

    async function expectRefusal(vector: ChipCdTestVector, failure: DeviceAttestationCheck, message: RegExp) {
        const dcl = await offlineService();
        const error = await validate(vector, dcl).then(
            () => undefined,
            (e: unknown) => e,
        );
        expect(error).instanceOf(DeviceAttestationError);
        if (error instanceof DeviceAttestationError) {
            expect(error.failure).equal(failure);
            expect(error.message).match(message);
        }
    }

    describe("accepts every valid CD", () => {
        for (const name of ChipCdAcceptedVectors) {
            it(name, async () => {
                const dcl = await offlineService();
                const { findings } = await validate(ChipCdTestVectors[name], dcl);
                expect(findings.filter(({ level }) => level === "error")).deep.equal([]);
            });
        }
    });

    describe("refuses a CD that breaks a CMS envelope rule", () => {
        const cases: [(typeof ChipCdRefusedVectors)[number], RegExp][] = [
            ["struct_cd_cms_v2", /CMS version must be 3, found 0x02/],
            ["struct_cd_cms_digest_algo_sha1", /CMS digestAlgorithm must be sha256/],
            ["struct_cd_cms_econtent_type_msac", /CMS eContentType must be pkcs7-data/],
            ["struct_cd_signer_info_v2", /CMS SignerInfo version must be 3, found 0x02/],
            ["struct_cd_signer_info_digest_algo_sha1", /CMS SignerInfo digestAlgorithm must be sha256/],
            ["struct_cd_cms_sig_algo_ecdsa_with_sha1", /CMS SignerInfo signatureAlgorithm must be ecdsa-with-SHA256/],
        ];
        for (const [name, message] of cases) {
            it(name, async () => {
                await expectRefusal(
                    ChipCdTestVectors[name],
                    DeviceAttestationCheck.CertificationDeclarationFormatInvalid,
                    message,
                );
            });
        }
    });

    describe("refuses a CD whose content breaks a format rule", () => {
        it("struct_cd_format_version_2", async () => {
            await expectRefusal(
                ChipCdTestVectors.struct_cd_format_version_2,
                DeviceAttestationCheck.CertificationDeclarationFormatInvalid,
                /format_version 2 is not 1/,
            );
        });

        it("struct_cd_cert_type_wrong", async () => {
            await expectRefusal(
                ChipCdTestVectors.struct_cd_cert_type_wrong,
                DeviceAttestationCheck.CertificationDeclarationFormatInvalid,
                /certification_type 255 is a reserved value/,
            );
        });
    });

    describe("CD signer", () => {
        it("refuses struct_cd_signer_info_skid_invalid", async () => {
            await expectRefusal(
                ChipCdTestVectors.struct_cd_signer_info_skid_invalid,
                DeviceAttestationCheck.CdSignerUnknown,
                /CD signer SKID 62fa823359acfa56963e1cfa140addf504f37160 is not known to be a CD signer/,
            );
        });

        it("refuses struct_cd_cms_signature once the signer is known", async () => {
            await expectRefusal(
                ChipCdTestVectors.struct_cd_cms_signature,
                DeviceAttestationCheck.CertificationDeclarationSignatureInvalid,
                /signature verification failed/,
            );
        });

        it("refuses struct_cd_signer_info_skid_invalid also without any DCL service", async () => {
            const error = await validate(ChipCdTestVectors.struct_cd_signer_info_skid_invalid).then(
                () => undefined,
                (e: unknown) => e,
            );
            expect(error instanceof DeviceAttestationError && error.failure).equal(
                DeviceAttestationCheck.CdSignerUnknown,
            );
        });
    });

    describe("CD signer trust", () => {
        it("refuses struct_cd_official_cd, an official CD signed by the test signer", async () => {
            await expectRefusal(
                ChipCdTestVectors.struct_cd_official_cd,
                DeviceAttestationCheck.OfficialCdSignedByTestSigner,
                /certification_type=2 \(official\) is signed by the Matter test CD signer/,
            );
        });

        it("verifies CDs with the built-in keys without a DCL service", async () => {
            const csaSigned = await validate(ChipCsaSignedCdVector);
            expect(csaSigned.findings.filter(({ level }) => level === "error")).deep.equal([]);

            const testSigned = await validate(ChipCdTestVectors.struct_cd_cms_v3);
            expect(testSigned.findings.filter(({ level }) => level === "error")).deep.equal([]);

            const forged = await validate(ChipCdTestVectors.struct_cd_cms_signature).then(
                () => undefined,
                (e: unknown) => e,
            );
            expect(forged instanceof DeviceAttestationError && forged.failure).equal(
                DeviceAttestationCheck.CertificationDeclarationSignatureInvalid,
            );
        });

        it("verifies a CD signed by CSA signing key 001 without any CD signer source", async () => {
            const dcl = await offlineService();
            const { findings } = await validate(ChipCsaSignedCdVector, dcl);
            expect(findings.filter(({ level }) => level !== "info")).deep.equal([]);
        });

        it("verifies a CSA-signed CD and still reports a test PAA under a production-only policy", async () => {
            const dcl = await offlineService({ acceptTestCertificates: false });
            const { findings } = await validate(ChipCsaSignedCdVector, dcl);
            expect(findings.map(({ level, type }) => ({ level, type }))).deep.include({
                level: "error",
                type: DeviceAttestationCheck.TrustedAsTestCertificate,
            });
        });
    });
});
