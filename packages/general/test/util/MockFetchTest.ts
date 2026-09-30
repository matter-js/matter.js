/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { Bytes } from "#util/Bytes.js";
import { MockFetch } from "#util/MockFetch.js";

describe("MockFetch", () => {
    it("serves a binary response that is a view into a larger buffer as just that view", async () => {
        const backing = Uint8Array.of(0xaa, 0x01, 0x02, 0x03, 0xbb);
        const mock = new MockFetch();
        mock.addResponse("https://example.com/data", backing.subarray(1, 4), { binary: true });
        mock.install();
        try {
            const response = await fetch("https://example.com/data");
            expect(Bytes.toHex(new Uint8Array(await response.arrayBuffer()))).equals("010203");
        } finally {
            mock.uninstall();
        }
    });
});
