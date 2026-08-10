/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

// Test fixture converted from a data file so it bundles for the web test runner.
export const data = {
    vectors: [
        {
            name: "openthread minimum passphrase",
            passphrase: "123456",
            extPanIdHex: "0102030405060708",
            networkName: "OpenThread",
            expectedPskcHex: "44988e22cf652eeeccd1e4c01d0154f8",
            source: "openthread/tests/unit/test_pskc.cpp::TestMinimumPassphrase (https://github.com/openthread/openthread/blob/main/tests/unit/test_pskc.cpp)",
        },
        {
            name: "openthread maximum passphrase (255 bytes)",
            passphrase:
                "123456781234567812345678123456781234567812345678123456781234567812345678123456781234567812345678123456781234567812345678123456781234567812345678123456781234567812345678123456781234567812345678123456781234567812345678123456781234567812345678123456781234567",
            extPanIdHex: "0102030405060708",
            networkName: "OpenThread",
            expectedPskcHex: "9e81bd35a253762f80ee04ff2fa285e9",
            source: "openthread/tests/unit/test_pskc.cpp::TestMaximumPassphrase (https://github.com/openthread/openthread/blob/main/tests/unit/test_pskc.cpp)",
        },
        {
            name: "openthread Thread spec example",
            passphrase: "12SECRETPASSWORD34",
            extPanIdHex: "0001020304050607",
            networkName: "Test Network",
            expectedPskcHex: "c3f59368445a1b6106be420a706d4cc9",
            source: "openthread/tests/unit/test_pskc.cpp::TestExampleInSpec (https://github.com/openthread/openthread/blob/main/tests/unit/test_pskc.cpp)",
        },
    ],
};
