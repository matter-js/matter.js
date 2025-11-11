/**
 * @license
 * Copyright 2022-2025 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */
import { Bytes, ContextTaggedBytes, Crypto, DerCodec, Pkcs7, PrivateKey, SHA256_CMS, X962 } from "#general";
import { TypeFromBitmapSchema, VendorId } from "#types";
import { assertCertificateDerSize } from "./common.js";
import { CertificationDeclaration as CertificationDeclarationDef } from "./definitions/certification-declaration.js";

// This is the private key from Appendix F of the Matter 1.1 Core Specification.
// The specification specifies it in PEM format:
//
// -----BEGIN EC PRIVATE KEY-----
// MHcCAQEEIK7zSEEW6UgexXvgRy30G/SZBk5QJK2GnspeiJgC1IB1oAoGCCqGSM49
// AwEHoUQDQgAEPDmJIkUrVcrzicJb0bykZWlSzLkOiGkkmthHRlMBTL+V1oeWXgNr
// UhxRA35rjO3vyh60QEZpT6CIgu7WUZ3sug==
// -----END EC PRIVATE KEY-----
//
// You can extract the key using openssl:
//
// openssl asn1parse -in key.txt
const TestCMS_SignerPrivateKey = Bytes.fromHex("AEF3484116E9481EC57BE0472DF41BF499064E5024AD869ECA5E889802D48075");

// You can extract the subject key identifier from the certificate in the same
// section.  The x509 command is best for that:
//
// openssl x509 -in cert.txt -text
//
// Look for the line under "X509v3 Subject Key Identifier:"
const TestCMS_SignerSubjectKeyIdentifier = Bytes.fromHex("62FA823359ACFAA9963E1CFA140ADDF504F37160");

/** A Matter Certification Declaration */
export class CertificationDeclaration {
    #eContent: Bytes;
    #subjectKeyIdentifier: Bytes;

    /**
     * Generator which is the main usage for the class from outside.
     * It constructs the class with the relevant details and returns a signed ASN.1 DER version of the CD.
     */
    static generate(crypto: Crypto, vendorId: VendorId, productId: number, provisional = false) {
        const cd = new CertificationDeclaration(
            {
                formatVersion: 1,
                vendorId,
                produceIdArray: [productId],
                deviceTypeId: 22,
                certificateId: "CSA00000SWC00000-00",
                securityLevel: 0,
                securityInformation: 0,
                versionNumber: 1,
                certificationType: provisional ? 1 : 0, // 0 = Test, 1 = Provisional/In certification, 2 = official
            },
            TestCMS_SignerSubjectKeyIdentifier,
        );

        return cd.asSignedAsn1(crypto, PrivateKey(TestCMS_SignerPrivateKey));
    }

    constructor(content: TypeFromBitmapSchema<typeof CertificationDeclarationDef.TlvDc>, subjectKeyIdentifier: Bytes) {
        this.#eContent = CertificationDeclarationDef.TlvDc.encode(content);
        this.#subjectKeyIdentifier = subjectKeyIdentifier;
    }

    /**
     * Returns the signed certificate in ASN.1 DER format.
     */
    async asSignedAsn1(crypto: Crypto, privateKey: JsonWebKey) {
        const cert = {
            version: 3,
            digestAlgorithm: [SHA256_CMS],
            encapContentInfo: Pkcs7.Data(this.#eContent),
            signerInfo: [
                {
                    version: 3,
                    subjectKeyIdentifier: ContextTaggedBytes(0, this.#subjectKeyIdentifier),
                    digestAlgorithm: SHA256_CMS,
                    signatureAlgorithm: X962.EcdsaWithSHA256,
                    signature: (await crypto.signEcdsa(privateKey, this.#eContent)).der,
                },
            ],
        };
        const certBytes = DerCodec.encode(Pkcs7.SignedData(cert));
        assertCertificateDerSize(certBytes);
        return certBytes;
    }
}
