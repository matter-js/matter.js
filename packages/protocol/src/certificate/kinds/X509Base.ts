/**
 * @license
 * Copyright 2022-2025 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import {
    Bytes,
    ContextTagged,
    Crypto,
    DatatypeOverride,
    DerBitString,
    DerCodec,
    DerKey,
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
import { CaseAuthenticatedTag, FabricId, NodeId, TypeFromPartialBitSchema, VendorId } from "#types";
import { assertCertificateDerSize, CertificateError, Unsigned } from "./common.js";
import {
    FabricId_Matter,
    FirmwareSigningId_Matter,
    IcacId_Matter,
    MATTER_EPOCH_OFFSET_S,
    MATTER_OID_TO_FIELD_MAP,
    matterToJsDate,
    NocCat_Matter,
    NodeId_Matter,
    ProductId_Matter,
    RcacId_Matter,
    VendorId_Matter,
    VvsId_Matter,
} from "./definitions/asn.js";
import { ExtensionKeyUsageBitmap, ExtensionKeyUsageSchema, X509Certificate } from "./definitions/base.js";
import { CertificateExtension } from "./definitions/operational.js";

/**
 * Abstract definition of a X.509 certificate that can be signed and converted to ASN.1 DER format.
 * It also provides two static methods to create a certificate signing request (CSR) and to extract the public key
 * from a CSR.
 */
