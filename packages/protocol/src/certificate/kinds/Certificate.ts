/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import {
    Bytes,
    CertificateError,
    ContextTagged,
    Crypto,
    DerBitString,
    DerCodec,
    DerNode,
    DerType,
    EcdsaSignature,
    Key,
    PublicKey,
    RawBytes,
    X509,
    X520,
    X962,
} from "#general";
import {
    CaseAuthenticatedTag,
    FabricId,
    MATTER_EPOCH_OFFSET_S,
    NodeId,
    TypeFromPartialBitSchema,
    VendorId,
} from "#types";
import { assertCertificateDerSize, Unsigned } from "./common.js";
import {
    FabricId_Matter,
    FirmwareSigningId_Matter,
    IcacId_Matter,
    MATTER_OID_TO_FIELD_MAP,
    matterToJsDate,
    NocCat_Matter,
    NodeId_Matter,
    ProductId_Matter,
    RcacId_Matter,
    VendorId_Matter,
    VvsId_Matter,
} from "./definitions/asn.js";
import { ExtensionKeyUsageBitmap, ExtensionKeyUsageSchema, MatterCertificate } from "./definitions/base.js";
import { CertificateExtension } from "./definitions/operational.js";

/**
 * Abstract definition of a X.509 certificate that can be signed and converted to ASN.1 DER format.
 * It also provides two static methods to create a certificate signing request (CSR) and to extract the public key
 * from a CSR.
 */
export abstract class Certificate<CT extends MatterCertificate> {
    #signature?: EcdsaSignature;
    #cert: Unsigned<CT>;

    constructor(cert: CT | Unsigned<CT>) {
        this.#cert = cert;
        if ("signature" in cert) {
            this.#signature = new EcdsaSignature(cert.signature);
        }
    }

    get cert(): Unsigned<CT> {
        return this.#cert;
    }

    get isSigned() {
        return this.#signature !== undefined;
    }

    /**
     * Get the signature of the certificate.
     * If the certificate is not signed, it throws a CertificateError.
     */
    get signature() {
        if (this.#signature === undefined) {
            throw new CertificateError("Certificate is not signed");
        }
        return this.#signature;
    }

    /**
     * Set the signature of the certificate.
     * If the certificate is already signed, it throws a CertificateError.
     */
    set signature(signature: EcdsaSignature) {
        if (this.isSigned) {
            throw new CertificateError("Certificate is already signed");
        }
        this.#signature = signature;
    }

    /**
     * Sign the certificate using the provided crypto and key.
     * It throws a CertificateError if the certificate is already signed.
     */
    async sign(crypto: Crypto, key: JsonWebKey) {
        this.signature = await crypto.signEcdsa(key, this.asUnsignedDer());
    }

    /**
     * Serialize as signed DER.
     *
     * If no signature is present, throws an error.
     */
    asSignedDer() {
        const certBytes = X509.certificateToDer({
            ...matterToX509(this.cert),
            signatureAlgorithm: X962.EcdsaWithSHA256,
            signature: this.signature.der,
        });
        assertCertificateDerSize(certBytes);
        return certBytes;
    }

    /**
     * Serialize as DER without signature.
     */
    asUnsignedDer(): Bytes {
        // Serialize
        const certBytes = X509.certificateToDer(matterToX509(this.cert));
        assertCertificateDerSize(certBytes);
        return certBytes;
    }

    /**
     * Convert the extensions of the certificate to ASN.1 DER format.
     */
    extensionsToAsn1(extensions: CertificateExtension) {
        const asn = {} as { [field: string]: any[] | any };
        Object.entries(extensions).forEach(([key, value]) => {
            if (value === undefined) {
                return;
            }
            switch (key) {
                case "basicConstraints":
                    asn.basicConstraints = X509.BasicConstraints(value);
                    break;
                case "keyUsage":
                    asn.keyUsage = X509.KeyUsage(
                        ExtensionKeyUsageSchema.encode(
                            value as TypeFromPartialBitSchema<typeof ExtensionKeyUsageBitmap>,
                        ),
                    );
                    break;
                case "extendedKeyUsage":
                    asn.extendedKeyUsage = X509.ExtendedKeyUsage(value as number[] | undefined);
                    break;
                case "subjectKeyIdentifier":
                    asn.subjectKeyIdentifier = X509.SubjectKeyIdentifier(value as Bytes);
                    break;
                case "authorityKeyIdentifier":
                    asn.authorityKeyIdentifier = X509.AuthorityKeyIdentifier(value as Bytes);
                    break;
                case "futureExtension":
                    asn.futureExtension = RawBytes(Bytes.concat(...((value as Uint8Array[] | undefined) ?? [])));
                    break;
            }
        });
        return asn;
    }
}

