/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { LocalActorContext } from "#behavior/context/server/LocalActorContext.js";
import { RootSupervisor } from "#behavior/supervision/RootSupervisor.js";
import {
    AttributeModel,
    ClusterModel,
    CommandModel,
    DataModelPath,
    FeatureMap,
    FieldElement,
    FieldModel,
} from "@matter/model";
import { ConformanceError, EnumValueConformanceError, UnknownEnumValueError } from "@matter/protocol";
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

            "two or more": Tests(
                Fields(
                    { name: "Test1", conformance: "O.a2+" },
                    { name: "Test2", conformance: "O.a2+" },
                    { name: "Test3", conformance: "O.a2+" },
                ),
                {
                    "allows two fields": {
                        record: { test1: 1234, test2: 4321 },
                    },

                    "allows three fields": {
                        record: { test1: 1234, test2: 4321, test3: 1111 },
                    },

                    "disallows no fields": {
                        error: {
                            type: ConformanceError,
                            message: 'Validating Test: Conformance choice "a": Too few fields present (0 of min 2)',
                        },
                    },

                    "disallows one field": {
                        record: { test1: 1234 },
                        error: {
                            type: ConformanceError,
                            message: 'Validating Test: Conformance choice "a": Too few fields present (1 of min 2)',
                        },
                    },
                },
            ),

            "at most one": Tests(
                Fields({ name: "Test1", conformance: "O.a-" }, { name: "Test2", conformance: "O.a-" }),
                {
                    "allows one field": {
                        record: { test1: 1234 },
                    },

                    "allows omission": {},

                    "disallows multiple fields": {
                        record: { test1: 1234, test2: 4321 },
                        error: {
                            type: ConformanceError,
                            message: 'Validating Test: Conformance choice "a": Too many fields present (2 of max 1)',
                        },
                    },
                },
            ),

            "at most two": Tests(
                Fields(
                    { name: "Test1", conformance: "O.a2-" },
                    { name: "Test2", conformance: "O.a2-" },
                    { name: "Test3", conformance: "O.a2-" },
                ),
                {
                    "allows two fields": {
                        record: { test1: 1234, test2: 4321 },
                    },

                    "allows omission": {},

                    "disallows three fields": {
                        record: { test1: 1234, test2: 4321, test3: 1111 },
                        error: {
                            type: ConformanceError,
                            message: 'Validating Test: Conformance choice "a": Too many fields present (3 of max 2)',
                        },
                    },
                },
            ),

            // A choice group whose members are all gated by an unsupported feature must not apply: omission is
            // allowed, a set value is still disallowed, and the "at least one" rule only holds once enabled
            "feature-gated group": Tests(
                Features({ F: "Foo" }),
                Fields({ name: "Test1", conformance: "[F].a+" }, { name: "Test2", conformance: "[F].a+" }),
                {
                    "allows omission if feature disabled": {},

                    "disallows field if feature disabled": {
                        record: { test1: 1234 },
                        error: disallowed("[F].a+", "test1"),
                    },

                    "allows one field if feature enabled": {
                        supports: ["foo"],
                        record: { test1: 1234 },
                    },

                    "requires one field if feature enabled": {
                        supports: ["foo"],
                        error: {
                            type: ConformanceError,
                            message: 'Validating Test: Conformance choice "a": Too few fields present (0 of min 1)',
                        },
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

        "value operators": Tests({
            "not equal": Tests(
                Fields(
                    { name: "Value", type: "uint8" },
                    { name: "Dependent", type: "bool", conformance: "Value != 4" },
                ),
                {
                    "requires if unequal": {
                        record: { value: 5 },
                        error: missing("Value != 4", "dependent"),
                    },

                    "allows if unequal": {
                        record: { value: 5, dependent: true },
                    },

                    "disallows if equal": {
                        record: { value: 4, dependent: true },
                        error: disallowed("Value != 4", "dependent"),
                    },

                    "allows omission if equal": {
                        record: { value: 4 },
                    },
                },
            ),

            "at least": Tests(
                Fields(
                    { name: "Value", type: "uint8" },
                    { name: "Dependent", type: "bool", conformance: "Value >= 4" },
                ),
                {
                    "requires if equal": {
                        record: { value: 4 },
                        error: missing("Value >= 4", "dependent"),
                    },

                    "requires if greater": {
                        record: { value: 5 },
                        error: missing("Value >= 4", "dependent"),
                    },

                    "disallows if less": {
                        record: { value: 3, dependent: true },
                        error: disallowed("Value >= 4", "dependent"),
                    },
                },
            ),

            "at most": Tests(
                Fields(
                    { name: "Value", type: "uint8" },
                    { name: "Dependent", type: "bool", conformance: "Value <= 4" },
                ),
                {
                    "requires if equal": {
                        record: { value: 4 },
                        error: missing("Value <= 4", "dependent"),
                    },

                    "requires if less": {
                        record: { value: 3 },
                        error: missing("Value <= 4", "dependent"),
                    },

                    "disallows if greater": {
                        record: { value: 5, dependent: true },
                        error: disallowed("Value <= 4", "dependent"),
                    },
                },
            ),

            range: Tests(
                Fields(
                    { name: "Value", type: "uint8" },
                    { name: "Dependent", type: "bool", conformance: "Value >= 2 & Value <= 8" },
                ),
                {
                    "requires within range": {
                        record: { value: 5 },
                        error: missing("Value >= 2 & Value <= 8", "dependent"),
                    },

                    "allows within range": {
                        record: { value: 5, dependent: true },
                    },

                    "disallows below range": {
                        record: { value: 1, dependent: true },
                        error: disallowed("Value >= 2 & Value <= 8", "dependent"),
                    },

                    "disallows above range": {
                        record: { value: 9, dependent: true },
                        error: disallowed("Value >= 2 & Value <= 8", "dependent"),
                    },
                },
            ),
        }),

        "exclusive or": Tests(Features({ F: "Foo", B: "Bar" }), {
            mandatory: Tests(Fields({ conformance: "F ^ B" }), {
                "allows if one enabled (LHS)": {
                    supports: ["foo"],
                    record: { test: 1234 },
                },

                "requires if one enabled": {
                    supports: ["bar"],
                    error: missing("F ^ B"),
                },

                "disallows if both enabled": {
                    supports: ["foo", "bar"],
                    record: { test: 1234 },
                    error: disallowed("F ^ B"),
                },

                "disallows if neither enabled": {
                    record: { test: 1234 },
                    error: disallowed("F ^ B"),
                },

                "allows omission if both enabled": {
                    supports: ["foo", "bar"],
                },
            }),

            optional: Tests(Fields({ conformance: "[F ^ B]" }), {
                "allows if one enabled": {
                    supports: ["foo"],
                    record: { test: 1234 },
                },

                "allows omission if one enabled": {
                    supports: ["foo"],
                },

                "disallows if both enabled": {
                    supports: ["foo", "bar"],
                    record: { test: 1234 },
                    error: disallowed("[F ^ B]"),
                },
            }),
        }),

        otherwise: Tests(Features({ F: "Foo", B: "Bar" }), {
            "mandatory otherwise optional": Tests(Fields({ conformance: "F, O" }), {
                "requires if enabled": {
                    supports: ["foo"],
                    error: missing("F, O"),
                },

                "allows if enabled": {
                    supports: ["foo"],
                    record: { test: 1234 },
                },

                "allows if disabled": {
                    record: { test: 1234 },
                },

                "allows omission if disabled": {},
            }),

            "optional otherwise mandatory": Tests(Fields({ conformance: "[F], M" }), {
                "allows if enabled": {
                    supports: ["foo"],
                    record: { test: 1234 },
                },

                "allows omission if enabled": {
                    supports: ["foo"],
                },

                "requires if disabled": {
                    error: missing("[F], M"),
                },
            }),

            "negated mandatory otherwise optional": Tests(Fields({ conformance: "!F, O" }), {
                "requires if disabled": {
                    error: missing("!F, O"),
                },

                "allows if enabled": {
                    supports: ["foo"],
                    record: { test: 1234 },
                },

                "allows omission if enabled": {
                    supports: ["foo"],
                },
            }),

            "mandatory otherwise optional-if": Tests(Fields({ conformance: "F, [B]" }), {
                "requires if first enabled": {
                    supports: ["foo"],
                    error: missing("F, [B]"),
                },

                "allows if second enabled": {
                    supports: ["bar"],
                    record: { test: 1234 },
                },

                "allows omission if second enabled": {
                    supports: ["bar"],
                },

                "disallows if neither enabled": {
                    record: { test: 1234 },
                    error: disallowed("F, [B]"),
                },
            }),

            "optional list equals disjunction": Tests(Fields({ conformance: "[F], [B]" }), {
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
                    error: disallowed("[F], [B]"),
                },

                "allows omission if disabled": {},
            }),
        }),

        disallowed: Tests(Fields({ conformance: "X" }), {
            "disallows the field": {
                record: { test: 1234 },
                error: disallowed("X"),
            },

            "allows omission": {},
        }),

        provisional: Tests(Fields({ conformance: "P" }), {
            "allows the field": {
                record: { test: 1234 },
            },

            "allows omission": {},
        }),

        "enum equality": Tests(
            Fields(
                {
                    name: "Status",
                    type: "enum8",
                    children: [FieldElement({ id: 0, name: "Idle" }), FieldElement({ id: 1, name: "UpdateAvailable" })],
                },
                {
                    name: "ImageUri",
                    type: "string",
                    conformance: "Status == UpdateAvailable",
                },
            ),
            {
                "allows if enum matches": {
                    record: { status: 1, imageUri: "https://example.com" },
                },

                "requires if enum matches": {
                    record: { status: 1 },
                    error: missing("Status == UpdateAvailable", "imageUri"),
                },

                "disallows if enum does not match": {
                    record: { status: 0, imageUri: "https://example.com" },
                    error: disallowed("Status == UpdateAvailable", "imageUri"),
                },

                "allows omission if enum does not match": {
                    record: { status: 0 },
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

        "qualified field reference": Tests(
            Fields(
                {
                    name: "Opts",
                    type: "struct",
                    children: [
                        FieldElement({ name: "Enable", id: 0, type: "uint8" }),
                        FieldElement({ name: "Mode", id: 1, type: "uint8" }),
                    ],
                },
                { name: "Dependent", type: "uint8", conformance: "Opts.Enable" },
            ),
            {
                "allows if qualified ref is present": {
                    record: { opts: { enable: 1 }, dependent: 42 },
                },

                "requires if qualified ref is present": {
                    record: { opts: { enable: 1 } },
                    error: missing("Opts.Enable", "dependent"),
                },

                "disallows if qualified ref is absent": {
                    record: { opts: { mode: 1 }, dependent: 42 },
                    error: disallowed("Opts.Enable", "dependent"),
                },

                "allows omission if qualified ref is absent": {
                    record: { opts: { mode: 1 } },
                },

                "allows omission if parent is absent": {
                    record: {},
                },
            },
        ),
    }),
});

describe("conformance", () => {
    testValidation("conformance", AllTests);

    describe("outerResolve", () => {
        // Field "Dependent" has conformance "ExtValue" — ExtValue is not a sibling, but provided via outerResolve
        const cluster = new ClusterModel({
            name: "Test",
            children: [
                FeatureMap.clone(),
                new FieldModel({ name: "Dependent", type: "uint8", conformance: "ExtValue" }),
            ],
        });

        const root = RootSupervisor.for(cluster);
        const manager = root.get(cluster);

        function validateWith(record: Record<string, unknown>, outerResolve?: (name: string) => unknown) {
            manager.validate?.(record, LocalActorContext.ReadOnly, {
                path: new DataModelPath(cluster.path),
                outerResolve,
            });
        }

        it("resolves name via outerResolve when not in siblings", () => {
            expect(() => validateWith({ dependent: 42 }, name => (name === "extValue" ? 1 : undefined))).not.throw();
        });

        it("requires field when outerResolve returns truthy", () => {
            expect(() => validateWith({}, name => (name === "extValue" ? 1 : undefined))).throw(ConformanceError);
        });

        it("disallows field when outerResolve returns undefined", () => {
            expect(() => validateWith({ dependent: 42 }, () => undefined)).throw(ConformanceError);
        });

        it("allows omission when outerResolve returns undefined", () => {
            expect(() => validateWith({}, () => undefined)).not.throw();
        });

        it("allows omission without outerResolve", () => {
            expect(() => validateWith({})).not.throw();
        });
    });

    describe("element references", () => {
        // Field conformance references a command name — should be treated as conformant since element-level
        // conformance is structural (enforced by ValidatedElements), not the data validator
        const cluster = new ClusterModel({
            name: "Test",
            children: [
                FeatureMap.clone(),
                new CommandModel({ name: "Pause", id: 1, direction: "request" }),
                new CommandModel({ name: "Resume", id: 2, direction: "request" }),
                new FieldModel({ name: "Dependent", type: "uint8", conformance: "Pause | Resume" }),
            ],
        });

        const root = RootSupervisor.for(cluster);
        const manager = root.get(cluster);

        function validate(record: Record<string, unknown>) {
            manager.validate?.(record, LocalActorContext.ReadOnly, {
                path: new DataModelPath(cluster.path),
            });
        }

        it("accepts field when conformance references cluster element", () => {
            expect(() => validate({ dependent: 42 })).not.throw();
        });

        it("requires field when conformance references cluster element", () => {
            expect(() => validate({})).throw(ConformanceError);
        });
    });

    describe("revision", () => {
        function managerFor(revision: number, conformance: string) {
            const cluster = new ClusterModel({
                name: "Test",
                children: [
                    FeatureMap.clone(),
                    new AttributeModel({ name: "ClusterRevision", id: 0xfffd, type: "uint16", default: revision }),
                    new FieldModel({ name: "Dependent", type: "uint8", conformance }),
                ],
            });
            return RootSupervisor.for(cluster).get(cluster);
        }

        function validate(manager: ReturnType<typeof managerFor>, record: Record<string, unknown>) {
            manager.validate?.(record, LocalActorContext.ReadOnly, { path: new DataModelPath("Test") });
        }

        it("requires field when revision satisfies mandatory condition", () => {
            const manager = managerFor(2, "Rev >= v2");
            expect(() => validate(manager, {})).throw(ConformanceError);
            expect(() => validate(manager, { dependent: 42 })).not.throw();
        });

        it("disallows field when revision below mandatory condition", () => {
            const manager = managerFor(1, "Rev >= v2");
            expect(() => validate(manager, { dependent: 42 })).throw(ConformanceError);
            expect(() => validate(manager, {})).not.throw();
        });

        it("allows field when revision satisfies optional condition", () => {
            const manager = managerFor(2, "[Rev >= v2]");
            expect(() => validate(manager, { dependent: 42 })).not.throw();
            expect(() => validate(manager, {})).not.throw();
        });

        it("disallows field when revision below optional condition", () => {
            const manager = managerFor(1, "[Rev >= v2]");
            expect(() => validate(manager, { dependent: 42 })).throw(ConformanceError);
            expect(() => validate(manager, {})).not.throw();
        });
    });
});
