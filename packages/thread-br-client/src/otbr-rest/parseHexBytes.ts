/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { Bytes } from "@matter/general";
import { OtbrRestError } from "./OtbrRestError.js";

/**
 * Decode a hex string into {@link Bytes}, rejecting non-hex characters, odd
 * length, and (if `expectedLen` is given) a wrong byte count.
 *
 * `Bytes.fromHex` does not itself reject non-hex characters, so this
 * validation is load-bearing.
 */
export function parseHexBytes(hex: string, where: string, expectedLen?: number): Bytes {
    if (!/^[0-9a-fA-F]*$/.test(hex)) {
        throw new OtbrRestError("rest_protocol", `${where}: not hex`);
    }
    if (hex.length % 2 !== 0) {
        throw new OtbrRestError("rest_protocol", `${where}: odd hex length`);
    }
    if (expectedLen !== undefined && hex.length !== expectedLen * 2) {
        throw new OtbrRestError("rest_protocol", `${where}: expected ${expectedLen} bytes, got ${hex.length / 2}`);
    }
    return Bytes.fromHex(hex);
}
