/**
 * @license
 * Copyright 2022-2025 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { Constraint } from "#aspects/Constraint.js";

const TEST_CONSTRAINTS: [text: string, ast: Constraint.Ast, expectedText?: string][] = [
    ["0", { value: 0 }],
    ["desc", { desc: true }],
    ["4", { value: 4 }],
    ["-4", { value: -4 }],
    ["+4", { value: 4 }, "4"],
    ["4%", { value: { type: "percent", value: 4 } }],
    ["4°C", { value: { type: "celsius", value: 4 } }],
    ["3.141592", { value: 3.141592 }],
    ["min 4", { min: 4 }],
    ["max 4", { max: 4 }],
    ["4 to 44", { min: 4, max: 44 }],
    ["0x4 to 0x44", { min: 4, max: 68 }, "4 to 68"],
    ["0xff to 0xffff", { min: 255, max: 65535 }, "255 to 65535"],
    ["4[44]", { value: 4, entry: { value: 44 } }],
    ["4{44}", { value: 4, cpMax: 44 }],
    ["4, 44", { parts: [{ value: 4 }, { value: 44 }] }],
    ["in foo", { in: { type: "reference", name: "foo" } }],
    ["-2.5°C to 2.5°C", { min: { type: "celsius", value: -2.5 }, max: { type: "celsius", value: 2.5 } }],
    [
        "0 to NumberOfPositions-1",
        { min: 0, max: { type: "-", lhs: { type: "reference", name: "numberOfPositions" }, rhs: 1 } },
        "0 to numberOfPositions - 1",
    ],
    [
        "4[44, 444], 5[max 55, min 555]",
        {
            parts: [
                {
                    value: 4,
                    entry: {
                        parts: [{ value: 44 }, { value: 444 }],
                    },
                },
                {
                    value: 5,
                    entry: {
                        parts: [{ max: 55 }, { min: 555 }],
                    },
                },
            ],
        },
    ],
    [
        "foo - 2",
        {
            value: {
                type: "-",
                lhs: {
                    type: "reference",
                    name: "foo",
                },
                rhs: 2,
            },
        },
    ],
    [
        "4 to foo + 2",
        {
            min: 4,

            max: {
                type: "+",
                lhs: {
                    type: "reference",
                    name: "foo",
                },
                rhs: 2,
            },
        },
    ],
    [
        "min maxOf(holdTimeMin, 10)",
        {
            min: {
                type: "maxOf",

                args: [
                    {
                        type: "reference",
                        name: "holdTimeMin",
                    },

                    10,
                ],
            },
        },
    ],
];

describe("Constraint", () => {
    TEST_CONSTRAINTS.forEach(([text, ast, expectedText]) => {
        describe(text, () => {
            it("parses", () => {
                expect(new Constraint(text)).deep.equal(new Constraint({ ...ast, definition: text }));
            });

            it("serializes", () => {
                expect(new Constraint(ast).toString()).deep.equal(expectedText ?? text);
            });
        });
    });
});
