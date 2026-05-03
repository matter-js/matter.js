/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { Read } from "#action/request/Read.js";
import { AttributeId, AttributePath, ClusterId, EndpointNumber } from "@matter/types";
import { expect } from "chai";

describe("Read.AttributePaths", () => {
    function path(endpointId: number, clusterId: number, attributeId: number): AttributePath {
        return {
            endpointId: EndpointNumber(endpointId),
            clusterId: ClusterId(clusterId),
            attributeId: AttributeId(attributeId),
        };
    }

    it("retains paths in insertion order", () => {
        const paths = new Read.AttributePaths();
        paths.add(path(1, 0x28, 0x01));
        paths.add(path(1, 0x06, 0x00));
        expect([...paths.paths]).to.deep.equal([path(1, 0x28, 0x01), path(1, 0x06, 0x00)]);
    });

    it("dedupes by (endpointId, clusterId, attributeId)", () => {
        const paths = new Read.AttributePaths();
        paths.add(path(1, 0x28, 0x01));
        paths.add(path(1, 0x28, 0x01));
        expect(paths.paths.length).to.equal(1);
    });

    it("treats different endpoints / clusters / attributes as distinct", () => {
        const paths = new Read.AttributePaths();
        paths.add(path(1, 0x28, 0x01));
        paths.add(path(2, 0x28, 0x01));
        paths.add(path(1, 0x29, 0x01));
        paths.add(path(1, 0x28, 0x02));
        expect(paths.paths.length).to.equal(4);
    });

    it("dedupes cluster-level wildcard paths (no attributeId)", () => {
        const paths = new Read.AttributePaths();
        paths.add({ endpointId: EndpointNumber(1), clusterId: ClusterId(0x28) });
        paths.add({ endpointId: EndpointNumber(1), clusterId: ClusterId(0x28) });
        expect(paths.paths.length).to.equal(1);
    });

    it("dedupes endpoint-level wildcard paths (no clusterId or attributeId)", () => {
        const paths = new Read.AttributePaths();
        paths.add({ endpointId: EndpointNumber(1) });
        paths.add({ endpointId: EndpointNumber(1) });
        expect(paths.paths.length).to.equal(1);
    });

    it("treats cluster wildcard and specific attribute as distinct", () => {
        const paths = new Read.AttributePaths();
        paths.add({ endpointId: EndpointNumber(1), clusterId: ClusterId(0x28) });
        paths.add(path(1, 0x28, 0x01));
        expect(paths.paths.length).to.equal(2);
    });
});
