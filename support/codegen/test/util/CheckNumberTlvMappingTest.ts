/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { ClusterModel, MatterModel } from "#model";
import "@matter/model/resources";
import { checkNumberTlvMapping } from "#util/check-number-tlv-mapping.js";

function model(...clusters: ConstructorParameters<typeof ClusterModel>[0][]) {
    return new MatterModel({ name: "Matter", children: clusters.map(c => new ClusterModel(c)) });
}

describe("checkNumberTlvMapping", () => {
    it("accepts an attribute whose type has a TLV codec", () => {
        const matter = model({
            name: "Test",
            id: 0x101,
            children: [{ tag: "attribute", name: "Thing", id: 0x1, type: "uint32" }],
        } as ConstructorParameters<typeof ClusterModel>[0]);

        expect(() => checkNumberTlvMapping(matter)).does.not.throw();
    });

    it("rejects an attribute whose type is an integer width with no TLV codec", () => {
        const matter = model({
            name: "Test",
            id: 0x101,
            children: [{ tag: "attribute", name: "Thing", id: 0x1, type: "int24" }],
        } as ConstructorParameters<typeof ClusterModel>[0]);

        expect(() => checkNumberTlvMapping(matter)).throws(/thing.*int24/i);
    });

    it("accepts the root datatype declarations themselves, which are not uses", () => {
        expect(() => checkNumberTlvMapping(MatterModel.standard)).does.not.throw();
    });

    it("rejects an attribute whose type is a bitmap width with no TLV codec", () => {
        const matter = model({
            name: "Test",
            id: 0x101,
            children: [{ tag: "attribute", name: "Thing", id: 0x1, type: "map64" }],
        } as ConstructorParameters<typeof ClusterModel>[0]);

        expect(() => checkNumberTlvMapping(matter)).throws(/thing.*map64/i);
    });
});