export abstract class X509Base<CT extends X509Certificate> {
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
        this.signature = await crypto.signEcdsa(key, this.asUnsignedAsn1());
    }

    /**
     * Convert the certificate to ASN.1 DER format without signature.
     */
    asUnsignedAsn1(): Bytes {
        const certBytes = DerCodec.encode(this.genericBuildAsn1Structure(this.cert));
        assertCertificateDerSize(certBytes);
        return certBytes;
    }

    /**
     * Convert the subject or issuer field of the certificate to ASN.1 DER format.
     * Preserve order of keys from original subject and also copy potential custom elements
     */
    #subjectOrIssuerToAsn1(data: { [field: string]: any }) {
        const asn = {} as { [field: string]: any[] };
        Object.entries(data).forEach(([key, value]) => {
            if (value === undefined) {
                return;
            }
            switch (key) {
                case "commonName":
                    asn.commonName = X520.CommonName(value as string);
                    break;
                case "surName":
                    asn.surName = X520.SurName(value as string);
                    break;
                case "serialNum":
                    asn.serialNum = X520.SerialNumber(value as string);
                    break;
                case "countryName":
                    asn.countryName = X520.CountryName(value as string);
                    break;
                case "localityName":
                    asn.localityName = X520.LocalityName(value as string);
                    break;
                case "stateOrProvinceName":
                    asn.stateOrProvinceName = X520.StateOrProvinceName(value as string);
                    break;
                case "orgName":
                    asn.orgName = X520.OrganisationName(value as string);
                    break;
                case "orgUnitName":
                    asn.orgUnitName = X520.OrganizationalUnitName(value as string);
                    break;
                case "title":
                    asn.title = X520.Title(value as string);
                    break;
                case "name":
                    asn.name = X520.Name(value as string);
                    break;
                case "givenName":
                    asn.givenName = X520.GivenName(value as string);
                    break;
                case "initials":
                    asn.initials = X520.Initials(value as string);
                    break;
                case "genQualifier":
                    asn.genQualifier = X520.GenerationQualifier(value as string);
                    break;
                case "dnQualifier":
                    asn.dnQualifier = X520.DnQualifier(value as string);
                    break;
                case "pseudonym":
                    asn.pseudonym = X520.Pseudonym(value as string);
                    break;
                case "domainComponent":
                    asn.domainComponent = X520.DomainComponent(value as string);
                    break;
                case "nodeId":
                    asn.nodeId = NodeId_Matter(value as NodeId);
                    break;
                case "firmwareSigningId":
                    asn.firmwareSigningId = FirmwareSigningId_Matter(value as number);
                    break;
                case "icacId":
                    asn.icacId = IcacId_Matter(value as number | bigint);
                    break;
                case "rcacId":
                    asn.rcacId = RcacId_Matter(value as number | bigint);
                    break;
                case "vvsId":
                    asn.vvsId = VvsId_Matter(value as number | bigint);
                    break;
                case "fabricId":
                    asn.fabricId = FabricId_Matter(value as FabricId);
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
                        asn.caseAuthenticatedTag0 = NocCat_Matter(cat0);
                    }
                    if (cat1 !== undefined) {
                        asn.caseAuthenticatedTag1 = NocCat_Matter(cat1);
                    }
                    if (cat2 !== undefined) {
                        asn.caseAuthenticatedTag2 = NocCat_Matter(cat2);
                    }
                    break;
                case "vendorId": // Only relevant for ASN.1 encoding of DAC/PAA/PAI certificates
                    asn.vendorId = VendorId_Matter(value as VendorId);
                    break;
                case "productId": // Only relevant for ASN.1 encoding of DAC/PAA/PAI certificates
                    asn.productId = ProductId_Matter(value as number);
                    break;
                case "commonNamePs":
                    asn.commonNamePs = X520.CommonName(value as string, true);
                    break;
                case "surNamePs":
                    asn.surNamePs = X520.SurName(value as string, true);
                    break;
                case "serialNumPs":
                    asn.serialNumPs = X520.SerialNumber(value as string, true);
                    break;
                case "countryNamePs":
                    asn.countryNamePs = X520.CountryName(value as string, true);
                    break;
                case "localityNamePs":
                    asn.localityNamePs = X520.LocalityName(value as string, true);
                    break;
                case "stateOrProvinceNamePs":
                    asn.stateOrProvinceNamePs = X520.StateOrProvinceName(value as string, true);
                    break;
                case "orgNamePs":
                    asn.orgNamePs = X520.OrganisationName(value as string, true);
                    break;
                case "orgUnitNamePs":
                    asn.orgUnitNamePs = X520.OrganizationalUnitName(value as string, true);
                    break;
                case "titlePs":
                    asn.titlePs = X520.Title(value as string, true);
                    break;
                case "namePs":
                    asn.namePs = X520.Name(value as string, true);
                    break;
                case "givenNamePs":
                    asn.givenNamePs = X520.GivenName(value as string, true);
                    break;
                case "initialsPs":
                    asn.initialsPs = X520.Initials(value as string, true);
                    break;
                case "genQualifierPs":
                    asn.genQualifierPs = X520.GenerationQualifier(value as string, true);
                    break;
                case "dnQualifierPs":
                    asn.dnQualifierPs = X520.DnQualifier(value as string, true);
                    break;
                case "pseudonymPs":
                    asn.pseudonymPs = X520.Pseudonym(value as string, true);
                    break;
            }
        });
        return asn;
    }

    /**
     * Convert the extensions of the certificate to ASN.1 DER format.
     */
    #extensionsToAsn1(extensions: CertificateExtension) {
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

    /**
     * Build the ASN.1 DER structure for the certificate.
     */
    genericBuildAsn1Structure({
        serialNumber,
        notBefore,
        notAfter,
        issuer,
        subject,
        ellipticCurvePublicKey,
        extensions,
    }: Unsigned<CT>) {
        const {
            basicConstraints: { isCa, pathLen },
        } = extensions;
        if (!isCa && pathLen !== undefined) {
            throw new CertificateError("Path length must be undefined for non-CA certificates.");
        }
        return {
            version: ContextTagged(0, 2), // v3
            serialNumber: DatatypeOverride(DerType.Integer, serialNumber),
            signatureAlgorithm: X962.EcdsaWithSHA256,
            issuer: this.#subjectOrIssuerToAsn1(issuer),
            validity: {
                notBefore: matterToJsDate(notBefore),
                notAfter: matterToJsDate(notAfter),
            },
            subject: this.#subjectOrIssuerToAsn1(subject),
            publicKey: X962.PublicKeyEcPrime256v1(ellipticCurvePublicKey),
            extensions: ContextTagged(3, this.#extensionsToAsn1(extensions)),
        };
    }
}

