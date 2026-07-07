/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { ImplementationError, Logger } from "@matter/general";

export const CHIP_DUMMY_MANUFACTURE_DATE = "20200101";

export interface BasicInfoValidationState {
    uniqueId?: string;
    serialNumber?: string;
    vendorName?: string;
    productLabel?: string;
    manufacturingDate?: string;
    vendorId?: number;
    productId?: number;
}

/**
 * Validates common BasicInformation attributes and logs warnings for known problematic values.
 * `vendorName` may be undefined (optional on bridged devices); related checks are skipped when absent.
 *
 * VendorID/ProductID identity is rejected hard: `0x0000` is reserved as the VID/PID suppression sentinel in
 * discovery adverts (§5.4.2.5.6), which only holds because a real device identity is never `0` — VID `0x0000`
 * is the "Matter Standard" namespace (§2.5.2) and PID `0x0000` SHALL NOT be assigned to a product (§2.5.3).
 */
export function validateBasicInfoAttributes(state: BasicInfoValidationState, log: Logger) {
    const { uniqueId, serialNumber, vendorName, productLabel, manufacturingDate, vendorId, productId } = state;

    if (vendorId !== undefined && (vendorId === 0 || vendorId > 0xfff4)) {
        throw new ImplementationError(
            `VendorID 0x${vendorId.toString(16).padStart(4, "0")} is not a valid device identity; it must be in 0x0001-0xFFF4`,
        );
    }

    if (productId === 0) {
        throw new ImplementationError("ProductID 0x0000 is reserved and may not be assigned to a product");
    }

    if (uniqueId !== undefined && serialNumber !== undefined && uniqueId === serialNumber) {
        log.warn("uniqueId and serialNumber shall not be the same");
    }

    if (vendorName !== undefined) {
        if (vendorName.trim().length === 0) {
            log.warn("vendorName shall not be empty");
        } else if (productLabel !== undefined && productLabel.includes(vendorName)) {
            log.warn("productLabel should not include vendorName");
        }
    }

    if (manufacturingDate === CHIP_DUMMY_MANUFACTURE_DATE) {
        log.warn(`manufacturingDate "${CHIP_DUMMY_MANUFACTURE_DATE}" looks like a placeholder/example value`);
    }
}
