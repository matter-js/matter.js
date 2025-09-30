/**
 * @license
 *
 * Portions copyright 2022-2023 Project CHIP Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { DerBigUint, DerCodec, DerError } from "#codec/DerCodec.js";
import { Environment } from "#environment/Environment.js";
import { ImplementationError, NotImplementedError } from "#MatterError.js";
import { Bytes } from "#util/Bytes.js";
import { MaybePromise } from "#util/Promises.js";
import { describeList } from "#util/String.js";
import { Ccm } from "./aes/Ccm.js";
import { Crypto, CRYPTO_SYMMETRIC_KEY_LENGTH, CryptoDsaEncoding } from "./Crypto.js";
import { CryptoVerifyError, KeyInputError } from "./CryptoError.js";
import { CurveType, Key, KeyType, PrivateKey, PublicKey } from "./Key.js";
import { WebCrypto } from "./WebCrypto.js";

// Ensure we don't reference global crypto accidentally
declare const crypto: never;

const SIGNATURE_ALGORITHM = <EcdsaParams>{
    name: "ECDSA",
    namedCurve: "P-256",
    hash: { name: "SHA-256" },
};

const requiredCryptoMethods: Array<keyof WebCrypto> = ["getRandomValues"];

const requiredSubtleMethods: Array<keyof SubtleCrypto> = [
    "digest",
    "deriveBits",
    "sign",
    "verify",
    "generateKey",
    "exportKey",
    "importKey",
];

/**
 * A {@link Crypto} implementation that uses only JS standards.
 *
 * WARNING: This code is unaudited.  Use a trusted native alternative where available.
 *
 * This module is mostly based on  {@link crypto.subtle}.  This should be a reliable native implementation.  However,
 * Web Crypto doesn't support AES-CCM required by Matter so we use a JS implementation for that.  See relevant warnings
 * in the "aes" subdirectory.
 */
export class StandardCrypto extends Crypto {
    implementationName = "JS";
    #crypto: WebCrypto;
    #subtle: SubtleCrypto;

    constructor(crypto: WebCrypto = globalThis.crypto) {
        const { subtle } = crypto;

        assertInterface("crypto", crypto, requiredCryptoMethods);
        assertInterface("crypto.subtle", subtle, requiredSubtleMethods);

        super();

        this.#crypto = crypto;
        this.#subtle = subtle;
    }

    protected get subtle() {
        return this.#subtle;
    }

    static provider() {
        return new StandardCrypto();
    }

    randomBytes(length: number): Bytes {
        const result = new Uint8Array(length);
        this.#crypto.getRandomValues(result);
        return result;
    }

    encrypt(key: Bytes, data: Bytes, nonce: Bytes, associatedData?: Bytes) {
        const ccm = Ccm(key);
        return ccm.encrypt({
            pt: Bytes.of(data),
            nonce: Bytes.of(nonce),
            adata: associatedData !== undefined ? Bytes.of(associatedData) : undefined,
        });
    }

    decrypt(key: Bytes, data: Bytes, nonce: Bytes, associatedData?: Bytes) {
        const ccm = Ccm(key);
        return ccm.decrypt({
            ct: Bytes.of(data),
            nonce: Bytes.of(nonce),
            adata: associatedData !== undefined ? Bytes.of(associatedData) : undefined,
        });
    }

    computeSha256(buffer: Bytes | Bytes[] | ReadableStreamDefaultReader<Bytes> | AsyncIterator<Bytes>) {
        if (Array.isArray(buffer)) {
            buffer = Bytes.concat(...buffer);
        }
        if (!Bytes.isBytes(buffer)) {
            throw new NotImplementedError("Streamed SHA-256 computation is not supported in StandardCrypto");
        }
        return this.#subtle.digest("SHA-256", Bytes.exclusive(buffer));
    }

