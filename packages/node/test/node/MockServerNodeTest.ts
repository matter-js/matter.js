/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { Bytes, Crypto } from "@matter/general";
import { MockServerNode } from "@matter/node/testing";

describe("MockServerNode", () => {
    it("seeds mock crypto from the index of a single configuration", async () => {
        await using node1 = new MockServerNode({ index: 1 });
        await using node2 = new MockServerNode({ index: 2 });
        await node1.construction;
        await node2.construction;

        const bytes1 = Bytes.toHex(node1.env.get(Crypto).randomBytes(16));
        const bytes2 = Bytes.toHex(node2.env.get(Crypto).randomBytes(16));
        expect(bytes1).not.equals(bytes2);
    });
});
