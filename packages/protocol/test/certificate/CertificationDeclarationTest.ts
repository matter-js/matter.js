/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import {
    CertificationDeclaration,
    CertificationDeclarationFormatError,
} from "#certificate/kinds/CertificationDeclaration.js";
import { CertificationDeclaration as CertificationDeclarationDef } from "#certificate/kinds/definitions/certification-declaration.js";
import {
    Bytes,
    ContextTaggedBytes,
    DerCodec,
    DerNodeDefinition,
    Pkcs7,
    PrivateKey,
    Shs,
    StandardCrypto,
    X962,
} from "@matter/general";
import { VendorId } from "@matter/types";

describe("CertificationDeclaration", () => {
    const crypto = new StandardCrypto();

    // These are the well-known test values from Appendix F of the Matter 1.1 Core Specification.
    const TestCMS_SignerPrivateKey = Bytes.fromHex("AEF3484116E9481EC57BE0472DF41BF499064E5024AD869ECA5E889802D48075");
    const TestCMS_SignerSubjectKeyIdentifier = Bytes.fromHex("62FA823359ACFAA9963E1CFA140ADDF504F37160");

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

        it("rejects a ContentInfo whose contentType is not pkcs7-signedData", async () => {
            const cdHex = Bytes.toHex(await CertificationDeclaration.generate(crypto, VendorId(0xfff1), 0x8000));
            const signedDataOid = "06092a864886f70d010702";
            expect(cdHex).include(signedDataOid);
            const pkcs7DataOid = "06092a864886f70d010701";
            const wrongContentType = Bytes.fromHex(cdHex.replace(signedDataOid, pkcs7DataOid));

            expect(() => CertificationDeclaration.parse(wrongContentType)).throw(
                CertificationDeclarationFormatError,
                "CMS contentType must be pkcs7-signedData, found OID 2a864886f70d010701",
            );
        });

        it("rejects a CMS version that is not an INTEGER", async () => {
            const cdHex = Bytes.toHex(await CertificationDeclaration.generate(crypto, VendorId(0xfff1), 0x8000));
            // SignedData SEQUENCE header followed by the version INTEGER 3, then the digestAlgorithms SET
            const version = cdHex.match(/020103(31)/);
            expect(version?.index).not.undefined;
            const octetStringVersion = Bytes.fromHex(cdHex.replace(/020103(31)/, "040103$1"));

            expect(() => CertificationDeclaration.parse(octetStringVersion)).throw(
                CertificationDeclarationFormatError,
                "CMS version must be 3, found none",
            );
        });

        it("rejects a signer subject key identifier that is not 20 bytes", async () => {
            const cd = new CertificationDeclaration(
                CertificationDeclaration.parse(
                    await CertificationDeclaration.generate(crypto, VendorId(0xfff1), 0x8000),
                ).content,
                Bytes.of(TestCMS_SignerSubjectKeyIdentifier).slice(0, 19),
            );
            const cdBytes = await cd.asSignedAsn1(crypto, PrivateKey(TestCMS_SignerPrivateKey));

            expect(() => CertificationDeclaration.parse(cdBytes)).throw(
                CertificationDeclarationFormatError,
                "CMS SignerInfo subjectKeyIdentifier must be 20 bytes, found 19",
            );
        });

        /** A CMS SignedData for a valid CD content, with the digest algorithms given as stated. */
        function signedData(digestAlgorithms: DerNodeDefinition[], signerDigestAlgorithm: DerNodeDefinition) {
            const content = CertificationDeclarationDef.TlvDc.encode({
                formatVersion: 1,
                vendorId: VendorId(0xfff1),
                produceIdArray: [0x8000],
                deviceTypeId: 22,
                certificateId: "CSA00000SWC00000-00",
                securityLevel: 0,
                securityInformation: 0,
                versionNumber: 1,
                certificationType: 0,
            });
            return DerCodec.encode(
                Pkcs7.SignedData({
                    version: 3,
                    digestAlgorithm: digestAlgorithms,
                    encapContentInfo: Pkcs7.Data(content),
                    signerInfo: [
                        {
                            version: 3,
                            subjectKeyIdentifier: ContextTaggedBytes(0, TestCMS_SignerSubjectKeyIdentifier),
                            digestAlgorithm: signerDigestAlgorithm,
                            signatureAlgorithm: X962.EcdsaWithSHA256,
                            signature: Bytes.fromHex("3006020101020101"),
                        },
                    ],
                }),
            );
        }

        it("rejects a CMS SignedData with an empty digestAlgorithms SET", () => {
            expect(() => CertificationDeclaration.parse(signedData([], Shs.SHA256_CMS))).throw(
                CertificationDeclarationFormatError,
                "CMS digestAlgorithms must hold sha256, found none",
            );
        });

        it("rejects a SignerInfo digestAlgorithm that is a bare OID instead of an AlgorithmIdentifier", () => {
            expect(() => CertificationDeclaration.parse(signedData([Shs.SHA256_CMS], Shs.SHA256_CMS._objectId))).throw(
                CertificationDeclarationFormatError,
                "CMS SignerInfo digestAlgorithm must be sha256, found OID none",
            );
        });

        it("rejects invalid input gracefully", () => {
            // Empty bytes
            expect(() => CertificationDeclaration.parse(new Uint8Array(0))).to.throw();

            // Random garbage
            expect(() => CertificationDeclaration.parse(Bytes.fromHex("deadbeef"))).to.throw();
        });
    });
});
