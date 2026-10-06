/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import {
    FieldElement,
    FieldValue,
    MandatoryDefaultValue,
    Scope,
    SelectDefaultValue,
    StoredDefaultValue,
} from "#index.js";
import { DatatypeModel, FieldModel } from "#models/index.js";

function memberFor(definition: Parameters<typeof FieldElement>[0] & { children?: FieldElement[] }) {
    const parent = new DatatypeModel(
        { name: "Parent", type: "struct" },
        FieldElement({ conformance: "M", ...definition }),
    );
    const scope = Scope(parent);
    return { scope, member: parent.children[0] as FieldModel };
}

describe("MandatoryDefaultValue", () => {
    it("computes the specification fallback per metatype", () => {
        for (const [type, expected] of [
            ["uint8", 0],
            ["bool", false],
            ["string", ""],
            ["list", []],
        ] as const) {
            const { scope, member } = memberFor({ name: "Field", type });
            expect(MandatoryDefaultValue(scope, member)).deep.equals(expected);
        }
    });

    it("computes an empty byte string", () => {
        const { scope, member } = memberFor({ name: "Field", type: "octstr" });
        expect(MandatoryDefaultValue(scope, member)).deep.equals(new Uint8Array());
    });

    it("computes the analog zero for time types, which derive from integers", () => {
        for (const type of ["epoch-s", "systime-ms", "elapsed-s"]) {
            const { scope, member } = memberFor({ name: "Field", type });
            expect(MandatoryDefaultValue(scope, member)).equals(0);
        }
    });

    it("computes no value for an enum, whose fallback is manufacturer-specific", () => {
        const { scope, member } = memberFor({ name: "Field", type: "enum8" });
        expect(MandatoryDefaultValue(scope, member)).undefined;
    });

    it("computes null for a nullable member", () => {
        const { scope, member } = memberFor({ name: "Field", type: "uint8", quality: "X" });
        expect(MandatoryDefaultValue(scope, member)).null;
    });

    it("computes an empty bitmap and decodes an explicit bitmap default", () => {
        const plain = memberFor({
            name: "Field",
            type: "map8",
            children: [FieldElement({ name: "Flag", constraint: "0" })],
        });
        expect(MandatoryDefaultValue(plain.scope, plain.member)).deep.equals({});

        const explicit = memberFor({
            name: "Field",
            type: "map8",
            default: 1,
            children: [FieldElement({ name: "Flag", constraint: "0" })],
        });
        expect(MandatoryDefaultValue(explicit.scope, explicit.member)).deep.equals({ flag: true });
    });

    it("composites a struct from its mandatory members only", () => {
        const { scope, member } = memberFor({
            name: "Field",
            type: "struct",
            children: [
                FieldElement({ name: "Req", type: "uint8", conformance: "M" }),
                FieldElement({ name: "Opt", type: "uint8", conformance: "O" }),
            ],
        });
        expect(MandatoryDefaultValue(scope, member)).deep.equals({ req: 0 });
    });

    it("computes no value for an optional member", () => {
        const parent = new DatatypeModel(
            { name: "Parent", type: "struct" },
            FieldElement({ name: "Field", type: "uint8", conformance: "O" }),
        );
        const scope = Scope(parent);
        expect(MandatoryDefaultValue(scope, parent.children[0] as FieldModel)).undefined;
    });
});

describe("SelectDefaultValue", () => {
    // The shallow variant used for server state seeding: a struct reads a placeholder rather than a composited
    // default, and members are gated on operational support rather than pure mandatoriness
    it("selects a shallow placeholder for a struct", () => {
        const { scope, member } = memberFor({
            name: "Field",
            type: "struct",
            children: [FieldElement({ name: "Req", type: "uint8", conformance: "M" })],
        });
        expect(SelectDefaultValue(scope, member)).deep.equals({});
    });

    it("selects no value for an unsupported member", () => {
        const parent = new DatatypeModel(
            { name: "Parent", type: "struct" },
            FieldElement({ name: "Field", type: "uint8", conformance: "O" }),
        );
        const scope = Scope(parent);
        expect(SelectDefaultValue(scope, parent.children[0] as FieldModel)).undefined;
    });
});

// A model that was never validated, such as a schema handed to withClusters, still carries the marker
describe("the no value marker", () => {
    it("stores no value for a boolean", () => {
        const { scope, member } = memberFor({ name: "Field", type: "bool", default: FieldValue.None });
        expect(StoredDefaultValue(scope, member)).equals(undefined);
    });

    it("stores no value for a list, where no default would be an empty list", () => {
        const { scope, member } = memberFor({ name: "Field", type: "list", default: FieldValue.None });
        expect(StoredDefaultValue(scope, member)).equals(undefined);
    });

    it("falls back to null for a mandatory nullable struct rather than to its members' defaults", () => {
        const { scope, member } = memberFor({
            name: "Field",
            type: "struct",
            quality: "X",
            default: FieldValue.None,
            children: [FieldElement({ name: "Flag", type: "bool", conformance: "M", default: true })],
        });
        expect(MandatoryDefaultValue(scope, member)).equals(null);
    });

    it("falls back to the specification default for a mandatory boolean", () => {
        const { scope, member } = memberFor({ name: "Field", type: "bool", default: FieldValue.None });
        expect(MandatoryDefaultValue(scope, member)).equals(false);
    });
});
