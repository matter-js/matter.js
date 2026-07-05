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

const RLOC16_MAX = 0xffff;
const RLOC16_STRING = /^(?:0x[0-9a-fA-F]{1,4}|[0-9]{1,5})$/;

/**
 * Parse a 16-bit RLOC, accepting either a JSON number (legacy builds) or a hex
 * string like `"0x4800"` (post-2024 builds). Returns `undefined` for absent,
 * malformed, or out-of-16-bit-range input — callers decide whether that is an
 * error (`/node`) or a skippable field (`/diagnostics`).
 */
export function parseRloc16(value: unknown): number | undefined {
    const parsed =
        typeof value === "number"
            ? value
            : typeof value === "string" && RLOC16_STRING.test(value)
              ? Number(value)
              : NaN;
    return Number.isInteger(parsed) && parsed >= 0 && parsed <= RLOC16_MAX ? parsed : undefined;
}
