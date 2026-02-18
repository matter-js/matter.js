/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { Constraint } from "#aspects/Constraint.js";
import { FieldValue } from "#common/FieldValue.js";

interface ValueTest {
    test: FieldValue;
    ok: boolean;
}

const TEST_CONSTRAINTS: [text: string, ast: Constraint.Ast, expectedText?: string, valueTests?: ValueTest[]][] = [
    [
        "0",
        { value: 0 },
        undefined,
        [
            { test: 0, ok: true },
            { test: 1, ok: false },
        ],
    ],
    ["desc", { desc: true }],
    [
        "4",
        { value: 4 },
        undefined,
        [
            { test: 4, ok: true },
            { test: 3, ok: false },
        ],
    ],
    [
        "-4",
        { value: -4 },
        undefined,
        [
            { test: -4, ok: true },
            { test: 4, ok: false },
        ],
    ],
    ["+4", { value: 4 }, "4"],
    ["4%", { value: { type: "percent", value: 4 } }],
    ["4°C", { value: { type: "celsius", value: 4 } }],
    ["3.141592", { value: 3.141592 }],
    [
        "min 4",
        { min: 4 },
        undefined,
        [
            { test: 5, ok: true },
            { test: 4, ok: true },
            { test: 3, ok: false },
        ],
    ],
    [
        "max 4",
        { max: 4 },
        undefined,
        [
            { test: 3, ok: true },
            { test: 4, ok: true },
            { test: 5, ok: false },
        ],
    ],
    [
        "4 to 44",
        { min: 4, max: 44 },
        undefined,
        [
            { test: 3, ok: false },
            { test: 4, ok: true },
            { test: 24, ok: true },
            { test: 44, ok: true },
            { test: 45, ok: false },
        ],
    ],
    ["0x4 to 0x44", { min: 4, max: 68 }, "4 to 68"],
    ["0xff to 0xffff", { min: 255, max: 65535 }, "255 to 65535"],
    ["4[44]", { value: 4, entry: { value: 44 } }],
    ["4{44}", { value: 4, cpMax: 44 }],
    ["4, 44", { parts: [{ value: 4 }, { value: 44 }] }],
    ["in foo", { in: { type: "reference", name: "foo" } }],
    ["-2.5°C to 2.5°C", { min: { type: "celsius", value: -2.5 }, max: { type: "celsius", value: 2.5 } }],
    ["max 0b1", { max: 1 }, "max 1"],
    ["max 0b00111111", { max: 63 }, "max 63"],
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
        "2 + 3 * 4",
        {
            value: {
                type: "+",
                lhs: 2,
                rhs: {
                    type: "*",
                    lhs: 3,
                    rhs: 4,
                },
            },
        },
        "2 + (3 * 4)",
    ],
    [
        "foo - 2 + 3",
        {
            value: {
                type: "+",
                lhs: {
                    type: "-",
                    lhs: {
                        type: "reference",
                        name: "foo",
                    },
                    rhs: 2,
                },
                rhs: 3,
            },
        },
        "(foo - 2) + 3",
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
    [
        "2^10",
        {
            value: {
                type: "^",
                lhs: 2,
                rhs: 10,
            },
        },
        undefined,
        [
            { test: 1024, ok: true },
            { test: 1024n, ok: true },
            { test: 1023, ok: false },
        ],
    ],
    [
        "2^62",
        {
            value: {
                type: "^",
                lhs: 2,
                rhs: 62,
            },
        },
        undefined,
        [
            { test: 2 ** 62, ok: true },
            { test: 2n ** 62n, ok: true },
            { test: 0, ok: false },
        ],
    ],
    [
        "-2^62 to 2^62",
        {
            min: {
                type: "^",
                lhs: -2,
                rhs: 62,
            },
            max: {
                type: "^",
                lhs: 2,
                rhs: 62,
            },
        },
        undefined,
        [
            { test: 0, ok: true },
            { test: Number.MIN_SAFE_INTEGER, ok: true },
            { test: Number.MAX_SAFE_INTEGER, ok: true },
            { test: -(2 ** 62), ok: true },
            { test: 2 ** 62, ok: true },
            { test: -(2n ** 62n), ok: true },
            { test: 2n ** 62n, ok: true },
            { test: -(2n ** 62n) - 1n, ok: false },
            { test: 2n ** 62n + 1n, ok: false },
        ],
    ],
    [
        "-2^53 to 2^53",
        {
            min: {
                type: "^",
                lhs: -2,
                rhs: 53,
            },
            max: {
                type: "^",
                lhs: 2,
                rhs: 53,
            },
        },
        undefined,
        [
            { test: 0, ok: true },
            { test: Number.MIN_SAFE_INTEGER, ok: true },
            { test: Number.MAX_SAFE_INTEGER, ok: true },
            { test: -(2n ** 53n), ok: true },
            { test: 2n ** 53n, ok: true },
            { test: -(2n ** 53n) - 1n, ok: false },
            { test: 2n ** 53n + 1n, ok: false },
        ],
    ],
    [
        "0 to 2^62",
        {
            min: 0,
            max: {
                type: "^",
                lhs: 2,
                rhs: 62,
            },
        },
        undefined,
        [
            { test: 0, ok: true },
            { test: 2n ** 62n, ok: true },
            { test: -1, ok: false },
            { test: 2n ** 62n + 1n, ok: false },
        ],
    ],
    [
        "min (2^62) + 1",
        {
            min: {
                type: "+",
                lhs: {
                    type: "^",
                    lhs: 2,
                    rhs: 62,
                },
                rhs: 1,
            },
        },
        "min (2^62) + 1",
        [
            { test: 2n ** 62n, ok: false },
            { test: 2n ** 62n + 1n, ok: true },
            { test: 2n ** 62n + 2n, ok: true },
        ],
    ],
    [
        "0 to segmentDuration / 2",
        {
            min: 0,
            max: {
                type: "/",
                lhs: {
                    type: "reference",
                    name: "segmentDuration",
                },
                rhs: 2,
            },
        },
    ],
    [
        "-1 * panMax to panMax",
        {
            min: {
                type: "*",
                lhs: -1,
                rhs: {
                    type: "reference",
                    name: "panMax",
                },
            },
            max: {
                type: "reference",
                name: "panMax",
            },
        },
    ],
    [
        "max (2^62) - 1",
        {
            max: {
                type: "-",
                lhs: {
                    type: "^",
                    lhs: 2,
                    rhs: 62,
                },
                rhs: 1,
            },
        },
        "max (2^62) - 1",
        [
            { test: 0, ok: true },
            { test: 2n ** 62n - 1n, ok: true },
            { test: 2n ** 62n, ok: false },
        ],
    ],
    [
        "2 * 3 ^ 4",
        {
            value: {
                type: "*",
                lhs: 2,
                rhs: {
                    type: "^",
                    lhs: 3,
                    rhs: 4,
                },
            },
        },
        "2 * (3^4)",
    ],
    [
        "holdTimeLimits.holdTimeMin to holdTimeLimits.holdTimeMax",
        {
            min: {
                type: ".",

                lhs: {
                    type: "reference",
                    name: "holdTimeLimits",
                },
                rhs: {
                    type: "reference",
                    name: "holdTimeMin",
                },
            },

            max: {
                type: ".",

                lhs: {
                    type: "reference",
                    name: "holdTimeLimits",
                },
                rhs: {
                    type: "reference",
                    name: "holdTimeMax",
                },
            },
        },
    ],
];

describe("Constraint", () => {
    TEST_CONSTRAINTS.forEach(([text, ast, expectedText, valueTests]) => {
        describe(text, () => {
            it("parses", () => {
                expect(new Constraint(text)).deep.equal(new Constraint({ ...ast, definition: text }));
            });

            it("serializes", () => {
                expect(new Constraint(ast).toString()).deep.equal(expectedText ?? text);
            });

            if (valueTests) {
                const constraint = new Constraint(text);

                for (const vt of valueTests) {
                    const label = typeof vt.test === "bigint" ? `${vt.test}n` : `${vt.test}`;
                    it(`${vt.ok ? "accepts" : "rejects"} ${label}`, () => {
                        expect(constraint.test(vt.test)).equal(vt.ok);
                    });
                }
            }
        });
    });
});
