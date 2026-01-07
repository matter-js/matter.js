/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { ValidationOutOfBoundsError } from "../common/ValidationError.js";
import { VendorId } from "./VendorId.js";

export namespace Mei {
    /** Create a Manufacturer Extensible Identifier (MEI) from a vendor prefix and type suffix. */
    export const asMei = (vendorPrefix: VendorId, typeSuffix: number) => {
        if (vendorPrefix < 0 || vendorPrefix > 0xfff4) {
            throw new ValidationOutOfBoundsError(`Invalid vendor prefix for MEI: ${vendorPrefix}`);
        }
        if (typeSuffix < 0 || typeSuffix > 0xfffe) {
            throw new ValidationOutOfBoundsError(`Invalid type suffix for MEI: ${typeSuffix}`);
        }

        return ((vendorPrefix << 16) + typeSuffix) >>> 0;
    };

    /** Extract the vendor prefix and type suffix from a Manufacturer Extensible Identifier (MEI). */
    export const fromMei = (mei: number): { vendorPrefix: VendorId; typeSuffix: number } => {
        const vendorPrefix = mei >>> 16;
        if (vendorPrefix > 0xfff4) {
            throw new ValidationOutOfBoundsError(`Invalid vendor prefix for MEI: ${mei}`);
        }

        const typeSuffix = mei & 0xffff;
        if (typeSuffix > 0xfffe) {
            throw new ValidationOutOfBoundsError(`Invalid type suffix for MEI: ${mei}`);
        }

        return {
            vendorPrefix: VendorId(vendorPrefix),
            typeSuffix: mei & 0xffff,
        };
    };

    /**
     * Check if the MEI has a custom vendor prefix.
     *
     * @param mei The MEI to check.
     * @param vendorPrefix An optional vendor prefix to check against. if not provided, checks if the prefix is not equal 0
     */
    export const hasCustomMeiPrefix = (mei: number, vendorPrefix?: VendorId) => {
        if (vendorPrefix === undefined) {
            return mei > 0xfffe;
        }
        return mei >>> 16 === vendorPrefix;
    };
}
