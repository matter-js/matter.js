/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { BasicInformationClient } from "#behaviors/basic-information";
import { OperationalCredentialsClient } from "#behaviors/operational-credentials";
import { Endpoint } from "#endpoint/Endpoint.js";
import { EndpointBehaviorNotPresentError } from "#endpoint/errors.js";
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

    // The `fabricFilter` option threads through to the protocol Read on client-side reads
    // (`Endpoint.ts:1069`). Server-side reads ignore it (hardcoded false at line 1120). This test
    // covers the option's plumbing on the client path: passing `fabricFilter: false` must not
    // throw and must still return a usable slice.
    it("accepts the fabricFilter option on the client read path", async () => {
        await using site = new MockSite();
        const { controller } = await site.addCommissionedPair();
        const peer = await subscribedPeer(controller, "peer1");

        const result = (await asEndpoint(peer).get(
            { basicInformation: ["vendorName"] },
            { fabricFilter: false },
        )) as Record<string, Record<string, unknown>>;
        expect(result.basicInformation).to.have.property("vendorName");
    });
});

describe("Endpoint.getStateOf on a client endpoint", () => {
    before(() => {
        MockTime.init();
    });

    it("returns full behavior state when called with type only (Behavior.Type overload)", async () => {
        await using site = new MockSite();
        const { controller } = await site.addCommissionedPair();
        const peer = await subscribedPeer(controller, "peer1");

        const result = (await asEndpoint(peer).getStateOf(BasicInformationClient)) as unknown as Record<
            string,
            unknown
        >;
        const cachedBi = (peer as unknown as { state: { basicInformation: Record<string, unknown> } }).state
            .basicInformation;
        expect(result.vendorName).to.equal(cachedBi.vendorName);
        expect(result.productName).to.equal(cachedBi.productName);
    });

    it("returns selected attributes when called with a key list (Behavior.Type overload)", async () => {
        await using site = new MockSite();
        const { controller } = await site.addCommissionedPair();
        const peer = await subscribedPeer(controller, "peer1");

        const result = (await asEndpoint(peer).getStateOf(BasicInformationClient, [
            "vendorName",
            "productName",
        ])) as unknown as Record<string, unknown>;
        expect(Object.keys(result).sort()).to.deep.equal(["productName", "vendorName"]);
        const cachedBi = (peer as unknown as { state: { basicInformation: Record<string, unknown> } }).state
            .basicInformation;
        expect(result.vendorName).to.equal(cachedBi.vendorName);
        expect(result.productName).to.equal(cachedBi.productName);
    });

    it("supports the string-id overload", async () => {
        await using site = new MockSite();
        const { controller } = await site.addCommissionedPair();
        const peer = await subscribedPeer(controller, "peer1");

        const result = (await asEndpoint(peer).getStateOf("basicInformation", ["vendorName"])) as Record<
            string,
            unknown
        >;
        expect(Object.keys(result)).to.deep.equal(["vendorName"]);
        const cachedBi = (peer as unknown as { state: { basicInformation: Record<string, unknown> } }).state
            .basicInformation;
        expect(result.vendorName).to.equal(cachedBi.vendorName);
    });

    it("returns {} when called with an empty attribute list", async () => {
        await using site = new MockSite();
        const { controller } = await site.addCommissionedPair();
        const peer = await subscribedPeer(controller, "peer1");

        const result = await asEndpoint(peer).getStateOf("basicInformation", []);
        expect(result).to.deep.equal({});
    });

    it("throws EndpointBehaviorNotPresentError for an unknown behavior id", async () => {
        await using site = new MockSite();
        const { controller } = await site.addCommissionedPair();
        const peer = await subscribedPeer(controller, "peer1");

        let threw = false;
        try {
            await asEndpoint(peer).getStateOf("unknownBehaviorXyz");
        } catch (e) {
            threw = true;
            expect(e).to.be.instanceof(EndpointBehaviorNotPresentError);
        }
        expect(threw).to.be.true;
    });

    // ClientNode behaviors are added dynamically by ClientStructure after commissioning, so they
    // are not part of `ClientNode.RootEndpoint`'s static behavior map. The Behavior.Type overload of
    // `getStateOf()` must therefore accept any `Behavior.Type` (not only `BehaviorOf<T>`) so callers
    // can pass cluster behaviors like `OperationalCredentialsClient` directly without an `asEndpoint`
    // widening cast.
    it("accepts a dynamically-added behavior class without a widening cast (typed call)", async () => {
        await using site = new MockSite();
        const { controller } = await site.addCommissionedPair();
        const peer = await subscribedPeer(controller, "peer1");

        const result = (await peer.getStateOf(OperationalCredentialsClient, ["fabrics"])) as unknown as Record<
            string,
            unknown
        >;
        expect(Object.keys(result)).to.deep.equal(["fabrics"]);
        expect(Array.isArray(result.fabrics)).to.be.true;
    });
});
