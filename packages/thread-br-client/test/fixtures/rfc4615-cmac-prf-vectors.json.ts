/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

// Test fixture converted from a data file so it bundles for the web test runner.
export const data = {
    source: "RFC 4615 Section 4 — AES-CMAC-PRF-128 test vectors. Same 20-octet message, three key lengths (18, 16, 10).",
    messageHex: "000102030405060708090a0b0c0d0e0f10111213",
    vectors: [
        {
            name: "key length 18 (oversized -> compressed via CMAC)",
            keyHex: "000102030405060708090a0b0c0d0e0fedcb",
            expectedPrfHex: "84a348a4a45d235babfffc0d2b4da09a",
        },
        {
            name: "key length 16 (used directly)",
            keyHex: "000102030405060708090a0b0c0d0e0f",
            expectedPrfHex: "980ae87b5f4c9c5214f5b6a8455e4c2d",
        },
        {
            name: "key length 10 (undersized -> compressed via CMAC)",
            keyHex: "00010203040506070809",
            expectedPrfHex: "290d9e112edb09ee141fcf64c0b72f3d",
        },
    ],
};
