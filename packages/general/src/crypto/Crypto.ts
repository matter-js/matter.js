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
import { Entropy } from "../util/Entropy.js";
import { EcdsaSignature } from "./EcdsaSignature.js";
import type { PrivateKey, PublicKey } from "./Key.js";

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

/**
 * Hash algorithms identified by IANA Hash Function identifiers.
 * Based on FIPS 180-4 Section 6.2 and FIPS 202.
 *
 * The enum values are the FIPS-defined algorithm IDs.
 */
export enum HashAlgorithm {
    SHA256 = 1,
    SHA512 = 7,
    SHA384 = 8,
    SHA512_224 = 10,
    SHA512_256 = 11,
    SHA3_256 = 12,
}

export const HASH_ALGORITHM_OUTPUT_LENGTHS: Record<HashAlgorithm, number> = {
    [HashAlgorithm.SHA256]: 32,
    [HashAlgorithm.SHA512]: 64,
    [HashAlgorithm.SHA384]: 48,
    [HashAlgorithm.SHA512_224]: 28,
    [HashAlgorithm.SHA512_256]: 32,
    [HashAlgorithm.SHA3_256]: 32,
};

/**
 * Human-readable names for hash algorithms.
 */
export const HASH_ALGORITHM_NAMES: Record<HashAlgorithm, string> = {
    [HashAlgorithm.SHA256]: "SHA-256",
    [HashAlgorithm.SHA512]: "SHA-512",
    [HashAlgorithm.SHA384]: "SHA-384",
    [HashAlgorithm.SHA512_224]: "SHA-512/224",
    [HashAlgorithm.SHA512_256]: "SHA-512/256",
    [HashAlgorithm.SHA3_256]: "SHA3-256",
};

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
export abstract class Crypto extends Entropy {
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
     * Compute a cryptographic hash using the specified algorithm.
     */
    abstract computeHash(
        algorithm: HashAlgorithm,
        data: Bytes | Bytes[] | ReadableStreamDefaultReader<Bytes> | AsyncIterator<Bytes>,
    ): MaybePromise<Bytes>;

    /**
     * Compute the SHA-256 hash of a buffer, stream or async iterator.
     * Convenience method that calls computeHash(HashAlgorithm.SHA256, data), but commonly used in Matter.
     */
    computeSha256(
        data: Bytes | Bytes[] | ReadableStreamDefaultReader<Bytes> | AsyncIterator<Bytes>,
    ): MaybePromise<Bytes> {
        return this.computeHash(HashAlgorithm.SHA256, data);
    }

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
    abstract signEcdsa(privateKey: JsonWebKey, data: Bytes | Bytes[]): MaybePromise<EcdsaSignature>;

    /**
     * Authenticate an ECDSA signature.
     */
    abstract verifyEcdsa(publicKey: JsonWebKey, data: Bytes, signature: EcdsaSignature): MaybePromise<void>;

    /**
     * Create a general-purpose EC key.
     */
    abstract createKeyPair(): MaybePromise<PrivateKey>;

    /**
     * Compute the shared secret for a Diffie-Hellman exchange.
     */
    abstract generateDhSecret(key: PrivateKey, peerKey: PublicKey): MaybePromise<Bytes>;

    reportUsage(component?: string) {
        const message = ["Using", Diagnostic.strong(this.implementationName), "crypto implementation"];
        if (component) {
            message.push("for", component);
        }
        logger.debug(...message);
    }
}
