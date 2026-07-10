/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { NodeActivity } from "#behavior/context/NodeActivity.js";
import { MockServerNode } from "./mock-server-node.js";

describe("shutdown activity draining", () => {
    it("shuts down even if node activity never settles", async () => {
        const node = await MockServerNode.createOnline();

        // Model an interaction parked on an MRP ack from an unresponsive peer (e.g. a restarted ICD, whose
        // retransmission backoff spans the idle interval): an activity that never closes.  Without the drain bound,
        // close() awaits NodeActivity.inactive forever (MockTime aborts after one virtual hour).
        const stuck = node.env.get(NodeActivity).begin("stuck interaction");
        expect(node.env.get(NodeActivity).inactive.value).equals(false);

        try {
            await node.close();
        } finally {
            stuck.close();
        }
    });
});
