/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import {
    Bytes,
    CertificateError,
    ContextTaggedBytes,
    Crypto,
    DerCodec,
    DerError,
    DerNode,
    DerTag,
    DerType,
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

/** Thrown when a Certification Declaration violates an encoding rule of the Matter specification. */
export class CertificationDeclarationFormatError extends CertificateError {}

const CMS_VERSION = 3;
const SIGNER_INFO_VERSION = 3;
const OID_PKCS7_SIGNED_DATA = Bytes.fromHex("2A864886F70D010702");
const OID_PKCS7_DATA = Bytes.fromHex("2A864886F70D010701");

function requireOid(node: DerNode | undefined, expected: Bytes, rule: string) {
    if (node?._tag !== DerType.ObjectIdentifier || !Bytes.areEqual(node._bytes, expected)) {
        const found = node?._tag === DerType.ObjectIdentifier ? Bytes.toHex(node._bytes) : "none";
        throw new CertificationDeclarationFormatError(`${rule}, found OID ${found}`);
    }
}

/** Checks an AlgorithmIdentifier SEQUENCE by its OID; parameters after the OID are not inspected. */
function requireAlgorithm(node: DerNode | undefined, expected: Bytes, rule: string) {
    requireOid(node?._tag === DerTag.Sequence ? node._elements?.[0] : undefined, expected, rule);
}

function requireVersion(node: DerNode | undefined, expected: number, rule: string) {
    if (node?._tag !== DerType.Integer || !Bytes.areEqual(node._bytes, Uint8Array.of(expected))) {
        const found = node?._tag === DerType.Integer ? `0x${Bytes.toHex(node._bytes)}` : "none";
        throw new CertificationDeclarationFormatError(`${rule}, found ${found}`);
    }
}

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
     *
     * Only the first SignerInfo is read. The signature is not verified here.
     *
     * @throws CertificationDeclarationFormatError if the CMS envelope breaks a CD encoding rule: contentType
     *   pkcs7-signedData, CMS version 3, at least one digest algorithm and every one sha256, eContentType pkcs7-data,
     *   SignerInfo version 3, a 20-byte subjectKeyIdentifier, SignerInfo digest algorithm sha256, signature algorithm
     *   ecdsa-with-SHA256
     * @throws DerError or a TLV decoding error if the structure cannot be decoded
     * @see {@link MatterSpecification.v161.Core} § 6.3.1
     */
    static parse(cdBytes: Bytes): {
        content: TypeFromBitmapSchema<typeof CertificationDeclarationDef.TlvDc>;
        signerSubjectKeyId: Bytes;
        signature: EcdsaSignature;
        signedData: Bytes;
    } {
        // ContentInfo ::= SEQUENCE { contentType OID, content [0] EXPLICIT SignedData }
        const contentInfoElements = DerCodec.decode(cdBytes)._elements;
        if (!contentInfoElements || contentInfoElements.length < 2) {
            throw new DerError("Invalid CMS ContentInfo structure");
        }
        requireOid(contentInfoElements[0], OID_PKCS7_SIGNED_DATA, "CMS contentType must be pkcs7-signedData");

        // Tag 0xa0 = context-specific (0x80) | constructed (0x20) | tag number 0
        const signedDataWrapper = contentInfoElements[1];
        if (signedDataWrapper._tag !== 0xa0 || !signedDataWrapper._elements || signedDataWrapper._elements.length < 1) {
            throw new DerError("Invalid CMS SignedData wrapper");
        }

        // SignedData ::= SEQUENCE { version, digestAlgorithms SET, encapContentInfo, signerInfos SET }
        const signedDataElements = signedDataWrapper._elements[0]._elements;
        if (!signedDataElements || signedDataElements.length < 4) {
            throw new DerError("Invalid CMS SignedData structure");
        }
        const [version, digestAlgorithms, encapContentInfo, signerInfosSet] = signedDataElements;

        requireVersion(version, CMS_VERSION, "CMS version must be 3");

        const digestAlgorithmList = digestAlgorithms._tag === DerTag.Set ? digestAlgorithms._elements : undefined;
        if (!digestAlgorithmList?.length) {
            throw new CertificationDeclarationFormatError("CMS digestAlgorithms must hold sha256, found none");
        }
        for (const algorithm of digestAlgorithmList) {
            requireAlgorithm(algorithm, Shs.SHA256_CMS._objectId._bytes, "CMS digestAlgorithm must be sha256");
        }

        // EncapsulatedContentInfo ::= SEQUENCE { eContentType OID, eContent [0] EXPLICIT OCTET STRING }
        const encapElements = encapContentInfo._elements;
        if (!encapElements || encapElements.length < 2) {
            throw new DerError("Invalid encapContentInfo structure");
        }
        requireOid(encapElements[0], OID_PKCS7_DATA, "CMS eContentType must be pkcs7-data");

        const eContentWrapper = encapElements[1];
        if (eContentWrapper._tag !== 0xa0 || !eContentWrapper._elements || eContentWrapper._elements.length < 1) {
            throw new DerError("Invalid eContent wrapper in encapContentInfo");
        }
        const eContentBytes = Bytes.of(eContentWrapper._elements[0]._bytes);

        const signerInfos = signerInfosSet._elements;
        if (!signerInfos || signerInfos.length < 1) {
            throw new DerError("No SignerInfo found in SignedData");
        }

        // SignerInfo ::= SEQUENCE { version, [0] subjectKeyIdentifier, digestAlgorithm, signatureAlgorithm, signature }
        const signerInfoElements = signerInfos[0]._elements;
        if (!signerInfoElements || signerInfoElements.length < 5) {
            throw new DerError("Invalid SignerInfo structure");
        }
        const [signerVersion, subjectKeyIdNode, signerDigestAlgorithm, signatureAlgorithm, signatureNode] =
            signerInfoElements;

        requireVersion(signerVersion, SIGNER_INFO_VERSION, "CMS SignerInfo version must be 3");

        // Tag 0x80 = context-specific (0x80) | primitive | tag number 0
        if (subjectKeyIdNode._tag !== 0x80) {
            throw new DerError("Expected SubjectKeyIdentifier context tag [0] in SignerInfo");
        }
        const { SIGNER_SUBJECT_KEY_ID_LENGTH } = CertificationDeclaration;
        if (subjectKeyIdNode._bytes.byteLength !== SIGNER_SUBJECT_KEY_ID_LENGTH) {
            throw new CertificationDeclarationFormatError(
                `CMS SignerInfo subjectKeyIdentifier must be ${SIGNER_SUBJECT_KEY_ID_LENGTH} bytes, found ${subjectKeyIdNode._bytes.byteLength}`,
            );
        }
        requireAlgorithm(
            signerDigestAlgorithm,
            Shs.SHA256_CMS._objectId._bytes,
            "CMS SignerInfo digestAlgorithm must be sha256",
        );
        requireAlgorithm(
            signatureAlgorithm,
            X962.EcdsaWithSHA256._objectId._bytes,
            "CMS SignerInfo signatureAlgorithm must be ecdsa-with-SHA256",
        );

        return {
            content: CertificationDeclarationDef.TlvDc.decode(eContentBytes),
            signerSubjectKeyId: Bytes.of(subjectKeyIdNode._bytes),
            signature: new EcdsaSignature(Bytes.of(signatureNode._bytes), EcdsaSignature.DER),
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
    /** Length in bytes of the signer subject key identifier, a 160-bit SHA-1 key identifier. */
    export const SIGNER_SUBJECT_KEY_ID_LENGTH = 20;

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
     * A `DclCertificateService` trusts this signer while it accepts test certificates, whether or not the certificate
     * is stored.
     */
    export function testSignerCertificate(): Bytes {
        return TestCMS_SignerCertificate;
    }
}
