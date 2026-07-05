/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { Bytes, InternalError } from "@matter/general";
import { ThreadDiagError } from "../../diagnostic/errors.js";

/**
 * Decoded Timeout TLV (Network Diagnostic TLV type 3).
 *
 * Big-endian uint32 — maximum polling time period (seconds) for SEDs.
 * Source: OpenThread `network_diagnostic_tlvs.hpp` `TimeoutTlv` and
 * `network_diagnostic.cpp` parser.
 */
export namespace Timeout {
    export function decode(value: Bytes): number {
        const buf = Bytes.of(value);
        if (buf.length !== 4) {
            throw new ThreadDiagError(`Timeout TLV must be 4 bytes, got ${buf.length}`);
        }
        return ((buf[0] << 24) | (buf[1] << 16) | (buf[2] << 8) | buf[3]) >>> 0;
    }

    export function encode(seconds: number): Bytes {
        if (!Number.isInteger(seconds) || seconds < 0 || seconds > 0xffffffff) {
            throw new InternalError(`Timeout TLV out of range: ${seconds}`);
        }
        return new Uint8Array([
            (seconds >>> 24) & 0xff,
            (seconds >>> 16) & 0xff,
            (seconds >>> 8) & 0xff,
            seconds & 0xff,
        ]);
    }
}
