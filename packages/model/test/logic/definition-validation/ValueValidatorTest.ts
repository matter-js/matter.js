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
    int64,
    bool,
    double,
    enum8,
    percent,
    percent100ths,
    single,
    uint8,
    duration,
    map8,
    uint16,
    uint24,
    uint56,
    string,
    struct,
    uint64,
    ValidateModel,
} from "#index.js";
import { AttributeModel, ClusterModel, DatatypeModel, FieldModel, MatterModel } from "#models/index.js";
import { Seconds } from "@matter/general";

const CODES = new Set([
    "UNIT_WITHOUT_SCALE",
    "FRACTION_ON_INTEGER_TYPE",
    "NEGATIVE_ON_UNSIGNED_TYPE",
    "VALUE_EXCEEDS_TYPE",
    "INVALID_VALUE",
]);

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

function modelWithDefault(type: string, dflt: FieldValue) {
    return new MatterModel(
        {},
        uint8.clone(),
        uint16.clone(),
        uint64.clone(),
        uint56.clone(),
        uint24.clone(),
        int64.clone(),
        map8.clone(),
        int8.clone(),
        percent100ths.clone(),
        string.clone(),
        struct.clone(),
        duration.clone(),
        bool.clone(),
        new DatatypeModel({ name: "UnsignedTemperature", type: "uint8" }),
        new ClusterModel({ name: "Test", id: 0xfff1 }, Attribute({ name: "Bounded", id: 1, type, default: dflt })),
    );
}

function validateDefault(type: string, dflt: FieldValue) {
    return ValidateModel(modelWithDefault(type, dflt)).errors.filter(e => CODES.has(e.code));
}

/** Validation of a final model, which is frozen and so cannot be normalized */
function validateFinalDefault(type: string, dflt: FieldValue) {
    const model = modelWithDefault(type, dflt);
    model.finalize();

    return {
        errors: ValidateModel(model).errors,
        default: model.get(ClusterModel, "Test")?.get(AttributeModel, "Bounded")?.default,
    };
}

/** Every error validation reports, not only those of the numeric rules */
function allErrors(type: string, dflt: FieldValue) {
    return ValidateModel(modelWithDefault(type, dflt)).errors;
}

/** A default naming a sibling field, which normalization turns into a reference to it */
function modelWithReferenceDefault() {
    return new MatterModel(
        {},
        uint8.clone(),
        new ClusterModel(
            { name: "Test", id: 0xfff1 },
            Attribute({ name: "Bounded", id: 1, type: "uint8", default: "Other" }),
            Attribute({ name: "Other", id: 2, type: "uint8" }),
        ),
    );
}

/** A default naming a cluster attribute, which the struct that carries the default does not shadow */
function modelWithClusterReferenceDefault() {
    return new MatterModel(
        {},
        uint8.clone(),
        struct.clone(),
        new ClusterModel(
            { name: "Test", id: 0xfff1 },
            Attribute({ name: "Limit", id: 1, type: "uint8" }),
            new DatatypeModel(
                { name: "Holder", type: "struct" },
                FieldElement({ name: "Bounded", type: "uint8", default: "Limit" }),
            ),
        ),
    );
}

/** A member whose type resolves only once its name is corrected to the case its definition uses */
function modelWithCaseMismatch() {
    return new MatterModel(
        {},
        uint8.clone(),
        new ClusterModel({ name: "Base", id: 0xfff0 }, Attribute({ name: "Foo", id: 1, type: "uint8" })),
        new ClusterModel({ name: "Derived", id: 0xfff1, type: "Base" }, Attribute({ name: "foo", id: 1 })),
    );
}

function validate(model: MatterModel, final: boolean) {
    if (final) {
        model.finalize();
    }
    return ValidateModel(model).errors;
}

