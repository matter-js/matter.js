/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { VendorId } from "../datatype/VendorId.js";
import { SoftwareVersionCertificationStatus } from "../globals/SoftwareVersionCertificationStatus.js";

/**
 * @deprecated Use {@link SoftwareVersionCertificationStatus}.
 */
export import SoftwareVersionCertificationStatusEnum = SoftwareVersionCertificationStatus;

/**
 * ComplianceHistoryItem Schema, one entry of {@link DeviceSoftwareComplianceDclSchema.history}. Each entry records a
 * change in the certification status of a compliance record.
 *
 * The DCL sends every field and encodes an unset optional field as `""` or `0`; `DclClient` returns it as `undefined`.
 *
 * @see {@link MatterSpecification.v161.Core} § 11.23.9
 */
export interface ComplianceHistoryItemDclSchema {
    /**
     * See {@link DeviceSoftwareComplianceDclSchema.softwareVersionCertificationStatus}.
     */
    softwareVersionCertificationStatus: SoftwareVersionCertificationStatus;

    /**
     * See {@link DeviceSoftwareComplianceDclSchema.date}.
     */
    date: string;

    /**
     * See {@link DeviceSoftwareComplianceDclSchema.reason}.
     */
    reason?: string;

    /**
     * See {@link DeviceSoftwareComplianceDclSchema.cDVersionNumber}.
     */
    cDVersionNumber: number;

    /**
     * The SchemaVersion field value history for this schema is provided below:
     * * 0: Initial Release
     */
    schemaVersion: number;
}

/**
 * DeviceSoftwareCompliance / Compliance test result Schema
 *
 * The DCL sends every field and encodes an unset optional field as `""` or `0`; `DclClient` returns it as `undefined`.
 *
 * @see {@link MatterSpecification.v161.Core} § 11.23.10
 * DCL endpoint:
 *   * /dcl/compliance/compliance-info
 *   * /dcl/compliance/compliance-info/{vid}/{pid}/{softwareVersion}/{certificationType}
 *   * /dcl/compliance/device-software-compliance (entries in each item's `complianceInfo` list)
 *   * /dcl/compliance/device-software-compliance/{cDCertificateId} (entries in its `complianceInfo` list)
 */
export interface DeviceSoftwareComplianceDclSchema {
    /**
     * This field SHALL identify the vendor of the product by its Vendor ID and SHALL match the VendorID
     * field in the Basic Information Cluster of a device running the software referenced by this
     * DeviceModel/DeviceSoftwareVersionModel record.
     */
    vid: VendorId; // Spec: VendorId

    /**
     * This field SHALL identify the Product ID of the product instance to which a certification declaration,
     * and thus a DCL entry, applies. This field SHALL match the ProductID field in the Basic Information
     * Cluster of a device running the software referenced by this DeviceModel/DeviceSoftwareVersionModel
     * record.
     */
    pid: number; // Spec: ProductId

    /**
     * SoftwareVersion SHALL identify the software version number for the device model consistent with
     * the value found in Section 11.21.2.4.3, “SoftwareVersion field”. The SoftwareVersionNumber value
     * SHOULD NOT be displayed to an end-user. SoftwareVersion is not editable, but it would be possible
     * to create a new device model for the same VendorID/ProductID for different versions. Both SoftwareVersion
     * and SoftwareVersionString SHALL be included. This field SHALL match the SoftwareVersion
     * field in the Basic Information Cluster of a device running the software certified by this
     * DeviceModel record.
     */
    softwareVersion: number;

    /**
     * This field SHALL match the Software Version String field in the Basic Information Cluster of a
     * device running the software referenced by this DeviceModel record, including format constraints
     * on that field.
     */
    softwareVersionString: string;

    /**
     * CDVersionNumber SHALL identify the CD Version Number of the Certification that applies to this
     * Software Image. The CDVersionNumber maps to version_number defined in Certification Elements TLV
     * structure.
     */
    cDVersionNumber: number;

    /**
     * This field SHALL have the CSA certification’s certificate ID for the Certification that applies to this
     * record. The value of this field is used in the Certification Declaration's certificate_id field (see Certification
     * Elements TLV structure) for products using the VendorID, ProductID and SoftwareVersion
     * in this schema entry.
     */
    cDCertificateId: string;

    /**
     * This field SHALL specify the certification program applied to the model. Supported values are `zigbee`,
     * `matter` or `aliro`.
     */
    certificationType: string;

    /**
     * SpecificationVersion SHALL identify the specification version applicable to the device model. This field
     * SHALL match the SpecificationVersion attribute in the Basic Information Cluster of a device running the
     * software certified by this DeviceModel record. For example, for `1.4.2.0` this field contains `0x01040200`.
     *
     * Records with schema version 0 predate the field and have no value.
     */
    specificationVersion?: number;

    /**
     * This field SHALL have a value from {@link SoftwareVersionCertificationStatus} reflecting the current
     * certification status of this SoftwareVersion.
     */
    softwareVersionCertificationStatus: SoftwareVersionCertificationStatus;

    /**
     * This field SHALL identify the date (encoded as in RFC 3339) when a device software version is
     * provisioned, certified or revoked, depending on
     * {@link DeviceSoftwareComplianceDclSchema.softwareVersionCertificationStatus}.
     */
    date: string;

    /**
     * This field uniquely identifies the DCL key that was used to register the device software compliance record
     * in DCL, pursuant to DCL policies.
     */
    owner: string;

    /**
     * The history of changes to the certification status. DCL creates and manages the history, adding an entry for
     * each change in the certification status of this record.
     */
    history: ComplianceHistoryItemDclSchema[];

    /**
     * This field, when present, SHALL specify the certification path. Supported values are `fullTested`,
     * `similarity`, `rapid-recert`, `fastTrack`, `ctp`, `family` and `portfolio`; values may be added or removed in
     * the future.
     */
    certificationRoute?: string;

    /**
     * This field, when present, SHALL contain additional human-readable information about the reason of the
     * certification.
     */
    reason?: string;

    /**
     * This field, when present, SHALL specify the communication technologies the device uses, comma-separated when
     * there are several (e.g. `wi-fi,ethernet,bluetooth`). Supported transports are `thread`, `wi-fi`, `ethernet`,
     * `bluetooth` and `nfc`.
     */
    transport?: string;

    /**
     * This field, when present, SHALL specify the product family to which the certified model belongs. Typical
     * family IDs have the prefix `FAM` followed by alphanumeric characters (e.g. `FAM123456`).
     */
    familyId?: string;

    /**
     * This field, when present, SHALL specify the application cluster IDs supported by the device, as hexadecimal
     * numbers in a comma-separated list (e.g. `0x0003,0x0004,0x0006`).
     */
    supportedClusters?: string;

    /**
     * This field, when present, SHALL contain the product type. Supported values are `endProduct`,
     * `softwareComponent` or `compliantPlatform`.
     */
    programType?: string;

    /**
     * This field, if present, SHALL specify the version of the specified {@link DeviceSoftwareComplianceDclSchema.programType}. It MAY be provided
     * only if programType is populated.
     */
    programTypeVersion?: string;

    /**
     * This field, when present, SHALL specify the parent vs. child characteristic when using the Product Family
     * Certification or Portfolio Certification Program. Supported values are `parent` and `child`.
     */
    parentChild?: string;

    /**
     * The SchemaVersion field value history for this schema is provided below:
     * * 0: Initial Release
     * * 1: Introduction of the SpecificationVersion field
     */
    schemaVersion: number;
}
