/**
 * @license
 * Copyright 2022-2025 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { install } from "react-native-quick-crypto";

install(); // Install the react-native crypto module

import {
    Bytes,
    Ccm,
    Crypto,
    CRYPTO_SYMMETRIC_KEY_LENGTH,
    CryptoDsaEncoding,
    CryptoVerifyError,
    CurveType,
    DerBigUint,
    DerCodec,
    DerError,
    Environment,
    ImplementationError,
    Key,
    KeyInputError,
    KeyType,
    PrivateKey,
    PublicKey,
} from "#general";
import { ec } from "elliptic";

const SIGNATURE_ALGORITHM = <EcdsaParams>{
    name: "ECDSA",
    namedCurve: "P-256",
    hash: { name: "SHA-256" },
};

class ReactNativeCryptoSubtle implements SubtleCrypto {
    /** [MDN Reference](https://developer.mozilla.org/docs/Web/API/SubtleCrypto/decrypt) */
    decrypt(
        algorithm: AlgorithmIdentifier | RsaOaepParams | AesCtrParams | AesCbcParams | AesGcmParams,
        key: CryptoKey,
        data: BufferSource,
    ): Promise<ArrayBuffer> {
        return crypto.subtle.decrypt(algorithm, key, data);
    }

    /** [MDN Reference](https://developer.mozilla.org/docs/Web/API/SubtleCrypto/deriveBits) */
    deriveBits(
        algorithm: AlgorithmIdentifier | EcdhKeyDeriveParams | HkdfParams | Pbkdf2Params,
        baseKey: CryptoKey,
        length?: number | null,
    ): Promise<ArrayBuffer> {
        return crypto.subtle.deriveBits(algorithm, baseKey, length);
    }

    /** [MDN Reference](https://developer.mozilla.org/docs/Web/API/SubtleCrypto/deriveKey) */
    deriveKey(
        algorithm: AlgorithmIdentifier | EcdhKeyDeriveParams | HkdfParams | Pbkdf2Params,
        baseKey: CryptoKey,
        derivedKeyType: AlgorithmIdentifier | AesDerivedKeyParams | HmacImportParams | HkdfParams | Pbkdf2Params,
        extractable: boolean,
        keyUsages: KeyUsage[],
    ): Promise<CryptoKey> {
        return crypto.subtle.deriveKey(algorithm, baseKey, derivedKeyType, extractable, keyUsages);
    }

    /** [MDN Reference](https://developer.mozilla.org/docs/Web/API/SubtleCrypto/digest) */
    digest(algorithm: AlgorithmIdentifier, data: BufferSource): Promise<ArrayBuffer> {
        return crypto.subtle.digest(algorithm, data);
    }

    /** [MDN Reference](https://developer.mozilla.org/docs/Web/API/SubtleCrypto/encrypt) */
    encrypt(
        algorithm: AlgorithmIdentifier | RsaOaepParams | AesCtrParams | AesCbcParams | AesGcmParams,
        key: CryptoKey,
        data: BufferSource,
    ): Promise<ArrayBuffer> {
        return crypto.subtle.encrypt(algorithm, key, data);
    }

    /** [MDN Reference](https://developer.mozilla.org/docs/Web/API/SubtleCrypto/exportKey) */
    exportKey(format: "jwk", key: CryptoKey): Promise<JsonWebKey>;
    exportKey(format: Exclude<KeyFormat, "jwk">, key: CryptoKey): Promise<ArrayBuffer>;
    exportKey(format: KeyFormat, key: CryptoKey): Promise<ArrayBuffer | JsonWebKey> {
        return crypto.subtle.exportKey(format, key);
    }

    /** [MDN Reference](https://developer.mozilla.org/docs/Web/API/SubtleCrypto/generateKey) */
    generateKey(
        algorithm: AlgorithmIdentifier,
        extractable: boolean,
        keyUsages: ReadonlyArray<KeyUsage>,
    ): Promise<CryptoKeyPair>;
    generateKey(
        algorithm: RsaHashedKeyGenParams | EcKeyGenParams,
        extractable: boolean,
        keyUsages: ReadonlyArray<KeyUsage>,
    ): Promise<CryptoKeyPair>;
    generateKey(
        algorithm: AesKeyGenParams | HmacKeyGenParams | Pbkdf2Params,
        extractable: boolean,
        keyUsages: ReadonlyArray<KeyUsage>,
    ): Promise<CryptoKey>;
    generateKey(
        algorithm:
            | AlgorithmIdentifier
            | RsaHashedKeyGenParams
            | EcKeyGenParams
            | AesKeyGenParams
            | HmacKeyGenParams
            | Pbkdf2Params,
        extractable: boolean,
        keyUsages: KeyUsage[],
    ): Promise<CryptoKeyPair | CryptoKey> {
        return crypto.subtle.generateKey(algorithm, extractable, keyUsages);
    }

    /** [MDN Reference](https://developer.mozilla.org/docs/Web/API/SubtleCrypto/importKey) */
    importKey(
        format: Exclude<KeyFormat, "jwk">,
        keyData: BufferSource,
        algorithm: AlgorithmIdentifier | RsaHashedImportParams | EcKeyImportParams | HmacImportParams | AesKeyAlgorithm,
        extractable: boolean,
        keyUsages: ReadonlyArray<KeyUsage>,
    ): Promise<CryptoKey>;
    importKey(
        format: "jwk",
        keyData: JsonWebKey,
        algorithm: AlgorithmIdentifier | RsaHashedImportParams | EcKeyImportParams | HmacImportParams | AesKeyAlgorithm,
        extractable: boolean,
        keyUsages: ReadonlyArray<KeyUsage>,
    ): Promise<CryptoKey>;
    importKey(
        format: KeyFormat,
        keyData: BufferSource | JsonWebKey,
        algorithm: AlgorithmIdentifier | RsaHashedImportParams | EcKeyImportParams | HmacImportParams | AesKeyAlgorithm,
        extractable: boolean,
        keyUsages: ReadonlyArray<KeyUsage>,
    ): Promise<CryptoKey> {
        if (format !== "jwk") {
            throw new ImplementationError(`React Native Crypto does not support importKey with format "${format}"`);
        }
        return crypto.subtle.importKey(format, keyData as JsonWebKey, algorithm, extractable, keyUsages);
    }

    /** [MDN Reference](https://developer.mozilla.org/docs/Web/API/SubtleCrypto/sign) */
    sign(
        algorithm: AlgorithmIdentifier | RsaPssParams | EcdsaParams,
        key: CryptoKey,
        data: BufferSource,
    ): Promise<ArrayBuffer> {
        return crypto.subtle.sign(algorithm, key, data);
    }

    /** [MDN Reference](https://developer.mozilla.org/docs/Web/API/SubtleCrypto/unwrapKey) */
    unwrapKey(
        format: KeyFormat,
        wrappedKey: BufferSource,
        unwrappingKey: CryptoKey,
        unwrapAlgorithm: AlgorithmIdentifier | RsaOaepParams | AesCtrParams | AesCbcParams | AesGcmParams,
        unwrappedKeyAlgorithm:
            | AlgorithmIdentifier
            | RsaHashedImportParams
            | EcKeyImportParams
            | HmacImportParams
            | AesKeyAlgorithm,
        extractable: boolean,
        keyUsages: KeyUsage[],
    ): Promise<CryptoKey> {
        return crypto.subtle.unwrapKey(
            format,
            wrappedKey,
            unwrappingKey,
            unwrapAlgorithm,
            unwrappedKeyAlgorithm,
            extractable,
            keyUsages,
        );
    }

    /** [MDN Reference](https://developer.mozilla.org/docs/Web/API/SubtleCrypto/verify) */
    verify(
        algorithm: AlgorithmIdentifier | RsaPssParams | EcdsaParams,
        key: CryptoKey,
        signature: BufferSource,
        data: BufferSource,
    ): Promise<boolean> {
        return crypto.subtle.verify(algorithm, key, signature, data);
    }

    /** [MDN Reference](https://developer.mozilla.org/docs/Web/API/SubtleCrypto/wrapKey) */
    wrapKey(
        format: KeyFormat,
        key: CryptoKey,
        wrappingKey: CryptoKey,
        wrapAlgorithm: AlgorithmIdentifier | RsaOaepParams | AesCtrParams | AesCbcParams | AesGcmParams,
    ): Promise<ArrayBuffer> {
        return crypto.subtle.wrapKey(format, key, wrappingKey, wrapAlgorithm);
    }
}

