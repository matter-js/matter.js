/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { GroupKeyManagementServer } from "#behaviors/group-key-management";
import { MockServerNode } from "../../node/mock-server-node.js";
import { causeMessagesOf } from "../../node/node-helpers.js";

// The GroupKeyManagement Groupcast (GCAST) feature is still provisional in Matter 1.6.1; its implementation is present
// but guarded.
describe("Matter 1.6.1 provisional Groupcast guards", () => {
    it("rejects the provisional GroupKeyManagement Groupcast feature", async () => {
        const messages = await causeMessagesOf(
            MockServerNode.create(MockServerNode.RootEndpoint.with(GroupKeyManagementServer.with("Groupcast"))),
        );
        expect(messages).contains("Groupcast feature of GroupKeyManagement is provisional");
    });
});
