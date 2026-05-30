/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { FabricManager, TestFabric } from "@matter/protocol";
import { MockServerNode } from "../node/mock-server-node.js";

describe("Deferred fabric.delete via transaction.onFinalize", () => {
    it("completes cleanly when scheduled from inside a behavior transaction", async () => {
        const node = new MockServerNode();
        await node.start();
        try {
            const fabric = await TestFabric({ fabrics: node.env.get(FabricManager) });
            expect(node.env.get(FabricManager).fabrics.length).to.equal(1);

            const onlinePromise = Promise.resolve(
                node.online({}, async agent => {
                    agent.context.transaction.onFinalize(() => fabric.delete());
                    throw new Error("simulated handler failure");
                }),
            ).catch((err: unknown) => err);

            await MockTime.resolve(onlinePromise, { macrotasks: true });

            await MockTime.resolve(
                new Promise<void>(resolve => {
                    const check = () => {
                        if (node.env.get(FabricManager).fabrics.length === 0) {
                            resolve();
                        } else {
                            void MockTime.advance(100).then(check);
                        }
                    };
                    check();
                }),
                { macrotasks: true },
            );

            expect(node.env.get(FabricManager).fabrics.length).to.equal(0);
        } finally {
            await node.close();
        }
    });
});