/**
 * Crypto implementation for React Native
 */
export class ReactNativeCrypto extends Crypto {
    implementationName = "ReactNativeCrypto";
    #subtle: ReactNativeCryptoSubtle;

    constructor() {
        const subtle = new ReactNativeCryptoSubtle();
        super();
        this.#subtle = subtle;
    }

    static provider() {
        return new ReactNativeCrypto();
    }

    randomBytes(length: number): Uint8Array {
        const result = new Uint8Array(length);
        crypto.getRandomValues(result);
        return result;
    }

    encrypt(key: Uint8Array, data: Uint8Array, nonce: Uint8Array, associatedData?: Uint8Array) {
        const ccm = Ccm(key);
        return ccm.encrypt({ pt: data, nonce, adata: associatedData });
    }

    decrypt(key: Uint8Array, data: Uint8Array, nonce: Uint8Array, associatedData?: Uint8Array) {
        const ccm = Ccm(key);
        return ccm.decrypt({ ct: data, nonce, adata: associatedData });
    }

    async computeSha256(buffer: Uint8Array | Uint8Array[]) {
        if (Array.isArray(buffer)) {
            buffer = Bytes.concat(...buffer);
        }
        return new Uint8Array(await this.#subtle.digest("SHA-256", buffer));
    }

    async createPbkdf2Key(secret: Uint8Array, salt: Uint8Array, iteration: number, keyLength: number) {
        const key = await this.#importKey("raw", secret, "PBKDF2", false, ["deriveBits"]);
        const bits = await this.#subtle.deriveBits(
            {
                name: "PBKDF2",
                hash: "SHA-256",
                salt: salt,
                iterations: iteration,
            },
            key,
            keyLength * 8,
        );
        return new Uint8Array(bits);
    }

