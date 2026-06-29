/**
 * @license
 * Copyright 2025-2026 Open Home Foundation
 * SPDX-License-Identifier: Apache-2.0
 */

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
    export function decode(value: Uint8Array): SecurityPolicy {
        if (value.length !== 4) {
            throw new Error(`Security policy must be 4 bytes, got ${value.length}`);
        }
        return {
            rotationTime: (value[0] << 8) | value[1],
            flags: (value[2] << 8) | value[3],
        };
    }

    export function encode(policy: SecurityPolicy): Uint8Array {
        if (policy.rotationTime < 0 || policy.rotationTime > 0xffff) {
            throw new Error(`Security policy rotationTime out of range: ${policy.rotationTime}`);
        }
        if (policy.flags < 0 || policy.flags > 0xffff) {
            throw new Error(`Security policy flags out of range: ${policy.flags}`);
        }
        return new Uint8Array([
            (policy.rotationTime >> 8) & 0xff,
            policy.rotationTime & 0xff,
            (policy.flags >> 8) & 0xff,
            policy.flags & 0xff,
        ]);
    }
}
