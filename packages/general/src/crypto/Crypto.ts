/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
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

/** Hash algorithm names supported by the Matter crypto primitives. */
export type HashAlgorithm = "SHA-1" | "SHA-256" | "SHA-512" | "SHA-384" | "SHA-512/224" | "SHA-512/256" | "SHA3-256";

export const HASH_ALGORITHM_OUTPUT_LENGTHS: Record<HashAlgorithm, number> = {
    // SHA-1 is permitted ONLY for RFC 5280 key identifiers (SKI/AKI), never for signatures.
    "SHA-1": 20,
    "SHA-256": 32,
    "SHA-512": 64,
    "SHA-384": 48,
    "SHA-512/224": 28,
    "SHA-512/256": 32,
    "SHA3-256": 32,
};

/**
 * Identifiers from the IANA Named Information (NI) Hash Algorithm Registry (RFC 6920), used as the OTA
 * image digest type (Matter Core §11.21.2.4.9) and the DCL data digest type. Limited to the registry
 * algorithms the Matter crypto primitives can compute; SHA3-256 availability is backend-dependent (no
 * browser Web Crypto support).
 */
export enum HashAlgorithmId {
    "SHA-256" = 1,
    "SHA-384" = 7,
    "SHA-512" = 8,
    "SHA3-256" = 10,
}

/** Subset of {@link HashAlgorithm} that has an IANA NI registry identifier (see {@link HashAlgorithmId}). */
export type IdentifiedHashAlgorithm = keyof typeof HashAlgorithmId;

const HASH_ALGORITHM_BY_ID = new Map<number, IdentifiedHashAlgorithm>([
    [HashAlgorithmId["SHA-256"], "SHA-256"],
    [HashAlgorithmId["SHA-384"], "SHA-384"],
    [HashAlgorithmId["SHA-512"], "SHA-512"],
    [HashAlgorithmId["SHA3-256"], "SHA3-256"],
]);

/** Resolves an IANA NI registry identifier to its {@link IdentifiedHashAlgorithm} name, or undefined if unsupported. */
export function hashAlgorithmForId(id: number): IdentifiedHashAlgorithm | undefined {
    return HASH_ALGORITHM_BY_ID.get(id);
}

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
     * Compute a cryptographic hash using the specified algorithm. If no algorithm is specified, SHA-256 is used.
     */
    abstract computeHash(
        data: Bytes | Bytes[] | ReadableStreamDefaultReader<Bytes> | AsyncIterator<Bytes>,
        algorithm?: HashAlgorithm,
    ): MaybePromise<Bytes>;

    /**
     * Create a key from a secret using PBKDF2.
     */
    abstract createPbkdf2Key(secret: Bytes, salt: Bytes, iteration: number, keyLength: number): MaybePromise<Bytes>;

    /**
     * Create a key from a secret using HKDF. The length parameter defines the length in bytes.
     *
     * @see {@link MatterSpecification.v151.Core} §3.8
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

    /**
     * Multiply an EC point by a scalar on the P-256 curve.
     *
     * @param point - 65-byte uncompressed EC point (04 || x || y)
     * @param scalar - 32-byte big-endian scalar
     * @returns 65-byte uncompressed EC point
     */
    abstract ecMultiply(point: Bytes, scalar: Bytes): Bytes;

    /**
     * Add two EC points on the P-256 curve.
     *
     * @param a - 65-byte uncompressed EC point (04 || x || y)
     * @param b - 65-byte uncompressed EC point (04 || x || y)
     * @returns 65-byte uncompressed EC point
     */
    ecAdd(a: Bytes, b: Bytes): Bytes {
        return ec.p256.Point.fromBytes(Bytes.of(a))
            .add(ec.p256.Point.fromBytes(Bytes.of(b)))
            .toBytes(false);
    }

    /**
     * Negate an EC point on the P-256 curve.
     *
     * @param point - 65-byte uncompressed EC point (04 || x || y)
     * @returns 65-byte uncompressed EC point
     */
    ecNegate(point: Bytes): Bytes {
        return ec.p256.Point.fromBytes(Bytes.of(point)).negate().toBytes(false);
    }

    reportUsage(component?: string) {
        const message = ["Using", Diagnostic.strong(this.implementationName), "crypto implementation"];
        if (component) {
            message.push("for", component);
        }
        logger.debug(...message);
    }
}
