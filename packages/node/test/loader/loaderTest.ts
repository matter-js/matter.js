/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { loader } from "@matter/node";

if (typeof window === "undefined") {
    describe("loader", () => {
        it("loads behaviors", async () => {
            const OnOffBehavior = await loader.behavior("on-off");
            expect(typeof OnOffBehavior).equals("function");
            expect(OnOffBehavior.name).equals("OnOffBehavior");
        });

        it("loads devices", async () => {
            const OnOffLightDevice = await loader.device("on-off-light");
            expect(typeof OnOffLightDevice).equals("object");
            expect(OnOffLightDevice.name).equals("OnOffLight");
        });

        it("loads endpoints", async () => {
            const BridgedNodeEndpoint = await loader.endpoint("BridgedNode");
            expect(typeof BridgedNodeEndpoint).equals("object");
            expect(BridgedNodeEndpoint.name).equals("BridgedNode");
        });
    });
}
