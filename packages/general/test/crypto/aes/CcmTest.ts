/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { Ccm } from "#crypto/aes/Ccm.js";
import { Bytes } from "#util/Bytes.js";

/**
 * Structure for NIST CCM test vectors.
 */
interface CcmTestData {
    /**
     * The test case ID from the source.
     */
    name: string;
    key: string;
    nonce: string;
    adata: string;
    pt: string;
    ct: string;
    tag: string;
}

/**
 * These vectors include:
 *
 * * The NIST test vectors for CCM mode that adhere to Matter specification constraints (e.g. 13-byte nonce, 16-byte tag)
 *
 * * Additional vectors we've added during diagnostics
 */
const vectors: CcmTestData[] = [
    {
        name: "NIST tcId 0",
        key: "0953fa93e7caac9638f58820220a398e",
        nonce: "00800000011201000012345678",
        adata: "",
        pt: "fffd034b50057e400000010000",
        ct: "b5e5bfdacbaf6cb7fb6bff871f",
        tag: "b0d6dd827d35bf372fa6425dcd17d356",
    },
    {
        name: "NIST tcId 1",
        key: "0953fa93e7caac9638f58820220a398e",
        nonce: "00800148202345000012345678",
        adata: "",
        pt: "120104320308ba072f",
        ct: "79d7dbc0c9b4d43eeb",
        tag: "281508e50d58dbbd27c39597800f4733",
    },
    {
        name: "NIST tcId 2",
        key: "0953fa93e7caac9638f58820220a398e",
        nonce: "00802b38322fe3000012345678",
        adata: "",
        pt: "120104fa0205a6000a",
        ct: "53273086b8c5ee00bd",
        tag: "d52b87a8ce6290a772d472b8c62bdc13",
    },
    {
        name: "NIST tcId 3",
        key: "be635105434859f484fc798e043ce40e",
        nonce: "00800000021201000012345678",
        adata: "",
        pt: "23450100",
        ct: "b0e5d0ad",
        tag: "6078e0ddbb7cd43faea57c7051e5b4ae",
    },
    {
        name: "NIST tcId 4",
        key: "be635105434859f484fc798e043ce40e",
        nonce: "00800148342345000012345678",
        adata: "",
        pt: "120102001234567800",
        ct: "5c39da1792b1fee9ec",
        tag: "a9233958aced64f2343b9d610e876440",
    },
    {
        name: "NIST tcId 5",
        key: "0953fa93e7caac9638f58820220a398e",
        nonce: "008b0148352345000012345678",
        adata: "",
        pt: "000300a6ac00000002",
        ct: "0d0d730f94d7f3509d",
        tag: "dda1694adb791652fb6ae04682f19b29",
    },
    {
        name: "NIST tcId 6",
        key: "0953fa93e7caac9638f58820220a398e",
        nonce: "008b0148362345000012345678",
        adata: "",
        pt: "000300a6ac00000003",
        ct: "d85d806bbed248614f",
        tag: "ef7f4d55e47d21522ebe3d5bc735a5c5",
    },
    {
        name: "NIST tcId 7",
        key: "be635105434859f484fc798e043ce40e",
        nonce: "00800000031201000012345678",
        adata: "",
        pt: "23450101",
        ct: "7777ed35",
        tag: "35d84e18784c4bf3cb1b4c191dc555cc",
    },
    {
        name: "NIST tcId 8",
        key: "be635105434859f484fc798e043ce40e",
        nonce: "00800000041201000012345678",
        adata: "",
        pt: "23450101",
        ct: "ae214660",
        tag: "d146b28beafe7f984f9430502d07aafe",
    },
    {
        name: "NIST tcId 9",
        key: "be635105434859f484fc798e043ce40e",
        nonce: "00800000051201000012345678",
        adata: "",
        pt: "23450100",
        ct: "7d3ae62a",
        tag: "52ee03ab84e1a33365e8a61275665f71",
    },
    {
        name: "NIST tcId 10",
        key: "63964771734fbd76e3b40519d1d94a48",
        nonce: "010007080d1234973612345677",
        adata: "f4a002c7fb1e4ca0a469a021de0db875",
        pt: "ea0a00576f726c64",
        ct: "de1547118463123e",
        tag: "14604c1ddb4f5987064b1736f3923962",
    },
    {
        name: "Matter message payload 1",
        key: "bacb178b2588443d5d5b1e4559e7accc",
        nonce: "00221453000000000000000000",
        adata: "001d350022145300",
        pt: "05028d040100153600172403312504fcff18172402002403302404001817240200240330240401181724020024033024040218172402002403302404031817240200240328240402181724020024032824040418172403312404031818290324ff0118",
        ct: "ec2b931025dada82ed67521c966d2454d131a271023be699e4e2796650f568e590fd9b65f456c720a60a0da127eaa53974c5d41d3d933ed7b58a9ce5b5cb96ad94a7762611c48774cf75458327e74c34668a45dc9943546f8a6aa1dcd40bd4b8014bef",
        tag: "b49954a097a60cbdff333ee3f2fd1f49",
    },
];

describe("Ccm", () => {
    for (const { name, key, nonce, adata: aad, pt, ct, tag } of vectors) {
        const ccm = Ccm(Bytes.fromHex(key));
        const ptb = Bytes.of(Bytes.fromHex(pt));
        const ctb = Bytes.of(Bytes.fromHex(ct + tag));
        const aadb = Bytes.fromHex(aad);
        const nonceb = Bytes.fromHex(nonce);
        const input = {
            adata: Bytes.of(aadb),
            nonce: Bytes.of(nonceb),
        };

        describe(name, () => {
            it("encrypts", () => {
                const ct2 = Bytes.toHex(
                    ccm.encrypt({
                        ...input,
                        pt: ptb,
                    }),
                );

                expect(ct2.slice(0, ct2.length - tag.length)).equals(ct, "Ciphertext does not match");
                expect(ct2.slice(ct2.length - tag.length)).equals(tag, "Tag does not match");
            });

            it("decrypts", () => {
                const pt2 = Bytes.toHex(
                    ccm.decrypt({
                        ...input,
                        ct: ctb,
                    }),
                );
                expect(pt2).deep.equals(Bytes.toHex(ptb), "Plaintext does not match");
            });
        });
    }
});
