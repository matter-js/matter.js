/**
 * @license
 * Copyright 2022-2025 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import {
    Bytes,
    Crypto,
    CRYPTO_HASH_LEN_BYTES,
    CRYPTO_SYMMETRIC_KEY_LENGTH,
    Environment,
    Key,
    NodeJsStyleCrypto,
    PrivateKey,
    PublicKey,
    StandardCrypto,
    WebCrypto,
} from "#general";
import { Buffer } from "@craftzdog/react-native-buffer";
import QuickCrypto from "react-native-quick-crypto";

// This is probably the crypto implementation we should be building on because Quick Crypto's node.js emulation is more
// mature than their web crypto support.  However, for now we just use for API portions where web crypto does not work
const nodeJsCrypto = new NodeJsStyleCrypto(QuickCrypto);

// The default export from QuickCrypto should be compatible with the standard `crypto` object but the type system
// seems confused by CJS exports.  Use a forced cast to correct types.
const crypto = QuickCrypto as unknown as typeof QuickCrypto.default;

// QuickCrypto's `install()` function is documented as optional but QuickCrypto references it as a global in its subtle
// implementation, so we can't avoid mucking with global scope (as of QuickCrypto 0.7.6)
if (!("Buffer" in globalThis)) {
    (globalThis as unknown as { Buffer: typeof Buffer }).Buffer = Buffer;
}

/**
 * Crypto implementation for React Native.
 */
export class ReactNativeCrypto extends StandardCrypto {
    override implementationName = "ReactNativeCrypto";

    static override provider() {
        return new ReactNativeCrypto(crypto as unknown as WebCrypto);
    }

    /**
     * Quick Crypto doesn't currently support {@link SubtleCrypto#deriveBits}.
     */
    override async createHkdfKey(
        secret: Bytes,
        salt: Bytes,
        info: Bytes,
        length: number = CRYPTO_SYMMETRIC_KEY_LENGTH,
    ) {
        const prk = crypto
            .createHmac("SHA-256", salt.byteLength ? Bytes.of(salt) : new Uint8Array(CRYPTO_HASH_LEN_BYTES))
            .update(Bytes.of(secret))
            .digest();

        // T(0) = empty
        // T(1) = HMAC(PRK, T(0) | info | 0x01)
        // T(2) = HMAC(PRK, T(1) | info | 0x02)
        // T(3) = HMAC(PRK, T(2) | info | 0x03)
        // ...
        // T(N) = HMAC(PRK, T(N-1) | info | N)

        const N = Math.ceil(length / CRYPTO_HASH_LEN_BYTES);

        // Single T buffer to accommodate T = T(1) | T(2) | T(3) | ... | T(N)
        // with a little extra for info | N during T(N)
        const T = new Uint8Array(CRYPTO_HASH_LEN_BYTES * N + info.byteLength + 1);
        let prev = 0;
        let start = 0;
        for (let c = 1; c <= N; c++) {
            T.set(Bytes.of(info), start);
            T[start + info.byteLength] = c;

            T.set(
                crypto
                    .createHmac("SHA-256", prk)
                    .update(T.subarray(prev, start + info.byteLength + 1))
                    .digest(),
                start,
            );

            prev = start;
            start += CRYPTO_HASH_LEN_BYTES;
        }

        // OKM, releasing T
        return T.slice(0, length);
    }

    /**
     * Quick Crypto apparently appends a "." to the base64 encoded properties.  I'm not aware of a legitimate reason for
     * this, seems likely just a bug.  Regardless it trips us off so strip off.
     */
    override async generateJwk() {
        const key = await super.generateJwk();

        for (const prop of ["d", "x", "y"] as const) {
            if (key[prop]?.endsWith(".")) {
                key[prop] = key[prop].slice(0, key[prop].length - 1);
            }
        }

        return key;
    }

    /**
     * See comment on {@link createHkdfKey}.
     */
    override async generateDhSecret(key: PrivateKey, peerKey: PublicKey) {
        return Key.sharedSecretFor(key, peerKey);
    }

    /**
     * QuickCrypto's subtle doesn't support HMAC signing; instead rely on Node.js crypto emulation.
     */
    override signHmac = nodeJsCrypto.signHmac.bind(nodeJsCrypto);
}

Environment.default.set(Crypto, new ReactNativeCrypto(crypto as unknown as WebCrypto));
