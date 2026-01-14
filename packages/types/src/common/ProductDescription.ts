/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { VendorId } from "../datatype/VendorId.js";

export interface ProductDescription {
    /**
     * The device name for commissioning announcements.
     */
    readonly name: string;

    /**
     * The device type for commissioning announcements.
     */
    readonly deviceType: number;

    /**
     * The vendor ID for commissioning announcements.
     */
    readonly vendorId: VendorId;

    /**
     * The product ID for commissioning announcements.
     */
    readonly productId: number;
}
