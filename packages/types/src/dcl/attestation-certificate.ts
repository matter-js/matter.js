/**
 * @license
 * Copyright 2022-2025 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { VendorId } from "../datatype/VendorId.js";

export interface ApprovalOrRejectDetails {
    address: string;
    time: string; // but number content
    info: string;
    schemaVersion: number; // No info
}

/**
 * Product Attestation Authority and Intermediate Certificate Schema
 * @see {@link MatterSpecification.v141.Core} § 11.23.4.
 * DCL Endpoints:
 *   * /dcl/pki/certificates
 *   * /dcl/pki/certificates/{subject}
 *   * /dcl/pki/certificates/{subject}/{subjectKeyId}
 */
export interface ProductAttestationDclSchema {
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
     * The field SHALL be used to identify the Certificate Authority that issues the certificate. For a PAA
     * Certificate, this field is OPTIONAL because Issuer and Subject are the same.
     */
    issuer?: string;

    /**
     * The authority key identifier extension provides a means of identifying the public key corresponding
     * to the private key used to sign a Matter certificate. This is OPTIONAL for PAA Certificates.
     */
    authorityKeyId?: string;

    /**
     * This field SHALL contain the PAA certificate’s Subject field, as defined in PAA in PAA Certificate.
     * This is OPTIONAL for PAA Certificates. This is encoded as defined in Section 6.1, “Certificate Common
     * Conventions”.
     */
    rootSubject?: string;

    /**
     * This field SHALL uniquely identify the PAA certificate’s Subject Key Identifier mandatory extension.
     * It is defined in PAA Certificate and Operational Root CA Certificates (RCAC). This is OPTIONAL
     * for PAA Certificates. This is encoded as defined in Section 6.1, “Certificate Common Conventions”.
     */
    rootSubjectKeyId?: string;

    /**
     * This field SHALL signify whether the associated certificate is PAA Certificate.
     */
    isRoot: boolean;

    /**
     * This field uniquely identifies the DCL key that was used to register the certificate in DCL, pursuant
     * to DCL policies.
     */
    owner: string;

    /**
     * This field SHALL contain the certificate's Subject field. This is OPTIONAL for PAA Certificates. This
     * is encoded as defined in Section 6.1, "Certificate Common Conventions".
     * Base64 encoded
     * TODO Check optional or not??
     */
    subject?: string;

    /**
     * Human-readable text representation of the certificate's Subject field.
     */
    subjectAsText?: string;

    /**
     * This field SHALL uniquely identify the PAA certificate's Subject Key Identifier mandatory extension.
     * This is encoded as defined in Section 6.1.2, "Key Identifier Extension Constraints".
     */
    subjectKeyId: string;

    /**
     * This field SHALL contain list of DCL Keys that approved the PAA Certificate admission into DCL.
     * This field SHALL be set only for a PAA Certificate.
     */
    approvals: ApprovalOrRejectDetails; // Spec: grantApprovals and other format

    /**
     * This field SHALL contain list of DCL Keys that rejected the PAA Certificate admission into DCL. This
     * field SHALL be set only for a PAA Certificate
     */
    rejects: ApprovalOrRejectDetails; // Spec: grantRejects and other format

    /**
     * This field SHALL uniquely identify this Vendor Schema entry and it SHALL match the Vendor’s
     * assigned Vendor ID.
     */
    vid: VendorId;

    /**
     * The SchemaVersion field value history for this schema is provided below:
     * ???? TODO
     */
    schemaVersion: number;
}
