/**
 * @license
 * Copyright 2022-2025 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { Bytes, Spake2p, StandardCrypto } from "#general";
import { SPAKE_CONTEXT } from "#session/pase/PaseMessenger.js";

describe("PasePairing", () => {
    const crypto = new StandardCrypto();

    describe("Test PASE Spake2 process", () => {
        it("test fix for elliptic library failure", async () => {
            /*
                As soon as the generated w0 had a leading 00 the verifier calculation of elliptic was wrong
                Adjustment to other library fixes this.
             */
            const serverPbkdfParameters = {
                iterations: 1000,
                salt: Bytes.fromHex("03959ebc20b8fcbda262d97f9a7a9e76e32d7a1b9c5166b6a3721e88acad8808"),
            };
            const { w0, L } = await Spake2p.computeW0L(crypto, serverPbkdfParameters, 20202021);
            expect(w0.toString(16)).equal("177867f1e564cc4d9f347edfc28263ee5a50f1e21177cfb9a7dc2504437ccb");
            expect(Bytes.toHex(L)).equal(
                "04cf26d253cae2dd44c6954d443c7badc1e8811b8484eaae2d7bf43ec2f7e3173527877ea4a554513063036f55d2871e87e294dfdc18cd39edd6519fb4dfcde976",
            );

            //const peerRandom = Bytes.fromHex("94eab5c37d101df5ef01b2c8ecada03a7c3b0cf5e26a08feda72617f9cd391a6");
            //const peerSessionId = 71;
            //const passcodeId = DEFAULT_PASSCODE_ID;
            //const hasPbkdfParameters = false;
            //const sessionParams = undefined;
            const requestPayload = Bytes.fromHex(
                "1530012094eab5c37d101df5ef01b2c8ecada03a7c3b0cf5e26a08feda72617f9cd391a6240247240300280418",
            );

            //const sessionId = 56919;
            //const random = Bytes.fromHex("22820a42684102fd4a92c0bad66ad1f21f3c5366f5a6d84203035e2c7caf3bae");

            const responsePayload = Bytes.fromHex(
                "1530012094eab5c37d101df5ef01b2c8ecada03a7c3b0cf5e26a08feda72617f9cd391a630022022820a42684102fd4a92c0bad66ad1f21f3c5366f5a6d84203035e2c7caf3bae250357de35042501e80330022003959ebc20b8fcbda262d97f9a7a9e76e32d7a1b9c5166b6a3721e88acad88081818",
            );

            // Process pake1 and send pake2
            const spake2p = new Spake2p(
                crypto,
                await crypto.computeHash([SPAKE_CONTEXT, requestPayload, responsePayload]),
                BigInt("0xde583b5685529de9544b92c9c8cba696751b14d65092d13458879b3bc9814b53"),
                w0,
            );

            const { w0: clientw0 } = await Spake2p.computeW0W1(crypto, serverPbkdfParameters, 20202021);
            expect(w0.toString(16)).equal(clientw0.toString(16));

            const X = Bytes.fromHex(
                "04cce1e192a645d54a3ac9a3a3f0b334f37c03400b826b14d873124dfb96a35815f80202f05c72d055b6da24942d0a6cac18caf310100ecef23248ac8fd2ced196",
            );

            const Y = spake2p.computeY();
            expect(Y).deep.equal(
                Bytes.fromHex(
                    "0404f972c7232cde8911de7d93e37ad752b90ad095888ac83da5f3a1d5a7eb063288ed6d358e9092a8606dac6cd6b8fdfc0b3960df85434ed60c6b6091d23da7bb",
                ),
            );
            const { hBX: verifier } = await spake2p.computeSecretAndVerifiersFromX(L, X, Y);
            expect(Bytes.toHex(verifier)).not.equal("13c986aeaf2415c3ae1228b213564fb10b66e013cc1cc9fa2c2b31e8b6c4b0db"); // That was old library
            expect(Bytes.toHex(verifier)).equal("d6a13c26b6c5b7c514033a0370b1830dff5116fd53de43eb2374737e9b64e4bb");
        });

        it("do special successful pase process", async () => {
            const serverPbkdfParameters = {
                iterations: 1000,
                salt: Bytes.fromHex("2bb41e9d75f30c2e6b2f059410c56965717cc2bf14ed6c73a169435326a89652"),
            };
            const { w0, L } = await Spake2p.computeW0L(crypto, serverPbkdfParameters, 20202021);
            expect(w0.toString(16)).equal("501f85a83d1da77983ff6f0c1f742d6d98f6d0ab0ba740a38032200099c8981f");
            expect(Bytes.toHex(L)).equal(
                "0463e7f225296bcd9b100e605d636a3d2c84524665cbd9b8b75e737d04bca1241486b37bdba74284de76f2db9df271d2c5bda21b8e26bc0943dcbf0542665c3aa8",
            );

            //const peerRandom = Bytes.fromHex("913cc0622eca85f8d4c132c89663c5d7afa780667be930e5c11bec865479c617");
            //const peerSessionId = 35814;
            //const passcodeId = DEFAULT_PASSCODE_ID;
            //const hasPbkdfParameters = false;
            //const sessionParams = undefined;
            const requestPayload = Bytes.fromHex(
                "15300120913cc0622eca85f8d4c132c89663c5d7afa780667be930e5c11bec865479c6172502e68b240300280418",
            );

            //const sessionId = 17028;
            //const random = Bytes.fromHex("5682c0732b37c045ebeb416904c187a58b5341088e0172123becfb855f94a72c");

            const responsePayload = Bytes.fromHex(
                "15300120913cc0622eca85f8d4c132c89663c5d7afa780667be930e5c11bec865479c6173002205682c0732b37c045ebeb416904c187a58b5341088e0172123becfb855f94a72c2503844235042501e8033002202bb41e9d75f30c2e6b2f059410c56965717cc2bf14ed6c73a169435326a896521818",
            );

            // Process pake1 and send pake2
            const spake2p = new Spake2p(
                crypto,
                await crypto.computeHash([SPAKE_CONTEXT, requestPayload, responsePayload]),
                BigInt("0xfee695b4972a4f620951010c87390d3fe1313efce399fbc2c9c7cdc04d22b4c6"),
                w0,
            );

            const { w0: clientw0 } = await Spake2p.computeW0W1(crypto, serverPbkdfParameters, 20202021);
            expect(w0.toString(16)).equal(clientw0.toString(16));

            const X = Bytes.fromHex(
                "04db4f7c7f4dbf478440753d578825da01ae177c89dad6637f9c91ef86880e8d67571b2fdc0e0564985cd6b2cbbee82ab5655b0fbae7254ff4b13f88a30076612c",
            );

            const Y = spake2p.computeY();
            expect(Y).deep.equal(
                Bytes.fromHex(
                    "04cd3a2937c598cfd46e197e786e4194e65164ed1a0bf23f224947b4f4c140f72b4742792b86ae6c427ae9d4a6d345cd6e1f9ae0f950d5399d38c8031d7975ca82",
                ),
            );

            const { hBX: verifier } = await spake2p.computeSecretAndVerifiersFromX(L, X, Y);
            expect(Bytes.toHex(verifier)).equal("52b9b5cb79dafd150b8729102ede22795d0f522ad884d29452818d8c54ca7508");
        });
    });
});
