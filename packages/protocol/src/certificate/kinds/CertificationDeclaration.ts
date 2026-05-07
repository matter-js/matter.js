/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */
import {
    Bytes,
    ContextTaggedBytes,
    Crypto,
    DerCodec,
    DerError,
    EcdsaSignature,
    Pkcs7,
    PrivateKey,
    Shs,
    X962,
} from "@matter/general";
import { TypeFromBitmapSchema, VendorId } from "@matter/types";
import { assertCertificateDerSize } from "./common.js";
import {
    CertificationDeclaration as CertificationDeclarationDef,
    CertificationType,
} from "./definitions/certification-declaration.js";

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

// Well-known Matter test CD signer X.509 certificate (Appendix F of the Matter Core Specification).
// Mirrored from CHIP: credentials/development/cd-certs/Chip-Test-CD-Cert.der
const TestCMS_SignerCertificate = Bytes.fromHex(
    "308201b33082015aa003020102020845daf39de47aa08f300a06082a8648ce3d040302302b3129302706035504030c204d61747465722054657374204344205369676e696e6720417574686f726974793020170d3231303632383134323334335a180f39393939313233313233353935395a302b3129302706035504030c204d61747465722054657374204344205369676e696e6720417574686f726974793059301306072a8648ce3d020106082a8648ce3d030107034200043c398922452b55caf389c25bd1bca4656952ccb90e8869249ad8474653014cbf95d687965e036b521c51037e6b8cedefca1eb44046694fa08882eed6519decbaa366306430120603551d130101ff040830060101ff020101300e0603551d0f0101ff040403020106301d0603551d0e0416041462fa823359acfaa9963e1cfa140addf504f37160301f0603551d2304183016801462fa823359acfaa9963e1cfa140addf504f37160300a06082a8648ce3d040302034700304402202c545ce4e457d8a6f0d9d9bbebd6ece1ddfe7f8c6d9a6cf375321fc6fac713840220540778e8743972527eedebaf58686220b54078f2cd4e62a76ae7cbb92ff54c8b",
);

/** A Matter Certification Declaration */
export class CertificationDeclaration {
    #eContent: Bytes;
    #subjectKeyIdentifier: Bytes;

