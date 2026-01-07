/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { DeviceTypeId } from "../datatype/DeviceTypeId.js";
import { VendorId } from "../datatype/VendorId.js";

/**
 * DeviceModel Schema
 * @see {@link MatterSpecification.v141.Core} § 11.23.6.
 * DCL endpoint:
 *   * /dcl/model/models
 *   * /dcl/model/models/{vid}
 *   * /dcl/model/models/{vid}/{pid}
 */
export interface DeviceModelDclSchema {
    /**
     * This field SHALL identify the vendor of the product by its Vendor ID and SHALL match the VendorID
     * field in the Basic Information Cluster of a device running the software referenced by this
     * DeviceModel/DeviceSoftwareVersionModel record.
     */
    vid: VendorId; // Spec: vendorId

    /**
     * This field SHALL identify the Product ID of the product instance to which a certification declaration,
     * and thus a DCL entry, applies. This field SHALL match the ProductID field in the Basic Information
     * Cluster of a device running the software referenced by this DeviceModel/DeviceSoftwareVersionModel
     * record.
     */
    pid: number; // Spec: productId

    /**
     * DeviceTypeID is the Primary Device Type identifier for the device. For example, DeviceTypeID is 10
     * (0x000A), which is the device type identifier for a Door Lock.
     */
    deviceTypeID: DeviceTypeId;

    /**
     * This field SHOULD match the ProductName field in the Basic Information Cluster of a device running
     * the software referenced by this DeviceModel record.
     */
    productName: string;

    /**
     * This field SHOULD match the ProductLabel field in the Basic Information Cluster of a device running
     * the software referenced by this DeviceModel record.
     */
    productLabel: string;

    /**
     * This field SHALL match the PartNumber field in the Basic Information Cluster of a device running the
     * software referenced by this DeviceModel record.
     * Multiple products (and hence PartNumbers) can share a ProductID. For instance, there may be different
     * packaging (with different PartNumbers) for different regions; also different colors of a product
     * might share the ProductID but may have a different PartNumber. In such cases, the choice of a
     * single PartNumber out of the available set of PartNumbers using this ProductID SHALL be used to
     * populate this field.
     */
    partNumber: string;

    /**
     * This field SHALL identify the device’s available technologies for device discovery which SHALL be
     * encoded as defined in Table 40, “Discovery Capabilities Bitmask”. This field SHALL match the Table
     * 40, “Discovery Capabilities Bitmask” provided in the Section 5.1.3, “QR Code” (if a QR-code is provided
     * on or with the product). This field SHALL be populated if the CommissioningFallbackUrl is
     * populated, and SHOULD be populated for all other products.
     */
    discoveryCapabilitiesBitmask: number; // TODO

    /**
     * This field SHALL identify the device’s commissioning flow with encoding as described in Custom
     * Flow.
     */
    commissioningCustomFlow: number;

    /**
     * This field SHALL identify a vendor-specific commissioning URL for the device model when the
     * CommissioningCustomFlow field is set to '2', and MAY be set for other values of CommissioningCustomFlow.
     * See Custom Commissioning Flow section for how this URL is used. During the lifetime of
     * the product, the specified URL SHOULD resolve to a maintained web page. The syntax of this field
     * SHALL follow the syntax as specified in RFC 1738 and SHALL use the https scheme. The maximum
     * length of this field is 256 ASCII characters.
     */
    commissioningCustomFlowUrl?: string;

    /**
     * This field SHALL identify a hint for the steps that MAY be used to put a device that has not yet been
     * commissioned into commissioning mode. This field is a bitmap with values defined in the Pairing
     * Hint Table. For example, a value of 1 (bit 0 is set) indicates that a device that has not yet been commissioned
     * will enter Commissioning Mode upon a power cycle.
     * Devices that implement Extended Discovery SHALL reflect this value in the Pairing Hint field of
     * Commissionable Node Discovery when they have not yet been commissioned.
     */
    commissioningModeInitialStepsHint: number; // TODO

    /**
     * This field SHALL be populated with the appropriate Pairing Instruction for those values of
     * CommissioningModeInitialStepsHint, for which the Pairing Hint Table indicates a Pairing Instruction (PI)
     * dependency.
     * Devices that implement Extended Discovery SHALL reflect this value in the Pairing Instruction field
     * of Commissionable Node Discovery when they have not yet been commissioned.
     */
    commissioningModeInitialStepsInstruction?: string;

    /**
     * This field SHALL identify a hint for the steps that MAY be used to put a device that has already been
     * commissioned into commissioning mode. This field is a bitmap with values defined in the Pairing
     * Hint Table. At least bit 2 SHALL be set, to indicate that a current Administrator can be used to put a
     * device that has already been commissioned into commissioning mode (see Section 5.6.3, “Enhanced
     * Commissioning Method (ECM)”). Devices which implement additional mechanisms to put a device
     * that has already been commissioned into commissioning mode SHALL reflect these mechanism by
     * setting the corresponding bits in this field.
     * Devices that implement Extended Discovery SHALL reflect this value in the Pairing Hint field of
     * Commissionable Node Discovery when they have already been commissioned.
     */
    commissioningModeSecondaryStepsHint: number; // TODO

    /**
     * This field SHALL be populated with the appropriate Pairing Instruction for those values of
     * CommissioningModeSecondaryStepsHint, for which the Pairing Hint Table indicates a Pairing Instruction
     * (PI) dependency.
     * Devices that implement Extended Discovery SHALL reflect this value in the Pairing Instruction field
     * of Commissionable Node Discovery when they have already been commissioned.
     */
    commissioningModeSecondaryStepsInstruction?: string;

