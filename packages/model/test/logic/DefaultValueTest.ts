/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { FieldValue } from "#common/index.js";
import {
    AttributeElement as Attribute,
    DatatypeElement as Datatype,
    FieldElement as Field,
    bool,
    double,
    list,
    map32,
    map8,
    percent100ths,
    single,
    string,
    uint8,
    uint16,
} from "#index.js";
import { DefaultValue } from "#logic/DefaultValue.js";
import { Scope } from "#logic/Scope.js";
import { ClusterModel, DatatypeModel, MatterModel } from "#models/index.js";

function defaultOf(type: string, dflt: FieldValue) {
    const Matter = new MatterModel(
        {},
        uint8.clone(),
        uint16.clone(),
        bool.clone(),
        string.clone(),
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

    // A model that was never validated, such as a schema handed to withClusters, still carries the marker
    describe("the no value marker", () => {
        for (const type of ["bool", "string"]) {
            it(`is no default for ${type}`, () => {
                expect(defaultOf(type, FieldValue.None)).equal(undefined);
            });
        }
    });

    describe("list with no default", () => {
        function listDefaultOf(constraint?: string) {
            const Matter = new MatterModel(
                {},
                uint8.clone(),
                list.clone(),
                new ClusterModel(
                    { name: "Test", id: 0xfff1 },
                    Datatype({ name: "Readings", type: "list", constraint }, Field({ name: "entry", type: "uint8" })),
                    Attribute({ name: "History", id: 1, type: "Readings" }),
                ),
            );
            Matter.finalize();

            const attribute = Matter.get(ClusterModel, "Test")!.attributes("History")!;
            expect(attribute.constraint.min).undefined;
            return DefaultValue(Scope(Matter), attribute);
        }

        it("is empty when its type permits no entries", () => {
            expect(listDefaultOf()).deep.equal([]);
        });

        it("is absent when the type it derives from requires an entry", () => {
            expect(listDefaultOf("min 1")).undefined;
        });
    });

    describe("bitmap", () => {
        function bitmapDefaultOf(...members: { constraint: string; default: number }[]) {
            const Matter = new MatterModel(
                {},
                map8.clone(),
                map32.clone(),
                new ClusterModel(
                    { name: "Test", id: 0xfff1 },
                    Datatype(
                        { name: "Flags", type: "map32" },
                        ...members.map((member, index) => Field({ name: `Member${index}`, ...member })),
                    ),
                    Attribute({ name: "Flags", id: 1, type: "Flags" }),
                ),
            );
            Matter.finalize();

            return DefaultValue(Scope(Matter), Matter.get(ClusterModel, "Test")!.attributes("Flags")!);
        }

        it("places a single-bit member at its bit", () => {
            expect(bitmapDefaultOf({ constraint: "0", default: 1 })).equal(0b1);
        });

        it("places every bit of a multi-bit member, its last bit included", () => {
            expect(bitmapDefaultOf({ constraint: "0", default: 1 }, { constraint: "1 to 2", default: 3 })).equal(0b111);
        });

        it("places a member with no upper bound from its lowest bit", () => {
            expect(bitmapDefaultOf({ constraint: "min 4", default: 3 })).equal(0b110000);
        });

        it("keeps bit 31 a bit, not a sign", () => {
            expect(bitmapDefaultOf({ constraint: "0 to 31", default: 2 ** 31 })).equal(2 ** 31);
        });
    });
});
