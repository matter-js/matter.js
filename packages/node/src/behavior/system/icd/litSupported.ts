/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { BasicInformationClient } from "#behaviors/basic-information";
import { IcdManagementClient } from "#behaviors/icd-management";
import type { Endpoint } from "#endpoint/Endpoint.js";

/** Minimum device Matter specification version (BasicInformation, encoded 0xMMmmpprr) for trustworthy LIT behavior. */
export const MIN_LIT_SPECIFICATION_VERSION = 0x01040000; // 1.4.0

/**
 * Whether a peer is LIT-capable: advertises LongIdleTimeSupport AND reports Matter specification version >= 1.4.0.
 * Devices below 1.4.0 (or not reporting a version) are treated as non-LIT regardless of the feature flag.
 */
export function litSupported(endpoint: Endpoint): boolean {
    if (endpoint.maybeFeaturesOf(IcdManagementClient)?.longIdleTimeSupport !== true) {
        return false;
    }
    return (endpoint.maybeStateOf(BasicInformationClient)?.specificationVersion ?? 0) >= MIN_LIT_SPECIFICATION_VERSION;
}
