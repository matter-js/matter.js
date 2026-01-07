/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { ValidationError } from "#common/ValidationError.js";
import { TlvAny } from "#tlv/TlvAny.js";
import { TlvVoid } from "#tlv/TlvVoid.js";

describe("TlvVoid", () => {
    describe("encode", () => {
        it("encodes undefined", () => {
            expect(TlvVoid.encode(undefined).byteLength).equals(0);
        });
    });

    describe("calculate bytesize", () => {
        it("calculate bytesize undefined", () => {
            const tlvEncoded = TlvVoid.encodeTlv(undefined);
            expect(TlvAny.getEncodedByteLength(tlvEncoded)).equal(0);
        });
    });

    describe("validation", () => {
        it("throws an error if the value is.exist", () => {
            expect(() => TlvVoid.validate("a" as any)).throw(ValidationError, "Expected void, got string.");
        });

        it("does not throw an error if the value is undefined", () => {
            expect(TlvVoid.validate(undefined)).equal(undefined);
        });
    });
});
