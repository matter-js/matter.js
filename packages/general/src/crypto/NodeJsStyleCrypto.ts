/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { Environment } from "#environment/Environment.js";
import { ImplementationError } from "#MatterError.js";
import { Bytes } from "#util/Bytes.js";
import { Entropy } from "#util/Entropy.js";
import { asError } from "#util/Error.js";
import { MaybePromise } from "#util/Promises.js";
import {
    Crypto,
    CRYPTO_AUTH_TAG_LENGTH,
    CRYPTO_EC_CURVE,
    CRYPTO_EC_KEY_BYTES,
    CRYPTO_ENCRYPT_ALGORITHM,
    CRYPTO_HASH_ALGORITHM,
    CRYPTO_SYMMETRIC_KEY_LENGTH,
    ec,
    HashAlgorithm,
} from "./Crypto.js";
import { CryptoDecryptError, CryptoVerifyError } from "./CryptoError.js";
import { EcdsaSignature } from "./EcdsaSignature.js";
import { PrivateKey, PublicKey } from "./Key.js";

// Ensure we don't reference global crypto accidentally
declare const crypto: never;

/**
 * A crypto API implemented in the style of Node.js.
 *
 * This defines the limited subset of the Node API that we use and nothing more.
 */
export interface NodeJsCryptoApiLike {
    createCipheriv(
        algorithm: "aes-128-ccm",
        key: NodeJsCryptoApiLike.BinaryLike,
        iv: NodeJsCryptoApiLike.BinaryLike,
        options: NodeJsCryptoApiLike.CipherCcmOptions,
    ): NodeJsCryptoApiLike.CipherCcm;

    createDecipheriv(
        algorithm: "aes-128-ccm",
        key: NodeJsCryptoApiLike.BinaryLike,
        iv: NodeJsCryptoApiLike.BinaryLike,
        options: NodeJsCryptoApiLike.CipherCcmOptions,
    ): NodeJsCryptoApiLike.DecipherCcm;

    randomBytes(count: number): NodeJsCryptoApiLike.BinaryLike;

    createECDH(crv: string): NodeJsCryptoApiLike.Ecdh;

    createHash(algo: string): NodeJsCryptoApiLike.Hash;

    pbkdf2(
        password: NodeJsCryptoApiLike.BinaryLike,
        salt: NodeJsCryptoApiLike.BinaryLike,
        iterations: number,
        keylen: number,
        digest: string,
        callback: (err: Error | null, derivedKey: NodeJsCryptoApiLike.BinaryLike) => void,
    ): void;

    hkdf(
        digest: string,
        irm: NodeJsCryptoApiLike.BinaryLike,
        salt: NodeJsCryptoApiLike.BinaryLike,
        info: NodeJsCryptoApiLike.BinaryLike,
        keylen: number,
        callback: (err: Error | null, derivedKey: ArrayBuffer) => void,
    ): void;

    createHmac(algo: string, key: NodeJsCryptoApiLike.BinaryLike): NodeJsCryptoApiLike.Hash;

    createSign(algo: string): NodeJsCryptoApiLike.Sign;

    createVerify(algo: string): NodeJsCryptoApiLike.Verify;
}

export namespace NodeJsCryptoApiLike {
    export type CipherKey = {
        key: any; // Definitely typed is wrong here, should be JsonWebKey
        format: "jwk";
        type: "pkcs8" | "spki";
        dsaEncoding: "ieee-p1363";
    };
    export type BinaryLike = Uint8Array<ArrayBufferLike>;
    export interface CipherCcmOptions {
        authTagLength: number;
    }

    export interface CipherCcm {
        update(data: BinaryLike): BinaryLike;
        final(): BinaryLike;
        setAAD(buffer: BinaryLike, options: { plaintextLength: number }): this;
        getAuthTag(): BinaryLike;
    }

    export interface DecipherCcm {
        update(data: BinaryLike): BinaryLike;
        final(): BinaryLike;
        setAAD(buffer: BinaryLike, options: { plaintextLength: number }): this;
        setAuthTag(data: BinaryLike): this;
    }

