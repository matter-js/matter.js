/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { SignatureEncodingError } from "#crypto/CryptoError.js";
import { EcdsaSignature } from "#crypto/EcdsaSignature.js";
import { Bytes } from "#util/Bytes.js";

describe("EcdsaSignature", () => {
    const ieee = new Uint8Array(64);
    for (let i = 0; i < 64; i++) {
        ieee[i] = i + 1;
    }

    it("accepts a 64-byte IEEE P1363 signature", () => {
        const signature = new EcdsaSignature(ieee);

        expect(Bytes.toHex(signature.bytes)).equal(Bytes.toHex(ieee));
    });

    it("rejects an IEEE P1363 signature of the wrong length", () => {
        expect(() => new EcdsaSignature(new Uint8Array(32))).throws(SignatureEncodingError, "signature length");
    });

    it("round-trips through DER encoding", () => {
        const der = new EcdsaSignature(ieee).der;
        const decoded = new EcdsaSignature(der, "der");

        expect(Bytes.toHex(decoded.bytes)).equal(Bytes.toHex(ieee));
    });

    it("rejects malformed DER input", () => {
        expect(() => new EcdsaSignature(Bytes.fromHex("000102"), "der")).throws(
            SignatureEncodingError,
            "Could not decode DER signature",
        );
    });
});
