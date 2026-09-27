/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { VendorId } from "../datatype/VendorId.js";
import { DclCertificateType } from "./operational-certificate.js";

/**
 * Grant Schema, one approval or rejection of a PAA certificate.
 * @see {@link MatterSpecification.v16.Core} § 11.23.4
 */
export interface ApprovalOrRejectDetails {
    /**
     * This field SHALL contain the DCL Key address of the entity granting the approval or rejection.
     */
    address: string;

    /**
     * This field SHALL contain the timestamp of the grant. The DCL REST API sends Unix epoch seconds (not the Matter
     * epoch) as a decimal string.
     */
    time: string;

    /**
     * Additional information or reason for the grant.
     */
    info: string;

    /**
     * The SchemaVersion field value history for this schema is provided below:
     * * 0: Initial Release
     */
    schemaVersion: number;
}

/**
 * Product Attestation Authority and Intermediate Certificate Schema
 *
 * The DCL sends every field and encodes an unset optional field as `""` or `0`; `DclClient` returns it as `undefined`.
 * @see {@link MatterSpecification.v16.Core} § 11.23.5
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
     *
     * The DCL sends the serial number as a decimal string.
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
     * This field SHALL contain the certificate's Subject field. This is encoded as defined in Section 6.1,
     * "Certificate Common Conventions". Base64 encoded.
     *
     * The specification text calls it OPTIONAL for PAA Certificates while its schema table lists it as mandatory;
     * the DCL sends it for every certificate.
     */
    subject: string;

    /**
     * This field SHALL contain the certificate's Subject field, encoded as a human-readable string.
     */
    subjectAsText: string;

    /**
     * This field SHALL uniquely identify the PAA certificate's Subject Key Identifier mandatory extension.
     * This is encoded as defined in Section 6.1.2, "Key Identifier Extension Constraints".
     */
    subjectKeyId: string;

    /**
     * This field SHALL contain list of DCL Keys that approved the PAA Certificate admission into DCL.
     * This field SHALL be set only for a PAA Certificate.
     */
    approvals: ApprovalOrRejectDetails[];

    /**
     * This field SHALL contain list of DCL Keys that rejected the PAA Certificate admission into DCL. This
     * field SHALL be set only for a PAA Certificate
     */
    rejects: ApprovalOrRejectDetails[];

    /**
     * The certificate type. The DCL sends it on every certificate record, although the specification lists it only
     * in the Operational Trust Anchors Schema.
     */
    certificateType: DclCertificateType;

    /**
     * This field SHALL uniquely identify this Vendor Schema entry and it SHALL match the Vendor’s
     * assigned Vendor ID.
     *
     * The DCL sends `0` for a PAA that is not scoped to one vendor.
     */
    vid: VendorId;

    /**
     * The SchemaVersion field value history for this schema is provided below:
     * ???? TODO
     */
    schemaVersion: number;
}
