/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { Endpoint } from "#endpoint/Endpoint.js";
import type { EndpointType } from "#endpoint/type/EndpointType.js";
import { MockSite } from "../node/mock-site.js";
import { subscribedPeer } from "../node/node-helpers.js";

// The peer's static type (ClientNode.RootEndpoint) does not include device behaviors such as basicInformation,
// which are added dynamically by ClientStructure after commissioning.
function asEndpoint(peer: Endpoint): Endpoint<EndpointType> {
    return peer as Endpoint<EndpointType>;
}

describe("Endpoint.get on a client endpoint", () => {
    before(() => {
        MockTime.init();
    });

    it("has nodeType 'client'", async () => {
        await using site = new MockSite();
        const { controller } = await site.addCommissionedPair();
        const peer = await subscribedPeer(controller, "peer1");
        expect((peer as unknown as { nodeType: string }).nodeType).to.equal("client");
    });

    it("returns state for the requested behavior (selection=true)", async () => {
        await using site = new MockSite();
        const { controller } = await site.addCommissionedPair();
        const peer = await subscribedPeer(controller, "peer1");

        const result = (await asEndpoint(peer).get({ basicInformation: true })) as Record<string, unknown>;
        const bi = result.basicInformation as Record<string, unknown>;
        const cachedBi = (peer as unknown as { state: { basicInformation: Record<string, unknown> } }).state
            .basicInformation;
        expect(bi.vendorName).to.equal(cachedBi.vendorName);
    });

    it("returns only selected attributes (attribute list)", async () => {
        await using site = new MockSite();
        const { controller } = await site.addCommissionedPair();
        const peer = await subscribedPeer(controller, "peer1");

        const result = (await asEndpoint(peer).get({
            basicInformation: ["vendorName", "productName"],
        })) as Record<string, unknown>;
        const bi = result.basicInformation as Record<string, unknown>;
        expect(Object.keys(bi).sort()).to.deep.equal(["productName", "vendorName"]);
        const cachedBi = (peer as unknown as { state: { basicInformation: Record<string, unknown> } }).state
            .basicInformation;
        expect(bi.vendorName).to.equal(cachedBi.vendorName);
        expect(bi.productName).to.equal(cachedBi.productName);
    });

    it("returns {} for empty selector", async () => {
        await using site = new MockSite();
        const { controller } = await site.addCommissionedPair();
        const peer = await subscribedPeer(controller, "peer1");

        const result = await asEndpoint(peer).get({});
        expect(result).to.deep.equal({});
    });
});
