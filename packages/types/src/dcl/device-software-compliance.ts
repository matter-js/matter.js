/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { VendorId } from "../datatype/VendorId.js";

export enum SoftwareVersionCertificationStatusEnum {
    /**
     * Used for development and test purposes
     * (These will typically not be placed in DCL)
     */
    DevTest = 0,

    /**
     * Used for a SoftwareVersion when going into certification testing
     * (These might or might not be placed in DCL, depending on CSA policy and procedures)
     */
    Provisional = 1,

    /**
     * Used for a SoftwareVersion which has been certified
     */
    Certified = 2,

    /**
     * Used for a SoftwareVersion which has been revoked
     */
    Revoked = 3,
}

/**
 * DeviceSoftwareCompliance / Compliance test result Schema
 * @see {@link MatterSpecification.v141.Core} § 11.23.8.
 * DCL endpoint:
 *   * /dcl/compliance/device-software-compliance
 *   * /dcl/compliance/device-software-compliance/{cDCertificateId}
 *
 *   * /dcl/compliance/compliance-info
 *   * /dcl/compliance/compliance-info/{vid}/{pid}/{softwareVersion}/{certificationType}
 *   * /dcl/compliance/certified-models
 *   * /dcl/compliance/certified-models/{vid}/{pid}/{softwareVersion}/{certificationType}
 *
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
    cdVersionNumber: number;

    /**
     * The FirmwareInformation field, if present, SHALL match the firmware_information field in attestation-elements
     * field included in the Device Attestation response when this Software Image boots on
     * the device. It is an OPTIONAL field that MAY be present only for devices that meet the requirements
     * listed in Section 6.3.2, “Firmware Information”.
     */
    softwareVersionCertificationStatus?: SoftwareVersionCertificationStatusEnum;

    /**
     * This field SHALL have the CSA certification’s certificate ID for the Certification that applies to this
     * record. The value of this field is used in the Certification Declaration's certificate_id field (see Certification
     * Elements TLV structure) for products using the VendorID, ProductID and SoftwareVersion
     * in this schema entry.
     */
    cdCertificateId: string;

    /**
     * The SchemaVersion field value history for this schema is provided below:
     * * 0: Initial Release
     */
    schemaVersion: number;
}
