/**
 * @license
 * Copyright 2022-2025 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { MatterAggregateError, MatterError } from "#MatterError.js";
import "../src/log/LogFormat.js";

class SpecialError extends MatterError {}
class AnotherProblemError extends MatterError {}

function errorFrame0() {
    const error = new MatterError("oopsy!");
    error.cause = new MatterAggregateError(
        [new Error("a problem"), new AnotherProblemError("another problem")],
        "some details",
    );
    (error.cause as AggregateError).errors[0].cause = new SpecialError("your mom");
    throw error;
}

function errorFrame1() {
    try {
        errorFrame0();
    } catch (e) {
        if (e instanceof MatterError) {
            return e;
        }

        // Impossible
        const error = new MatterError("Umm, error not a MatterError??");
        error.cause = e;
        return error;
    }

    // Impossible
    return new MatterError("Umm, failed to throw??");
}

// This is the error we're going to test.  We create a couple of functions deep so we can ensure there are common stack
// frames in all environments
const error = errorFrame1();

function assertExpectedText(
    text: string,
    { truncatedStack, ansi, fallback }: { truncatedStack?: boolean; ansi?: boolean; fallback?: boolean } = {},
) {
    try {
        const iterator = text.split("\n")[Symbol.iterator]();

        let current = iterator.next().value;

        let stackShouldTruncate = false;

        function next() {
            current = iterator.next().value;
        }

        function expectMessage(text: string, indents = 0) {
            const prefix = " ".repeat(indents * 2);
            expect(current).match(new RegExp(`${prefix}${text}`));
            next();
        }

        function expectStack(indents = 0, withReset = false) {
            const indent = " ".repeat(2 + indents * 2);
            const frameMarker = ansi
                ? new RegExp(`^${indent}(?:\x1b\\[2;39m)?at \x1b\\[0m`)
                : new RegExp(`^${indent}at `);
            const reset = ansi && withReset ? "\x1b[0m" : "";

            expect(current).match(frameMarker);
            next();

            while (current?.match(frameMarker)) {
                next();
            }

            if (stackShouldTruncate) {
                expect(current).equals(`${indent}(see parent frames)${reset}`);
                next();
            }
        }

        expectMessage(`${errorId("general")}oopsy!`);
        expectStack();
        stackShouldTruncate = truncatedStack !== false;
        expectMessage(`Caused by: ${errorId("aggregate")}some details`);
        expectStack();
        expectMessage(`${ansi ? "\u001b\\[0m" : ""}Cause #0: ${ansi ? "\u001b\\[31m" : ""}a problem`, 1);
        expectStack(1);
        expectMessage(`${ansi ? "\u001b\\[0m" : ""}Caused by: ${errorId("special")}your mom`, 1);
        expectStack(1);
        expectMessage(`${ansi ? "\u001b\\[0m" : ""}Cause #1: ${errorId("another-problem")}another problem`, 1);
        expectStack(1, true);
        expect(current).undefined;
    } catch (e) {
        console.log("Failing formatted error follows");
        console.log(text);
        throw e;
    }

    function errorId(text: string) {
        if (fallback) {
            return "";
        }
        if (ansi) {
            return `\u001b\\[31m\\[\u001b\\[1m${text}\u001b\\[0;31m\\] `;
        }
        return `\\[${text}\\] `;
    }
}

describe("MatterError", () => {
    it("formats plain", () => {
        assertExpectedText(error.format());
    });

    it("formats ansi", () => {
        assertExpectedText(error.format("ansi"), { ansi: true });
    });

    it("formats fallback", () => {
        const originalFormatter = MatterError.formatterFor;
        try {
            (MatterError as any).formatterFor = undefined;
            assertExpectedText(error.format(), { fallback: true, truncatedStack: false });
        } finally {
            MatterError.formatterFor = originalFormatter;
        }
    });
});
