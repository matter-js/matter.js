/**
 * @license
 * Copyright 2022-2025 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import {
    TlvByteString,
    TlvField,
    TlvObject,
    TlvOptionalField,
    TlvString,
    TlvUInt16,
    TlvUInt32,
    TlvUInt64,
    TlvUInt8,
    TypeFromSchema,
} from "#types";

/**
 * OTA Image TLV Header
 * @see {@link MatterSpecification.v142.Core} §11.21.2.4.
 */
export const TlvOtaImageHeader = TlvObject({
    /**
     * The VendorID field SHALL be used by an OTA Provider to determine if a Node is the intended recipient
     * of the OTA software update file by checking that the VendorID field in the OTA software update
     * file matches the VendorID received in the Query Image command from the OTA Requestor. This
     * VendorID field MAY be zero, in which case this OTA software update file MAY apply to more than
     * one vendor.
     */
    vendorId: TlvField(0, TlvUInt16),

    /**
     * The ProductID field MAY be used by an OTA Provider to determine if a Node is the intended recipient
     * of the OTA software update file by checking that the ProductID field in the OTA software update
     * file matches the ProductID received in the Query Image command from the OTA Requestor. This
     * ProductID field MAY be zero, in which case this OTA software update file MAY apply to more than
     * one product.
     */
    productId: TlvField(1, TlvUInt16),

    /**
     * The SoftwareVersion field SHALL contain the version for the software contained within the file. A
     * larger value of SoftwareVersion is newer than a lower value. The SoftwareVersion value SHOULD
     * NOT be displayed to an end-user.
     * For a given version, this SoftwareVersion field SHALL match what the Node will report in its SoftwareVersion
     * attribute in the Basic Information Cluster, once executing the version.
     */
    softwareVersion: TlvField(2, TlvUInt32),

    /**
     * The SoftwareVersionString field SHALL contain a human readable (displayable) representation of
     * the version for the software contained within the file. The SoftwareVersionString value SHALL NOT
     * be used by an OTA Provider to determine if the OTA software update file contains a newer image
     * than what is currently running on a Node. The SoftwareVersionString value SHOULD be displayed
     * to an end-user when communicating an identification for the software version.
     * Format constraints for this field SHALL match the constraints of the SoftwareVersionString
     * attribute in the Basic Information Cluster.
     * For a given version, this SoftwareVersionString field SHALL match what the Node will report in its
     * SoftwareVersionString attribute in the Basic Information Cluster, once executing the version
     */
    softwareVersionString: TlvField(3, TlvString.bound({ minLength: 1, maxLength: 64 })),

    /**
     * The PayloadSize field SHALL indicate the total size, in bytes, of the payload contained within this
     * OTA software update file, beyond the header. The length of all data beyond the terminating byte of
     * the header structure SHALL be equal to this field’s value.
     */
    payloadSize: TlvField(4, TlvUInt64),

    /**
     * The MinApplicableSoftwareVersion field, if present, SHALL be used by an OTA Provider to determine
     * if the OTA Software Image is suitable for the Node, by checking that the MinApplicableSoftwareVersion
     * field in the OTA software update file is less than or equal to the SoftwareVersion
     * received in the Query Image command from the OTA Requestor.
     */
    minApplicableSoftwareVersion: TlvOptionalField(5, TlvUInt32),

    /**
     * The MaxApplicableSoftwareVersion field, if present, SHALL be used by an OTA Provider to determine
     * if the OTA Software Image is suitable for the Node, by checking that the MaxApplicableSoftwareVersion
     * field in the OTA software update file is greater than or equal to the SoftwareVersion
     * received in the Query Image command from the OTA Requestor.
     */
    maxApplicableSoftwareVersion: TlvOptionalField(6, TlvUInt32),

    /**
     * The ReleaseNotesUrl field, if present, SHOULD specify a link to a product specific web page that
     * contains release notes for the OTA software update file. The specified URL SHOULD resolve to a
     * maintained web page available at that URL for the lifetime of the software version’s availability.
     * The syntax of this field SHALL follow the syntax as specified in RFC 1738 and SHALL use the https
     * scheme. The maximum length of this field is 256 ASCII characters.
     */
    releaseNotesUrl: TlvOptionalField(7, TlvString.bound({ minLength: 1, maxLength: 256 })),

    /**
     * The ImageDigestTypeField SHALL contain the algorithm used to compute the ImageDigest field.
     * The value of this field SHALL be a supported numerical identifier value from the IANA Named
     * Information Hash Algorithm Registry [https://www.iana.org/assignments/named-information/named-information.xhtml#hash-alg]
     * established as part of RFC 6920. For example, a value of 1 would match the sha-
     * 256 identifier, which maps to the SHA-256 digest algorithm per Section 6.2 of FIPS 180-4
     * It is RECOMMENDED that a digest algorithm be chosen that has a minimum digest length of 256
     * bits, such as sha-256 (ID 1 in the registry).
     */
    imageDigestType: TlvField(8, TlvUInt8),

    /**
     * The ImageDigestField SHALL contain the digest of the entire payload of length PayloadSize that follows
     * the header. The digest SHALL be computed using the algorithm indicated in the ImageDigestType
     * field. This digest SHOULD be used by OTA Providers to ensure they have obtained the entire image expected,
     * and that the contents matches the expectations.
     *
     * Maximum length is 128 hex characters to support SHA-512 (64 bytes = 128 hex chars).
     */
    imageDigest: TlvField(9, TlvByteString.bound({ maxLength: 64 })),
});

export interface OtaImageHeader extends TypeFromSchema<typeof TlvOtaImageHeader> {}
