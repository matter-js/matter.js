/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { cmac } from "#crypto/aes/Cmac.js";
import { CryptoInputError } from "#crypto/CryptoError.js";
import { Bytes } from "#util/Bytes.js";

// RFC 4493 §4 test vectors (key K, examples 1–4).
const KEY = Bytes.fromHex("2b7e151628aed2a6abf7158809cf4f3c");
const vectors = [
    { name: "Example 1 (len 0)", msg: "", mac: "bb1d6929e95937287fa37d129b756746" },
    { name: "Example 2 (len 16)", msg: "6bc1bee22e409f96e93d7e117393172a", mac: "070a16b46b4d4144f79bdd9dd04a287c" },
    {
        name: "Example 3 (len 40)",
        msg: "6bc1bee22e409f96e93d7e117393172aae2d8a571e03ac9c9eb76fac45af8e5130c81c46a35ce411",
        mac: "dfa66747de9ae63030ca32611497c827",
    },
    {
        name: "Example 4 (len 64)",
        msg: "6bc1bee22e409f96e93d7e117393172aae2d8a571e03ac9c9eb76fac45af8e5130c81c46a35ce411e5fbc1191a0a52eff69f2445df4f9b17ad2b417be66c3710",
        mac: "51f0bebf7e3b9d92fc49741779363cfe",
    },
];

describe("cmac (RFC 4493)", () => {
    for (const v of vectors) {
        it(`matches ${v.name}`, () => {
            const out = cmac(Bytes.of(KEY), Bytes.of(Bytes.fromHex(v.msg)));
            expect(Bytes.toHex(out)).equals(v.mac);
        });
    }

    it("rejects a non-16-byte key with CryptoInputError", () => {
        expect(() => cmac(new Uint8Array(15), new Uint8Array())).throws(CryptoInputError);
        expect(() => cmac(new Uint8Array(17), new Uint8Array())).throws(CryptoInputError);
    });
});