export namespace Certificate {
    /**
     * Create a Certificate Signing Request (CSR) in ASN.1 DER format.
     */
    export async function createCertificateSigningRequest(crypto: Crypto, key: Key) {
        const request = {
            version: 0,
            subject: { organization: X520.OrganisationName("CSR") },
            publicKey: X962.PublicKeyEcPrime256v1(key.publicKey),
            endSignedBytes: ContextTagged(0),
        };

        return DerCodec.encode({
            request,
            signAlgorithm: X962.EcdsaWithSHA256,
            signature: DerBitString((await crypto.signEcdsa(key, DerCodec.encode(request))).der),
        });
    }

    /**
     * Map an OID to a subject/issuer field name.
     * Uses auto-generated lookup maps from X520 and Matter OID definitions.
     * Returns the field name and whether the value is a PrintableString variant.
     */
    function oidToSubjectField(oid: Bytes) {
        const oidHex = Bytes.toHex(oid);

        const field = X520.OID_TO_FIELD_MAP[oidHex] ?? MATTER_OID_TO_FIELD_MAP[oidHex];
        if (field !== undefined) {
            return { field, isPrintable: false };
        }
    }

    /**
     * Parse a subject or issuer field from ASN.1 DER format.
     */
    function parseSubjectOrIssuer(node: DerNode) {
        const result: { [field: string]: unknown } = {};

        const { _elements: rdnSequence } = node;
        if (!rdnSequence) {
            throw new CertificateError("Invalid subject/issuer structure");
        }

        // Iterate through RDN SEQUENCEs
        for (const rdnSet of rdnSequence) {
            const { _elements: attributeSets } = rdnSet;
            if (!attributeSets) continue;

            for (const attributeSet of attributeSets) {
                const { _elements: attrElements } = attributeSet;
                if (!attrElements || attrElements.length !== 2) continue;

                const [oidNode, valueNode] = attrElements;
                const oid = oidNode._bytes;
                const fieldInfo = oidToSubjectField(oid);

                if (fieldInfo === undefined) continue;

                let { field } = fieldInfo;
                let value;

                // Parse the value based on the field type
                const valueBytes = Bytes.of(valueNode._bytes);
                const valueTag = valueNode._tag;

                // Matter-specific fields are encoded as UTF8 strings containing hex values
                switch (field) {
                    case "nodeId":
                    case "fabricId": {
                        // 16-byte hex string -> BigInt
                        const hexString = Bytes.toString(valueBytes);
                        value = BigInt("0x" + hexString);
                        break;
                    }
                    case "icacId":
                    case "rcacId":
                    case "vvsId": {
                        // 8-byte hex string -> BigInt, but convert to number if it fits
                        const hexString = Bytes.toString(valueBytes);
                        const bigIntValue = BigInt("0x" + hexString);
                        // Convert to number if it fits in Number.MAX_SAFE_INTEGER
                        value = bigIntValue <= BigInt(Number.MAX_SAFE_INTEGER) ? Number(bigIntValue) : bigIntValue;
                        break;
                    }
                    case "firmwareSigningId":
                    case "productId":
                    case "vendorId": {
                        // 4-byte or 2-byte hex string -> number
                        const hexString = Bytes.toString(valueBytes);
                        value = parseInt(hexString, 16);
                        break;
                    }
                    case "caseAuthenticatedTag": {
                        // CAT tags - 4-byte hex string -> number
                        const hexString = Bytes.toString(valueBytes);
                        const catValue = parseInt(hexString, 16);
                        if (result.caseAuthenticatedTags !== undefined) {
                            (result.caseAuthenticatedTags as number[]).push(catValue);
                            continue;
                        }
                        field = "caseAuthenticatedTags";
                        value = [catValue];
                        break;
                    }
                    default: {
                        // String fields
                        value = Bytes.toString(valueBytes);

                        // Handle PrintableString variants
                        if (valueTag === DerType.PrintableString) {
                            field += "Ps";
                        }
                    }
                }
                result[field] = value;
            }
        }

        return result;
    }

