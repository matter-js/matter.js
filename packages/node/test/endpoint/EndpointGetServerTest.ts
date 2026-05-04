/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { AttributeNotPresentError, EndpointBehaviorNotPresentError } from "#endpoint/errors.js";
import { MockServerNode } from "../node/mock-server-node.js";

describe("Endpoint.get on a server endpoint", () => {
    let node: MockServerNode;

    beforeEach(async () => {
        node = new MockServerNode();
        await node.construction;
    });

    afterEach(async () => {
        await node.close();
    });

    it("has nodeType 'server'", () => {
        expect(node.nodeType).to.equal("server");
    });

    it("returns full state when called with no selector", async () => {
        const result = (await node.get()) as Record<string, unknown>;
        expect(result).to.be.an("object");
        expect(result).to.have.property("basicInformation");
        expect(result).to.have.property("accessControl");
    });

    it("returns only the requested behavior when given { beh: true }", async () => {
        const result = (await node.get({ basicInformation: true })) as Record<string, unknown>;
        expect(Object.keys(result)).to.deep.equal(["basicInformation"]);
        expect(result.basicInformation).to.be.an("object");
    });

    it("returns only the requested attributes when given an attribute list", async () => {
        const result = (await node.get({ basicInformation: ["vendorId", "vendorName"] })) as Record<string, unknown>;
        expect(Object.keys(result)).to.deep.equal(["basicInformation"]);
        const bi = result.basicInformation as Record<string, unknown>;
        expect(Object.keys(bi).sort()).to.deep.equal(["vendorId", "vendorName"]);
        const state = node.state.basicInformation as unknown as Record<string, unknown>;
        expect(bi.vendorId).to.equal(state.vendorId);
        expect(bi.vendorName).to.equal(state.vendorName);
    });

    it("returns {} for empty selector {}", async () => {
        const result = await node.get({});
        expect(result).to.deep.equal({});
    });

    it("returns { beh: {} } for empty attribute list []", async () => {
        const result = (await node.get({ basicInformation: [] })) as Record<string, unknown>;
        expect(result).to.deep.equal({ basicInformation: {} });
    });

    it("throws EndpointBehaviorNotPresentError for an unknown behavior id", async () => {
        let threw = false;
        try {
            await node.get({ unknownBehaviorXyz: true } as any);
        } catch (e) {
            threw = true;
            expect(e).to.be.instanceof(EndpointBehaviorNotPresentError);
        }
        expect(threw).to.be.true;
    });

    it("throws AttributeNotPresentError for an unknown attribute name", async () => {
        let threw = false;
        try {
            await node.get({ basicInformation: ["nonExistentAttribute"] } as any);
        } catch (e) {
            threw = true;
            expect(e).to.be.instanceof(AttributeNotPresentError);
        }
        expect(threw).to.be.true;
    });
});
