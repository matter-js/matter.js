/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

// Test fixture converted from a data file so it bundles for the web test runner.
export const data = {
    source: "RFC 3610 Section 8 Packet Vectors. M=8 (8-byte tag) selected to match TLS_ECJPAKE_WITH_AES_128_CCM_8. Key is the single shared key from the appendix; nonce is 13 bytes (CCM L=2). encryptedHex = ciphertext || 8-byte tag, as emitted on the wire.",
    key: "C0C1C2C3C4C5C6C7C8C9CACBCCCDCECF",
    vectors: [
        {
            name: "Packet Vector #1",
            nonceHex: "00000003020100A0A1A2A3A4A5",
            aadHex: "0001020304050607",
            plaintextHex: "08090A0B0C0D0E0F101112131415161718191A1B1C1D1E",
            encryptedHex: "588C979A61C663D2F066D0C2C0F989806D5F6B61DAC38417E8D12CFDF926E0",
        },
        {
            name: "Packet Vector #2",
            nonceHex: "00000004030201A0A1A2A3A4A5",
            aadHex: "0001020304050607",
            plaintextHex: "08090A0B0C0D0E0F101112131415161718191A1B1C1D1E1F",
            encryptedHex: "72C91A36E135F8CF291CA894085C87E3CC15C439C9E43A3BA091D56E10400916",
        },
        {
            name: "Packet Vector #3",
            nonceHex: "00000005040302A0A1A2A3A4A5",
            aadHex: "0001020304050607",
            plaintextHex: "08090A0B0C0D0E0F101112131415161718191A1B1C1D1E1F20",
            encryptedHex: "51B1E5F44A197D1DA46B0F8E2D282AE871E838BB64DA8596574ADAA76FBD9FB0C5",
        },
        {
            name: "Packet Vector #4",
            nonceHex: "00000006050403A0A1A2A3A4A5",
            aadHex: "000102030405060708090A0B",
            plaintextHex: "0C0D0E0F101112131415161718191A1B1C1D1E",
            encryptedHex: "A28C6865939A9A79FAAA5C4C2A9D4A91CDAC8C96C861B9C9E61EF1",
        },
    ],
};
