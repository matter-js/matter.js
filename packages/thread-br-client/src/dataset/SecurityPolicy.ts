/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { Bytes, ImplementationError } from "@matter/general";
import { ThreadDatasetError } from "./errors.js";

/**
 * MeshCoP Security Policy TLV (type 12) is a fixed 4-byte payload: 2-byte
 * big-endian rotation time (hours) followed by 2 bytes of policy flags.
 *
 * Flag bits track the version-dependent layout in Thread spec §8.10.1.15;
 * we expose the raw 16-bit value so callers can interpret bits as needed
 * without locking the codec to a particular Thread revision.
 */
export interface SecurityPolicy {
    rotationTime: number;
    flags: number;
}

export namespace SecurityPolicy {
    export function decode(value: Bytes): SecurityPolicy {
        const buf = Bytes.of(value);
        if (buf.length !== 4) {
            throw new ThreadDatasetError(`Security policy must be 4 bytes, got ${buf.length}`);
        }
        return {
            rotationTime: (buf[0] << 8) | buf[1],
            flags: (buf[2] << 8) | buf[3],
        };
    }

    export function encode(policy: SecurityPolicy): Bytes {
        if (policy.rotationTime < 0 || policy.rotationTime > 0xffff) {
            throw new ImplementationError(`Security policy rotationTime out of range: ${policy.rotationTime}`);
        }
        if (policy.flags < 0 || policy.flags > 0xffff) {
            throw new ImplementationError(`Security policy flags out of range: ${policy.flags}`);
        }
        return new Uint8Array([
            (policy.rotationTime >> 8) & 0xff,
            policy.rotationTime & 0xff,
            (policy.flags >> 8) & 0xff,
            policy.flags & 0xff,
        ]);
    }
}