    /** These extensions are minimum required for all Matter certificates. */
    export const REQUIRED_PAA_EXTENSIONS = ["basicConstraints", "keyUsage", "subjectKeyIdentifier"];

    /** These extensions are usually required for all Matter certificates, beside a PAA. */
    export const REQUIRED_EXTENSIONS = [...REQUIRED_PAA_EXTENSIONS, "authorityKeyIdentifier"];

    /**
     * Parse extensions from ASN.1 DER format.
     */
    function parseExtensions(
        extensionsNode: DerNode,
        requiredExtensions: string[],
    ): MatterCertificate["extensions"] & {
        [oid: string]: unknown; // For unrecognized extensions
    } {
        const result = {
            basicConstraints: { isCa: false },
        } as MatterCertificate["extensions"] & { [oid: string]: unknown };

        const { _elements: extensions } = extensionsNode;
        if (!extensions) {
            throw new CertificateError("Invalid extensions structure");
        }

        for (const ext of extensions) {
            const { _elements: extElements } = ext;
            if (!extElements || extElements.length < 2) continue;

            const oid = extElements[0]._bytes;
            const oidValue = Bytes.asBigInt(oid);

            // Find the value - it might be after a critical flag
            let valueIndex = 1;
            if (extElements.length > 2 && extElements[1]._tag === DerType.Boolean) {
                valueIndex = 2; // Skip critical flag
            }

            const valueOctetString = extElements[valueIndex]._bytes;
            const valueNode = DerCodec.decode(valueOctetString);

            switch (oidValue) {
                case X509.Extensions.BASIC_CONSTRAINTS:
                    {
                        const { _elements: bcElements } = valueNode;
                        // Always initialize basicConstraints when extension is present
                        if (bcElements && bcElements.length > 0) {
                            // First element is isCa boolean
                            if (bcElements[0]._tag === DerType.Boolean) {
                                const bcBytes = Bytes.of(bcElements[0]._bytes);
                                result.basicConstraints.isCa = bcBytes[0] !== 0;
                            }
                            // Second element (if present) is pathLen integer
                            if (bcElements.length > 1 && bcElements[1]._tag === DerType.Integer) {
                                const pathLenBytes = Bytes.of(bcElements[1]._bytes);
                                result.basicConstraints.pathLen = pathLenBytes[0];
                            }
                        }
                    }
                    break;

                case X509.Extensions.KEY_USAGE:
                    {
                        // Note: DerKey.Bytes for BIT STRING returns data without the padding byte
                        const bitString = Bytes.of(valueNode._bytes);
                        if (bitString.length >= 1) {
                            // The keyUsage flags are in the first byte
                            const usageByte = bitString[0];

                            // Set all flags based on the bit values
                            result.keyUsage = {
                                digitalSignature: (usageByte & 0x80) !== 0,
                                nonRepudiation: (usageByte & 0x40) !== 0,
                                keyEncipherment: (usageByte & 0x20) !== 0,
                                dataEncipherment: (usageByte & 0x10) !== 0,
                                keyAgreement: (usageByte & 0x08) !== 0,
                                keyCertSign: (usageByte & 0x04) !== 0,
                                cRLSign: (usageByte & 0x02) !== 0,
                                encipherOnly: (usageByte & 0x01) !== 0,
                                decipherOnly: bitString.length > 1 ? (bitString[1] & 0x80) !== 0 : false,
                            };
                        }
                    }
                    break;

                case X509.Extensions.EXTENDED_KEY_USAGE:
                    {
                        const { _elements: ekuElements } = valueNode;
                        if (ekuElements) {
                            const ekuValues: number[] = [];
                            for (const eku of ekuElements) {
                                const ekuOidValue = Bytes.asBigInt(eku._bytes);
                                switch (ekuOidValue) {
                                    case X509.ExtendedKeyUsage.SERVER_AUTH:
                                        ekuValues.push(1);
                                        break;
                                    case X509.ExtendedKeyUsage.CLIENT_AUTH:
                                        ekuValues.push(2);
                                        break;
                                    case X509.ExtendedKeyUsage.CODE_SIGNING:
                                        ekuValues.push(3);
                                        break;
                                    case X509.ExtendedKeyUsage.EMAIL_PROTECTION:
                                        ekuValues.push(4);
                                        break;
                                    case X509.ExtendedKeyUsage.TIME_STAMPING:
                                        ekuValues.push(5);
                                        break;
                                    case X509.ExtendedKeyUsage.OCSP_SIGNING:
                                        ekuValues.push(6);
                                        break;
                                }
                            }
                            if (ekuValues.length > 0) {
                                result.extendedKeyUsage = ekuValues;
                            }
                        }
                    }
                    break;

                case X509.Extensions.SUBJECT_KEY_IDENTIFIER:
                    result.subjectKeyIdentifier = valueNode._bytes;
                    break;

                case X509.Extensions.AUTHORITY_KEY_IDENTIFIER:
                    {
                        const { _elements: akiElements } = valueNode;
                        if (akiElements && akiElements.length > 0) {
                            // The keyIdentifier is context-tagged with [0]
                            result.authorityKeyIdentifier = akiElements[0]._bytes;
                        }
                    }
                    break;
            }
        }

        if (requiredExtensions.some(ext => result[ext] === undefined)) {
            throw new CertificateError("Missing required extensions in certificate");
        }

        return result;
    }

