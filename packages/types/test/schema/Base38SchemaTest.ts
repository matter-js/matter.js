/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { Base38 } from "#schema/Base38Schema.js";
import { Bytes } from "@matter/general";

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

        it("reads back everything encode writes", () => {
            // A length that is a multiple of 3 bytes encodes to a multiple of 5 characters, which the
            // decoder used to reject outright — matter.js could not read its own output
            for (let length = 1; length <= 24; length++) {
                const bytes = Bytes.of(Uint8Array.from({ length }, (_, i) => (i * 37 + 11) & 0xff));

                expect(Bytes.toHex(Base38.decode(Base38.encode(bytes))), `${length} bytes`).equal(Bytes.toHex(bytes));
            }
        });

        it("rejects a length no group count can produce", () => {
            expect(() => Base38.decode("0")).throw("Invalid base38 encoded string length: 1");
            expect(() => Base38.decode("000")).throw("Invalid base38 encoded string length: 3");
        });

        it("rejects a group length no encoding produces", () => {
            // A guard keyed on the character count must say so rather than compute a nonsense bound
            expect(() => Base38.decode("000")).throw("Invalid base38 encoded string length: 3");
        });

        it("rejects a group holding more than the bytes it stands for", () => {
            // "0" is 0 and "." is 37, so ".." is the largest 2-character group: 37*38 + 37 = 1443 > 255
            expect(() => Base38.decode("..")).throw("decodes to more than 1 bytes");
            expect(() => Base38.decode("....."), "5-character group").throw("decodes to more than 3 bytes");
        });
    });
});
