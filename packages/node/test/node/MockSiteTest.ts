/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { MockServerNode, MockSite } from "@matter/node/testing";

describe("MockSite", () => {
    it("leaves the node offline for online: false in a single configuration", async () => {
        await using site = new MockSite();
        const node = await site.addNode({ type: MockServerNode.RootEndpoint, online: false });

        expect(node.lifecycle.isOnline).equals(false);
    });
});
