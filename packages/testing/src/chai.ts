/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import Chai from "chai";
import "./global-definitions.js";

export interface DiffMarker {}

Chai.config.truncateThreshold = 200;

function createDiffMarker(title: string) {
    return {
        toString() {
            return `<<${title}>>`;
        },
    } as DiffMarker;
}

expect.IGNORE = createDiffMarker("ignore");
expect.BIGINT = createDiffMarker("bigint");
expect.BYTES = createDiffMarker("bytes");
expect.NUMBER = createDiffMarker("number");
expect.STRING = createDiffMarker("string");

(Chai.config as any).deepEqual = (expected: unknown, actual: unknown) => {
    return (Chai.util as any).eql(expected, actual, {
        comparator(expected: unknown, actual: unknown) {
            // Handle special "type-only" checks
            switch (expected) {
                case expect.IGNORE:
                    return true;

                case expect.BIGINT:
                    return typeof actual === "bigint";

                case expect.NUMBER:
                    return typeof actual === "number";

                case expect.STRING:
                    return typeof actual === "string";

                case expect.BYTES:
                    return actual instanceof Uint8Array;
            }

            // Specialized support for intervals
            if (typeof actual === "object" && actual?.constructor.name === "Interval" && "ms" in actual) {
                if (typeof expected === "number") {
                    return actual.ms === expected;
                }
                if (typeof expected === "object" && expected !== null && "ms" in expected) {
                    return actual.ms === expected.ms;
                }
            }

            return null;
        },
    });
};