    /**
     * Parse a date from ASN.1 DER format (UTCTime or GeneralizedTime).
     */
    function parseDate(node: DerNode): number {
        const dateBytes = node._bytes;
        const dateString = Bytes.toString(dateBytes);
        const tag = node._tag;

        let year: number, month: number, day: number, hour: number, minute: number, second: number;

        if (tag === DerType.UtcDate) {
            // UTCTime format: YYMMDDHHMMSSZ
            year = parseInt(dateString.substring(0, 2));
            year += year >= 50 ? 1900 : 2000;
            month = parseInt(dateString.substring(2, 4));
            day = parseInt(dateString.substring(4, 6));
            hour = parseInt(dateString.substring(6, 8));
            minute = parseInt(dateString.substring(8, 10));
            second = parseInt(dateString.substring(10, 12));
        } else if (tag === DerType.GeneralizedTime) {
            // GeneralizedTime format: YYYYMMDDHHMMSSZ
            year = parseInt(dateString.substring(0, 4));
            month = parseInt(dateString.substring(4, 6));
            day = parseInt(dateString.substring(6, 8));
            hour = parseInt(dateString.substring(8, 10));
            minute = parseInt(dateString.substring(10, 12));
            second = parseInt(dateString.substring(12, 14));
        } else {
            throw new CertificateError(`Unsupported date type: ${tag}`);
        }

        const date = new Date(Date.UTC(year, month - 1, day, hour, minute, second));

        // Check if this is the special NON_WELL_DEFINED_DATE (9999-12-31 23:59:59Z)
        // which should be represented as 0 in Matter epoch
        if (date.getTime() === X520.NON_WELL_DEFINED_DATE.getTime()) {
            return 0;
        }

        // Convert to Matter epoch (seconds since 2000-01-01 00:00:00 UTC)
        return Math.floor(date.getTime() / 1000) - MATTER_EPOCH_OFFSET_S;
    }

