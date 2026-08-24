/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { FieldValue } from "#common/index.js";
import {
    AttributeElement as Attribute,
    FieldElement,
    int8,
    bool,
    double,
    enum8,
    percent,
    percent100ths,
    single,
    uint8,
    uint16,
    string,
    uint64,
    ValidateModel,
} from "#index.js";
import { ClusterModel, DatatypeModel, MatterModel } from "#models/index.js";

const CODES = new Set(["UNIT_WITHOUT_SCALE", "FRACTION_ON_INTEGER_TYPE", "NEGATIVE_ON_UNSIGNED_TYPE", "INVALID_VALUE"]);

/** A constraint stated on the datatype that names the scale, rather than on a value of that type */
function validateDatatype(constraint: string) {
    const Matter = new MatterModel(
        {},
        uint8.clone(),
        new ClusterModel(
            { name: "Test", id: 0xfff1 },
            new DatatypeModel({ name: "UnsignedTemperature", type: "uint8", constraint }),
        ),
    );
    Matter.finalize();

    return ValidateModel(Matter).errors.filter(e => CODES.has(e.code));
}

/** A list whose entries are of the given type, with a constraint bounding both the list and its entries */
function validateList(entryType: string, constraint: string) {
    const Matter = new MatterModel(
        {},
        uint8.clone(),
        uint16.clone(),
        new ClusterModel(
            { name: "Test", id: 0xfff1 },
            Attribute(
                { name: "Bounded", id: 1, type: "list", constraint },
                FieldElement({ name: "entry", type: entryType }),
            ),
        ),
    );
    Matter.finalize();

    return ValidateModel(Matter).errors.filter(e => CODES.has(e.code));
}

function validateDefault(type: string, dflt: FieldValue) {
    const Matter = new MatterModel(
        {},
        uint8.clone(),
        uint16.clone(),
        uint64.clone(),
        percent100ths.clone(),
        string.clone(),
        bool.clone(),
        new DatatypeModel({ name: "UnsignedTemperature", type: "uint8" }),
        new ClusterModel({ name: "Test", id: 0xfff1 }, Attribute({ name: "Bounded", id: 1, type, default: dflt })),
    );

    // Not finalized: validation normalizes a default by writing it back, which a finalized model refuses
    return ValidateModel(Matter).errors.filter(e => CODES.has(e.code));
}

/** An enum states no unit, so a percentage default on one has nowhere to go */
function validateEnumDefault(dflt: FieldValue) {
    const Matter = new MatterModel(
        {},
        uint8.clone(),
        enum8.clone(),
        new ClusterModel(
            { name: "Test", id: 0xfff1 },
            Attribute({ name: "Bounded", id: 1, type: "enum8", default: dflt }, FieldElement({ name: "A", id: 0 })),
        ),
    );

    return ValidateModel(Matter).errors.filter(e => CODES.has(e.code));
}

function validateConstraint(type: string, constraint: string) {
    const Matter = new MatterModel(
        {},
        uint8.clone(),
        uint16.clone(),
        int8.clone(),
        percent.clone(),
        percent100ths.clone(),
        single.clone(),
        double.clone(),

        // The scale of a unit comes from the type name, so the test needs a type the conversion knows
        new DatatypeModel({ name: "UnsignedTemperature", type: "uint8" }),

        // A type the conversion has never heard of, deriving from one it knows
        new DatatypeModel({ name: "RoomTemperature", type: "UnsignedTemperature" }),
        new ClusterModel({ name: "Test", id: 0xfff1 }, Attribute({ name: "Bounded", id: 1, type, constraint })),
    );
    Matter.finalize();

    return ValidateModel(Matter).errors.filter(e => CODES.has(e.code));
}

