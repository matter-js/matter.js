/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { Seconds } from "@matter/general";
import { FieldElement } from "@matter/model";
import { ConstraintError } from "@matter/protocol";
import { BitmapEncodedValue } from "@matter/types";
import { Fields, Tests, testValidation } from "./validation-test-utils.js";

const AllTests = Tests({
    min: Tests(Fields({ constraint: "min 4" }), {
        "accepts if over": { record: { test: 5 } },
        "accepts if equal": { record: { test: 4 } },
        "rejects if under": {
            record: { test: 3 },
            error: {
                type: ConstraintError,
                message: 'Validating Test.test: Constraint "min 4": Value 3 is not within bounds defined by constraint',
            },
        },
    }),

    "percentage bound": Tests(Fields({ type: "percent100ths", constraint: "0.01% to 100.00%" }), {
        "accepts a value within the encoded range": { record: { test: 5000 } },
        "rejects a value above the encoded range": {
            record: { test: 10001 },
            error: {
                type: ConstraintError,
                message:
                    'Validating Test.test: Constraint "0.01% to 100%": Value 10001 is not within bounds defined by constraint',
            },
        },
    }),

    "percentage bound of a list entry": Tests(
        Fields({
            type: "list",
            constraint: "max 4[0% to 100%]",
            children: [FieldElement({ name: "entry", type: "percent100ths" })],
        }),
        {
            "accepts an entry within the encoded range": { record: { test: [5000] } },
            "rejects an entry above the encoded range": {
                record: { test: [10001] },
                error: {
                    type: ConstraintError,
                    message:
                        'Validating Test.test.0: Constraint "all": Value 10001 is not within bounds defined by constraint',
                },
            },
        },
    ),

    "min with reference": Tests(Fields({ constraint: "min MinVal" }, { name: "MinVal", quality: "X" }), {
        "accepts if over": { record: { test: 5, minVal: 4 } },
        "rejects if under": {
            record: { test: 3, minVal: 4 },
            error: {
                type: ConstraintError,
                message:
                    'Validating Test.test: Constraint "min minVal": Value 3 is not within bounds defined by constraint',
            },
        },
        "accepts if reference value is missing": { record: { test: 3 } },
        "accepts if reference value is null": { record: { test: 3, minVal: null } },
    }),

    "min with expression": Tests(Fields({ constraint: "min (MinVal + 1)" }, { name: "MinVal", quality: "X" }), {
        "accepts if over": { record: { test: 6, minVal: 4 } },
        "rejects if under": {
            record: { test: 4, minVal: 4 },
            error: {
                type: ConstraintError,
                message:
                    'Validating Test.test: Constraint "min minVal + 1": Value 4 is not within bounds defined by constraint',
            },
        },
        "accepts if reference value is missing": { record: { test: 3 } },
        "accepts if reference value is null": { record: { test: 3, minVal: null } },
    }),

    max: Tests(Fields({ constraint: "max 4" }), {
        "rejects if over": {
            record: { test: 5 },
            error: {
                type: ConstraintError,
                message: 'Validating Test.test: Constraint "max 4": Value 5 is not within bounds defined by constraint',
            },
        },
        "accepts if equal": { record: { test: 4 } },
        "accepts if under": {
            record: { test: 3 },
        },
    }),

    "max with reference": Tests(Fields({ constraint: "max MaxVal" }, { name: "MaxVal", quality: "X" }), {
        "rejects if over": {
            record: { test: 5, maxVal: 4 },
            error: {
                type: ConstraintError,
                message:
                    'Validating Test.test: Constraint "max maxVal": Value 5 is not within bounds defined by constraint',
            },
        },
        "accepts if under": { record: { test: 3, maxVal: 4 } },
        "accepts if reference value is missing": { record: { test: 3 } },
        "accepts if reference value is null": { record: { test: 3, maxVal: null } },
    }),

    // Client mirrors (primaryKey: "id") store live values at numeric ids; the resolver must prefer
    // them over the property-name slot, which can hold a stale initial default.
    "max with reference (sibling keyed by id)": Tests(
        Fields({ id: 0, constraint: "max MaxVal" }, { id: 1, name: "MaxVal", quality: "X" }),
        {
            "rejects if over (id-keyed sibling)": {
                record: { test: 5, 1: 4 },
                error: {
                    type: ConstraintError,
                    message:
                        'Validating Test.test: Constraint "max maxVal": Value 5 is not within bounds defined by constraint',
                },
            },
            "accepts if under (id-keyed sibling)": {
                record: { test: 3, 1: 4 },
            },
            "prefers id-keyed live value over name-keyed stale default": {
                record: { test: 3, maxVal: 0, 1: 4 },
            },
            "rejects on id-keyed sibling even when name-keyed slot would accept": {
                record: { test: 5, maxVal: 10, 1: 4 },
                error: {
                    type: ConstraintError,
                    message:
                        'Validating Test.test: Constraint "max maxVal": Value 5 is not within bounds defined by constraint',
                },
            },
        },
    ),

    compound: Tests(Fields({ constraint: "3 to 4, 6 to 7" }), {
        "rejects if under": {
            record: { test: 2 },
            error: {
                type: ConstraintError,
                message:
                    'Validating Test.test: Constraint "3 to 4, 6 to 7": Value 2 is not within bounds defined by constraint',
            },
        },
        "accepts at bottom of first sub-range": {
            record: { test: 3 },
        },
        "accepts at top of first sub-range": {
            record: { test: 4 },
        },
        "rejects between ranges": {
            record: { test: 5 },
            error: {
                type: ConstraintError,
                message:
                    'Validating Test.test: Constraint "3 to 4, 6 to 7": Value 5 is not within bounds defined by constraint',
            },
        },
        "accepts at bottom of second sub-range": {
            record: { test: 6 },
        },
        "accepts at top of second sub-range": {
            record: { test: 7 },
        },
        "rejects if over": {
            record: { test: 8 },
            error: {
                type: ConstraintError,
                message:
                    'Validating Test.test: Constraint "3 to 4, 6 to 7": Value 8 is not within bounds defined by constraint',
            },
        },
    }),

    "range with expression": Tests(Fields({ constraint: "0 to NumberOfPositions-1" }, { name: "NumberOfPositions" }), {
        "accepts if under": {
            record: { test: 1, numberOfPositions: 2 },
        },
        "rejects if over": {
            record: { test: 2, numberOfPositions: 2 },
            error: {
                type: ConstraintError,
                message:
                    'Validating Test.test: Constraint "0 to numberOfPositions - 1": Value 2 is not within bounds defined by constraint',
            },
        },
    }),

    // <ConstrainingElementName>.<Field>, the form the specification defines for naming a bound held by another
    // element.  @see {@link MatterSpecification.v16.Core} § 7.18.3.4
    "range with dot-qualified reference": Tests(
        Fields(
            { type: "uint16", constraint: "Limits.HoldTimeMin to Limits.HoldTimeMax" },
            {
                name: "Limits",
                type: "struct",
                children: [
                    FieldElement({ name: "HoldTimeMin", type: "uint16" }),
                    FieldElement({ name: "HoldTimeMax", type: "uint16" }),
                ],
            },
        ),
        {
            "accepts at the lower bound": {
                record: { test: 10, limits: { holdTimeMin: 10, holdTimeMax: 100 } },
            },
            "accepts within the bounds": {
                record: { test: 50, limits: { holdTimeMin: 10, holdTimeMax: 100 } },
            },
            "accepts at the upper bound": {
                record: { test: 100, limits: { holdTimeMin: 10, holdTimeMax: 100 } },
            },
            "rejects below the lower bound": {
                record: { test: 9, limits: { holdTimeMin: 10, holdTimeMax: 100 } },
                error: {
                    type: ConstraintError,
                    message:
                        'Validating Test.test: Constraint "limits.holdTimeMin to limits.holdTimeMax": Value 9 is not within bounds defined by constraint',
                },
            },
            "rejects zero": {
                record: { test: 0, limits: { holdTimeMin: 10, holdTimeMax: 100 } },
                error: {
                    type: ConstraintError,
                    message:
                        'Validating Test.test: Constraint "limits.holdTimeMin to limits.holdTimeMax": Value 0 is not within bounds defined by constraint',
                },
            },
            "rejects above the upper bound": {
                record: { test: 101, limits: { holdTimeMin: 10, holdTimeMax: 100 } },
                error: {
                    type: ConstraintError,
                    message:
                        'Validating Test.test: Constraint "limits.holdTimeMin to limits.holdTimeMax": Value 101 is not within bounds defined by constraint',
                },
            },
            "rejects the far end of the type range": {
                record: { test: 65535, limits: { holdTimeMin: 10, holdTimeMax: 100 } },
                error: {
                    type: ConstraintError,
                    message:
                        'Validating Test.test: Constraint "limits.holdTimeMin to limits.holdTimeMax": Value 65535 is not within bounds defined by constraint',
                },
            },
            "accepts if the referenced element is missing": {
                record: { test: 65535 },
            },
            "accepts if the referenced member is missing": {
                record: { test: 65535, limits: { holdTimeMin: 10 } },
            },
        },
    ),

    // An enumerated type states a bound as the names of its own values.  @see {@link MatterSpecification.v16.Core}
    // § 7.18.3
    "named values of an enumeration": Tests(
        Fields({
            type: "enum8",
            constraint: "Add, Modify",
            children: [
                FieldElement({ name: "Add", id: 0 }),
                FieldElement({ name: "Clear", id: 1 }),
                FieldElement({ name: "Modify", id: 2 }),
            ],
        }),
        {
            "accepts the first value named": { record: { test: 0 } },
            "accepts the last value named": { record: { test: 2 } },
            "rejects a value the constraint omits": {
                record: { test: 1 },
                error: {
                    type: ConstraintError,
                    message: 'Validating Test.test: Constraint "add, modify": Value 1 is not allowed by constraint',
                },
            },
        },
    ),

    // A bitmap's bound states the magnitude its flags encode to, so an entry bound on a list of them is judged by
    // that magnitude: a record setting no flag encodes to 0, which "min 1" refuses
    "entry of a list of bitmaps": Tests(
        Fields({
            type: "list",
            constraint: "max 4[min 1]",
            children: [
                FieldElement(
                    { name: "entry", type: "map8" },
                    FieldElement({ name: "Recording", constraint: "0" }),
                    FieldElement({ name: "Analysis", constraint: "1" }),
                ),
            ],
        }),
        {
            "accepts an entry within the bound": { record: { test: [{ recording: true }] } },
            "rejects an entry below the bound": {
                record: { test: [{}] },
                error: {
                    type: ConstraintError,
                    message:
                        'Validating Test.test.0: Constraint "all": Value 0 is not within bounds defined by constraint',
                },
            },
        },
    ),

    // A struct has neither a magnitude nor a length, so an entry bound on a list of them enforces nothing
    "entry of a list of structs": Tests(
        Fields({
            type: "list",
            constraint: "max 4[0 to 65534]",
            children: [
                FieldElement({ name: "entry", type: "struct" }, FieldElement({ name: "Low", id: 0, type: "uint16" })),
            ],
        }),
        {
            "accepts an entry of the struct": { record: { test: [{ low: 1 }] } },
        },
    ),

    // An index names the position in the list, which an entry holding no value occupies too
    "entry bound after a null entry": Tests(
        Fields({
            type: "list",
            quality: "X",
            constraint: "max 4[max 2]",
            children: [FieldElement({ name: "entry", type: "uint8", quality: "X" })],
        }),
        {
            "names the position of the entry it rejects": {
                record: { test: [1, null, 9] },
                error: {
                    type: ConstraintError,
                    message:
                        'Validating Test.test.2: Constraint "all": Value 9 is not within bounds defined by constraint',
                },
            },
        },
    ),

    // Characterization: a flag's constraint states the bits it occupies, not the values it may take.  A bitmap judges
    // its flags itself rather than building a validator for each, so nothing tests a flag's value against its own
    // constraint
    "multi-bit flag of a bitmap": Tests(
        Fields({
            type: "map8",
            children: [
                FieldElement(
                    { name: "Speed", type: "SpeedEnum", constraint: "0 to 1" },
                    FieldElement({ name: "Slow", id: 0 }),
                    FieldElement({ name: "Fast", id: 3 }),
                ),
            ],
        }),
        {
            "accepts a value outside the bits the flag occupies": { record: { test: { speed: 3 } } },
        },
    ),

    // The entry model states this bound itself rather than the list's constraint stating it, which is a different
    // path through validation and numbers positions of its own
    "bound on the entry model after a null entry": Tests(
        Fields({
            type: "list",
            quality: "X",
            children: [FieldElement({ name: "entry", type: "uint8", constraint: "max 2", quality: "X" })],
        }),
        {
            "names the position of the entry it rejects": {
                record: { test: [1, null, 9] },
                error: {
                    type: ConstraintError,
                    message:
                        'Validating Test.test.2: Constraint "max 2": Value 9 is not within bounds defined by constraint',
                },
            },
        },
    ),

    // The specification bounds the number a bitmap's flags encode to.  A lower bound states a flag that must be set,
    // which the reserved-bit check cannot express
    "bound on a bitmap": Tests(
        Fields({
            type: "map8",
            constraint: "min 1",
            children: [
                FieldElement({ name: "Recording", constraint: "0" }),
                FieldElement({ name: "Analysis", constraint: "1" }),
            ],
        }),
        {
            "accepts a value setting a flag": { record: { test: { recording: true } } },
            "rejects a value setting no flag": {
                record: { test: { recording: false, analysis: false } },
                error: {
                    type: ConstraintError,
                    message:
                        'Validating Test.test: Constraint "min 1": Value 0 is not within bounds defined by constraint',
                },
            },
            "rejects a value naming no flag at all": {
                record: { test: {} },
                error: {
                    type: ConstraintError,
                    message:
                        'Validating Test.test: Constraint "min 1": Value 0 is not within bounds defined by constraint',
                },
            },
        },
    ),

    // The bound stays local where a reserved-bit failure is forwarded for a peer write, so the bound is judged
    // first: a value breaking both must report the bound rather than unwinding on the forwarded error
    "bound on a bitmap carrying a reserved bit": Tests(
        Fields({
            type: "map8",
            constraint: "min 2",
            children: [FieldElement({ name: "Recording", constraint: "0" })],
        }),
        {
            "reports the bound rather than the reserved bit": {
                record: { test: Object.assign({ recording: true }, { [BitmapEncodedValue]: 0b11 }) },
                error: {
                    type: ConstraintError,
                    message:
                        'Validating Test.test: Constraint "min 2": Value 1 is not within bounds defined by constraint',
                },
            },
        },
    ),

    // A flag spanning several bits states the number those bits hold, not one
    "bound on a bitmap with a multi-bit flag": Tests(
        Fields({
            type: "map8",
            constraint: "max 5",
            children: [
                FieldElement({ name: "Speed", constraint: "0 to 1" }),
                FieldElement({ name: "Active", constraint: "2" }),
            ],
        }),
        {
            "accepts a value within the bound": { record: { test: { speed: 1, active: true } } },
            "rejects a value above the bound": {
                record: { test: { speed: 3, active: true } },
                error: {
                    type: ConstraintError,
                    message:
                        'Validating Test.test: Constraint "max 5": Value 7 is not within bounds defined by constraint',
                },
            },
        },
    ),

    // The magnitude is the unsigned number the flags encode to, so the highest bit a shift reaches is judged like
    // any other
    "bound on a bitmap using the highest bit": Tests(
        Fields({
            type: "map32",
            constraint: "max 1",
            children: [FieldElement({ name: "High", constraint: "31" })],
        }),
        {
            "rejects a magnitude above the bound": {
                record: { test: { high: true } },
                error: {
                    type: ConstraintError,
                    message:
                        'Validating Test.test: Constraint "max 1": Value 2147483648 is not within bounds defined by constraint',
                },
            },
        },
    ),

    // A flag beyond the reach of a shift states a magnitude nothing computes, so the bound is left unjudged rather
    // than judged against a number that truncated
    "bound on a bitmap wider than a shift reaches": Tests(
        Fields({
            type: "map64",
            constraint: "min 1",
            children: [FieldElement({ name: "Wide", constraint: "30 to 33" })],
        }),
        {
            "accepts a value no shift states": { record: { test: { wide: 0 } } },
        },
    ),

    // A duration is held as a number of milliseconds, so a bound on one is enforced like any other magnitude
    "bound on a duration": Tests(Fields({ type: "duration", constraint: "max 2000" }), {
        "accepts a value within the bound": { record: { test: Seconds(1) } },
        "rejects a value above the bound": {
            record: { test: Seconds(30) },
            error: {
                type: ConstraintError,
                message:
                    'Validating Test.test: Constraint "max 2000": Value 30000 is not within bounds defined by constraint',
            },
        },
    }),

    // A duration is held as a number of milliseconds, so a bound on one is enforced like any other magnitude
    "entry of a list of durations": Tests(
        Fields({
            type: "list",
            constraint: "max 4[max 2000]",
            children: [FieldElement({ name: "entry", type: "duration" })],
        }),
        {
            "accepts an entry within the bound": { record: { test: [Seconds(1)] } },
            "rejects an entry above the bound": {
                record: { test: [Seconds(30)] },
                error: {
                    type: ConstraintError,
                    message:
                        'Validating Test.test.0: Constraint "all": Value 30000 is not within bounds defined by constraint',
                },
            },
        },
    ),

    // The specification states this bound of a struct-typed field, which compares a number against a record.  A
    // struct field's own constraint reaches no validator, so this states that it stays that way
    "numeric bound on a struct": Tests(
        Fields({
            type: "struct",
            constraint: "0 to 65534",
            children: [FieldElement({ name: "Low", id: 0, type: "uint16" })],
        }),
        {
            "accepts a value of the struct": { record: { test: { low: 1 } } },
        },
    ),

    "string length": Tests(Fields({ type: "string", constraint: "max 2" }), {
        "accepts if under": {
            record: { test: "ab" },
        },

        "rejects if over": {
            record: { test: "abc" },
            error: {
                type: ConstraintError,
                message:
                    'Validating Test.test: Constraint "max 2": String length of 3 is not within bounds defined by constraint',
            },
        },
    }),

    "string length with codepoints": Tests(Fields({ type: "string", constraint: "max 8{1}" }), {
        "accepts if under": {
            record: { test: "𩸽" },
        },

        "rejects if over": {
            record: { test: "𩸽定" },
            error: {
                type: ConstraintError,
                message:
                    'Validating Test.test: Constraint "max 8{1}": Codepoint count of 2 is not within bounds defined by constraint',
            },
        },
    }),
});

describe("constraint", () => {
    testValidation("constraint", AllTests);
});
