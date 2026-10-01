/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { ClusterFile } from "#clusters/ClusterFile.js";
import { TlvGenerator } from "#clusters/TlvGenerator.js";
import { ComponentGenerator } from "#endpoints/ComponentGenerator.js";
import { TypeGenerator } from "#endpoints/TypeGenerator.js";
import { ClusterModel, DatatypeModel, FieldElement, MatterModel } from "#model";

function structOf(...children: FieldElement[]) {
    const struct = new DatatypeModel({ name: "PolicyStruct", type: "struct", children });
    const cluster = new ClusterModel({ id: 0xfff1_fc12, name: "ObsoleteTypes" }, struct);
    new MatterModel({}, cluster);
    return { struct, cluster };
}

describe("obsolete struct fields", () => {
    function structSource() {
        const struct = new DatatypeModel({
            name: "PolicyStruct",
            type: "struct",
            children: [
                { tag: "field", id: 0, name: "Current", type: "uint8", conformance: "M" },
                { tag: "field", id: 1, name: "LegacyTyped", type: "uint8", conformance: "Z" },
                { tag: "field", id: 2, name: "LegacyUntyped", conformance: "Z" },
                { tag: "field", id: 3, name: "Forbidden", type: "uint8", conformance: "X" },
            ],
        });
        const cluster = new ClusterModel({ id: 0xfff1_fc11, name: "ObsoleteFields" }, struct);
        new MatterModel({}, cluster);
        const file = new ClusterFile(cluster);
        new TlvGenerator(file).defineDatatype(struct);
        return file.toString();
    }

    it("keeps an obsolete field that states a type (characterization)", () => {
        expect(structSource()).contains("legacyTyped: TlvOptionalField(1,");
    });

    it("skips an obsolete field without a type", () => {
        expect(structSource()).not.contains("legacyUntyped");
    });

    it("skips a disallowed field (characterization)", () => {
        expect(structSource()).not.contains("forbidden");
    });

    it("marks an obsolete field deprecated", () => {
        expect(structSource()).contains(
            "TlvUInt8),\n\n    /**\n     * @deprecated Obsolete; a server must not implement it\n     */\n    legacyTyped:",
        );
    });

    it("keeps a struct with only a typed obsolete field non-empty (characterization)", () => {
        const { struct } = structOf(FieldElement({ id: 1, name: "LegacyTyped", type: "uint8", conformance: "Z" }));
        expect(TypeGenerator.isEmpty(struct)).false;
    });

    it("leaves a struct with only an untyped obsolete field empty", () => {
        const { struct } = structOf(FieldElement({ id: 1, name: "LegacyUntyped", conformance: "Z" }));
        expect(TypeGenerator.isEmpty(struct)).true;
    });

    function componentSource() {
        const { cluster } = structOf(
            FieldElement({ id: 1, name: "LegacyTyped", type: "uint8", conformance: "Z" }),
            FieldElement({ id: 2, name: "LegacyUntyped", conformance: "Z" }),
        );
        const file = new ClusterFile(cluster);
        new ComponentGenerator(file).generateTypes();
        return file.toString();
    }

    it("generates a typed obsolete field into the component class (characterization)", () => {
        expect(componentSource()).contains("legacyTyped?: number");
    });

    it("skips an untyped obsolete field in the component class", () => {
        expect(componentSource()).not.contains("legacyUntyped");
    });
});
