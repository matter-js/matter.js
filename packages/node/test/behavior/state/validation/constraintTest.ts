/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { ConstraintError } from "#protocol";
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

testValidation("constraint", AllTests);
