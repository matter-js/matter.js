/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { CertificationDeclaration } from "#certificate/kinds/CertificationDeclaration.js";
import { CertificationDeclaration as CertificationDeclarationDef } from "#certificate/kinds/definitions/certification-declaration.js";
import { Bytes, PrivateKey, StandardCrypto } from "#general";
import { VendorId } from "#types";

describe("CertificationDeclaration", () => {
    const crypto = new StandardCrypto();

    // These are the well-known test values from Appendix F of the Matter 1.1 Core Specification.
    const TestCMS_SignerPrivateKey = Bytes.fromHex(
        "AEF3484116E9481EC57BE0472DF41BF499064E5024AD869ECA5E889802D48075",
    );
    const TestCMS_SignerSubjectKeyIdentifier = Bytes.fromHex(
        "62FA823359ACFAA9963E1CFA140ADDF504F37160",
    );

    describe("parse", () => {
        it("round-trips: generate then parse recovers all fields", async () => {
            const vendorId = VendorId(0xfff1);
            const productId = 0x8000;

            // Generate a CD
            const cdBytes = await CertificationDeclaration.generate(crypto, vendorId, productId);

            // Parse it back
            const parsed = CertificationDeclaration.parse(cdBytes);

            // Verify CD content fields
            expect(parsed.content.formatVersion).equal(1);
            expect(parsed.content.vendorId).equal(vendorId);
            expect(parsed.content.produceIdArray).deep.equal([productId]);
            expect(parsed.content.deviceTypeId).equal(22);
            expect(parsed.content.certificateId).equal("CSA00000SWC00000-00");
            expect(parsed.content.securityLevel).equal(0);
            expect(parsed.content.securityInformation).equal(0);
            expect(parsed.content.versionNumber).equal(1);
            expect(parsed.content.certificationType).equal(0); // Test (non-provisional)
        });

        it("extracts correct signer subject key identifier", async () => {
            const vendorId = VendorId(0xfff1);
            const productId = 0x8000;

            const cdBytes = await CertificationDeclaration.generate(crypto, vendorId, productId);
            const parsed = CertificationDeclaration.parse(cdBytes);

            expect(Bytes.toHex(parsed.signerSubjectKeyId).toLowerCase()).equal(
                Bytes.toHex(TestCMS_SignerSubjectKeyIdentifier).toLowerCase(),
            );
        });

        it("extracts a valid ECDSA signature that verifies against the test signer public key", async () => {
            const vendorId = VendorId(0xfff1);
            const productId = 0x8000;

            const cdBytes = await CertificationDeclaration.generate(crypto, vendorId, productId);
            const parsed = CertificationDeclaration.parse(cdBytes);

            // The signature should be 64 bytes in IEEE P1363 format
            expect(parsed.signature.bytes.byteLength).equal(64);

            // Derive the public key from the known test private key
            const signerKey = PrivateKey(TestCMS_SignerPrivateKey);

            // Verify the signature over the signedData (eContent)
            // This should not throw if the signature is valid
            await crypto.verifyEcdsa(signerKey, parsed.signedData, parsed.signature);
        });

        it("extracts signedData that can be decoded by TlvDc", async () => {
            const vendorId = VendorId(0xfff2);
            const productId = 0x1234;

            const cdBytes = await CertificationDeclaration.generate(crypto, vendorId, productId);
            const parsed = CertificationDeclaration.parse(cdBytes);

            // The signedData should be decodable as TLV
            const decoded = CertificationDeclarationDef.TlvDc.decode(parsed.signedData);
            expect(decoded.vendorId).equal(vendorId);
            expect(decoded.produceIdArray).deep.equal([productId]);
        });

        it("round-trips a provisional CD correctly", async () => {
            const vendorId = VendorId(0xfff1);
            const productId = 0x8001;

            const cdBytes = await CertificationDeclaration.generate(
                crypto,
                vendorId,
                productId,
                true, // provisional
            );
            const parsed = CertificationDeclaration.parse(cdBytes);

            expect(parsed.content.vendorId).equal(vendorId);
            expect(parsed.content.produceIdArray).deep.equal([productId]);
            expect(parsed.content.certificationType).equal(1); // Provisional
        });

        it("rejects invalid input gracefully", () => {
            // Empty bytes
            expect(() => CertificationDeclaration.parse(new Uint8Array(0))).to.throw();

            // Random garbage
            expect(() => CertificationDeclaration.parse(Bytes.fromHex("deadbeef"))).to.throw();
        });
    });
});