    export interface Ecdh {
        generateKeys(): BinaryLike;
        getPublicKey(): BinaryLike;
        getPrivateKey(): BinaryLike;
        setPrivateKey(key: BinaryLike): void;
        computeSecret(data: BinaryLike): BinaryLike;
    }

    export interface Hash {
        update(data: BinaryLike): this;
        digest(): BinaryLike;
    }

    export interface Sign {
        update(data: BinaryLike): this;
        sign(key: CipherKey): Uint8Array<ArrayBuffer>;
    }

    export interface Verify {
        update(data: BinaryLike): this;
        verify(key: CipherKey, signature: BinaryLike): boolean;
    }
}

/**
 * A crypto implementation that uses the Node.js crypto API.
 *
 * It is Node.js "style" because there are many packages that emulate the Node.js API.  As of now (mid-2025) these are
 * sometimes more mature than the available Web Crypto implementation.
 *
 * This module does not import the Node.js crypto implementation directly.  You must provide a crypto implementation to
 * use it.
 */
export class NodeJsStyleCrypto extends Crypto {
    implementationName = "Node.js";

    /**
     * The auto-detected Node.js crypto module, set at module load time if available.
     */
    static detectedCrypto?: NodeJsCryptoApiLike;

    #crypto: NodeJsCryptoApiLike;

    constructor(crypto?: NodeJsCryptoApiLike) {
        super();

        this.#crypto = (crypto ?? NodeJsStyleCrypto.detectedCrypto)!;
    }

