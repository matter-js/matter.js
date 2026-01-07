/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { VendorId } from "../datatype/VendorId.js";

/**
 * DeviceSoftwareVersionModel Schema
 * @see {@link MatterSpecification.v141.Core} § 11.23.7.
 * DCL endpoints:
 * * check with https://on.dcl.csa-iot.org/dcl/model/versions/{vid}/{pid} to get a list of software versions, check for newer ones
 * * check with https://on.dcl.csa-iot.org/dcl/model/versions/{vid}/{pid}/{softwareVersion} for these details
 * see also https://github.com/home-assistant-libs/python-matter-server/blob/main/matter_server/server/ota/dcl.py#L35
 */
export interface DeviceSoftwareVersionModelDclSchema {
    /**
     * This field SHALL identify the vendor of the product by its Vendor ID and SHALL match the VendorID
     * field in the Basic Information Cluster of a device running the software referenced by this
     * DeviceModel/DeviceSoftwareVersionModel record.
     */
    vid: VendorId; // Spec vendorId

    /**
     * This field SHALL identify the Product ID of the product instance to which a certification declaration,
     * and thus a DCL entry, applies. This field SHALL match the ProductID field in the Basic Information
     * Cluster of a device running the software referenced by this DeviceModel/DeviceSoftwareVersionModel
     * record.
     */
    pid: number; // Spec productId

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
    firmwareInformation?: string;

    /**
     * This field SHALL indicate whether this SoftwareVersion is valid. When creating an entry for a new
     * SoftwareVersion, this typically is set to True. When the manufacturer later finds out there is some
     * reason that this version should no longer be used (e.g. due to some bugs), the field SHALL be
     * updated to False.
     */
    softwareVersionValid: boolean;

    /**
     * OtaUrl SHALL identify the URL where to obtain the OTA image. The OtaUrl field SHALL be populated
     * unless the device manufacturer provides alternative means to update the product’s firmware.
     * The specified URL SHOULD be available for the relevant lifetime of the corresponding software.
     * The syntax of this field SHALL follow the syntax as specified in RFC 1738 and SHALL use the https
     * scheme. The maximum length of this field is 256 ASCII characters.
     */
    otaUrl?: string;

    /**
     * OtaFileSize is the total size of the OTA software image in bytes. This field SHALL be provided if the
     * OtaUrl field is populated.
     */
    otaFileSize?: number | bigint; // TODO

    /**
     * OtaChecksum SHALL contain the digest of the entire contents of the associated OTA Software
     * Update Image under the OtaUrl field, encoded in base64 string representation. The digest SHALL
     * have been computed using the algorithm specified in OtaChecksumType. This field SHALL be provided
     * if the OtaUrl field is populated.
     */
    otaChecksum?: string;

    /**
     * OtaChecksumType SHALL identify the type of OtaChecksum. This field SHALL be provided if the
     * OtaUrl field is populated.
     * The value of this field SHALL be a supported numerical identifier value from the IANA Named
     * Information Hash Algorithm Registry [https://www.iana.org/assignments/named-information/named-information.xhtml#hash-alg]
     * established as part of RFC 6920. For example, a value of 1 would match the sha-
     * 256 identifier, which maps to the SHA-256 digest algorithm per Section 6.2 of FIPS 180-4.
     * The digest algorithm chosen SHALL have a minimum digest length of 256 bits, such as sha-256 (ID 1
     * in the registry).
     * To increase interoperability, OtaChecksumType SHALL be within the list of [1, 7, 8, 10, 11, 12].
     */
    otaChecksumType?: number; // TODO: Define enum for checksum types

    /**
     * MinApplicableSoftwareVersion SHALL be equal to the lowest SoftwareVersion for which this image
     * can be applied. Also see Section 11.21.2.4.6, “MinApplicableSoftwareVersion field”.
     */
    minApplicableSoftwareVersion: number;

    /**
     * MaxApplicableSoftwareVersion SHALL be equal to the highest SoftwareVersion for which this
     * image can be applied. Also see Section 11.21.2.4.7, “MaxApplicableSoftwareVersion field”.
     */
    maxApplicableSoftwareVersion: number;

    /**
     * ReleaseNotesUrl SHALL identify a product specific web page that contains release notes for the
     * device model software. The specified URL SHOULD resolve to a maintained web page available for
     * the lifetime of the corresponding software being relevant. The syntax of this field SHALL follow the
     * syntax as specified in RFC 1738 and SHALL use the https scheme. The maximum length of this field
     * is 256 ASCII characters.
     */
    releaseNotesUrl?: string;

    /**
     * SpecificationVersion SHALL identify the specification version applicable to the device model. This
     * field SHALL match the SpecificationVersion field in the Basic Information Cluster of a device running
     * the software certified by this DeviceModel record.
     */
    specificationVersion?: number;

    /**
     * The SchemaVersion field value history for this schema is provided below:
     * * 0: Initial Release
     */
    schemaVersion: number;
}
