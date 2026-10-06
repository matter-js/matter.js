/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { ClusterFile } from "#clusters/ClusterFile.js";
import { ComponentGenerator } from "#endpoints/ComponentGenerator.js";
import { ClusterModel, DatatypeModel, MatterModel } from "#model";

function componentSource(datatype: DatatypeModel) {
    const cluster = new ClusterModel({ id: 0xfff1_fc13, name: "DigitNames" }, datatype);
    new MatterModel({}, cluster);
    const file = new ClusterFile(cluster);
    new ComponentGenerator(file).generateTypes();
    return file.toString();
}

describe("component property names", () => {
    it("quotes a bitmap bit whose name starts with a digit", () => {
        const source = componentSource(
            new DatatypeModel({
                name: "BandBitmap",
                type: "map8",
                children: [
                    { tag: "field", name: "2G4", constraint: "0" },
                    { tag: "field", name: "Wired", constraint: "1" },
                ],
            }),
        );

        expect(source).contains('"2G4"?: boolean');
        expect(source).contains("wired?: boolean");
    });

    it("quotes a struct field whose name starts with a digit", () => {
        const source = componentSource(
            new DatatypeModel({
                name: "BandStruct",
                type: "struct",
                children: [
                    { tag: "field", id: 0, name: "5G", type: "uint8", conformance: "M" },
                    { tag: "field", id: 1, name: "Label", type: "string", conformance: "M" },
                ],
            }),
        );

        expect(source).contains('"5G": number');
        expect(source).contains("label: string");
    });
});