    /**
     * This field SHALL identify a vendor-specific commissioning-fallback URL for the device model,
     * which can be used by a Commissioner in case commissioning fails to direct the user to a manufacturer-provided
     * mechanism to provide resolution to commissioning issues. See Commissioning Fallback
     * section for how this URL is used.
     * During the lifetime of the product, the specified URL SHOULD resolve to a maintained web page.
     * The syntax of this field SHALL follow the syntax as specified in RFC 1738 and SHALL use the https
     * scheme. The maximum length of this field is 256 ASCII characters.
     */
    commissioningFallbackUrl?: string;

    /**
     * This field (when provided) SHALL identify a product-specific web page containing a user manual
     * for the device model. During the lifetime of the product, the specified URL SHOULD resolve to a
     * maintained web page. The syntax of this field SHALL follow the syntax as specified in RFC 1738 and
     * SHALL use the https scheme. The maximum length of this field is 256 ASCII characters.
     */
    userManualUrl?: string;

    /**
     * This field (when provided) SHALL identify a product specific support web page. During the lifetime
     * of the product, the specified URL SHOULD resolve to a maintained web page. The syntax of this
     * field SHALL follow the syntax as specified in RFC 1738 and SHALL use the https scheme. The maximum
     * length of this field is 256 ASCII characters.
     */
    supportUrl?: string;

    /**
     * This field (when provided) SHALL identify a link to a product specific web page. This field SHALL
     * match the ProductURL field in the Basic Information Cluster of a device running the software referenced
     * by this DeviceModel record. During the lifetime of the product, the specified URL SHOULD resolve to a
     * maintained web page. The syntax of this field SHALL follow the syntax as specified in
     * RFC 1738 and SHALL use the https scheme. The maximum length of this field is 256 ASCII characters.
     */
    productUrl?: string;

    /**
     * This field (when provided) SHALL identify a link to the Localized String File of this product. This
     * field SHALL NOT have a localized string identifier. During the lifetime of the product, the specified
     * URL SHOULD resolve to a maintained Localized String File. The syntax of this field SHALL follow
     * the syntax as specified in RFC 1738 and SHALL use the https scheme. The maximum length of this
     * field is 256 ASCII characters.
     */
    lsfUrl?: string;

    /**
     * LsfRevision is a monotonically increasing positive integer indicating the latest available version of
     * Localized String File. Any client can use this field to check whether it has the latest version of the
     * Localized String File cached. When the first version of the Localized String File is published, the
     * value of this field SHOULD be 1. When a new revision of the Localized String File is published, this
     * value SHALL monotonically increase by 1. When a client of this information finds this to be greater
     * than its currently stored LSF revision number, it SHOULD download the latest version of the LSF
     * from the LsfUrl, and update its local value of this field.
     * This field SHALL be provided if and only if when LsfUrl is provided.
     */
    lsfRevision?: number;

    /**
     * This field SHALL identify the configuration options for the Enhanced Setup Flow. This field is a
     * bitmap with values defined in Enhanced Setup Flow Options Table.
     */
    enhancedSetupFlowOptions?: number; // TODO

    /**
     * This field (when provided) SHALL identify a link to the Enhanced Setup Flow Terms and Condition
     * File for this product. During the lifetime of the product, the specified URL SHOULD resolve to a
     * maintained Terms and Conditions File. The syntax of this field SHALL follow the syntax as specified
     * in RFC 1738. The maximum length of this field is 256 ASCII characters. All URLs SHALL use the
     * https scheme. This field SHALL be present if and only if the EnhancedSetupFlowOptions field has
     * bit 0 set.
     */
    enhancedSetupFlowTCUrl?: string;

    /**
     * This field (when provided) is an increasing positive integer indicating the latest available version of
     * the Enhanced Setup Flow Terms and Conditions file. When a new revision of the File is published,
     * this value SHALL increase (and SHOULD increase by 1). This field SHALL be present if and only if
     * the EnhancedSetupFlowOptions field has bit 0 set.
     */
    enhancedSetupFlowTCRevision?: number;

    /**
     * This field (when provided) SHALL contain the digest of the entire contents of the associated file
     * downloaded from the EnhancedSetupFlowTCUrl field, encoded in base64 string representation and
     * SHALL be used to ensure the contents of the downloaded file are authentic. The digest SHALL have
     * been computed using the SHA-256 digest algorithm. This field SHALL be present if and only if the
     * EnhancedSetupFlowOptions field has bit 0 set.
     */
    enhancedSetupFlowTCDigest?: string;

    /**
     * This field (when provided) SHALL indicate the total size of the Enhanced Setup Flow Terms and
     * Conditions file in bytes, and SHALL be used to ensure the downloaded file size is within the bounds
     * of EnhancedSetupFlowTCFileSize. This field SHALL be provided if and only if the EnhancedSetupFlowTCUrl
     * field is present.
     */
    enhancedSetupFlowTCFileSize?: number;

    /**
     * This field (when provided) SHALL identify a link to a vendor-specific URL which SHALL provide a
     * manufacturer specific means to resolve any functionality limitations indicated by the
     * TERMS_AND_CONDITIONS_CHANGED status code. This field SHALL be present if the EnhancedSetupFlowOptions
     * field has bit 0 set. During the lifetime of the product, the specified URL SHOULD
     * resolve to a maintained web page. The syntax of this field SHALL follow the syntax as specified in
     * RFC 1738. The maximum length of this field is 256 ASCII characters. All URLs SHALL use the https
     * scheme.
     */
    enhancedSetupFlowMaintenanceUrl?: string;

    /**
     * The SchemaVersion field value history for this schema is provided below:
     * * 0: Initial Release
     */
    schemaVersion: number;
}
