/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { DerObject } from "#codec/DerCodec.js";

/**
 * Secure Hash Standard (FIPS 180-4) semantics.
 */
export namespace Shs {
    export const SHA256_CMS = DerObject("608648016503040201"); // 2.16.840.1.101.3.4.2.1
}
