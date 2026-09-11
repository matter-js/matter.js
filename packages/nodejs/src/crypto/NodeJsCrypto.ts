/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import {
    asError,
    CRYPTO_AEAD_NONCE_LENGTH_BYTES,
    CRYPTO_AUTH_TAG_LENGTH,
    CRYPTO_ENCRYPT_ALGORITHM,
    CRYPTO_HASH_ALGORITHM,
    CRYPTO_SYMMETRIC_KEY_LENGTH,
    NodeJsStyleCrypto,
    type NodeJsCryptoApiLike,
} from "@matter/general";
import * as crypto from "node:crypto";

/**
 * Report the first primitive a Node.js-style crypto API cannot offer Matter, or undefined if it offers both of the
 * primitives probed here: the SHA-256 digest and the "aes-128-ccm" cipher Matter encrypts every message with.
 *
 * This is not a conformance test.  It covers the two gaps that stop a runtime dead — Bun and Deno offer no
 * "aes-128-ccm" — and leaves any other divergence to surface where it occurs.  Probing beats identifying individual
 * runtimes because an emulation that gains a primitive then needs no change here.
 */
export function nodeCryptoDefect(api: NodeJsCryptoApiLike): string | undefined {
    try {
        api.createHash(CRYPTO_HASH_ALGORITHM).digest();
    } catch (error) {
        return `no ${CRYPTO_HASH_ALGORITHM} digest: ${asError(error).message}`;
    }

    try {
        api.createCipheriv(
            CRYPTO_ENCRYPT_ALGORITHM,
            new Uint8Array(CRYPTO_SYMMETRIC_KEY_LENGTH),
            new Uint8Array(CRYPTO_AEAD_NONCE_LENGTH_BYTES),
            { authTagLength: CRYPTO_AUTH_TAG_LENGTH },
        );
    } catch (error) {
        return `no ${CRYPTO_ENCRYPT_ALGORITHM} cipher: ${asError(error).message}`;
    }

    return undefined;
}

let defect: string | undefined;
let probed = false;

/**
 * Node.js-based crypto implementation.
 */
export class NodeJsCrypto extends NodeJsStyleCrypto {
    /**
     * What Node.js's crypto module lacks in the current runtime, per {@link nodeCryptoDefect}, or undefined where it
     * offers the primitives that function probes.
     */
    static get defect() {
        if (!probed) {
            defect = nodeCryptoDefect(crypto);
            probed = true;
        }
        return defect;
    }

    constructor() {
        super(crypto);
    }
}
