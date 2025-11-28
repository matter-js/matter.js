/**
 * @license
 * Copyright 2022-2025 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { FieldElement } from "#model";
import { ConformanceError } from "#protocol";
import { EnumValueConformanceError, UnknownEnumValueError } from "@matter/protocol";
import { Features, Fields, Tests, testValidation } from "./validation-test-utils.js";

function missing(conformance: string, fieldName = "test") {
    return {
        type: ConformanceError,
        message: `Validating Test.${fieldName}: Conformance "${conformance}": Matter requires you to set this attribute`,
    };
}

function disallowed(conformance: string, fieldName = "test") {
    return {
        type: ConformanceError,
        message: `Validating Test.${fieldName}: Conformance "${conformance}": Matter does not allow you to set this attribute`,
    };
}

function disallowedEnum(conformance: string, name: string, value: number) {
    return {
        type: EnumValueConformanceError,
        message: `Validating Test.test: Conformance "${conformance}": Matter does not allow enum value ${name} (ID ${value}) here`,
    };
}

function undefinedEnum(name: string, value: number) {
    return {
        type: UnknownEnumValueError,
        message: `Validating Test.test: Matter does not define the enum value ${value} for ${name}`,
    };
}

const AllTests = Tests({
    conformance: Tests({
        base: Tests({
            mandatory: Tests(Fields({ conformance: "M" }), {
                accepts: {
                    record: { test: 1234 },
                },

                requires: { error: missing("M") },
            }),

            optional: Tests(Fields({ conformance: "O" }), {
                accepts: {
                    record: { test: 1234 },
                },

                "allows omission": {},
            }),

            mandatoryNullable: Tests(Fields({ conformance: "M", quality: "X" }), {
                accepts: {
                    record: { test: 1234 },
                },

                "allows ommission": {},
            }),
        }),

        feature: Tests(Features({ F: "Foo" }), {
            mandatory: Tests(Fields({ conformance: "F" }), {
                "allows if enabled": {
                    supports: ["foo"],
                    record: { test: 1234 },
                },

                "requires if enabled": {
                    supports: ["foo"],
                    error: missing("F"),
                },

                "disallows if disabled": {
                    record: { test: 1234 },
                    error: disallowed("F"),
                },

                "allows omission if disabled": {},
            }),

            optional: Tests(Fields({ conformance: "[F]" }), {
                "allows if enabled": {
                    supports: ["foo"],
                    record: { test: 1234 },
                },

                "allows omission if enabled": {
                    supports: ["foo"],
                },

                "disallows if disabled": {
                    record: { test: 1234 },
                    error: disallowed("[F]"),
                },

                "allows omission if disabled": {},
            }),

            "negated mandatory": Tests(Fields({ conformance: "!F" }), {
                "allows if disabled": {
                    record: { test: 1234 },
                },

                "requires if disabled": {
                    error: missing("!F"),
                },

                "disallows if enabled": {
                    supports: ["foo"],
                    record: { test: 1234 },
                    error: disallowed("!F"),
                },

                "allows omission if enabled": {
                    supports: ["foo"],
                },
            }),

            "negated optional": Tests(Fields({ conformance: "[!F]" }), {
                "allows if disabled": {
                    record: { test: 1234 },
                },

                "allows omission if disabled": {},

                "disallows if enabled": {
                    supports: ["foo"],
                    record: { test: 1234 },
                    error: disallowed("[!F]"),
                },

                "allows omission if enabled": {
                    supports: ["foo"],
                },
            }),
        }),

        "binary logical feature": Tests(Features({ F: "Foo", B: "Bar" }), {
            disjunction: Tests({
                mandatory: Tests(Fields({ conformance: "F | B" }), {
                    "allows if enabled (LHS)": {
                        supports: ["foo"],
                        record: { test: 1234 },
                    },

                    "allows if enabled (RHS)": {
                        supports: ["bar"],
                        record: { test: 1234 },
                    },

                    "disallows if disabled": {
                        record: { test: 1234 },
                        error: disallowed("F | B"),
                    },

                    "allows omission if disabled": {},
                }),

                optional: Tests(Fields({ conformance: "[F | B]" }), {
                    "allows if enabled (LHS)": {
                        supports: ["foo"],
                        record: { test: 1234 },
                    },

                    "allows if enabled (RHS)": {
                        supports: ["bar"],
                        record: { test: 1234 },
                    },

                    "allows omission if enabled (LHS)": {
                        supports: ["foo"],
                    },

                    "allows omission if enabled (RHS)": {
                        supports: ["bar"],
                    },

                    "disallows if disabled": {
                        record: { test: 1234 },
                        error: disallowed("[F | B]"),
                    },

                    "allows omission if disabled": {},
                }),
            }),

            conjunction: Tests({
                mandatory: Tests(Fields({ conformance: "F & B" }), {
                    "allows if enabled": {
                        supports: ["foo", "bar"],
                        record: { test: 1234 },
                    },

                    "requires if enabled": {
                        supports: ["foo", "bar"],
                        error: missing("F & B"),
                    },

                    "disallows if disabled": {
                        record: { test: 1234 },
                        error: disallowed("F & B"),
                    },

                    "disallows if disabled (LHS enabled)": {
                        supports: ["foo"],
                        record: { test: 1234 },
                        error: disallowed("F & B"),
                    },

                    "disallows if disabled (RHS enabled)": {
                        supports: ["bar"],
                        record: { test: 1234 },
                        error: disallowed("F & B"),
                    },

                    "allows omission if disabled": {},

                    "allows omission if disabled (LHS enabled)": {
                        supports: ["foo"],
                    },

                    "allows omission if disabled (RHS enabled)": {
                        supports: ["bar"],
                    },
                }),

                optional: Tests(Fields({ conformance: "[F & B]" }), {
                    "allows if enabled": {
                        supports: ["foo", "bar"],
                        record: { test: 1234 },
                    },

                    "allows omission if enabled": {
                        supports: ["foo", "bar"],
                    },

                    "disallows if disabled": {
                        record: { test: 1234 },
                        error: disallowed("[F & B]"),
                    },

                    "disallows if disabled (LHS enabled)": {
                        supports: ["foo"],
                        record: { test: 1234 },
                        error: disallowed("[F & B]"),
                    },

                    "disallows if disabled (RHS enabled)": {
                        supports: ["bar"],
                        record: { test: 1234 },
                        error: disallowed("[F & B]"),
                    },

                    "allows omission if disabled": {},

                    "allows omission if disabled (LHS enabled)": {
                        supports: ["foo"],
                    },

                    "allows omission if disabled (RHS enabled)": {
                        supports: ["bar"],
                    },
                }),
            }),

            "with field": Tests(
                Fields(
                    { name: "Value", type: "uint8" },
                    { name: "ValueIsSet", type: "bool", conformance: "F & Value" },
                    { name: "UnsupportedValueIsSet", type: "bool", conformance: "F & UnsupportedValue" },
                ),
                {
                    "allows if present": {
                        supports: ["foo"],
                        record: { value: 4, valueIsSet: true },
                    },

                    "requires if present": {
                        supports: ["foo"],
                        record: { value: 4 },
                        error: missing("F & Value", "valueIsSet"),
                    },

                    "disallows if not present": {
                        supports: ["foo"],
                        record: { valueIsSet: true },
                        error: disallowed("F & Value", "valueIsSet"),
                    },
                },
            ),
        }),

        "trinary logical feature": Tests(Features({ A: "Aye", B: "Bee", C: "See" }), {
            conjunction: Tests(Fields({ conformance: "A & B & C" }), {
                "allows if enabled": {
                    supports: ["aye", "bee", "see"],
                    record: { test: 1234 },
                },

                "requires if enabled": {
                    supports: ["aye", "bee", "see"],
                    error: missing("A & B & C"),
                },

                "disallows if disabled (RHS & LHS enabled)": {
                    supports: ["aye", "see"],
                    record: { test: 1234 },
                    error: disallowed("A & B & C"),
                },

                "allows omission if disabled (RHS & LHS enabled)": {
                    supports: ["aye", "see"],
                },
            }),

            "disjunction within conjunction": Tests(Fields({ conformance: "A & (B | C)" }), {
                "allows if enabled (disjunction RHS)": {
                    supports: ["aye", "bee"],
                    record: { test: 1234 },
                },

                "allows if enabled (disjunction LHS)": {
                    supports: ["aye", "see"],
                    record: { test: 1234 },
                },

                "requires if enabled (disjunction RHS)": {
                    supports: ["aye", "bee"],
                    error: missing("A & (B | C)"),
                },

                "requires if enabled (disjunction LHS)": {
                    supports: ["aye", "see"],
                    error: missing("A & (B | C)"),
                },

                "disallows if disabled (conjunction LHS)": {
                    supports: ["see"],
                    record: { test: 1234 },
                    error: disallowed("A & (B | C)"),
                },

                "allows omission if disabled (conjunction LHS)": {
                    supports: ["see"],
                },
            }),

            "conjunction within disjunction": Tests(Fields({ conformance: "A | (B & C)" }), {
                "allows if enabled (conjunction LHS)": {
                    supports: ["aye"],
                    record: { test: 1234 },
                },

                "allows if enabled (conjunction RHS)": {
                    supports: ["bee", "see"],
                    record: { test: 1234 },
                },

                "disallows if disabled (conjunction LHS enabled)": {
                    supports: ["bee"],
                    record: { test: 1234 },
                    error: disallowed("A | B & C"),
                },
            }),
        }),

        choice: Tests({
            "exactly one": Tests(Fields({ name: "Test1", conformance: "O.a" }, { name: "Test2", conformance: "O.a" }), {
                "allows one field": {
                    record: { test1: 1234 },
                },

                "requires one field": {
                    error: {
                        type: ConformanceError,
                        message: 'Validating Test: Conformance choice "a": Too few fields present (0 of min 1)',
                    },
                },

                "disallows multiple fields": {
                    record: { test1: 1234, test2: 1234 },
                    error: {
                        type: ConformanceError,
                        message: 'Validating Test: Conformance choice "a": Too many fields present (2 of max 1)',
                    },
                },
            }),

            "exactly two": Tests(
                Fields(
                    { name: "Test1", conformance: "O.a2" },
                    { name: "Test2", conformance: "O.a2" },
                    { name: "Test3", conformance: "O.a2" },
                ),
                {
                    "allows two fields": {
                        record: { test1: 1234, test3: 4321 },
                    },

                    "disallows no fields": {
                        error: {
                            type: ConformanceError,
                            message: 'Validating Test: Conformance choice "a": Too few fields present (0 of min 2)',
                        },
                    },

                    "disallows one field": {
                        record: { test1: 1 },
                        error: {
                            type: ConformanceError,
                            message: 'Validating Test: Conformance choice "a": Too few fields present (1 of min 2)',
                        },
                    },

                    "disallows three fields": {
                        record: { test1: 1, test2: 2, test3: 3 },
                        error: {
                            type: ConformanceError,
                            message: 'Validating Test: Conformance choice "a": Too many fields present (3 of max 2)',
                        },
                    },
                },
            ),

            "one or more": Tests(
                Fields({ name: "Test1", conformance: "O.a+" }, { name: "Test2", conformance: "O.a+" }),
                {
                    "allows one field": {
                        record: { test1: 1234 },
                    },

                    "requires one field": {
                        error: {
                            type: ConformanceError,
                            message: 'Validating Test: Conformance choice "a": Too few fields present (0 of min 1)',
                        },
                    },

                    "allows multiple fields": {
                        record: { test1: 1234, test2: 1234 },
                    },
                },
            ),
        }),

        "enum values": Tests(
            Features({ FT: "Feature" }),
            Fields({
                name: "Test",
                type: "enum8",
                children: [
                    FieldElement({ id: 1, name: "noConformance" }),
                    FieldElement({ id: 2, name: "mandatory", conformance: "M" }),
                    FieldElement({ id: 3, name: "disallowed", conformance: "X" }),
                    FieldElement({ id: 4, name: "ifFeature", conformance: "FT" }),
                ],
            }),

            {
                "allows without conformance": {
                    record: { test: 1 },
                },

                "allows without mandatory": {
                    record: { test: 2 },
                },

                "disallows disallowed": {
                    record: { test: 3 },
                    error: disallowedEnum("X", "disallowed", 3),
                },

                "disallows non-conformant by feature": {
                    record: { test: 4 },
                    error: disallowedEnum("FT", "ifFeature", 4),
                },

                "disallows undefined enum value": {
                    record: { test: 99 },
                    error: undefinedEnum("Test", 99),
                },

                "allows conformant by feature": {
                    supports: ["FT"],
                    record: { test: 4 },
                },
            },
        ),

        comparisons: Tests(
            Fields(
                {
                    name: "Value",
                    type: "uint8",
                },
                {
                    name: "IsGreaterThan",
                    type: "bool",
                    conformance: "Value > 4",
                },
                {
                    name: "IsLessThan",
                    type: "bool",
                    conformance: "Value < 4",
                },
            ),
            {
                "allows if >": {
                    record: { value: 5, isGreaterThan: true },
                },

                "requires if >": {
                    record: { value: 5 },
                    error: missing("Value > 4", "isGreaterThan"),
                },

                "disallows if <": {
                    record: { value: 4, isGreaterThan: true },
                    error: disallowed("Value > 4", "isGreaterThan"),
                },

                "allows if <": {
                    record: { value: 3, isLessThan: true },
                },

                "requires if <": {
                    record: { value: 3 },
                    error: missing("Value < 4", "isLessThan"),
                },

                "disallows if >": {
                    record: { value: 4, isLessThan: true },
                    error: disallowed("Value < 4", "isLessThan"),
                },
            },
        ),

        "optional field dependency": Tests(
            Fields(
                {
                    name: "CurrentArea",
                    type: "uint32",
                    quality: "X",
                    conformance: "desc",
                },
                {
                    name: "EstimatedEndTime",
                    type: "epoch-s",
                    quality: "X",
                    conformance: "[CurrentArea]",
                },
            ),
            {
                "accepts neither": {
                    record: {},
                },

                "accepts CurrentArea without EstimatedEndTime": {
                    record: {
                        currentArea: 4,
                    },
                },

                "accepts CurrentArea as null without EstimatedEndTime": {
                    record: {
                        currentArea: null,
                    },
                },

                "rejects EstimatedEndTime without CurrentArea": {
                    record: {
                        estimatedEndTime: 946684804,
                    },

                    error: {
                        type: ConformanceError,
                        message:
                            'Validating Test.estimatedEndTime: Conformance "[CurrentArea]": Matter does not allow you to set this attribute',
                    },
                },

                "accepts EstimatedEndTime with CurrentArea": {
                    record: {
                        currentArea: 1,
                        estimatedEndTime: 946684804,
                    },
                },

                "accepts EstimatedEndTime with null CurrentArea": {
                    record: {
                        currentArea: null,
                        estimatedEndTime: 946684804,
                    },
                },
            },
        ),

        "hairy real-world": Tests(
            Features({
                PIR: "PIR",
                US: "US",
                PHY: "PHY",
            }),
            Fields(
                {
                    name: "HoldTime",
                    type: "uint16",
                },
                {
                    name: "PirUnoccupiedToOccupiedThreshold",
                    type: "uint8",
                },
                {
                    name: "PirUnoccupiedToOccupiedDelay",
                    type: "uint8",
                    conformance:
                        "HoldTime & (PIR | !PIR & !US & !PHY) & PirUnoccupiedToOccupiedThreshold, [HoldTime & (PIR | !PIR & !US & !PHY)], D",
                },
            ),
            {
                "disallows PirUnoccupiedToOccupiedDelay without HoldTime": {
                    record: { pirUnoccupiedToOccupiedDelay: 4 },
                    error: {
                        type: ConformanceError,
                        message:
                            'Validating Test.pirUnoccupiedToOccupiedDelay: Conformance "HoldTime & (PIR | !PIR & !US & !PHY) & PirUnoccupiedToOccupiedThreshold, [HoldTime & (PIR | !PIR & !US & !PHY)], D": Matter does not allow you to set this attribute',
                    },
                },

                "allows PirUnoccupiedToOccupiedDelay without HoldTime": {
                    record: { holdTime: 4, pirUnoccupiedToOccupiedDelay: 4 },
                },

                "allows neither PirUnoccupiedToOccupiedDelay nor HoldTime": {
                    record: {},
                },
            },
        ),
    }),
});

testValidation("conformance", AllTests);
