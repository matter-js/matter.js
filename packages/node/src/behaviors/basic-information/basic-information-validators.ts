/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { Logger } from "@matter/general";

export const CHIP_DUMMY_MANUFACTURE_DATE = "20200101";

export interface BasicInfoValidationState {
    uniqueId?: string;
    serialNumber?: string;
    vendorName?: string;
    productLabel?: string;
    manufacturingDate?: string;
}

/**
 * Validates common BasicInformation attributes and logs warnings for known problematic values.
 * {@code vendorName} may be undefined (optional on bridged devices); related checks are skipped when absent.
 */
export function validateBasicInfoAttributes(state: BasicInfoValidationState, log: Logger) {
    const { uniqueId, serialNumber, vendorName, productLabel, manufacturingDate } = state;

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