describe("ValueValidator", () => {
    describe("constraint bounds stated in a unit", () => {
        it("accepts a bound the type gives a scale for", () => {
            expect(validateConstraint("UnsignedTemperature", "0°C to 25.5°C")).deep.equals([]);
        });

        it("accepts a bound whose scale comes from the type it derives from", () => {
            expect(validateConstraint("RoomTemperature", "0°C to 25.5°C")).deep.equals([]);
        });

        // The name of a datatype is a type name, so it states a scale for a bound the datatype itself carries
        it("accepts a bound on the datatype that names the scale", () => {
            expect(validateDatatype("0°C to 25.5°C")).deep.equals([]);
        });

        it("accepts a bound with no unit", () => {
            expect(validateConstraint("uint16", "0 to 255")).deep.equals([]);
        });

        // Left in place the bound admits every value as a range, and none as an exact value
        it("reports one error for a constraint whose unit has no scale", () => {
            const errors = validateConstraint("uint16", "0°C to 25.5°C");

            expect(errors.length).equals(1);
            expect(errors[0].code).equals("UNIT_WITHOUT_SCALE");
            expect(errors[0].message).match(/0°C and 25.5°C state a unit that type uint16 gives no scale for/);
        });

        // Only percent and percent100ths state what a percentage means; on any other type it is unscaled
        it("reports a percentage on a type with no scale", () => {
            const errors = validateConstraint("uint16", "min 0.01%");

            expect(errors.length).equals(1);
            expect(errors[0].code).equals("UNIT_WITHOUT_SCALE");
        });

        it("accepts a percentage on the types that state a scale", () => {
            expect(validateConstraint("percent", "0% to 100%")).deep.equals([]);
            expect(validateConstraint("percent100ths", "min 0.01%")).deep.equals([]);
        });
    });

    describe("numbers a type cannot hold", () => {
        it("rejects a fraction on an integer type", () => {
            const errors = validateConstraint("uint16", "0.01 to 100");

            expect(errors.length).equals(1);
            expect(errors[0].code).equals("FRACTION_ON_INTEGER_TYPE");
            expect(errors[0].message).match(/0.01 cannot be held by uint16/);
        });

        it("rejects a negative on an unsigned type", () => {
            const errors = validateConstraint("uint16", "-1 to 100");

            expect(errors.length).equals(1);
            expect(errors[0].code).equals("NEGATIVE_ON_UNSIGNED_TYPE");
        });

        // A default stated as text becomes the value it denotes only once the type is validated
        it("rejects a negative stated as the text of a default", () => {
            const errors = validateDefault("uint16", "-1");

            expect(errors.length).equals(1);
            expect(errors[0].code).equals("NEGATIVE_ON_UNSIGNED_TYPE");
        });

        // A 64 bit value is stated as a bigint, which has no numeric form to convert to
        it("rejects a negative default too large to be a number", () => {
            const errors = validateDefault("uint64", -18446744073709551615n);

            expect(errors.length).equals(1);
            expect(errors[0].code).equals("NEGATIVE_ON_UNSIGNED_TYPE");
        });

        it("accepts the largest value a 64 bit type holds", () => {
            expect(validateDefault("uint64", 18446744073709551615n)).deep.equals([]);
        });

        // Casting a fraction to an integer throws rather than reporting, so the stated value is judged first
        it("reports a fractional default rather than failing to cast it", () => {
            const errors = validateDefault("uint16", 0.01);

            expect(errors.length).equals(1);
            expect(errors[0].code).equals("FRACTION_ON_INTEGER_TYPE");
        });

        // The guard that stops the integer cast throwing must not make these pass in silence
        it("reports a default that is no number at all", () => {
            for (const dflt of [NaN, Infinity, -Infinity]) {
                const errors = validateDefault("uint16", dflt);

                expect(errors.length).equals(1);
                expect(errors[0].code).equals("INVALID_VALUE");
            }
        });

        it("keeps the magnitude of an integer stated as text", () => {
            expect(validateDefault("uint64", "18446744073709551615")).deep.equals([]);
            expect(validateDefault("uint64", "-18446744073709551615").map(e => e.code)).deep.equals([
                "NEGATIVE_ON_UNSIGNED_TYPE",
            ]);
        });

        // An operand of an arithmetic bound is a scalar of the expression, not a value the type must hold
        // A bound computed from constants states a number; one computed from another value states none
        it("judges a bound computed from constants", () => {
            const errors = validateConstraint("uint16", "max 1 / 2");

            expect(errors.length).equals(1);
            expect(errors[0].code).equals("FRACTION_ON_INTEGER_TYPE");
        });

        it("accepts a scalar operand a type could not hold", () => {
            expect(validateConstraint("uint16", "max Other * 0.5")).deep.equals([]);
            expect(validateConstraint("uint16", "max Other / 2")).deep.equals([]);
        });

        // The specification states a unit-bearing default as text; the cast turns it into the value its unit denotes,
        // so the digits alone must not be judged
        it("accepts a unit-bearing default stated as text", () => {
            expect(validateDefault("UnsignedTemperature", "25.5°C")).deep.equals([]);
            expect(validateDefault("percent100ths", "0.01%")).deep.equals([]);
        });

        // Dropping the tail of "1e-3" leaves 1, which is a value the specification never stated
        it("rejects text stating a number no integer form matches", () => {
            for (const text of ["1e-3", "0.01"]) {
                const errors = validateDefault("uint16", text);

                expect(errors.length).equals(1);
                expect(errors[0].code).equals("INVALID_VALUE");
            }
        });

        it("still ignores a trailing remark the specification adds", () => {
            expect(validateDefault("uint16", "12 (deprecated)")).deep.equals([]);
        });

        // The cast drops a unit it cannot place, so the stated default is kept to notice it went
        it("reports a unit-bearing default the cast discards", () => {
            const errors = validateEnumDefault({ type: "percent", value: 0.01 });

            expect(errors.length).equals(1);
            expect(errors[0].code).equals("UNIT_WITHOUT_SCALE");
        });

        // The cast renders a unit it cannot scale as the type it could not scale to, leaving no unit to notice
        it("reports a unit-bearing default the cast renders as another type", () => {
            for (const type of ["string", "bool"]) {
                const errors = validateDefault(type, { type: "percent", value: 0.01 });

                expect(errors.length).equals(1);
                expect(errors[0].code).equals("UNIT_WITHOUT_SCALE");
            }
        });

        it("reports a unit the type does scale only once", () => {
            expect(validateDefault("percent100ths", { type: "percent", value: 0.01 })).deep.equals([]);
        });

        it("accepts a fraction on a floating point type", () => {
            expect(validateConstraint("single", "0.5 to 100")).deep.equals([]);
            expect(validateConstraint("double", "0.5 to 100")).deep.equals([]);
        });

        it("accepts a negative on a signed type", () => {
            expect(validateConstraint("int8", "-1 to 100")).deep.equals([]);
        });

        // The entry constraint of a list bounds the entries, so the entry's type decides what it may state
        it("rejects a fraction on the entry of a list", () => {
            const errors = validateList("uint8", "max 4[0.5]");

            expect(errors.length).equals(1);
            expect(errors[0].code).equals("FRACTION_ON_INTEGER_TYPE");
            expect(errors[0].message).match(/0.5 cannot be held by uint8/);
        });

        it("rejects a negative on the entry of a list", () => {
            const errors = validateList("uint8", "max 4[-1 to 10]");

            expect(errors.length).equals(1);
            expect(errors[0].code).equals("NEGATIVE_ON_UNSIGNED_TYPE");
        });

        it("accepts a whole entry bound on a list whose own bound is whole", () => {
            expect(validateList("uint8", "max 4[0 to 10]")).deep.equals([]);
        });

        it("accepts a fraction the unit scales to a whole number", () => {
            expect(validateConstraint("percent100ths", "min 0.01%")).deep.equals([]);
        });
    });
});
