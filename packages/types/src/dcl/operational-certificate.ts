/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * CertificationTypeEnum of the Operational Trust Anchors Schema, as the DCL REST API encodes it: the value name, not
 * its number.
 * @see {@link MatterSpecification.v16.Core} § 11.23.6.9
 */
export type DclCertificateType = "DeviceAttestationPKI" | "OperationalPKI" | "VIDSignerPKI";

/**
 * Operational Root and Intermediate Certificate Schema
 * @see {@link MatterSpecification.v16.Core} § 11.23.6
 */
export interface OperationalCertificateDclSchema {
    /**
     * This field uniquely identifies a certificate and SHALL contain the body of a certificate that has been
     * added in the DCL. It SHALL be encoded in PEM format. The certificate SHALL respect the format
     * constraints provided for that certificate type.
     */
    pemCert: string;

    /**
     * The field SHALL be used to identify the serial number field in the Matter certificate structure. A
     * Matter certificate follows the same limitation on admissible serial numbers as in [RFC 5280], i.e.,
     * that implementations SHALL admit serial numbers up to 20 octets in length, and certificate authorities
     * SHALL NOT use serial numbers longer than 20 octets in length.
     */
    serialNumber: string;

    /**
     * The field SHALL be used to identify the Certificate Authority that issues the certificate. For a
     * Operational Root CA Certificates (RCAC), this field is OPTIONAL because Issuer and
     * Subject are the same.
     */
    issuer?: string;

    /**
     * The authority key identifier extension provides a means of identifying the public key corresponding
     * to the private key used to sign a Matter certificate. This is OPTIONAL for Operational Root CA
     * Certificates (RCAC).
     */
    authorityKeyId?: string;

    /**
     * This field SHALL contain the PAA certificate’s Subject field, as defined Operational Root CA Certificates
     * (RCAC). This is OPTIONAL for Operational Root CA Certificates (RCAC). This is encoded as
     * defined in Section 6.1, “Certificate Common Conventions”.
     */
    rootSubject?: string;

    /**
     * This field SHALL uniquely identify the PAA certificate’s Subject Key Identifier mandatory extension.
     * It is defined in PAA Certificate and Operational Root CA Certificates (RCAC). This is OPTIONAL
     * for Operational Root CA Certificates (RCAC). This is encoded as defined in Section 6.1, “Certificate
     * Common Conventions”.
     */
    rootSubjectKeyId?: string;

    /**
     * This field SHALL signify whether the associated certificates is a Operational Root CA Certificate
     * (RCAC).
     */
    isRoot: boolean;

    /**
     * This field SHALL indicate the type of the certificate. `VIDSignerPKI` marks a Vendor ID Verification Signer
     * Certificate (VVSC).
     */
    certificateType: DclCertificateType;

    /**
     * This field uniquely identifies the DCL key that was used to register the certificate in DCL, pursuant
     * to DCL policies.
     */
    owner: string;

    /**
     * This field SHALL contain the certificate’s Subject field. This is encoded as defined in Section 6.1,
     * “Certificate Common Conventions”.
     */
    subject: string;

    /**
     * This field SHALL contain the certificate's Subject field, encoded as a human-readable string.
     */
    subjectAsText: string;

    /**
     * This field SHALL uniquely identify the PAA certificate’s Subject Key Identifier mandatory extension.
     * This is encoded as defined in Section 6.1.2, “Key Identifier Extension Constraints”.
     */
    subjectKeyId: string;

    /**
     * This field SHALL contain the Vendor ID of the vendor that issued the certificate.
     */
    vid: number;

    /**
     * The SchemaVersion field value history for this schema is provided below:
     * * 0 Initial Release
     * * 1 Introduction of the CertificationType enum
     */
    schemaVersion: number;
}
