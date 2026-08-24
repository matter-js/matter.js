/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { FieldValue } from "#common/index.js";
import { AttributeElement as Attribute, percent100ths, uint8, uint16 } from "#index.js";
import { DefaultValue } from "#logic/DefaultValue.js";
import { Scope } from "#logic/Scope.js";
import { ClusterModel, DatatypeModel, MatterModel } from "#models/index.js";

function defaultOf(type: string, dflt: FieldValue) {
    const Matter = new MatterModel(
        {},
        uint8.clone(),
        uint16.clone(),
        percent100ths.clone(),

        // A type with no scale of its own, deriving from one that has
        new DatatypeModel({ name: "Openness", type: "percent100ths" }),

        new ClusterModel({ name: "Test", id: 0xfff1 }, Attribute({ name: "Extent", id: 1, type, default: dflt })),
    );
    Matter.finalize();

    return DefaultValue(Scope(Matter), Matter.get(ClusterModel, "Test")!.attributes("Extent")!);
}

describe("DefaultValue", () => {
    it("counts the units of the type", () => {
        expect(defaultOf("percent100ths", FieldValue.Percent(0.01))).equal(1);
    });

    // The scale is a property of the type, so it survives a name the conversion does not know of its own
    it("counts the units of the type a default's type derives from", () => {
        expect(defaultOf("Openness", FieldValue.Percent(0.01))).equal(1);
    });

    it("leaves a value with no unit alone", () => {
        expect(defaultOf("uint8", 5)).equal(5);
    });
});
