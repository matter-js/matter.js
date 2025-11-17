/**
 * @license
 * Copyright 2022-2025 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { VendorId } from "../datatype/VendorId.js";

export enum RevocationTypeEnum {
    /**
     * RFC 5280 Certificate Revocation List (CRL)
     */
    Crl = 1,
}

/**
 * Device Attestation PKI Revocation Distribution Points Schema
 * @see {@link MatterSpecification.v141.Core} § 11.23.9.
 * DCL endpoints:
 *   * /dcl/pki/revocation-points
 *   * /dcl/pki/revocation-points/{issuerSubjectKeyId}
 *   * /dcl/pki/revocation-points/{issuerSubjectKeyId}/{vid}/{label}
 */
export interface DeviceAttestationPkiRevocationDclSchema {
    /**
     * This field SHALL indicate the VendorID associated with the PAA or PAI whose revocation information
     * is provided. For a non-vendor-scoped PAA, this SHALL be the VendorID associated with the
     * organization operating the PAA. For vendor-scoped PAA and for PAIs, this field SHALL contain the
     * VendorID as found in the CRLSignerCertificate (see Section 6.2.2.2, “Encoding of Vendor ID and
     * Product ID in subject and issuer fields” for encoding).
     */
    vid: VendorId; // Spec: vendorId

    /**
     * This field is only required when a PAI is making the distribution point available. This field SHALL
     * only be provided if the IsPAA field is false and if the CRLSignerCertificate field has a ProductID in
     * its subject (see Section 6.2.2.2, “Encoding of Vendor ID and Product ID in subject and issuer fields”
     * for encoding).
     */
    pid?: number; // Spec: productId

    /**
     * This field SHALL be set to true if the revocation information distribution point relates to a PAA, otherwise
     * it SHALL be set to false (i.e. it relates to a PAI, not a PAA)."
     */
    isPAA: boolean;

    /**
     * This field contains a label to disambiguate multiple revocation information partitions of a particular
     * issuer. Uniqueness within the Device Attestation PKI Revocation Distribution Points schema
     * SHALL be enforced against the tuple containing all of:
     * • VendorID
     * • Label
     * • IssuerSubjectKeyId
     * Therefore, there MAY be multiple entries for the same VendorID and IssuerSubjectKeyId in case
     * partitioning is done, which are disambiguated by the Label.
     * Enforcement of uniqueness constraints SHALL be done by the Distributed Compliance Ledger’s
     * block transaction processing and SHALL also be done by clients making use of the information
     * from this schema.
     */
    label: string;

    /**
     * This field SHALL be present and non-empty if all of the following are true:
     * • Certificate in CRLSignerCertificate field is not self-signed.
     * • IsPAA is false.
     * • CRLSignerCertificate is not a PAI.
     * When present, this field SHALL contain the issuer certificate which signed the CRLSignerCertificate,
     * encoded in X.509v3 PEM format.
     * Additional constraints related to the value of this field are specified in Section 11.23.9.6, “CRLSignerCertificate”.
     */
    crlSignerDelegator?: string;

    /**
     * This field SHALL contain the issuer certificate who signed the revocation information that is provided
     * in the distribution point entry, encoded in X.509v3 PEM format.
     * Additional constraints related to the value of this field are specified in
     * @see {@link MatterSpecification.v141.Core} §11.23.9.6.
     */
    crlSignerCertificate: string;

    /**
     * This field SHALL uniquely identify the PAA or PAI for which this revocation distribution point is
     * provided, via the certificate’s SubjectKeyIdentifier mandatory extension. This field is provided to
     * assist queries without requiring additional certificate parsing. This field SHALL provide the subject
     * key identifier as an even number of uppercase hexadecimal characters ([0-9A-F]), with no whitespace
     * and no non-hexadecimal characters.
     * For example, subject key ID A3:03:13:6D:54:A8:4B:E2:4C:48:87:B3:41:06:6D:C2:70:96:2F:99 (as it
     * would appear in openssl x509 output, for human consumption) would be recorded as
     * A303136D54A84BE24C4887B341066DC270962F99.
     * When processing revocation information during the device Device Attestation Procedure, clients
     * SHALL only use entries whose IssuerSubjectKeyId matches a candidate certificate’s Authority Key
     * Identifier extension.
     */
    issuerSubjectKeyId: string;

    /**
     * This field SHALL indicate the URL where to obtain the information in the format indicated by the
     * RevocationType field. The syntax of this field SHALL follow the syntax as specified in RFC 1738. The
     * maximum length of this field is 256 ASCII characters. All URLs SHALL use either the http or https
     * scheme.
     * Additional details of the content by revocation type are specified in
     * @see {@link MatterSpecification.v141.Core} §11.23.9.8
     */
    dataUrl: string;

    /**
     * This field, if present, SHALL indicate the total size in bytes of the file found at the DataUrl. This field
     * SHALL be omitted if the RevocationType is 1, which refers to a type having built-in signatures.
     */
    dataFileSize?: number | bigint; // TODO

    /**
     * This field, if present, SHALL contain the digest of the entire contents of the associated file downloaded
     * from the DataUrl field, encoded in base64 string representation. The digest SHALL have been
     * computed using the algorithm specified in DataDigestType. This field SHALL be present if and only if
     * the DataFileSize field is present.
     */
    dataDigest?: string;

    /**
     * This field, if present, SHALL indicate the type of digest used in the DataDigest field. This field SHALL
     * be provided if and only if the DataDigest field is present.
     * The value of this field SHALL be a supported numerical identifier value from the IANA Named
     * Information Hash Algorithm Registry [https://www.iana.org/assignments/named-information/named-information.xhtml#hash-alg]
     * established as part of RFC 6920. For example, a value of 1 would match the sha-
     * 256 identifier, which maps to the SHA-256 digest algorithm per Section 6.2 of FIPS 180-4.
     * The digest algorithm chosen SHALL have a minimum digest length of 256 bits, such as sha-256 (ID 1
     * in the registry).
     * To increase interoperability, DataDigestType, if present, SHALL be within the list of [1, 7, 8, 10, 11,
     * 12].
     */
    dataDigestType?: number; // TODO: Define enum for digest types

    /**
     * This field SHALL indicate the type of revocation information provided in the DataUrl field. The
     * following values are defined:
     * • 0: CRL (Certificate Revocation List) in PEM format.
     * • 1: Signed JSON object containing a list of revoked certificates.
     * • 2: Signed JSON object containing a list of revoked certificates, with additional metadata.
     */
    revocationType: RevocationTypeEnum;

    /**
     * The SchemaVersion field value history for this schema is provided below:
     * * 0: Initial Release
     */
    schemaVersion: number;
}
