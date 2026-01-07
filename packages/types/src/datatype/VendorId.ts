/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { Branded } from "#general";
import { ValidationOutOfBoundsError } from "../common/ValidationError.js";
import { TlvUInt16 } from "../tlv/TlvNumber.js";
import { TlvWrapper } from "../tlv/TlvWrapper.js";

/**
 * A Vendor Identifier (Vendor ID or VID) is a 16-bit number that uniquely identifies a particular
 * product manufacturer, vendor, or group thereof. Each Vendor ID is statically allocated by the
 * Connectivity Standards Alliance (see [CSA Manufacturer Code Database]).
 *
 * @see {@link MatterSpecification.v10.Core} § 2.5.2
 */
export type VendorId = Branded<number, "VendorId">;

export function VendorId(vendorId: number, validate = true): VendorId {
    if (!validate || (vendorId >= 0 && vendorId <= 0xfff4)) {
        return vendorId as VendorId;
    }
    throw new ValidationOutOfBoundsError(`Invalid vendor ID: ${vendorId}`);
}

export namespace VendorId {
    export const isValid = (v: number): v is VendorId => {
        try {
            VendorId(v);
            return true;
        } catch {
            return false;
        }
    };
}

/** Data model for a Vendor Identifier. */
export const TlvVendorId = new TlvWrapper<VendorId, number>(
    TlvUInt16,
    vendorId => vendorId,
    value => VendorId(value, false), // No automatic validation on decode
);