    /**
     * Parse an ASN.1/DER encoded certificate into the internal format.
     * This extracts the certificate data without the signature.
     */
    export function parseAsn1Certificate(
        encodedCert: Bytes,
        requiredExtensions = REQUIRED_EXTENSIONS,
    ): MatterCertificate {
        const { _elements: rootElements } = DerCodec.decode(encodedCert);

        if (!rootElements || rootElements.length !== 3) {
            throw new CertificateError(
                `Invalid certificate structure - expected 3 root elements, got ${rootElements?.length ?? 0}`,
            );
        }

        const [certificateNode, , signatureNode] = rootElements;

        // Parse TBSCertificate
        const { _elements: certElements } = certificateNode;
        if (!certElements || certElements.length < 7) {
            throw new CertificateError("Invalid TBSCertificate structure");
        }

        let idx = 0;

        // Version (optional, context-tagged [0])
        if (certElements[idx]._tag === 0xa0) {
            // Skip version - we don't need it for the internal representation
            idx++;
        }

        // Serial number
        const serialNumber = certElements[idx++]._bytes;

        // Signature algorithm
        const signatureAlgorithmOid = certElements[idx]._elements?.[0]?._bytes;
        if (!signatureAlgorithmOid) {
            throw new CertificateError("Invalid signature algorithm structure");
        }
        const signatureAlgorithm = Bytes.toHex(signatureAlgorithmOid) === "2a8648ce3d040302" ? 1 : 0;
        idx++;

        // Issuer
        const issuer = parseSubjectOrIssuer(certElements[idx++]);

        // Validity
        const { _elements: validityElements } = certElements[idx++];
        if (!validityElements || validityElements.length !== 2) {
            throw new CertificateError("Invalid validity structure");
        }
        const notBefore = parseDate(validityElements[0]);
        const notAfter = parseDate(validityElements[1]);

        // Subject
        const subject = parseSubjectOrIssuer(certElements[idx++]);

        // Public key
        const { _elements: publicKeyElements } = certElements[idx++];
        if (!publicKeyElements || publicKeyElements.length !== 2) {
            throw new CertificateError("Invalid public key structure");
        }

        const { _elements: algorithmElements } = publicKeyElements[0];
        if (!algorithmElements || algorithmElements.length !== 2) {
            throw new CertificateError("Invalid public key algorithm structure");
        }

        const publicKeyAlgorithmOid = Bytes.toHex(algorithmElements[0]._bytes);
        const publicKeyAlgorithm = publicKeyAlgorithmOid === "2a8648ce3d0201" ? 1 : 0;

        const ellipticCurveOid = Bytes.toHex(algorithmElements[1]._bytes);
        const ellipticCurveIdentifier = ellipticCurveOid === "2a8648ce3d030107" ? 1 : 0;

        // Note: DerKey.Bytes for BIT STRING returns data without the padding byte
        // EC public keys in Matter format include the 0x04 uncompressed point format byte
        // followed by 64 bytes (32 bytes X + 32 bytes Y), totaling 65 bytes
        const ellipticCurvePublicKey = Bytes.of(publicKeyElements[1]._bytes);

        // Extensions (required, context-tagged [3])
        if (idx >= certElements.length || certElements[idx]._tag !== 0xa3) {
            throw new CertificateError("Missing required extensions in certificate");
        }
        const extensionsBytes = certElements[idx]._bytes;
        const extensionsSequence = DerCodec.decode(extensionsBytes);
        const extensions = parseExtensions(extensionsSequence, requiredExtensions);

        // Extract signature from BIT STRING
        // Note: DerKey.Bytes for BIT STRING returns data without the padding byte
        const signature = new EcdsaSignature(Bytes.of(signatureNode._bytes), "der").bytes;

        return {
            serialNumber,
            signatureAlgorithm,
            issuer,
            notBefore,
            notAfter,
            subject,
            publicKeyAlgorithm,
            ellipticCurveIdentifier,
            ellipticCurvePublicKey,
            extensions,
            signature,
        };
    }

