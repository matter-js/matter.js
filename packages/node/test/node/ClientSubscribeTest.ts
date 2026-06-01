/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { ServerNode } from "#node/ServerNode.js";
import { ImplementationError } from "@matter/general";
import { ClientInteraction, Subscribe } from "@matter/protocol";
import { MockSite } from "./mock-site.js";

describe("ClientSubscribe", () => {
    before(() => {
        MockTime.init();
    });

    it("rejects a subscription that designates no attributes or events", async () => {
        await using site = new MockSite();
        const { controller } = await site.addCommissionedPair({
            device: { type: ServerNode.RootEndpoint },
        });

        const peer1 = controller.peers.get("peer1")!;
        const interaction = peer1.interaction as ClientInteraction;

        await expect(interaction.subscribe(Subscribe({}))).rejectedWith(
            ImplementationError,
            "at least one must be specified",
        );
    });
});
