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
import { CertificationDeclaration } from "#certificate/kinds/CertificationDeclaration.js";
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

const testCdSigner = () =>
    seedOf([
        {
            subjectKeyId: Bytes.toHex(CertificationDeclaration.testSignerInfo().subjectKeyId),
            derHex: Bytes.toHex(CertificationDeclaration.testSignerCertificate()),
            kind: "test",
        },
    ]);

/**
 * Drives the validator with CHIP's commissioner DUT test vectors, each an attestation whose CD breaks or keeps one
 * rule. The services are offline so the trust store is exactly the CHIP test PAAs plus, when seeded, the test CD signer.
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

    async function offlineService(options: { cdSigners: boolean }) {
        const environment = new Environment("test");
        environment.set(Crypto, crypto);
        new MockStorageService(environment);
        service = new DclCertificateService(environment, {
            seed: { paaRoots: chipTestPaas(), cdSigners: options.cdSigners ? testCdSigner() : undefined },
            fetchTestCertificates: true,
            acceptTestCertificates: true,
            updateInterval: null,
            offline: true,
        });
        await service.construction;
        return service;
    }

    async function validate(vector: ChipCdTestVector, dclCertificateService: DclCertificateService) {
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
        const dcl = await offlineService({ cdSigners: true });
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
                const dcl = await offlineService({ cdSigners: true });
                const { findings } = await validate(ChipCdTestVectors[name], dcl);
                expect(findings.filter(({ level }) => level === "error")).deep.equal([]);
                expect(findings.map(({ type }) => type)).not.include(
                    DeviceAttestationCheck.CdSignerVerificationSkipped,
                );
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
        it("refuses struct_cd_signer_info_skid_invalid when CD signers are configured", async () => {
            await expectRefusal(
                ChipCdTestVectors.struct_cd_signer_info_skid_invalid,
                DeviceAttestationCheck.CdSignerUnknown,
                /CD signer SKID 62fa823359acfa56963e1cfa140addf504f37160 is not a known CD signer/,
            );
        });

        it("refuses struct_cd_cms_signature once the signer is known", async () => {
            await expectRefusal(
                ChipCdTestVectors.struct_cd_cms_signature,
                DeviceAttestationCheck.CertificationDeclarationSignatureInvalid,
                /signature verification failed/,
            );
        });

        it("only warns about struct_cd_signer_info_skid_invalid when no signer information exists", async () => {
            const dcl = await offlineService({ cdSigners: false });
            const { findings } = await validate(ChipCdTestVectors.struct_cd_signer_info_skid_invalid, dcl);
            expect(findings.filter(({ level }) => level === "error")).deep.equal([]);
            const skipped = findings.find(({ type }) => type === DeviceAttestationCheck.CdSignerVerificationSkipped);
            expect(skipped?.level).equal("warning");
            expect(skipped?.message).include("has no CD signer seed");
        });
    });
});