    /**
     * Extract the public key from a Certificate Signing Request (CSR) in ASN.1 DER format.
     */
    export async function getPublicKeyFromCsr(crypto: Crypto, encodedCsr: Bytes) {
        const { _elements: rootElements } = DerCodec.decode(encodedCsr);
        if (rootElements?.length !== 3) {
            throw new CertificateError("Invalid CSR data");
        }
        const [requestNode, signAlgorithmNode, signatureNode] = rootElements;

        // Extract the public key
        const { _elements: requestElements } = requestNode;
        if (requestElements?.length !== 4) {
            throw new CertificateError("Invalid CSR data");
        }
        const [versionNode, subjectNode, publicKeyNode] = requestElements;
        const requestVersionBytes = Bytes.of(versionNode._bytes);
        if (requestVersionBytes.length !== 1 || requestVersionBytes[0] !== 0) {
            throw new CertificateError(`Unsupported CSR version ${requestVersionBytes[0]}`);
        }

        // Verify the subject, according to spec can be "any value", so just check that it exists
        if (!subjectNode._elements?.length) {
            throw new CertificateError("Missing subject in CSR data");
        }

        const { _elements: publicKeyElements } = publicKeyNode;
        if (publicKeyElements?.length !== 2) {
            throw new CertificateError("Invalid CSR data");
        }
        const [publicKeyTypeNode, publicKeyBytesNode] = publicKeyElements;

        // Verify Public Key Algorithm Type
        const { _elements: publicKeyTypeNodeElements } = publicKeyTypeNode;
        if (publicKeyTypeNodeElements?.length !== 2) {
            throw new CertificateError("Invalid public key type in CSR");
        }
        if (!Bytes.areEqual(publicKeyTypeNodeElements[0]._bytes, X962.PublicKeyAlgorithmEcPublicKey._bytes)) {
            throw new CertificateError("Unsupported public key algorithm in CSR");
        }
        // Verify Public Key Curve Type (Parameter to Algorithm)
        if (!Bytes.areEqual(publicKeyTypeNodeElements[1]._bytes, X962.PublicKeyAlgorithmEcPublicKeyP256._bytes)) {
            throw new CertificateError("Unsupported public key curve in CSR");
        }

        const publicKey = publicKeyBytesNode._bytes;

        // Verify the CSR signature algorithm
        const signatureAlgorithmBytes = signAlgorithmNode._elements?.[0]?._bytes;
        if (
            signatureAlgorithmBytes === undefined ||
            !Bytes.areEqual(X962.EcdsaWithSHA256._objectId._bytes, signatureAlgorithmBytes)
        ) {
            throw new CertificateError("Unsupported signature algorithm in CSR");
        }

        // Verify the CSR signature
        await crypto.verifyEcdsa(
            PublicKey(publicKey),
            DerCodec.encode(requestNode),
            new EcdsaSignature(signatureNode._bytes, "der"),
        );

        return publicKey;
    }
}

/**
 * Convert from Matter TLV to x.509 DER semantics
 */
function matterToX509(cert: Unsigned<MatterCertificate>): X509.UnsignedCertificate {
    const { serialNumber, notBefore, notAfter, issuer, subject, ellipticCurvePublicKey, extensions } = cert;

    return {
        serialNumber,
        validity: {
            notBefore: matterToJsDate(notBefore),
            notAfter: matterToJsDate(notAfter),
        },
        issuer: astOfDistinguishedName(issuer),
        subject: astOfDistinguishedName(subject),
        extensions,
        signatureAlgorithm: X962.EcdsaWithSHA256,
        publicKey: X962.PublicKeyEcPrime256v1(ellipticCurvePublicKey),
    };
}

/**
 * Convert the subject or issuer field of a certificate to a DER AST.
 *
 * Preserve order of keys from original subject and also copy potential custom elements
 */