    async createHkdfKey(
        secret: Uint8Array,
        salt: Uint8Array,
        info: Uint8Array,
        length: number = CRYPTO_SYMMETRIC_KEY_LENGTH,
    ) {
        return this.#createHkdfKey("sha256", secret, salt, info, length);
    }

    async signHmac(secret: Uint8Array, data: Uint8Array) {
        return (
            crypto
                // @ts-expect-error No types but all fine
                .createHmac("sha256", secret)
                .update(data)
                .digest()
        );
    }

    async signEcdsa(key: JsonWebKey, data: Uint8Array | Uint8Array[], dsaEncoding?: CryptoDsaEncoding) {
        if (Array.isArray(data)) {
            data = Bytes.concat(...data);
        }

        const { crv, kty, d, x, y } = key;

        key = {
            kty,
            crv,
            d,
            x,
            y,
            ext: true, // Required by some subtle implementations to sign
            key_ops: ["sign"],
        };

        const subtleKey = await this.#importKey("jwk", key, SIGNATURE_ALGORITHM, false, ["sign"]);

        const ieeeP1363 = await this.#subtle.sign(SIGNATURE_ALGORITHM, subtleKey, data);

        if (dsaEncoding !== "der") return new Uint8Array(ieeeP1363);

        const bytesPerComponent = ieeeP1363.byteLength / 2;

        return DerCodec.encode({
            r: DerBigUint(ieeeP1363.slice(0, bytesPerComponent)),
            s: DerBigUint(ieeeP1363.slice(bytesPerComponent)),
        });
    }

    async verifyEcdsa(key: JsonWebKey, data: Uint8Array, signature: Uint8Array, dsaEncoding?: CryptoDsaEncoding) {
        const { crv, kty, x, y } = key;
        key = { crv, kty, x, y };
        const subtleKey = await this.#importKey("jwk", key, SIGNATURE_ALGORITHM, false, ["verify"]);

        if (dsaEncoding === "der") {
            try {
                const decoded = DerCodec.decode(signature);

                const r = DerCodec.decodeBigUint(decoded?._elements?.[0], 32);
                const s = DerCodec.decodeBigUint(decoded?._elements?.[1], 32);

                signature = Bytes.concat(r, s);
            } catch (cause) {
                DerError.accept(cause);

                throw new CryptoVerifyError("Invalid DER signature", { cause });
            }
        }

        const verified = await this.#subtle.verify(SIGNATURE_ALGORITHM, subtleKey, signature, data);

        if (!verified) {
            throw new CryptoVerifyError("Signature verification failed");
        }
    }

