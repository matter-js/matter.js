/**
 * @license
 * Copyright 2022-2025 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { ImplementationError } from "#MatterError.js";
import { Bytes } from "#util/Bytes.js";
import { asError } from "#util/Error.js";
import { MaybePromise } from "#util/Promises.js";
import { Identity } from "#util/Type.js";
import {
    Crypto,
    CRYPTO_AUTH_TAG_LENGTH,
    CRYPTO_EC_CURVE,
    CRYPTO_EC_KEY_BYTES,
    CRYPTO_ENCRYPT_ALGORITHM,
    CRYPTO_HASH_ALGORITHM,
    CRYPTO_SYMMETRIC_KEY_LENGTH,
    CryptoDsaEncoding,
} from "./Crypto.js";
import { CryptoDecryptError, CryptoVerifyError } from "./CryptoError.js";
import { PrivateKey, PublicKey } from "./Key.js";

// Note that this is a type-only import, not a runtime dependency.
import type * as NodeJsCryptoApi from "node:crypto";

// Ensure we don't reference global crypto accidentally
declare const crypto: never;

/**
 * A crypto API implemented in the style of Node.js.
 */
export interface NodeJsCryptoApiLike extends Identity<typeof NodeJsCryptoApi> {}

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

    #crypto: NodeJsCryptoApiLike;

    constructor(crypto: NodeJsCryptoApiLike) {
        super();

        this.#crypto = crypto;
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

    async #hashAsyncIteratorData(hasher: NodeJsCryptoApi.Hash, iteratorFunc: () => Promise<IteratorResult<Bytes>>) {
        while (true) {
            const { value, done } = await iteratorFunc();
            if (value === undefined || done) break;
            hasher.update(Bytes.of(value));
        }
    }

    computeSha256(
        data: Bytes | Bytes[] | ReadableStreamDefaultReader<Bytes> | AsyncIterator<Bytes>,
    ): MaybePromise<Bytes> {
        const hasher = this.#crypto.createHash(CRYPTO_HASH_ALGORITHM);
        if (Array.isArray(data)) {
            data.forEach(chunk => hasher.update(Bytes.of(chunk)));
        } else if (Bytes.isBytes(data)) {
            hasher.update(Bytes.of(data));
        } else {
            let iteratorFunc: () => Promise<IteratorResult<Bytes>>;
            if ("read" in data && typeof data.read === "function") {
                iteratorFunc = data.read.bind(data);
            } else if ("next" in data && typeof data.next === "function") {
                iteratorFunc = data.next.bind(data);
            } else {
                throw new ImplementationError("Invalid data type for computeSha256");
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

    signEcdsa(privateKey: JsonWebKey, data: Bytes | Bytes[], dsaEncoding: CryptoDsaEncoding = "ieee-p1363"): Bytes {
        const signer = this.#crypto.createSign(CRYPTO_HASH_ALGORITHM);
        if (Array.isArray(data)) {
            data.forEach(chunk => signer.update(Bytes.of(chunk)));
        } else {
            signer.update(Bytes.of(data));
        }
        return Bytes.of(
            signer.sign({
                key: privateKey as any,
                format: "jwk",
                type: "pkcs8",
                dsaEncoding,
            }),
        );
    }

    verifyEcdsa(publicKey: JsonWebKey, data: Bytes, signature: Bytes, dsaEncoding: CryptoDsaEncoding = "ieee-p1363") {
        const verifier = this.#crypto.createVerify(CRYPTO_HASH_ALGORITHM);
        verifier.update(Bytes.of(data));
        const success = verifier.verify(
            {
                key: publicKey as any,
                format: "jwk",
                type: "spki",
                dsaEncoding,
            },
            Bytes.of(signature),
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
}
