/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { Invoke } from "#action/request/Invoke.js";
import { EndpointNumber } from "@matter/types";
import { OnOffCluster } from "@matter/types/clusters/on-off";
import { CommandModel, Quality } from "@matter/model";

/**
 * Tests for the largeMessage flag on Invoke requests.
 *
 * The largeMessage flag indicates that a command's payload may exceed the IPv6 MTU
 * (1280 bytes) and therefore requires TCP transport.  This flag is set by
 * ClientCommandMethod when the CommandModel has the Large Message quality ("L").
 */
describe("Invoke largeMessage flag", () => {
    describe("CommandModel largeMessage quality", () => {
        it("parses largeMessage from quality DSL string 'L'", () => {
            const quality = new Quality("L");
            expect(quality.largeMessage).to.equal(true);
        });

        it("does not set largeMessage when quality is empty", () => {
            const quality = new Quality({});
            expect(quality.largeMessage).to.be.undefined;
        });

        it("CommandModel with largeMessage quality reports effectiveQuality.largeMessage", () => {
            const model = new CommandModel({
                name: "TestCommand",
                id: 0x01,
                quality: "L",
            });
            expect(model.effectiveQuality.largeMessage).to.equal(true);
        });

        it("CommandModel without largeMessage quality does not report largeMessage", () => {
            const model = new CommandModel({
                name: "TestCommand",
                id: 0x01,
            });
            expect(model.effectiveQuality.largeMessage).to.be.undefined;
        });
    });

    describe("ClientInvoke largeMessage property", () => {
        it("Invoke factory does not set largeMessage by default", () => {
            const invoke = Invoke({
                commands: [
                    Invoke.ConcreteCommandRequest({
                        endpoint: EndpointNumber(1),
                        cluster: OnOffCluster,
                        command: "toggle",
                    }),
                ],
            });

            expect(invoke.largeMessage).to.be.undefined;
        });

        it("largeMessage can be set on an Invoke result", () => {
            const invoke = Invoke({
                commands: [
                    Invoke.ConcreteCommandRequest({
                        endpoint: EndpointNumber(1),
                        cluster: OnOffCluster,
                        command: "toggle",
                    }),
                ],
            });

            // This mirrors what ClientCommandMethod does:
            //   if (largeMessage) { invoke.largeMessage = true; }
            invoke.largeMessage = true;
            expect(invoke.largeMessage).to.equal(true);
        });

        it("largeMessage flag matches the pattern used in ClientCommandMethod", () => {
            // Verify the boolean coercion pattern used in ClientCommandMethod:
            //   const largeMessage = !!commandModel?.effectiveQuality.largeMessage;
            const modelWith = new CommandModel({ name: "Big", id: 0x01, quality: "L" });
            const modelWithout = new CommandModel({ name: "Small", id: 0x02 });

            // With largeMessage quality
            const flagWith = !!modelWith.effectiveQuality.largeMessage;
            expect(flagWith).to.equal(true);

            // Without largeMessage quality
            const flagWithout = !!modelWithout.effectiveQuality.largeMessage;
            expect(flagWithout).to.equal(false);

            // No model at all (undefined case)
            const noModel = undefined as CommandModel | undefined;
            const flagNone = !!noModel?.effectiveQuality.largeMessage;
            expect(flagNone).to.equal(false);
        });
    });
});
