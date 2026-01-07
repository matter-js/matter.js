/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { Bytes } from "#general";
import { Base38 } from "#schema/Base38Schema.js";

const ENCODED = "-MOA57ZU02IT2L2BJ00";
const DECODED = Bytes.fromHex("88ffa7915040004751dd02");

describe("Base38Schema", () => {
    describe("encode", () => {
        it("encodes a string", () => {
            const result = Base38.encode(DECODED);

            expect(result).equal(ENCODED);
        });
    });

    describe("decode", () => {
        it("encodes a string", () => {
            const result = Base38.decode(ENCODED);

            expect(Bytes.toHex(result)).equal(Bytes.toHex(DECODED));
        });
    });
});
