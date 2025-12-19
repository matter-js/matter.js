/**
 * @license
 * Copyright 2022-2025 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { Crypto, Entropy, Environment, StandardCrypto, WebCrypto } from "#general";
import { Buffer } from "@craftzdog/react-native-buffer";
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
}

{
    const rnCrypto = new ReactNativeCrypto(crypto as unknown as WebCrypto);
    Environment.default.set(Entropy, rnCrypto);
    Environment.default.set(Crypto, rnCrypto);
}
