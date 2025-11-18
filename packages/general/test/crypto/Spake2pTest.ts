/**
 * @license
 * Copyright 2022-2025 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { Spake2p } from "#crypto/Spake2p.js";
import { MockCrypto } from "#index.js";
import { Bytes } from "#util/Bytes.js";

describe("Spake2p", () => {
    const crypto = MockCrypto();

    describe("https://datatracker.ietf.org/doc/html/draft-bar-cfrg-spake2plus-01 test vectors", () => {
        const context = Bytes.fromString("SPAKE2+-P256-SHA256-HKDF draft-01");
        const w0 = BigInt("0xe6887cf9bdfb7579c69bf47928a84514b5e355ac034863f7ffaf4390e67d798c");
        const w1 = BigInt("0x24b5ae4abda868ec9336ffc3b78ee31c5755bef1759227ef5372ca139b94e512");
        const L = Bytes.fromHex(
            "0495645cfb74df6e58f9748bb83a86620bab7c82e107f57d6870da8cbcb2ff9f7063a14b6402c62f99afcb9706a4d1a143273259fe76f1c605a3639745a92154b9",
        );
        const x = BigInt("0x5b478619804f4938d361fbba3a20648725222f0a54cc4c876139efe7d9a21786");
        const y = BigInt("0x766770dad8c8eecba936823c0aed044b8c3c4f7655e8beec44a15dcbcaf78e5e");
        const X = Bytes.fromHex(
            "04a6db23d001723fb01fcfc9d08746c3c2a0a3feff8635d29cad2853e7358623425cf39712e928054561ba71e2dc11f300f1760e71eb177021a8f85e78689071cd",
        );
        const Y = Bytes.fromHex(
            "04390d29bf185c3abf99f150ae7c13388c82b6be0c07b1b8d90d26853e84374bbdc82becdb978ca3792f472424106a2578012752c11938fcf60a41df75ff7cf947",
        );
        const Ke = Bytes.fromHex("ea3276d68334576097e04b19ee5a3a8b");
        const hAY = Bytes.fromHex("71d9412779b6c45a2c615c9df3f1fd93dc0aaf63104da8ece4aa1b5a3a415fea");
        const hBX = Bytes.fromHex("095dc0400355cc233fde7437811815b3c1524aae80fd4e6810cf531cf11d20e3");
        const spake2pInitiator = new Spake2p(crypto, context, x, w0);
        const spake2pReceiver = new Spake2p(crypto, context, y, w0);

        it("generates X", () => {
            const result = spake2pInitiator.computeX();

            expect(result).deep.equal(X);
        });

        it("generates Y", () => {
            const result = spake2pReceiver.computeY();

            expect(result).deep.equal(Y);
        });

        it("generates shared secret and key confirmation for the initiator", async () => {
            const result = await spake2pInitiator.computeSecretAndVerifiersFromY(w1, X, Y);

            expect(Bytes.toHex(result.Ke)).equals(Bytes.toHex(Ke));
            expect(Bytes.toHex(result.hAY)).equals(Bytes.toHex(hAY));
            expect(Bytes.toHex(result.hBX)).equals(Bytes.toHex(hBX));
        }).timeout(20000);

        it("generates shared secret and key confirmation for the receiver", async () => {
            const result = await spake2pReceiver.computeSecretAndVerifiersFromX(L, X, Y);

            expect(Bytes.toHex(result.Ke)).equals(Bytes.toHex(Ke));
            expect(Bytes.toHex(result.hAY)).equals(Bytes.toHex(hAY));
            expect(Bytes.toHex(result.hBX)).equals(Bytes.toHex(hBX));
        }).timeout(20000);
    });

    describe("context hash test", () => {
        it("generates the correct context hash", async () => {
            // Test data captured from https://github.com/project-chip/connectedhomeip/
            const context = new Array<Bytes>();

            // "CHIP PAKE V1 Commissioning"
            context.push(Bytes.fromHex("434849502050414b4520563120436f6d6d697373696f6e696e67"));
            // PbkdfParamRequest bytes
            context.push(
                Bytes.fromHex(
                    "15300120b2901e92036f7bca007a3a1bf24bd71f18772105e83479c92b7a8af35e8182742502498d240300280435052501881325022c011818",
                ),
            );
            // PbkdfParamResponse bytes
            context.push(
                Bytes.fromHex(
                    "15300120b2901e92036f7bca007a3a1bf24bd71f18772105e83479c92b7a8af35e81827430022008070f685f2077779b824adf91e4bab6253b9d1a3c0f6615c6d447780f0feef325039c8d35042501e803300220163f8501fbbc0e6a8f69a9b999d038ca388ecffccc18fe259c4253f26e494dda1835052501881325022c011818",
                ),
            );
            const result = await crypto.computeHash(context);

            expect(Bytes.toHex(result)).equals("c49718b0275b6f81fd6a081f6c34c5833382b75b3bd997895d13a51c71a02855");
        });
    });
});