    async createKeyPair() {
        const subtleKey = await this.#subtle.generateKey(
            {
                // We must specify either ECDH or ECDSA to get an EC key but we may use the key for either (but not for
                // both)
                name: "ECDH",
                namedCurve: "P-256",
            },
            true,

            // We must also specify usage but will drop this on export
            ["deriveKey"],
        );

        // Do not export as JWK because we do not want to inherit the algorithm and key_ops
        const key = await this.#subtle.exportKey("jwk", subtleKey.privateKey);

        // Extract only private and public fields; we do not want key_ops
        return Key({
            kty: KeyType.EC,
            crv: CurveType.p256,
            d: key.d?.slice(0, -1),
            x: key.x?.slice(0, -1),
            y: key.y?.slice(0, -1),
        }) as PrivateKey;
    }

    async generateDhSecret(key: PrivateKey, peerKey: PublicKey) {
        const curve = new ec("p256");

        const keyPair = curve.keyFromPrivate(key.keyPair.privateKey);
        const publicPoint = curve.keyFromPublic(peerKey.keyPair.publicKey).getPublic();

        const shared = keyPair.derive(publicPoint);
        return new Uint8Array(shared.toArray());
    }

    #importKey(
        format: "jwk",
        keyData: JsonWebKey,
        algorithm: AlgorithmIdentifier | RsaHashedImportParams | EcKeyImportParams | HmacImportParams | AesKeyAlgorithm,
        extractable: boolean,
        keyUsages: ReadonlyArray<KeyUsage>,
    ): Promise<CryptoKey>;
    #importKey(
        format: Exclude<KeyFormat, "jwk">,
        keyData: BufferSource,
        algorithm: AlgorithmIdentifier | RsaHashedImportParams | EcKeyImportParams | HmacImportParams | AesKeyAlgorithm,
        extractable: boolean,
        keyUsages: KeyUsage[],
    ): Promise<CryptoKey>;

    async #importKey(...params: unknown[]) {
        try {
            return await this.#subtle.importKey(...(params as Parameters<ReactNativeCryptoSubtle["importKey"]>));
        } catch (cause) {
            throw new KeyInputError("Invalid key", { cause });
        }
    }

    #createHkdfKey = (
        digest: "sha1" | "sha256" | "sha384" | "sha512",
        ikm: Uint8Array,
        salt: Uint8Array,
        info: Uint8Array,
        keylen: number,
    ) => {
        const hashlen = parseInt(digest.substr(3), 10) >> 3 || 20;
        const prk = crypto
            // @ts-expect-error No types but all fine
            .createHmac(digest, salt.byteLength ? salt : new Uint8Array(hashlen))
            .update(ikm)
            .digest();

        // T(0) = empty
        // T(1) = HMAC(PRK, T(0) | info | 0x01)
        // T(2) = HMAC(PRK, T(1) | info | 0x02)
        // T(3) = HMAC(PRK, T(2) | info | 0x03)
        // ...
        // T(N) = HMAC(PRK, T(N-1) | info | N)

        const N = Math.ceil(keylen / hashlen);

        // Single T buffer to accomodate T = T(1) | T(2) | T(3) | ... | T(N)
        // with a little extra for info | N during T(N)
        const T = new Uint8Array(hashlen * N + info.byteLength + 1);
        let prev = 0;
        let start = 0;
        for (let c = 1; c <= N; c++) {
            T.set(info, start);
            T[start + info.byteLength] = c;

            T.set(
                crypto
                    // @ts-expect-error No types but all fine
                    .createHmac(digest, prk)
                    .update(T.subarray(prev, start + info.byteLength + 1))
                    .digest(),
                start,
            );

            prev = start;
            start += hashlen;
        }

        // OKM, releasing T
        return T.slice(0, keylen);
    };
}

if (crypto?.subtle !== undefined) {
    Environment.default.set(Crypto, new ReactNativeCrypto());
}