/** The default validation leaves on the model, which is the value generation then emits */
function normalizedDefault(type: string, dflt: FieldValue) {
    const model = modelWithDefault(type, dflt);
    ValidateModel(model);
    return model.get(ClusterModel, "Test")?.get(AttributeModel, "Bounded")?.default;
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
        int64.clone(),
        uint64.clone(),
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

        it("accepts zero at any exponent", () => {
            for (const text of ["0e-2", "0.0e-5", "-0.0"]) {
                expect(validateDefault("uint16", text)).deep.equals([]);
            }
        });

        // Building the digits of "1e1000000000" would allocate a gigabyte of them
        it("rejects an exponent no type could be that wide", () => {
            const errors = validateDefault("uint16", "1e1000000000");

            expect(errors.length).equals(1);
            expect(errors[0].code).equals("INVALID_VALUE");
        });

        // Snapped to zero it would read as neither a fraction nor a negative
        it("reports a scaled value that merely lands near zero", () => {
            const errors = validateDefault("percent100ths", { type: "percent", value: -1e-18 });

            expect(errors.map(error => error.code)).contains("FRACTION_ON_INTEGER_TYPE");
        });

        // These state integers, and the same cast reads command line arguments
        it("accepts notation stating an integer exactly", () => {
            for (const text of ["5.0", "1e3", "18446744073709551615"]) {
                expect(validateDefault("uint64", text)).deep.equals([]);
            }

            expect(validateDefault("int8", "-5.0")).deep.equals([]);

            // Notation stating a fraction is refused by the cast, whatever the sign of the type
            expect(validateDefault("int8", "-5.5").map(error => error.code)).deep.equals(["INVALID_VALUE"]);
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

        it("accepts a duration stated as a number of milliseconds or as text", () => {
            expect(validateDefault("duration", Seconds(2))).deep.equals([]);
            expect(validateDefault("duration", "2s")).deep.equals([]);
            expect(validateDefault("duration", "nonsense").map(error => error.code)).deep.equals(["INVALID_VALUE"]);
        });

        it("rejects a bound the type is too narrow to hold", () => {
            const errors = validateConstraint("uint8", "0 to 300");

            expect(errors.length).equals(1);
            expect(errors[0].code).equals("VALUE_EXCEEDS_TYPE");
            expect(errors[0].message).equals("300 is outside the range 0 to 255 of uint8");
        });

        it("accepts the widest value a type holds", () => {
            expect(validateConstraint("uint8", "0 to 255")).deep.equals([]);
            expect(validateConstraint("int8", "-128 to 127")).deep.equals([]);
            expect(validateConstraint("uint16", "0 to 65535")).deep.equals([]);
        });

        // A signed type holds half the magnitude of the unsigned type of the same width
        it("rejects a bound above the most a signed type holds", () => {
            expect(validateConstraint("int8", "0 to 200").map(error => error.code)).deep.equals(["VALUE_EXCEEDS_TYPE"]);
            expect(validateConstraint("int8", "0 to 127")).deep.equals([]);
        });

        it("judges a width the specification uses for a byte count", () => {
            expect(validateDefault("uint24", 16777215)).deep.equals([]);
            expect(validateDefault("uint24", 16777216).map(error => error.code)).deep.equals(["VALUE_EXCEEDS_TYPE"]);
        });

        it("accepts the least a 64 bit signed type holds", () => {
            expect(validateDefault("int64", -9223372036854775808n)).deep.equals([]);
        });

        // A bitmap resolves to its integer type by name rather than by derivation, so it is its own path
        it("rejects a value wider than the type a bitmap encodes to", () => {
            expect(validateDefault("map8", 300).map(error => error.code)).deep.equals(["VALUE_EXCEEDS_TYPE"]);
        });

        it("rejects a bound the entry of a list is too narrow to hold", () => {
            const errors = validateList("uint8", "max 4[0 to 300]");

            expect(errors.length).equals(1);
            expect(errors[0].code).equals("VALUE_EXCEEDS_TYPE");
            expect(errors[0].message).equals("300 is outside the range 0 to 255 of uint8");
        });

        it("rejects a bound below the least a signed type holds", () => {
            expect(validateConstraint("int8", "-129 to 0").map(error => error.code)).deep.equals([
                "VALUE_EXCEEDS_TYPE",
            ]);
        });

        // The sign is the fault a reader acts on; the magnitude adds nothing
        it("reports a negative on an unsigned type as a negative alone", () => {
            expect(validateConstraint("uint16", "-1 to 100").map(error => error.code)).deep.equals([
                "NEGATIVE_ON_UNSIGNED_TYPE",
            ]);
        });

        // An enum or bitmap is judged by the integer type carrying it
        it("rejects a value wider than the type an enum encodes to", () => {
            expect(validateEnumDefault(300).map(error => error.code)).deep.equals(["VALUE_EXCEEDS_TYPE"]);
        });

        it("judges a default by the width of its type", () => {
            expect(validateDefault("uint8", 255)).deep.equals([]);
            expect(validateDefault("uint8", 256).map(error => error.code)).deep.equals(["VALUE_EXCEEDS_TYPE"]);
            expect(validateDefault("uint64", 18446744073709551615n)).deep.equals([]);
            expect(validateDefault("uint64", 18446744073709551617n).map(error => error.code)).deep.equals([
                "VALUE_EXCEEDS_TYPE",
            ]);
        });

        // A bound keeps its magnitude exactly, so a type's own range is judged and admitted
        it("accepts the range a 56 or 64 bit type states for itself", () => {
            expect(validateConstraint("uint64", "max 18446744073709551615")).deep.equals([]);
            expect(validateConstraint("int64", "-9223372036854775808 to 9223372036854775807")).deep.equals([]);

            // A magnitude stated as a bigint keeps its exact form, so the width judges it
            for (const [type, dflt] of [
                ["uint64", 18446744073709551616n],
                ["int64", 9223372036854775808n],
                ["uint56", 72057594037927936n],
            ] as [string, FieldValue][]) {
                expect(
                    validateDefault(type, dflt).map(error => error.code),
                    `${type} ${dflt}`,
                ).deep.equals(["VALUE_EXCEEDS_TYPE"]);
            }
        });

        // A number states its magnitude as it arrived, having lost whatever it lost, so a wide type cannot tell one
        // from the bound it exceeds — but a magnitude no rounding explains is still refused
        it("judges a magnitude a number states only as what it rounded to", () => {
            expect(validateDefault("uint64", 18446744073709551616)).deep.equals([]);
            expect(validateDefault("uint64", 1e100).map(error => error.code)).deep.equals(["VALUE_EXCEEDS_TYPE"]);
        });

        // A narrow type holds none of a magnitude that large, so the precision it lost changes nothing
        it("rejects a magnitude no narrow type could hold", () => {
            expect(validateConstraint("uint8", "max 99999999999999999999999999").map(error => error.code)).deep.equals([
                "VALUE_EXCEEDS_TYPE",
            ]);
        });

        // A default states its magnitude as text, which the cast reads exactly
        it("accepts the largest magnitude a 64 bit type holds", () => {
            expect(validateDefault("uint64", "18446744073709551615")).deep.equals([]);
        });

        // A bound the specification computes stays an expression, and the rules read numbers.  Judging what an
        // expression amounts to belongs to Constraint, which alone knows what one means
        it("does not judge a bound stated as an expression", () => {
            expect(validateConstraint("uint8", "max 2^16")).deep.equals([]);
        });

        it("accepts a fraction the unit scales to a whole number", () => {
            expect(validateConstraint("percent100ths", "min 0.01%")).deep.equals([]);
        });
    });

    // An override states no value to remove a default the specification states
    describe("a default of no value", () => {
        it("leaves no default on a type no scalar could state", () => {
            expect(validateDefault("struct", FieldValue.None)).deep.equals([]);
            expect(normalizedDefault("struct", FieldValue.None)).undefined;
        });

        it("leaves no default on a scalar type", () => {
            expect(validateDefault("uint16", FieldValue.None)).deep.equals([]);
            expect(normalizedDefault("uint16", FieldValue.None)).undefined;
        });

        // Casting it to the type would state a value of that type: "[object Object]" on a string, true on a boolean
        it("leaves no default on a type that could render it", () => {
            for (const type of ["string", "bool"]) {
                expect(validateDefault(type, FieldValue.None)).deep.equals([]);
                expect(normalizedDefault(type, FieldValue.None)).undefined;
            }
        });
    });

    describe("a final model", () => {
        it("reports what the same model reports unfrozen", () => {
            for (const [type, dflt] of [
                ["uint16", "5"],
                ["uint16", "-1"],
                ["uint16", 0.01],
                ["struct", "0"],
                ["string", "empty"],
                ["UnsignedTemperature", "25.5°C"],
                ["percent100ths", { type: "percent", value: 0.01 }],
            ] as [string, FieldValue][]) {
                expect(validateFinalDefault(type, dflt).errors).deep.equals(allErrors(type, dflt));
            }
        });

        it("leaves the default it cannot normalize as stated", () => {
            expect(validateFinalDefault("uint16", "5").default).equals("5");
            expect(normalizedDefault("uint16", "5")).equals(5);

            // The specification's way of stating that a string has no default
            expect(validateFinalDefault("string", "empty").default).equals("empty");
            expect(normalizedDefault("string", "empty")).undefined;
        });

        it("leaves a default naming a sibling as the name it states", () => {
            const final = modelWithReferenceDefault();
            expect(validate(final, true)).deep.equals(validate(modelWithReferenceDefault(), false));
            expect(final.get(ClusterModel, "Test")?.get(AttributeModel, "Bounded")?.default).equals("Other");

            const normalized = modelWithReferenceDefault();
            ValidateModel(normalized);
            expect(normalized.get(ClusterModel, "Test")?.get(AttributeModel, "Bounded")?.default).deep.equals(
                FieldValue.Reference("Other"),
            );
        });

        it("leaves a default naming a cluster member as the name it states", () => {
            const final = modelWithClusterReferenceDefault();
            expect(validate(final, true)).deep.equals(validate(modelWithClusterReferenceDefault(), false));

            const holder = (model: MatterModel) =>
                model.get(ClusterModel, "Test")?.get(DatatypeModel, "Holder")?.get(FieldModel, "Bounded")?.default;
            expect(holder(final)).equals("Limit");

            const normalized = modelWithClusterReferenceDefault();
            ValidateModel(normalized);
            expect(holder(normalized)).deep.equals(FieldValue.Reference("Limit"));
        });

        // Correcting the case is a write, so a final model reports the type as absent instead of resolving it
        it("reports a type it cannot correct the case of", () => {
            const final = modelWithCaseMismatch();
            expect(validate(final, true).map(error => error.code)).deep.equals(["NO_TYPE"]);
            expect(final.get(ClusterModel, "Derived")?.get(AttributeModel, "foo")?.name).equals("foo");

            const corrected = modelWithCaseMismatch();
            expect(validate(corrected, false)).deep.equals([]);
            expect(corrected.get(ClusterModel, "Derived")?.get(AttributeModel, "Foo")?.effectiveType).equals("Foo");
        });

        // Characterization: a cross-reference redundant with the parent's survives validation, final or not.  The
        // generator drops these itself
        it("keeps a cross-reference redundant with its parent", () => {
            const xref = { document: "cluster", section: "1.2.3" } as const;
            const build = () =>
                new MatterModel(
                    {},
                    uint8.clone(),
                    new ClusterModel(
                        { name: "Test", id: 0xfff1, xref },
                        Attribute({ name: "Bounded", id: 1, type: "uint8", xref }),
                    ),
                );

            for (const final of [true, false]) {
                const model = build();
                expect(() => validate(model, final)).not.throws();
                expect(model.get(ClusterModel, "Test")?.get(AttributeModel, "Bounded")?.xref?.section).equals("1.2.3");
            }
        });
    });

    describe("a rejected default", () => {
        it("names the value and the type it rejects", () => {
            const errors = validateDefault("struct", "0");

            expect(errors.length).equals(1);
            expect(errors[0].code).equals("INVALID_VALUE");
            expect(errors[0].message).equals('Default value "0" is not a valid object for type struct');
        });

        it("names a value stated with a unit", () => {
            const errors = validateDefault("struct", { type: "percent", value: 0.01 });

            expect(errors.map(error => error.message)).contains(
                'Default value "0.01%" is not a valid object for type struct',
            );
        });

        it("names a value stating properties", () => {
            const errors = validateDefault("uint16", { type: FieldValue.properties, properties: { a: 1 } });

            expect(errors.map(error => error.message)).contains(
                'Default value "{ a: 1 }" is not a valid integer for type uint16',
            );
        });
    });
});