    /**
     * Parse a DER-encoded CMS/PKCS#7 SignedData structure containing a Certification Declaration.
     *
     * Extracts:
     * - The decoded CD content (TLV fields)
     * - The signer's subject key identifier
     * - The ECDSA signature
     * - The raw eContent bytes (signed data before TLV decoding)
     */
    static parse(cdBytes: Bytes): {
        content: TypeFromBitmapSchema<typeof CertificationDeclarationDef.TlvDc>;
        signerSubjectKeyId: Bytes;
        signature: EcdsaSignature;
        signedData: Bytes;
    } {
        // Decode the outer ContentInfo SEQUENCE
        const contentInfo = DerCodec.decode(cdBytes);
        const contentInfoElements = contentInfo._elements;
        if (!contentInfoElements || contentInfoElements.length < 2) {
            throw new DerError("Invalid CMS ContentInfo structure");
        }

        // contentInfoElements[0] = OID (signedData 1.2.840.113549.1.7.2)
        // contentInfoElements[1] = [0] CONSTRUCTED context tag containing SignedData SEQUENCE
        const signedDataWrapper = contentInfoElements[1];
        // Tag 0xa0 = context-specific (0x80) | constructed (0x20) | tag number 0
        if (signedDataWrapper._tag !== 0xa0 || !signedDataWrapper._elements || signedDataWrapper._elements.length < 1) {
            throw new DerError("Invalid CMS SignedData wrapper");
        }

        // The inner SEQUENCE is the SignedData
        const signedData = signedDataWrapper._elements[0];
        const signedDataElements = signedData._elements;
        if (!signedDataElements || signedDataElements.length < 4) {
            throw new DerError("Invalid CMS SignedData structure");
        }

        // signedDataElements[0] = INTEGER (version)
        // signedDataElements[1] = SET (digestAlgorithms)
        // signedDataElements[2] = SEQUENCE (encapContentInfo)
        // signedDataElements[3] = SET (signerInfos)

        // Extract eContent from encapContentInfo
        const encapContentInfo = signedDataElements[2];
        const encapElements = encapContentInfo._elements;
        if (!encapElements || encapElements.length < 2) {
            throw new DerError("Invalid encapContentInfo structure");
        }

        // encapElements[0] = OID (data 1.2.840.113549.1.7.1)
        // encapElements[1] = [0] CONSTRUCTED context tag containing OCTET STRING
        const eContentWrapper = encapElements[1];
        if (eContentWrapper._tag !== 0xa0 || !eContentWrapper._elements || eContentWrapper._elements.length < 1) {
            throw new DerError("Invalid eContent wrapper in encapContentInfo");
        }

        // The OCTET STRING containing the TLV-encoded CD
        const eContentOctetString = eContentWrapper._elements[0];
        const eContentBytes = Bytes.of(eContentOctetString._bytes);

        // Extract signerInfo from signerInfos SET
        const signerInfosSet = signedDataElements[3];
        const signerInfos = signerInfosSet._elements;
        if (!signerInfos || signerInfos.length < 1) {
            throw new DerError("No SignerInfo found in SignedData");
        }

        // Take the first (and typically only) SignerInfo
        const signerInfo = signerInfos[0];
        const signerInfoElements = signerInfo._elements;
        if (!signerInfoElements || signerInfoElements.length < 5) {
            throw new DerError("Invalid SignerInfo structure");
        }

        // signerInfoElements[0] = INTEGER (version = 3)
        // signerInfoElements[1] = [0] context-tagged OCTET STRING (subjectKeyIdentifier)
        //   Tag 0x80 = context-specific (0x80) | primitive | tag number 0
        // signerInfoElements[2] = SEQUENCE (digestAlgorithm)
        // signerInfoElements[3] = SEQUENCE (signatureAlgorithm)
        // signerInfoElements[4] = OCTET STRING (signature)

        const subjectKeyIdNode = signerInfoElements[1];
        if (subjectKeyIdNode._tag !== 0x80) {
            throw new DerError("Expected SubjectKeyIdentifier context tag [0] in SignerInfo");
        }
        const signerSubjectKeyId = Bytes.of(subjectKeyIdNode._bytes);

        const signatureNode = signerInfoElements[4];
        const signatureDerBytes = Bytes.of(signatureNode._bytes);
        const signature = new EcdsaSignature(signatureDerBytes, EcdsaSignature.DER);

        // Decode the TLV content
        const content = CertificationDeclarationDef.TlvDc.decode(eContentBytes);

        return {
            content,
            signerSubjectKeyId,
            signature,
            signedData: eContentBytes,
        };
    }

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
                certificationType: provisional ? CertificationType.Provisional : CertificationType.Test,
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
            digestAlgorithm: [Shs.SHA256_CMS],
            encapContentInfo: Pkcs7.Data(this.#eContent),
            signerInfo: [
                {
                    version: 3,
                    subjectKeyIdentifier: ContextTaggedBytes(0, this.#subjectKeyIdentifier),
                    digestAlgorithm: Shs.SHA256_CMS,
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

export namespace CertificationDeclaration {
    /**
     * Returns the well-known test CD signer's subject key identifier and public key.
     *
     * The public key is derived from the private key in Appendix F of the Matter 1.1 Core Specification.
     * Useful for validating Certification Declarations signed with the test signer.
     */
    export function testSignerInfo(): { subjectKeyId: Bytes; publicKey: Bytes } {
        const key = PrivateKey(TestCMS_SignerPrivateKey);
        return {
            subjectKeyId: TestCMS_SignerSubjectKeyIdentifier,
            publicKey: key.publicKey,
        };
    }

    /**
     * Returns the well-known Matter test CD signer certificate (DER-encoded X.509).
     * Mirrored from CHIP's `credentials/development/cd-certs/Chip-Test-CD-Cert.der`.
     * Useful for injecting the test signer into `DclCertificateService.addCertificate` with
     * kind "CDSigner".
     */
    export function testSignerCertificate(): Bytes {
        return TestCMS_SignerCertificate;
    }
}
