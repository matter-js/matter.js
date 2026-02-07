/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { ContextTagged, DerObject } from "#codec/DerCodec.js";

/**
 * Crypto semantics from RFC 2315.
 */
export namespace Pkcs7 {
    export const Data = (data: any) => DerObject("2A864886F70D010701", { value: ContextTagged(0, data) });
    export const SignedData = (data: any) => DerObject("2a864886f70d010702", { value: ContextTagged(0, data) });
}
