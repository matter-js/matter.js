/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { CdSigners } from "#certificate/CdSigners.js";
import { TestCert_PAA_FFF1_Cert, TestCert_PAA_FFF1_SKID } from "#certificate/ChipPAAuthorities.js";
import { CertificationDeclaration } from "#certificate/kinds/CertificationDeclaration.js";
import { Bytes, CertificateError, StandardCrypto } from "@matter/general";
import { CsaCdRoot, CsaCdSigningKey001, CsaCdSigningKeys } from "./CsaCdCertificates.js";

describe("CdSigners", () => {
    const crypto = new StandardCrypto();

    describe("CSA signing keys 001 to 005", () => {
        for (const [index, key] of CsaCdSigningKeys.entries()) {
            it(`key 00${index + 1} is built in and verifies against the CSA CD root`, async () => {
                const skid = Bytes.fromHex(key.subjectKeyId);

                expect(Bytes.toHex(CdSigners.builtIn(skid) ?? new Uint8Array())).equal(key.publicKeyHex);
                const verified = await CdSigners.verifyCertificate(crypto, Bytes.fromHex(key.certificateHex), skid);
                expect(Bytes.toHex(verified)).equal(key.publicKeyHex);
            });
        }
    });

    describe("verifyCertificate", () => {
        async function expectRefused(der: Bytes, skid: Bytes, message: RegExp) {
            await expect(CdSigners.verifyCertificate(crypto, der, skid)).rejectedWith(CertificateError, message);
        }

        it("refuses a certificate whose subject key identifier is not the requested one", async () => {
            await expectRefused(
                Bytes.fromHex(CsaCdSigningKey001.certificateHex),
                Bytes.fromHex("DEADBEEFDEADBEEFDEADBEEFDEADBEEFDEADBEEF"),
                /has subject key identifier fe343f/,
            );
        });

        it("refuses the CSA CD root itself", async () => {
            await expectRefused(
                Bytes.fromHex(CsaCdRoot.certificateHex),
                Bytes.fromHex(CsaCdRoot.subjectKeyId),
                /root certificate is not itself a CD signer/,
            );
        });

        it("refuses a certificate another authority issued", async () => {
            await expectRefused(
                CertificationDeclaration.testSignerCertificate(),
                CertificationDeclaration.testSignerInfo().subjectKeyId,
                /not the CSA CD root/,
            );
            await expectRefused(TestCert_PAA_FFF1_Cert, TestCert_PAA_FFF1_SKID, /not the CSA CD root/);
        });

        it("refuses a certificate whose signature does not verify against the CSA CD root", async () => {
            const der = Bytes.fromHex(CsaCdSigningKey001.certificateHex);
            const tampered = Bytes.of(der).slice();
            tampered[der.byteLength - 10] ^= 0x01;
            await expectRefused(tampered, Bytes.fromHex(CsaCdSigningKey001.subjectKeyId), /does not verify/);
        });
    });

    it("recognizes the Matter test CD signer", () => {
        expect(CdSigners.isTestSigner(CertificationDeclaration.testSignerInfo().subjectKeyId)).equal(true);
        expect(CdSigners.isTestSigner(Bytes.fromHex(CsaCdSigningKey001.subjectKeyId))).equal(false);
        expect(CdSigners.builtIn(CertificationDeclaration.testSignerInfo().subjectKeyId)).undefined;
    });
});