    async createPbkdf2Key(secret: Bytes, salt: Bytes, iteration: number, keyLength: number) {
        const key = await this.importKey("raw", secret, "PBKDF2", false, ["deriveBits"]);
        return this.#subtle.deriveBits(
            {
                name: "PBKDF2",
                hash: "SHA-256",
                salt: Bytes.exclusive(salt),
                iterations: iteration,
            },
            key,
            keyLength * 8,
        );
    }

    async createHkdfKey(
        secret: Bytes,
        salt: Bytes,
        info: Bytes,
        length: number = CRYPTO_SYMMETRIC_KEY_LENGTH,
    ): Promise<Bytes> {
        const key = await this.importKey("raw", secret, "HKDF", false, ["deriveBits"]);
        return this.#subtle.deriveBits(
            {
                name: "HKDF",
                hash: "SHA-256",
                salt: Bytes.exclusive(salt),
                info: Bytes.exclusive(info),
            },
            key,
            8 * length,
        );
    }

    signHmac(secret: Bytes, data: Bytes): MaybePromise<Bytes> {
        return this.importKey("raw", secret, { name: "HMAC", hash: "SHA-256" }, false, ["sign"]).then(key =>
            this.#subtle.sign("HMAC", key, Bytes.exclusive(data)),
        );
    }

    async signEcdsa(key: JsonWebKey, data: Bytes | Bytes[], dsaEncoding?: CryptoDsaEncoding) {
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

        const subtleKey = await this.importKey("jwk", key, SIGNATURE_ALGORITHM, false, ["sign"]);

        const ieeeP1363 = Bytes.of(await this.#subtle.sign(SIGNATURE_ALGORITHM, subtleKey, Bytes.exclusive(data)));

        if (dsaEncoding !== "der") return ieeeP1363;

        const bytesPerComponent = ieeeP1363.byteLength / 2;

        return DerCodec.encode({
            r: DerBigUint(ieeeP1363.slice(0, bytesPerComponent)),
            s: DerBigUint(ieeeP1363.slice(bytesPerComponent)),
        });
    }

    async verifyEcdsa(key: JsonWebKey, data: Bytes, signature: Bytes, dsaEncoding?: CryptoDsaEncoding) {
        const { crv, kty, x, y } = key;
        key = { crv, kty, x, y };
        const subtleKey = await this.importKey("jwk", key, SIGNATURE_ALGORITHM, false, ["verify"]);

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

        const verified = await this.#subtle.verify(
            SIGNATURE_ALGORITHM,
            subtleKey,
            Bytes.exclusive(signature),
            Bytes.exclusive(data),
        );

        if (!verified) {
            throw new CryptoVerifyError("Signature verification failed");
        }
    }

    async createKeyPair() {
        const key = await this.generateJwk();

        // Extract only private and public fields; we do not want key_ops
        return Key({
            kty: KeyType.EC,
            crv: CurveType.p256,
            d: key.d,
            x: key.x,
            y: key.y,
        }) as PrivateKey;
    }

    protected async generateJwk() {
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
        return await this.#subtle.exportKey("jwk", subtleKey.privateKey);
    }

    async generateDhSecret(key: PrivateKey, peerKey: PublicKey): Promise<Bytes> {
        const subtleKey = await this.importKey(
            "jwk",
            key,
            {
                name: "ECDH",
                namedCurve: "P-256",
            },
            false,
            ["deriveBits"],
        );

        const subtlePeerKey = await this.importKey(
            "jwk",
            peerKey,
            {
                name: "ECDH",
                namedCurve: "P-256",
            },
            false,
            [],
        );

        return this.#subtle.deriveBits(
            {
                name: "ECDH",
                public: subtlePeerKey,
            },
            subtleKey,
            256,
        );
    }

    protected async importKey(
        format: KeyFormat,
        keyData: JsonWebKey | Bytes,
        algorithm: AlgorithmIdentifier | RsaHashedImportParams | EcKeyImportParams | HmacImportParams | AesKeyAlgorithm,
        extractable: boolean,
        keyUsages: ReadonlyArray<KeyUsage>,
    ) {
        try {
            return await this.#subtle.importKey(format as any, keyData as any, algorithm, extractable, keyUsages);
        } catch (cause) {
            throw new KeyInputError("Invalid key", { cause });
        }
    }
}

function assertInterface<T extends {}>(name: string, object: T, requiredMethods: (keyof T & string)[]) {
    if (typeof object !== "object" || object === null) {
        throw new ImplementationError(
            `The ${name} implementation passed to StandardCrypto is invalid (received ${typeof object})`,
        );
    }

    const missingMethods = requiredMethods.filter(name => typeof object[name] !== "function");
    if (missingMethods.length) {
        throw new ImplementationError(
            `The ${name} implementation passed to StandardCrypto is missing required method${missingMethods.length === 1 ? "" : "s"} ${describeList("and", ...missingMethods)}`,
        );
    }
}

// If available, unconditionally add to Environment as it has not been exported yet so there can be no other
// implementation present
if ("crypto" in globalThis && globalThis.crypto?.subtle) {
    Environment.default.set(Crypto, new StandardCrypto());
}
