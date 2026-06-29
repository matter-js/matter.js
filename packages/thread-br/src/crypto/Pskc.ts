/**
 * @license
 * Copyright 2025-2026 Open Home Foundation
 * SPDX-License-Identifier: Apache-2.0
 */

import { pbkdf2AesCmac } from "./Pbkdf2AesCmac.js";

const SALT_PREFIX = new TextEncoder().encode("Thread");
const EXT_PAN_ID_LENGTH = 8;
const NETWORK_NAME_MAX_BYTES = 16;
const PASSPHRASE_MIN_BYTES = 6;
const PASSPHRASE_MAX_BYTES = 255;
// Thread spec §8.4 / openthread `meshcop.cpp::GeneratePskc`: 16384 PBKDF2 iterations.
const ITERATIONS = 16384;
const PSKC_LENGTH = 16;

/**
 * Thread MeshCoP PSKc derivation.
 *
 * Mirrors `openthread/src/core/meshcop/meshcop.cpp::GeneratePskc`. The salt
 * concatenation order is `"Thread" || extPanId || networkName` — confirmed
 * against the openthread main branch (the alternative `extPanId || "Thread"
 * || networkName` ordering is wrong).
 */
export namespace Pskc {
    export function derive(args: { passphrase: string; extPanId: Uint8Array; networkName: string }): Uint8Array {
        const password = new TextEncoder().encode(args.passphrase);
        if (password.length < PASSPHRASE_MIN_BYTES || password.length > PASSPHRASE_MAX_BYTES) {
            throw new Error(
                `passphrase UTF-8 length must be ${PASSPHRASE_MIN_BYTES}..${PASSPHRASE_MAX_BYTES} bytes, got ${password.length}`,
            );
        }
        if (args.extPanId.length !== EXT_PAN_ID_LENGTH) {
            throw new Error(`extPanId must be ${EXT_PAN_ID_LENGTH} bytes, got ${args.extPanId.length}`);
        }
        const networkNameBytes = new TextEncoder().encode(args.networkName);
        if (networkNameBytes.length === 0 || networkNameBytes.length > NETWORK_NAME_MAX_BYTES) {
            throw new Error(
                `networkName UTF-8 length must be 1..${NETWORK_NAME_MAX_BYTES} bytes, got ${networkNameBytes.length}`,
            );
        }

        const salt = new Uint8Array(SALT_PREFIX.length + EXT_PAN_ID_LENGTH + networkNameBytes.length);
        salt.set(SALT_PREFIX, 0);
        salt.set(args.extPanId, SALT_PREFIX.length);
        salt.set(networkNameBytes, SALT_PREFIX.length + EXT_PAN_ID_LENGTH);

        return pbkdf2AesCmac({
            password,
            salt,
            iterations: ITERATIONS,
            dkLen: PSKC_LENGTH,
        });
    }
}