    encrypt(key: Bytes, data: Bytes, nonce: Bytes, aad?: Bytes): Bytes {
        const cipher = this.#crypto.createCipheriv(CRYPTO_ENCRYPT_ALGORITHM, Bytes.of(key), Bytes.of(nonce), {
            authTagLength: CRYPTO_AUTH_TAG_LENGTH,
        });
        if (aad !== undefined) {
            cipher.setAAD(Bytes.of(aad), { plaintextLength: data.byteLength });
        }
        const encrypted = cipher.update(Bytes.of(data));
        cipher.final();
        return Bytes.concat(Bytes.of(encrypted), Bytes.of(cipher.getAuthTag()));
    }

    decrypt(key: Bytes, encrypted: Bytes, nonce: Bytes, aad?: Bytes): Bytes {
        const cipher = this.#crypto.createDecipheriv(CRYPTO_ENCRYPT_ALGORITHM, Bytes.of(key), Bytes.of(nonce), {
            authTagLength: CRYPTO_AUTH_TAG_LENGTH,
        });
        const data = Bytes.of(encrypted);
        const plaintextLength = data.length - CRYPTO_AUTH_TAG_LENGTH;
        if (aad !== undefined) {
            cipher.setAAD(Bytes.of(aad), { plaintextLength });
        }
        cipher.setAuthTag(data.slice(plaintextLength));
        const result = cipher.update(data.slice(0, plaintextLength));
        try {
            cipher.final();
        } catch (e) {
            throw new CryptoDecryptError(`${CRYPTO_ENCRYPT_ALGORITHM} decryption failed: ${asError(e).message}`);
        }
        return Bytes.of(result);
    }

    randomBytes(length: number): Bytes {
        return Bytes.of(this.#crypto.randomBytes(length));
    }

    ecdhGeneratePublicKey(): { publicKey: Bytes; ecdh: any } {
        const ecdh = this.#crypto.createECDH(CRYPTO_EC_CURVE);
        ecdh.generateKeys();
        return { publicKey: Bytes.of(ecdh.getPublicKey()), ecdh: ecdh };
    }

    ecdhGeneratePublicKeyAndSecret(peerPublicKey: Bytes): {
        publicKey: Bytes;
        sharedSecret: Bytes;
    } {
        const ecdh = this.#crypto.createECDH(CRYPTO_EC_CURVE);
        ecdh.generateKeys();
        return {
            publicKey: Bytes.of(ecdh.getPublicKey()),
            sharedSecret: Bytes.of(ecdh.computeSecret(Bytes.of(peerPublicKey))),
        };
    }

    async #hashAsyncIteratorData(hasher: NodeJsCryptoApiLike.Hash, iteratorFunc: () => Promise<IteratorResult<Bytes>>) {
        while (true) {
            const { value, done } = await iteratorFunc();
            if (value === undefined || done) break;
            hasher.update(Bytes.of(value));
        }
    }

    computeHash(
        data: Bytes | Bytes[] | ReadableStreamDefaultReader<Bytes> | AsyncIterator<Bytes>,
        algorithm: HashAlgorithm = "SHA-256",
    ): MaybePromise<Bytes> {
        const hasher = this.#crypto.createHash(algorithm);

        // Handle different data types with full streaming support
        if (Array.isArray(data)) {
            data.forEach(chunk => hasher.update(Bytes.of(chunk)));
        } else if (Bytes.isBytes(data)) {
            hasher.update(Bytes.of(data));
        } else {
            // Handle streaming data (ReadableStreamDefaultReader or AsyncIterator)
            let iteratorFunc: () => Promise<IteratorResult<Bytes>>;
            if ("read" in data && typeof data.read === "function") {
                iteratorFunc = data.read.bind(data);
            } else if ("next" in data && typeof data.next === "function") {
                iteratorFunc = data.next.bind(data);
            } else {
                throw new ImplementationError(`Invalid data type for computeHash with algorithm ${algorithm}`);
            }
            return this.#hashAsyncIteratorData(hasher, iteratorFunc).then(() => Bytes.of(hasher.digest()));
        }
        return Bytes.of(hasher.digest());
    }

    createPbkdf2Key(secret: Bytes, salt: Bytes, iteration: number, keyLength: number): Promise<Bytes> {
        return new Promise<Bytes>((resolver, rejecter) => {
            this.#crypto.pbkdf2(
                Bytes.of(secret),
                Bytes.of(salt),
                iteration,
                keyLength,
                CRYPTO_HASH_ALGORITHM,
                (error, key) => {
                    if (error !== null) rejecter(error);
                    resolver(Bytes.of(key));
                },
            );
        });
    }

    createHkdfKey(
        secret: Bytes,
        salt: Bytes,
        info: Bytes,
        length: number = CRYPTO_SYMMETRIC_KEY_LENGTH,
    ): Promise<Bytes> {
        return new Promise<Bytes>((resolver, rejecter) => {
            this.#crypto.hkdf(
                CRYPTO_HASH_ALGORITHM,
                Bytes.of(secret),
                Bytes.of(salt),
                Bytes.of(info),
                length,
                (error, key) => {
                    if (error !== null) rejecter(error);
                    resolver(Bytes.of(key));
                },
            );
        });
    }

    signHmac(key: Bytes, data: Bytes): Bytes {
        const hmac = this.#crypto.createHmac(CRYPTO_HASH_ALGORITHM, Bytes.of(key));
        hmac.update(Bytes.of(data));
        return Bytes.of(hmac.digest());
    }

    signEcdsa(privateKey: JsonWebKey, data: Bytes | Bytes[]) {
        const signer = this.#crypto.createSign(CRYPTO_HASH_ALGORITHM);
        if (Array.isArray(data)) {
            data.forEach(chunk => signer.update(Bytes.of(chunk)));
        } else {
            signer.update(Bytes.of(data));
        }
        return new EcdsaSignature(
            Bytes.of(
                signer.sign({
                    key: privateKey as any,
                    format: "jwk",
                    type: "pkcs8",
                    dsaEncoding: "ieee-p1363",
                }),
            ),
        );
    }

    verifyEcdsa(publicKey: JsonWebKey, data: Bytes, signature: EcdsaSignature) {
        const verifier = this.#crypto.createVerify(CRYPTO_HASH_ALGORITHM);
        verifier.update(Bytes.of(data));
        const success = verifier.verify(
            {
                key: publicKey as any,
                format: "jwk",
                type: "spki",
                dsaEncoding: "ieee-p1363",
            },
            Bytes.of(signature.bytes),
        );
        if (!success) throw new CryptoVerifyError("Signature verification failed");
    }

    createKeyPair() {
        // Note that we this key may be used for DH or DSA but we use an ECDH to generate
        const ecdh = this.#crypto.createECDH(CRYPTO_EC_CURVE);
        ecdh.generateKeys();

        // The key exported from Node doesn't include most-significant bytes that are 0.  This doesn't affect how we
        // currently use keys but it's a little weird so 0 pad to avoid future confusion
        const privateKey = new Uint8Array(CRYPTO_EC_KEY_BYTES);
        const nodePrivateKey = ecdh.getPrivateKey();
        privateKey.set(nodePrivateKey, CRYPTO_EC_KEY_BYTES - nodePrivateKey.length);

        return PrivateKey(privateKey, { publicKey: Bytes.of(ecdh.getPublicKey()) });
    }

    generateDhSecret(key: PrivateKey, peerKey: PublicKey): Bytes {
        const ecdh = this.#crypto.createECDH(CRYPTO_EC_CURVE);
        ecdh.setPrivateKey(Bytes.of(key.privateBits));

        return Bytes.of(ecdh.computeSecret(Bytes.of(peerKey.publicBits)));
    }

    ecMultiply(point: Bytes, scalar: Bytes): Bytes {
        const {
            p256: { Point },
            pow,
            mod: modFn,
        } = ec;
        const curve = Point.CURVE();
        const scalarVal = Bytes.asBigInt(Bytes.of(scalar));

        // Edge cases: fall back to noble-curves
        if (scalarVal === 0n || scalarVal + 1n >= curve.n) {
            return Point.fromBytes(Bytes.of(point)).multiply(scalarVal).toBytes(false);
        }

        const pointBuf = Bytes.of(point);
        const p = curve.p;

        // Native ECDH for x-coordinate of scalar * point
        const ecdh1 = this.#crypto.createECDH(CRYPTO_EC_CURVE);
        ecdh1.setPrivateKey(Bytes.of(scalar));
        const rx = Bytes.asBigInt(Bytes.of(ecdh1.computeSecret(pointBuf)));

        // Recover y via curve equation: y² = x³ - 3x + b (mod p)
        const rx2 = modFn(rx * rx, p);
        const rhs = modFn(rx2 * rx + (p - 3n) * rx + curve.b, p);
        const ry = pow(rhs, (p + 1n) / 4n, p);

        // Determine correct y parity via (scalar + 1) * point
        const ecdh2 = this.#crypto.createECDH(CRYPTO_EC_CURVE);
        ecdh2.setPrivateKey(Bytes.of(Bytes.fromBigInt(scalarVal + 1n, 32)));
        const expectedX = Bytes.asBigInt(Bytes.of(ecdh2.computeSecret(pointBuf)));

        // Build result with candidate y
        const result = new Uint8Array(65);
        result[0] = 0x04;
        result.set(Bytes.of(Bytes.fromBigInt(rx, 32)), 1);
        result.set(Bytes.of(Bytes.fromBigInt(ry, 32)), 33);

        // Check: (rx, ry) + point should have x-coordinate == expectedX
        if (Point.fromBytes(result).add(Point.fromBytes(pointBuf)).x === expectedX) {
            return result;
        }

        // Wrong y parity; negate
        result.set(Bytes.of(Bytes.fromBigInt(p - ry, 32)), 33);
        return result;
    }
}

// Auto-detect Node.js crypto and self-install
const nodeCrypto = (globalThis as any).process?.getBuiltinModule?.("crypto");
if (nodeCrypto?.createECDH) {
    NodeJsStyleCrypto.detectedCrypto = nodeCrypto;
    const nodeJsStyleCrypto = new NodeJsStyleCrypto();
    Environment.default.set(Entropy, nodeJsStyleCrypto);
    Environment.default.set(Crypto, nodeJsStyleCrypto);
}