function astOfDistinguishedName(data: { [field: string]: any }) {
    const ast = {} as { [field: string]: any[] };
    Object.entries(data).forEach(([key, value]) => {
        if (value === undefined) {
            return;
        }
        switch (key) {
            case "commonName":
                ast.commonName = X520.CommonName(value as string);
                break;
            case "surName":
                ast.surName = X520.SurName(value as string);
                break;
            case "serialNum":
                ast.serialNum = X520.SerialNumber(value as string);
                break;
            case "countryName":
                ast.countryName = X520.CountryName(value as string);
                break;
            case "localityName":
                ast.localityName = X520.LocalityName(value as string);
                break;
            case "stateOrProvinceName":
                ast.stateOrProvinceName = X520.StateOrProvinceName(value as string);
                break;
            case "orgName":
                ast.orgName = X520.OrganisationName(value as string);
                break;
            case "orgUnitName":
                ast.orgUnitName = X520.OrganizationalUnitName(value as string);
                break;
            case "title":
                ast.title = X520.Title(value as string);
                break;
            case "name":
                ast.name = X520.Name(value as string);
                break;
            case "givenName":
                ast.givenName = X520.GivenName(value as string);
                break;
            case "initials":
                ast.initials = X520.Initials(value as string);
                break;
            case "genQualifier":
                ast.genQualifier = X520.GenerationQualifier(value as string);
                break;
            case "dnQualifier":
                ast.dnQualifier = X520.DnQualifier(value as string);
                break;
            case "pseudonym":
                ast.pseudonym = X520.Pseudonym(value as string);
                break;
            case "domainComponent":
                ast.domainComponent = X520.DomainComponent(value as string);
                break;
            case "nodeId":
                ast.nodeId = NodeId_Matter(value as NodeId);
                break;
            case "firmwareSigningId":
                ast.firmwareSigningId = FirmwareSigningId_Matter(value as number);
                break;
            case "icacId":
                ast.icacId = IcacId_Matter(value as number | bigint);
                break;
            case "rcacId":
                ast.rcacId = RcacId_Matter(value as number | bigint);
                break;
            case "vvsId":
                ast.vvsId = VvsId_Matter(value as number | bigint);
                break;
            case "fabricId":
                ast.fabricId = FabricId_Matter(value as FabricId);
                break;
            case "caseAuthenticatedTags":
                // In theory if someone mixes multiple caseAuthenticatedTag fields with other fields we currently would
                // code them in ASN.1 as fields at the first position from the original data which might fail
                // certificate validation. Changing this would require to change Tlv decoding, so lets try that way for now.
                const caseAuthenticatedTags = value as CaseAuthenticatedTag[];
                CaseAuthenticatedTag.validateNocTagList(caseAuthenticatedTags);

                const cat0 = caseAuthenticatedTags[0];
                const cat1 = caseAuthenticatedTags[1];
                const cat2 = caseAuthenticatedTags[2];
                if (cat0 !== undefined) {
                    ast.caseAuthenticatedTag0 = NocCat_Matter(cat0);
                }
                if (cat1 !== undefined) {
                    ast.caseAuthenticatedTag1 = NocCat_Matter(cat1);
                }
                if (cat2 !== undefined) {
                    ast.caseAuthenticatedTag2 = NocCat_Matter(cat2);
                }
                break;
            case "vendorId": // Only relevant for ASN.1 encoding of DAC/PAA/PAI certificates
                ast.vendorId = VendorId_Matter(value as VendorId);
                break;
            case "productId": // Only relevant for ASN.1 encoding of DAC/PAA/PAI certificates
                ast.productId = ProductId_Matter(value as number);
                break;
            case "commonNamePs":
                ast.commonNamePs = X520.CommonName(value as string, true);
                break;
            case "surNamePs":
                ast.surNamePs = X520.SurName(value as string, true);
                break;
            case "serialNumPs":
                ast.serialNumPs = X520.SerialNumber(value as string, true);
                break;
            case "countryNamePs":
                ast.countryNamePs = X520.CountryName(value as string, true);
                break;
            case "localityNamePs":
                ast.localityNamePs = X520.LocalityName(value as string, true);
                break;
            case "stateOrProvinceNamePs":
                ast.stateOrProvinceNamePs = X520.StateOrProvinceName(value as string, true);
                break;
            case "orgNamePs":
                ast.orgNamePs = X520.OrganisationName(value as string, true);
                break;
            case "orgUnitNamePs":
                ast.orgUnitNamePs = X520.OrganizationalUnitName(value as string, true);
                break;
            case "titlePs":
                ast.titlePs = X520.Title(value as string, true);
                break;
            case "namePs":
                ast.namePs = X520.Name(value as string, true);
                break;
            case "givenNamePs":
                ast.givenNamePs = X520.GivenName(value as string, true);
                break;
            case "initialsPs":
                ast.initialsPs = X520.Initials(value as string, true);
                break;
            case "genQualifierPs":
                ast.genQualifierPs = X520.GenerationQualifier(value as string, true);
                break;
            case "dnQualifierPs":
                ast.dnQualifierPs = X520.DnQualifier(value as string, true);
                break;
            case "pseudonymPs":
                ast.pseudonymPs = X520.Pseudonym(value as string, true);
                break;
        }
    });
    return ast;
}
