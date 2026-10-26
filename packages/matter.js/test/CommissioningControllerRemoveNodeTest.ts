/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { createPromise } from "@matter/general";
import { ServerNodeStore } from "@matter/node";
import { LegacyControllerSite } from "./util/LegacyControllerSite.js";

describe("CommissioningController removeNode", () => {
    before(() => {
        MockTime.init();
    });

    it("removes a node and its storage while its server node closes", async () => {
        await using site = new LegacyControllerSite();
        const { controller, nodeId } = await site.addCommissionedPair();
        const { node } = controller;
        const { promise: entered, resolver: enter } = createPromise<void>();
        const { promise: released, resolver: release } = createPromise<void>();
        const blocking = node.lifecycle.mutex.hold("blocking", async () => {
            enter();
            await released;
        });
        await entered;
        const closing = node.close();

        await MockTime.resolve(controller.removeNode(nodeId, false), { macrotasks: true });

        expect(node.env.get(ServerNodeStore).clientStores.knownIds).deep.equals([]);
        release();
        await MockTime.resolve(Promise.all([blocking, closing]), { macrotasks: true });
    });
});
