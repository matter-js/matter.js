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
import { ml_dsa44, ml_dsa65 } from "@noble/post-quantum/ml-dsa.js";
import { Entropy } from "../util/Entropy.js";
import { cmac } from "./aes/Cmac.js";
import { CryptoVerifyError, KeyInputError } from "./CryptoError.js";
import { EcdsaSignature } from "./EcdsaSignature.js";
import type { PrivateKey, PublicKey } from "./Key.js";
import { MlDsa } from "./MlDsa.js";

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
 * algorithms the Matter crypto primitives can compute.
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

const nobleMlDsa = {
    "ML-DSA-44": ml_dsa44,
    "ML-DSA-65": ml_dsa65,
} satisfies Record<MlDsa.ParameterSet, unknown>;

const portableMlDsa: MlDsa.Implementation = {
    publicKeyOf(parameterSet, seed) {
        return nobleMlDsa[parameterSet].keygen(Bytes.of(seed)).publicKey;
    },

    sign({ parameterSet, seed }, message, entropy) {
        const dsa = nobleMlDsa[parameterSet];
        return dsa.sign(Bytes.of(message), dsa.keygen(Bytes.of(seed)).secretKey, { extraEntropy: Bytes.of(entropy) });
    },

    verify(parameterSet, publicKey, message, signature) {
        return nobleMlDsa[parameterSet].verify(Bytes.of(signature), Bytes.of(message), Bytes.of(publicKey));
    },
};

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
     * Encrypt using AES-CCM. `tagLength` defaults to 16 (Matter AEAD); pass 8 for CCM-8.
     */
    abstract encrypt(key: Bytes, data: Bytes, nonce: Bytes, aad?: Bytes, tagLength?: number): Bytes;

    /**
     * Decrypt using AES-CCM. `tagLength` defaults to 16; pass 8 for CCM-8.
     */
    abstract decrypt(key: Bytes, data: Bytes, nonce: Bytes, aad?: Bytes, tagLength?: number): Bytes;

    /**
     * Compute an AES-CMAC (RFC 4493) tag.  Synchronous: the default pure-JS implementation drives
     * iteration-heavy KDFs (e.g. Thread PSKc PBKDF2) that cannot tolerate per-block awaits.
     */
    cmac(key: Bytes, data: Bytes): Bytes {
        return cmac(Bytes.of(key), Bytes.of(data));
    }

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
     * @see {@link MatterSpecification.v16.Core} §3.8
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
     * Create an ML-DSA key pair (FIPS 204 §5.1, Matter Core §10.12.1).
     *
     * The seed comes from {@link randomBytes}, so a deterministic entropy source yields deterministic keys.
     *
     * @throws CryptoError if this backend cannot create ML-DSA keys
     * @see {@link https://csrc.nist.gov/pubs/fips/204/final FIPS 204}
     */
    createMlDsaKeyPair(parameterSet: MlDsa.ParameterSet): MaybePromise<MlDsa.PrivateKey> {
        const seed = Bytes.of(this.randomBytes(MlDsa.SEED_LENGTH));
        const publicKey = this.mlDsaOperation(parameterSet, "publicKeyOf")(parameterSet, seed);
        return { parameterSet, seed, publicKey };
    }

    /**
     * Create a hedged ML-DSA signature with an empty context (FIPS 204 §5.2, Matter Core §10.12.2).
     *
     * The portable implementation hedges with {@link randomBytes}; a native one uses the runtime's own entropy, so
     * only the former signs reproducibly under a deterministic entropy source.
     *
     * @throws KeyInputError if the private key is malformed or its public key does not belong to its seed
     * @throws CryptoError if this backend cannot offer ML-DSA
     * @see {@link https://csrc.nist.gov/pubs/fips/204/final FIPS 204}
     */
    signMlDsa(privateKey: MlDsa.PrivateKey, data: Bytes | Bytes[]): MaybePromise<Bytes> {
        MlDsa.assertPrivateKey(privateKey);
        const { parameterSet, publicKey } = privateKey;
        const sign = this.mlDsaOperation(parameterSet, "sign");
        const verify = this.mlDsaOperation(parameterSet, "verify");
        const message = Bytes.of(Array.isArray(data) ? Bytes.concat(...data) : data);

        let signature: Bytes;
        let valid: boolean;
        try {
            signature = sign(privateKey, message, this.randomBytes(32));

            // Native signing ignores the public key, so only this check catches one that does not belong to the seed
            valid = verify(parameterSet, publicKey, message, signature);
        } catch (cause) {
            throw new KeyInputError(`Cannot sign with this ${parameterSet} private key`, { cause });
        }

        if (!valid) {
            throw new KeyInputError(`${parameterSet} public key does not belong to the private key seed`);
        }

        return signature;
    }

    /**
     * Authenticate an ML-DSA signature with an empty context (FIPS 204 §5.3, Matter Core §10.12.3).
     *
     * @param publicKey the raw public key, as carried in the SubjectPublicKeyInfo BIT STRING
     * @throws KeyInputError if the public key has the wrong length
     * @throws CryptoVerifyError if the signature does not verify; {@link SignatureEncodingError} if its length is wrong
     * @throws CryptoError if this backend cannot offer ML-DSA
     * @see {@link https://csrc.nist.gov/pubs/fips/204/final FIPS 204}
     */
    verifyMlDsa(parameterSet: MlDsa.ParameterSet, publicKey: Bytes, data: Bytes, signature: Bytes): MaybePromise<void> {
        MlDsa.assertPublicKey(parameterSet, publicKey);
        MlDsa.assertSignature(parameterSet, signature);

        const verify = this.mlDsaOperation(parameterSet, "verify");
        let valid: boolean;
        try {
            valid = verify(parameterSet, publicKey, data, signature);
        } catch (cause) {
            throw new CryptoVerifyError(`${parameterSet} signature verification failed`, { cause });
        }

        if (!valid) {
            throw new CryptoVerifyError(`${parameterSet} signature verification failed`);
        }
    }

    /**
     * One operation of the ML-DSA primitive behind {@link createMlDsaKeyPair}, {@link signMlDsa} and
     * {@link verifyMlDsa}.
     *
     * Defaults to the portable `@noble/post-quantum` implementation.  A backend overrides this per operation, because a
     * runtime may offer native verification without native signing.  Throw here, not from the returned function, to
     * report that the backend cannot offer the operation at all.
     */
    protected mlDsaOperation<O extends keyof MlDsa.Implementation>(
        _parameterSet: MlDsa.ParameterSet,
        operation: O,
    ): MlDsa.Implementation[O] {
        return portableMlDsa[operation];
    }

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
