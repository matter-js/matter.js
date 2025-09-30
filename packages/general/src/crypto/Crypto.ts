/**
 * @license
 * Copyright 2022-2025 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import type { Environment } from "#environment/Environment.js";
import { Diagnostic } from "#log/Diagnostic.js";
import { Logger } from "#log/Logger.js";
import { Bytes } from "#util/Bytes.js";
import { MaybePromise } from "#util/Promises.js";
import * as mod from "@noble/curves/abstract/modular.js";
import { p256 } from "@noble/curves/nist.js";
import * as utils from "@noble/curves/utils.js";
import { PrivateKey, PublicKey } from "./Key.js";

export const ec = {
    p256,
    ...utils,
    ...mod,
};

export const CRYPTO_ENCRYPT_ALGORITHM = "aes-128-ccm";
export const CRYPTO_HASH_ALGORITHM = "sha256";
export const CRYPTO_EC_CURVE = "prime256v1";
export const CRYPTO_EC_KEY_BYTES = 32;
export const CRYPTO_AUTH_TAG_LENGTH = 16;
export const CRYPTO_SYMMETRIC_KEY_LENGTH = 16;
export type CryptoDsaEncoding = "ieee-p1363" | "der";

const logger = Logger.get("Crypto");

/**
 * These are the cryptographic primitives required to implement the Matter protocol.
 *
 * We provide a platform-independent implementation that uses Web Crypto via {@link crypto.subtle} and a JS-based
 * AES-CCM implementation.
 *
 * If your platform does not fully implement Web Crypto, or offers a native implementation of AES-CCM, you can replace
 * the implementation in {@link Environment.default}.
 *
 * WARNING: The standard implementation is unaudited.  See relevant warnings in StandardCrypto.ts.
 */
export abstract class Crypto {
    /**
     * The name used in log messages.
     */
    abstract implementationName: string;

    /**
     * Encrypt using AES-CCM with constants limited to those required by Matter.
     */
    abstract encrypt(key: Bytes, data: Bytes, nonce: Bytes, aad?: Bytes): Bytes;

    /**
     * Decrypt using AES-CCM with constants limited to those required by Matter.
     */
    abstract decrypt(key: Bytes, data: Bytes, nonce: Bytes, aad?: Bytes): Bytes;

    /**
     * Create a random buffer from the most cryptographically-appropriate source available.
     */
    abstract randomBytes(length: number): Bytes;

    /**
     * Compute the SHA-256 hash of a buffer.
     */
    abstract computeSha256(
        data: Bytes | Bytes[] | ReadableStreamDefaultReader<Bytes> | AsyncIterator<Bytes>,
    ): MaybePromise<Bytes>;

    /**
     * Create a key from a secret using PBKDF2.
     */
    abstract createPbkdf2Key(secret: Bytes, salt: Bytes, iteration: number, keyLength: number): MaybePromise<Bytes>;

    /**
     * Create a key from a secret using HKDF.
     */
    abstract createHkdfKey(secret: Bytes, salt: Bytes, info: Bytes, length?: number): MaybePromise<Bytes>;

    /**
     * Create an HMAC signature.
     */
    abstract signHmac(key: Bytes, data: Bytes): MaybePromise<Bytes>;

    /**
     * Create an ECDSA signature.
     */
    abstract signEcdsa(
        privateKey: JsonWebKey,
        data: Bytes | Bytes[],
        dsaEncoding?: CryptoDsaEncoding,
    ): MaybePromise<Bytes>;

    /**
     * Authenticate an ECDSA signature.
     */
    abstract verifyEcdsa(
        publicKey: JsonWebKey,
        data: Bytes,
        signature: Bytes,
        dsaEncoding?: CryptoDsaEncoding,
    ): MaybePromise<void>;

    /**
     * Create a general-purpose EC key.
     */
    abstract createKeyPair(): MaybePromise<PrivateKey>;

    /**
     * Compute the shared secret for a Diffie-Hellman exchange.
     */
    abstract generateDhSecret(key: PrivateKey, peerKey: PublicKey): MaybePromise<Bytes>;

    get randomUint8() {
        return Bytes.of(this.randomBytes(1))[0];
    }

    get randomUint16() {
        return Bytes.dataViewOf(this.randomBytes(2)).getUint16(0);
    }

    get randomUint32() {
        return Bytes.dataViewOf(this.randomBytes(4)).getUint32(0);
    }

    get randomBigUint64() {
        return Bytes.dataViewOf(this.randomBytes(8)).getBigUint64(0);
    }

    randomBigInt(size: number, maxValue?: bigint) {
        if (maxValue === undefined) {
            return Bytes.asBigInt(this.randomBytes(size));
        }

        while (true) {
            const random = Bytes.asBigInt(this.randomBytes(size));
            if (random < maxValue) return random;
        }
    }

    reportUsage(component?: string) {
        const message = ["Using", Diagnostic.strong(this.implementationName), "crypto implementation"];
        if (component) {
            message.push("for", component);
        }
        logger.debug(...message);
    }
}
