/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { Buffer } from "@craftzdog/react-native-buffer";
import {
    Bytes,
    Crypto,
    CRYPTO_HASH_ALGORITHM,
    CryptoVerifyError,
    EcdsaSignature,
    Entropy,
    Environment,
    StandardCrypto,
    WebCrypto,
} from "@matter/general";
import QuickCrypto from "react-native-quick-crypto";

// The default export from QuickCrypto should be compatible with the standard `crypto` object but the type system
// seems confused by CJS exports.  Use a forced cast to correct types.
const crypto = QuickCrypto as unknown as typeof QuickCrypto.default;

// QuickCrypto's `install()` function is documented as optional but QuickCrypto references it as a global in its subtle
// implementation, so we can't avoid mucking with global scope (as of QuickCrypto 0.7.6)
if (!("Buffer" in globalThis)) {
    (globalThis as unknown as { Buffer: typeof Buffer }).Buffer = Buffer;
}

/**
 * Crypto implementation for React Native should work with a WebCrypto basis with 1.x
 */
export class ReactNativeCrypto extends StandardCrypto {
    override implementationName = "ReactNativeCrypto";

    static override provider() {
        return new ReactNativeCrypto(crypto as unknown as WebCrypto);
    }

    override async signEcdsa(privateKey: JsonWebKey, data: Bytes | Bytes[]) {
        const pkcs8 = (privateKey as JsonWebKey & { pkcs8?: Bytes }).pkcs8;
        if (pkcs8 === undefined) {
            return super.signEcdsa(privateKey, data);
        }

        const signer = crypto.createSign(CRYPTO_HASH_ALGORITHM);
        if (Array.isArray(data)) {
            data.forEach(chunk => signer.update(Bytes.of(chunk)));
        } else {
            signer.update(Bytes.of(data));
        }

        return new EcdsaSignature(
            Bytes.of(
                signer.sign({
                    key: Buffer.from(Bytes.of(pkcs8)),
                    format: "der",
                    type: "pkcs8",
                    dsaEncoding: "ieee-p1363",
                }),
            ),
        );
    }

    override async verifyEcdsa(publicKey: JsonWebKey, data: Bytes, signature: EcdsaSignature) {
        const spki = (publicKey as JsonWebKey & { spki?: Bytes }).spki;
        if (spki === undefined) {
            return super.verifyEcdsa(publicKey, data, signature);
        }

        const verifier = crypto.createVerify(CRYPTO_HASH_ALGORITHM);
        verifier.update(Bytes.of(data));
        const success = verifier.verify(
            {
                key: Buffer.from(Bytes.of(spki)),
                format: "der",
                type: "spki",
                dsaEncoding: "ieee-p1363",
            },
            Bytes.of(signature.bytes),
        );
        if (!success) {
            throw new CryptoVerifyError("Signature verification failed");
        }
        return;
    }
}

{
    const rnCrypto = new ReactNativeCrypto(crypto as unknown as WebCrypto);
    Environment.default.set(Entropy, rnCrypto);
    Environment.default.set(Crypto, rnCrypto);
}
