/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { Buffer } from "@craftzdog/react-native-buffer";
import type { Bytes, EcdsaSignature } from "@matter/general";
import {
    Crypto,
    Entropy,
    Environment,
    NodeJsCryptoApiLike,
    NodeJsStyleCrypto,
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

// This is probably the crypto implementation we should be building on because QuickCrypto's node.js emulation is more
// mature than their web crypto support.  However, for now we just use for API portions where web crypto does not work.
const nodeJsCrypto = new NodeJsStyleCrypto(QuickCrypto as unknown as NodeJsCryptoApiLike);

/**
 * Crypto implementation for React Native should work with a WebCrypto basis with 1.x
 */
export class ReactNativeCrypto extends StandardCrypto {
    override implementationName = "ReactNativeCrypto";

    // As of QuickCrypto 1.0.15, subtle.sign() returns DER-encoded ECDSA signatures rather than IEEE P1363 as required
    // by the WebCrypto spec.  Use Node.js-style crypto instead which handles the encoding correctly.
    override async signEcdsa(key: JsonWebKey, data: Bytes | Bytes[]) {
        return nodeJsCrypto.signEcdsa(key, data);
    }

    // See comment for signEcdsa; same thing here
    override async verifyEcdsa(key: JsonWebKey, data: Bytes, signature: EcdsaSignature) {
        return nodeJsCrypto.verifyEcdsa(key, data, signature);
    }

    static override provider() {
        return new ReactNativeCrypto(crypto as unknown as WebCrypto);
    }
}

{
    const rnCrypto = new ReactNativeCrypto(crypto as unknown as WebCrypto);
    Environment.default.set(Entropy, rnCrypto);
    Environment.default.set(Crypto, rnCrypto);
}