export namespace X509Base {
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
     * X.509 certificate extension OIDs
     */
    namespace ExtensionOid {
        export const BASIC_CONSTRAINTS = 0x551d13n;
        export const KEY_USAGE = 0x551d0fn;
        export const EXTENDED_KEY_USAGE = 0x551d25n;
        export const SUBJECT_KEY_IDENTIFIER = 0x551d0en;
        export const AUTHORITY_KEY_IDENTIFIER = 0x551d23n;
    }

    /**
     * Extended Key Usage OIDs
     */
    namespace ExtendedKeyUsageOid {
        export const SERVER_AUTH = 0x2b06010505070301n;
        export const CLIENT_AUTH = 0x2b06010505070302n;
        export const CODE_SIGNING = 0x2b06010505070303n;
        export const EMAIL_PROTECTION = 0x2b06010505070304n;
        export const TIME_STAMPING = 0x2b06010505070308n;
        export const OCSP_SIGNING = 0x2b06010505070309n;
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

        const { [DerKey.Elements]: rdnSequence } = node;
        if (!rdnSequence) {
            throw new CertificateError("Invalid subject/issuer structure");
        }

        // Iterate through RDN SEQUENCEs
        for (const rdnSet of rdnSequence) {
            const { [DerKey.Elements]: attributeSets } = rdnSet;
            if (!attributeSets) continue;

            for (const attributeSet of attributeSets) {
                const { [DerKey.Elements]: attrElements } = attributeSet;
                if (!attrElements || attrElements.length !== 2) continue;

                const [oidNode, valueNode] = attrElements;
                const oid = oidNode[DerKey.Bytes];
                const fieldInfo = oidToSubjectField(oid);

                if (fieldInfo === undefined) continue;

                let { field } = fieldInfo;
                let value;

                // Parse the value based on the field type
                const valueBytes = Bytes.of(valueNode[DerKey.Bytes]);
                const valueTag = valueNode[DerKey.TagId];

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
    ): X509Certificate["extensions"] & {
        [oid: string]: unknown; // For unrecognized extensions
    } {
        const result = {
            basicConstraints: { isCa: false },
        } as X509Certificate["extensions"] & { [oid: string]: unknown };

        const { [DerKey.Elements]: extensions } = extensionsNode;
        if (!extensions) {
            throw new CertificateError("Invalid extensions structure");
        }

        for (const ext of extensions) {
            const { [DerKey.Elements]: extElements } = ext;
            if (!extElements || extElements.length < 2) continue;

            const oid = extElements[0][DerKey.Bytes];
            const oidValue = Bytes.asBigInt(oid);

            // Find the value - it might be after a critical flag
            let valueIndex = 1;
            if (extElements.length > 2 && extElements[1][DerKey.TagId] === DerType.Boolean) {
                valueIndex = 2; // Skip critical flag
            }

            const valueOctetString = extElements[valueIndex][DerKey.Bytes];
            const valueNode = DerCodec.decode(valueOctetString);

            switch (oidValue) {
                case ExtensionOid.BASIC_CONSTRAINTS:
                    {
                        const { [DerKey.Elements]: bcElements } = valueNode;
                        // Always initialize basicConstraints when extension is present
                        if (bcElements && bcElements.length > 0) {
                            // First element is isCa boolean
                            if (bcElements[0][DerKey.TagId] === DerType.Boolean) {
                                const bcBytes = Bytes.of(bcElements[0][DerKey.Bytes]);
                                result.basicConstraints.isCa = bcBytes[0] !== 0;
                            }
                            // Second element (if present) is pathLen integer
                            if (bcElements.length > 1 && bcElements[1][DerKey.TagId] === DerType.Integer) {
                                const pathLenBytes = Bytes.of(bcElements[1][DerKey.Bytes]);
                                result.basicConstraints.pathLen = pathLenBytes[0];
                            }
                        }
                    }
                    break;

                case ExtensionOid.KEY_USAGE:
                    {
                        // Note: DerKey.Bytes for BIT STRING returns data without the padding byte
                        const bitString = Bytes.of(valueNode[DerKey.Bytes]);
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

                case ExtensionOid.EXTENDED_KEY_USAGE:
                    {
                        const { [DerKey.Elements]: ekuElements } = valueNode;
                        if (ekuElements) {
                            const ekuValues: number[] = [];
                            for (const eku of ekuElements) {
                                const ekuOidValue = Bytes.asBigInt(eku[DerKey.Bytes]);
                                switch (ekuOidValue) {
                                    case ExtendedKeyUsageOid.SERVER_AUTH:
                                        ekuValues.push(1);
                                        break;
                                    case ExtendedKeyUsageOid.CLIENT_AUTH:
                                        ekuValues.push(2);
                                        break;
                                    case ExtendedKeyUsageOid.CODE_SIGNING:
                                        ekuValues.push(3);
                                        break;
                                    case ExtendedKeyUsageOid.EMAIL_PROTECTION:
                                        ekuValues.push(4);
                                        break;
                                    case ExtendedKeyUsageOid.TIME_STAMPING:
                                        ekuValues.push(5);
                                        break;
                                    case ExtendedKeyUsageOid.OCSP_SIGNING:
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

                case ExtensionOid.SUBJECT_KEY_IDENTIFIER:
                    result.subjectKeyIdentifier = valueNode[DerKey.Bytes];
                    break;

                case ExtensionOid.AUTHORITY_KEY_IDENTIFIER:
                    {
                        const { [DerKey.Elements]: akiElements } = valueNode;
                        if (akiElements && akiElements.length > 0) {
                            // The keyIdentifier is context-tagged with [0]
                            result.authorityKeyIdentifier = akiElements[0][DerKey.Bytes];
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
        const dateBytes = node[DerKey.Bytes];
        const dateString = Bytes.toString(dateBytes);
        const tag = node[DerKey.TagId];

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
    ): X509Certificate {
        const { [DerKey.Elements]: rootElements } = DerCodec.decode(encodedCert);

        if (!rootElements || rootElements.length !== 3) {
            throw new CertificateError(
                `Invalid certificate structure - expected 3 root elements, got ${rootElements?.length ?? 0}`,
            );
        }

        const [certificateNode, , signatureNode] = rootElements;

        // Parse TBSCertificate
        const { [DerKey.Elements]: certElements } = certificateNode;
        if (!certElements || certElements.length < 7) {
            throw new CertificateError("Invalid TBSCertificate structure");
        }

        let idx = 0;

        // Version (optional, context-tagged [0])
        if (certElements[idx][DerKey.TagId] === 0xa0) {
            // Skip version - we don't need it for the internal representation
            idx++;
        }

        // Serial number
        const serialNumber = certElements[idx++][DerKey.Bytes];

        // Signature algorithm
        const signatureAlgorithmOid = certElements[idx][DerKey.Elements]?.[0]?.[DerKey.Bytes];
        if (!signatureAlgorithmOid) {
            throw new CertificateError("Invalid signature algorithm structure");
        }
        const signatureAlgorithm = Bytes.toHex(signatureAlgorithmOid) === "2a8648ce3d040302" ? 1 : 0;
        idx++;

        // Issuer
        const issuer = parseSubjectOrIssuer(certElements[idx++]);

        // Validity
        const { [DerKey.Elements]: validityElements } = certElements[idx++];
        if (!validityElements || validityElements.length !== 2) {
            throw new CertificateError("Invalid validity structure");
        }
        const notBefore = parseDate(validityElements[0]);
        const notAfter = parseDate(validityElements[1]);

        // Subject
        const subject = parseSubjectOrIssuer(certElements[idx++]);

        // Public key
        const { [DerKey.Elements]: publicKeyElements } = certElements[idx++];
        if (!publicKeyElements || publicKeyElements.length !== 2) {
            throw new CertificateError("Invalid public key structure");
        }

        const { [DerKey.Elements]: algorithmElements } = publicKeyElements[0];
        if (!algorithmElements || algorithmElements.length !== 2) {
            throw new CertificateError("Invalid public key algorithm structure");
        }

        const publicKeyAlgorithmOid = Bytes.toHex(algorithmElements[0][DerKey.Bytes]);
        const publicKeyAlgorithm = publicKeyAlgorithmOid === "2a8648ce3d0201" ? 1 : 0;

        const ellipticCurveOid = Bytes.toHex(algorithmElements[1][DerKey.Bytes]);
        const ellipticCurveIdentifier = ellipticCurveOid === "2a8648ce3d030107" ? 1 : 0;

        // Note: DerKey.Bytes for BIT STRING returns data without the padding byte
        // EC public keys in Matter format include the 0x04 uncompressed point format byte
        // followed by 64 bytes (32 bytes X + 32 bytes Y), totaling 65 bytes
        const ellipticCurvePublicKey = Bytes.of(publicKeyElements[1][DerKey.Bytes]);

        // Extensions (required, context-tagged [3])
        if (idx >= certElements.length || certElements[idx][DerKey.TagId] !== 0xa3) {
            throw new CertificateError("Missing required extensions in certificate");
        }
        const extensionsBytes = certElements[idx][DerKey.Bytes];
        const extensionsSequence = DerCodec.decode(extensionsBytes);
        const extensions = parseExtensions(extensionsSequence, requiredExtensions);

        // Extract signature from BIT STRING
        // Note: DerKey.Bytes for BIT STRING returns data without the padding byte
        const signature = new EcdsaSignature(Bytes.of(signatureNode[DerKey.Bytes]), "der").bytes;

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
        const { [DerKey.Elements]: rootElements } = DerCodec.decode(encodedCsr);
        if (rootElements?.length !== 3) {
            throw new CertificateError("Invalid CSR data");
        }
        const [requestNode, signAlgorithmNode, signatureNode] = rootElements;

        // Extract the public key
        const { [DerKey.Elements]: requestElements } = requestNode;
        if (requestElements?.length !== 4) {
            throw new CertificateError("Invalid CSR data");
        }
        const [versionNode, subjectNode, publicKeyNode] = requestElements;
        const requestVersionBytes = Bytes.of(versionNode[DerKey.Bytes]);
        if (requestVersionBytes.length !== 1 || requestVersionBytes[0] !== 0) {
            throw new CertificateError(`Unsupported CSR version ${requestVersionBytes[0]}`);
        }

        // Verify the subject, according to spec can be "any value", so just check that it exists
        if (!subjectNode[DerKey.Elements]?.length) {
            throw new CertificateError("Missing subject in CSR data");
        }

        const { [DerKey.Elements]: publicKeyElements } = publicKeyNode;
        if (publicKeyElements?.length !== 2) {
            throw new CertificateError("Invalid CSR data");
        }
        const [publicKeyTypeNode, publicKeyBytesNode] = publicKeyElements;

        // Verify Public Key Algorithm Type
        const { [DerKey.Elements]: publicKeyTypeNodeElements } = publicKeyTypeNode;
        if (publicKeyTypeNodeElements?.length !== 2) {
            throw new CertificateError("Invalid public key type in CSR");
        }
        if (
            !Bytes.areEqual(
                publicKeyTypeNodeElements[0][DerKey.Bytes],
                X962.PublicKeyAlgorithmEcPublicKey[DerKey.Bytes],
            )
        ) {
            throw new CertificateError("Unsupported public key algorithm in CSR");
        }
        // Verify Public Key Curve Type (Parameter to Algorithm)
        if (
            !Bytes.areEqual(
                publicKeyTypeNodeElements[1][DerKey.Bytes],
                X962.PublicKeyAlgorithmEcPublicKeyP256[DerKey.Bytes],
            )
        ) {
            throw new CertificateError("Unsupported public key curve in CSR");
        }

        const publicKey = publicKeyBytesNode[DerKey.Bytes];

        // Verify the CSR signature algorithm
        const signatureAlgorithmBytes = signAlgorithmNode[DerKey.Elements]?.[0]?.[DerKey.Bytes];
        if (
            signatureAlgorithmBytes === undefined ||
            !Bytes.areEqual(X962.EcdsaWithSHA256[DerKey.ObjectId][DerKey.Bytes], signatureAlgorithmBytes)
        ) {
            throw new CertificateError("Unsupported signature algorithm in CSR");
        }

        // Verify the CSR signature
        await crypto.verifyEcdsa(
            PublicKey(publicKey),
            DerCodec.encode(requestNode),
            new EcdsaSignature(signatureNode[DerKey.Bytes], "der"),
        );

        return publicKey;
    }
}
