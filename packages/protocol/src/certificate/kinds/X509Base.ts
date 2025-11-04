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
    DerType,
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
    #signature?: Bytes;
    #cert: Unsigned<CT>;

    constructor(cert: CT | Unsigned<CT>) {
        this.#cert = cert;
        if ("signature" in cert) {
            this.#signature = cert.signature;
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
    set signature(signature: Bytes) {
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
                case "sureName":
                    asn.sureName = X520.SurName(value as string);
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
                    asn.rcacId = VvsId_Matter(value as number | bigint);
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
                case "sureNamePs":
                    asn.sureNamePs = X520.SurName(value as string, true);
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
    protected genericBuildAsn1Structure({
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

    /**
     * Create a Certificate Signing Request (CSR) in ASN.1 DER format.
     */
    static async createCertificateSigningRequest(crypto: Crypto, key: Key) {
        const request = {
            version: 0,
            subject: { organization: X520.OrganisationName("CSR") },
            publicKey: X962.PublicKeyEcPrime256v1(key.publicKey),
            endSignedBytes: ContextTagged(0),
        };

        return DerCodec.encode({
            request,
            signAlgorithm: X962.EcdsaWithSHA256,
            signature: DerBitString(await crypto.signEcdsa(key, DerCodec.encode(request), "der")),
        });
    }

    /**
     * Extract the public key from a Certificate Signing Request (CSR) in ASN.1 DER format.
     */
    static async getPublicKeyFromCsr(crypto: Crypto, encodedCsr: Bytes) {
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
            signatureNode[DerKey.Bytes],
            "der",
        );

        return publicKey;
    }
}
