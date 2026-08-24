/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { FieldValue } from "#common/index.js";
import { AttributeElement as Attribute, double, percent100ths, single, uint8, uint16 } from "#index.js";
import { DefaultValue } from "#logic/DefaultValue.js";
import { Scope } from "#logic/Scope.js";
import { ClusterModel, DatatypeModel, MatterModel } from "#models/index.js";

function defaultOf(type: string, dflt: FieldValue) {
    const Matter = new MatterModel(
        {},
        uint8.clone(),
        uint16.clone(),
        percent100ths.clone(),
        single.clone(),
        double.clone(),

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

    // Counting units is a binary multiplication that lands beside the integer it counts, so a value scaled into an
    // integer encoding is snapped to it.  On a floating point type the fraction is the value and snapping loses it
    it("keeps the fraction of a floating point default", () => {
        expect(defaultOf("double", 1e-16)).equal(1e-16);
        expect(defaultOf("double", 1.0000000000000002)).equal(1.0000000000000002);
        expect(defaultOf("single", 0.1)).equal(0.1);
    });

    it("leaves a value with no unit alone", () => {
        expect(defaultOf("uint8", 5)).equal(5);
    });
});
