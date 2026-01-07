/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { Bytes } from "#general";
import { BitField, BitFieldEnum, BitFlag, BitmapSchema, ByteArrayBitmapSchema } from "#schema/BitmapSchema.js";

describe("BitmapSchema", () => {
    const enum EnumTest {
        VALUE_1 = 1,
        VALUE_2 = 2,
    }

    const TestBitmapSchema = BitmapSchema({
        /** flag1 jsdoc */
        flag1: BitFlag(2),

        /** flag2 jsdoc */
        flag2: BitFlag(4),

        /** enum jsdoc */
        enumTest: BitFieldEnum<EnumTest>(5, 2),

        /** number jsdoc */
        numberTest: BitField(7, 2),
    });

    describe("encode", () => {
        it("encodes a bitmap using the schema", () => {
            const result = TestBitmapSchema.encode({
                flag1: true,
                flag2: false,
                enumTest: EnumTest.VALUE_2,
                numberTest: 1,
            });

            expect(result).equal(0xc4);
        });

        it("encodes a bitmap using the schema with not provided unset bits", () => {
            const result = TestBitmapSchema.encode({
                flag1: true,
                enumTest: EnumTest.VALUE_2,
                numberTest: 1,
            });

            expect(result).equal(0xc4);
        });

        it("encodes a bitmap using the schema with not provided unset bits #2", () => {
            const result = TestBitmapSchema.encode({
                flag1: true,
            });

            expect(result).equal(0x4);
        });

        it("encodes a bitmap using the schema with all unset bits", () => {
            const result = TestBitmapSchema.encode({});

            expect(result).equal(0);
        });
    });

    describe("decode", () => {
        it("decodes a bitmap using the schema with all bit set", () => {
            const result = TestBitmapSchema.decode(0xb4);

            expect(result).deep.equal({
                flag1: true,
                flag2: true,
                enumTest: EnumTest.VALUE_1,
                numberTest: 1,
            });
        });

        it("decodes a bitmap using the schema with some set", () => {
            const result = TestBitmapSchema.decode(0xc4);

            expect(result).deep.equal({
                flag1: true,
                flag2: false,
                enumTest: EnumTest.VALUE_2,
                numberTest: 1,
            });
        });

        it("decodes a bitmap using the schema with none set", () => {
            const result = TestBitmapSchema.decode(0x0);

            expect(result).deep.equal({
                flag1: false,
                flag2: false,
                enumTest: 0,
                numberTest: 0,
            });
        });
    });
});

describe("ByteArrayBitmapSchema", () => {
    const TestByteArrayBitmapSchema = ByteArrayBitmapSchema({
        /** flag1 jsdoc */
        flag1: BitFlag(0),

        /** number jsdoc */
        number: BitField(1, 14),

        /** flag2 jsdoc */
        flag2: BitFlag(15),
    });

    describe("encode", () => {
        it("encodes a bitmap using the schema", () => {
            const result = TestByteArrayBitmapSchema.encode({
                flag1: true,
                flag2: true,
                number: 0x2000,
            });

            expect(Bytes.toHex(result)).equal("01c0");
        });
    });

    describe("decode", () => {
        it("decodes a bitmap using the schema", () => {
            const result = TestByteArrayBitmapSchema.decode(Bytes.fromHex("01c0"));

            expect(result).deep.equal({
                flag1: true,
                flag2: true,
                number: 0x2000,
            });
        });
    });
});
