/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { VendorId } from "../datatype/VendorId.js";

/**
 * Vendor Schema
 * @see {@link MatterSpecification.v141.Core} § 11.23.3.
 * DCL Endpoint: /dcl/vendorinfo/vendors or /dcl/vendorinfo/vendors/{vendorID}
 */
export interface VendorDclSchema {
    /**
     * This field SHALL uniquely identify this Vendor Schema entry and it SHALL match the Vendor’s
     * assigned Vendor ID.
     */
    vendorID: VendorId;

    /**
     * This field SHALL provide a human readable (displayable) name for the product manufacturer associated
     * with this record. Maximum length is 128 characters.
     */
    vendorName: string;

    /**
     * The CompanyLegalName field SHALL specify the legal name for the product manufacturer.
     * Maximum length is 256 characters.
     */
    companyLegalName: string;

    /**
     * The CompanyPreferredName field, if provided, SHALL specify the Preferred Name that MAY be
     * used for display purposes instead of the CompanyLegalName. Maximum length is 256 characters.
     */
    companyPreferredName?: string;

    /**
     * The VendorLandingPageUrl field (when provided) SHALL contain a link to a maintained web page
     * containing more information about the device manufacturer, such as contact information, address,
     * etc. During the lifetime of the products of this manufacturer, the specified URL SHOULD resolve to a
     * maintained web page. The syntax of this field SHALL follow the syntax as specified in RFC 1738 and
     * SHALL use the https scheme. The maximum length of this field is 256 ASCII characters.
     */
    vendorLandingPageUrl?: string;

    /**
     * The SchemaVersion field value history for this schema is provided below:
     * * 0: Initial Release
     */
    schemaVersion: number;
}
