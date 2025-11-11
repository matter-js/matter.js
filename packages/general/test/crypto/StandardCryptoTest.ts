/**
 * @license
 * Copyright 2022-2025 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Notes:
 *
 * * We test the public interface here but bulk of AES-CCM tests are in AesTest.ts and CcmTest.ts
 *
 * * NodeJsCryptoTest.ts also implements some of these tests
 */

import { Key, PrivateKey, PublicKey } from "#crypto/Key.js";
import { StandardCrypto } from "#crypto/StandardCrypto.js";
import { b$, Bytes } from "#util/Bytes.js";

const KEY = b$`abf227feffea8c38e688ddcbffc459f1`;
const ENCRYPTED_DATA = b$`c4527bd6965518e8382edbbd28f27f42492d0766124f9961a772`;
const PLAIN_DATA = b$`03104f3c0000e98ceb00`;
const NONCE = b$`000ce399000000000000000000`;
const ADDITIONAL_AUTH_DATA = b$`00456a000ce39900`;

const KEY_2 = b$`4e4c1353a133397f7a7557c1fbd9ca38`;
const ENCRYPTED_DATA_2 = b$`cb50871ccd35d430b9d9f9f2a50c07f6b0e68ac78f671de670bc6622c3538b10184ac58e70475301edae3d45dd169bfad3a4367cb8eb821676b162`;
const PLAIN_DATA_2 = b$`0609523c01000fe399001528003601153501370024000024013e24020b1835012400001818181824ff0118`;
const NONCE_2 = b$`00ec8ceb000000000000000000`;
const ADDITIONAL_AUTH_DATA_2 = b$`00c7a200ec8ceb00`;

const PRIVATE_KEY = b$`727F1005CBA47ED7822A9D930943621617CFD3B79D9AF528B801ECF9F1992204`;
const PUBLIC_KEY = b$`0462e2b6e1baff8d74a6fd8216c4cb67a3363a31e691492792e61aee610261481396725ef95e142686ba98f339b0ff65bc338bec7b9e8be0bdf3b2774982476220`;

const SEC1_KEY = b$`30770201010420aef3484116e9481ec57be0472df41bf499064e5024ad869eca5e889802d48075a00a06082a8648ce3d030107a144034200043c398922452b55caf389c25bd1bca4656952ccb90e8869249ad8474653014cbf95d687965e036b521c51037e6b8cedefca1eb44046694fa08882eed6519decba`;
const SPKI_KEY = b$`3059301306072a8648ce3d020106082a8648ce3d030107034200043c398922452b55caf389c25bd1bca4656952ccb90e8869249ad8474653014cbf95d687965e036b521c51037e6b8cedefca1eb44046694fa08882eed6519decba`;

const crypto = new StandardCrypto();

describe("StandardCrypto", () => {
    it("encrypts", () => {
        const result = crypto.encrypt(KEY_2, PLAIN_DATA_2, NONCE_2, ADDITIONAL_AUTH_DATA_2);

        expect(Bytes.toHex(result)).equals(Bytes.toHex(ENCRYPTED_DATA_2));
    });

    it("decrypts", () => {
        const result = crypto.decrypt(KEY, ENCRYPTED_DATA, NONCE, ADDITIONAL_AUTH_DATA);

        expect(Bytes.toHex(result)).equals(Bytes.toHex(PLAIN_DATA));
    });

    it("signs & verifies", async () => {
        const result = await crypto.signEcdsa(PrivateKey(Bytes.of(PRIVATE_KEY)), ENCRYPTED_DATA);

        await crypto.verifyEcdsa(PublicKey(Bytes.of(PUBLIC_KEY)), ENCRYPTED_DATA, result);
    });

    it("signs & verifies with SEC1/SPKI keys", async () => {
        const result = await crypto.signEcdsa(Key({ sec1: Bytes.of(SEC1_KEY) }), ENCRYPTED_DATA);
        await crypto.verifyEcdsa(Key({ spki: Bytes.of(SPKI_KEY) }), ENCRYPTED_DATA, result);
    });

    it("generates a working DSA key pair", async () => {
        const key = await crypto.createKeyPair();

        const signature = await crypto.signEcdsa(key, ENCRYPTED_DATA);
        await crypto.verifyEcdsa(key, ENCRYPTED_DATA, signature);
    });

    // Too slow to leave enabled by default but useful for confirming key variance doesn't cause failure
    // it("creates a large volume of private keys", async () => {
    //     for (let i = 0; i < 100000; i++) {
    //         if (!(i % 100)) {
    //             console.log(`Key iteration ${i}`);
    //         }
    //         const key = await Crypto.createKeyPair();

    //         const signature = await Crypto.sign(key, ENCRYPTED_DATA);
    //         await Crypto.verify(key, ENCRYPTED_DATA, signature);
    //     }
    // });

    it("creates correct EC hash", async () => {
        const hash = await crypto.computeSha256(
            b$`047e708746f3d9fb3265a73f0c69ad18cdd48860d7956731eb72873f3d09c17b667c13737017574bf3f826239ff27cdb52fb3e69ff4a06ffd2cbccfdc695ff6096`,
        );
        expect(Bytes.toHex(hash)).equals("582418375f09bff6b3bbb2421206ad6aec3c79ff2602f95a68d3e4d23bebe36f");
    });

    it("performs correct HKDF computation", async () => {
        const hash = await crypto.createHkdfKey(
            b$`dbc94ee08a5ee674b4c1bfa7b05bfd339faa0cd67853a10d367e9790a6d064af5ea3650da79a228adfaf771970f5f31cdc3f0ebde443640185a6e0f488f0a243`,
            b$`0000000000000001`,
            b$`436f6d70726573736564466162726963`,
            8,
        );
        expect(Bytes.toHex(hash)).equals("ab4a2b4fba653117");
    });

    it("computes correct DH shared secret", async () => {
        const key1 = await crypto.createKeyPair();
        const key2 = await crypto.createKeyPair();

        const secret1 = await crypto.generateDhSecret(key1, PublicKey(key2.publicBits));
        const secret2 = await crypto.generateDhSecret(key2, PublicKey(key1.publicBits));

        expect(secret1).deep.equal(secret2);
        expect(secret1.byteLength).equals(32);
    });
});
