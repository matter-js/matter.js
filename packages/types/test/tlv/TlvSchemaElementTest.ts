/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { TlvAny } from "#tlv/TlvAny.js";
import { TlvArray } from "#tlv/TlvArray.js";
import { TlvBoolean } from "#tlv/TlvBoolean.js";
import { TlvNullable } from "#tlv/TlvNullable.js";
import {
    TlvDouble,
    TlvFloat,
    TlvInt16,
    TlvInt32,
    TlvInt64,
    TlvInt8,
    TlvPercent,
    TlvPercent100ths,
    TlvUInt16,
    TlvUInt24,
    TlvUInt32,
    TlvUInt64,
    TlvUInt8,
} from "#tlv/TlvNumber.js";
import { TlvField, TlvObject, TlvOptionalField } from "#tlv/TlvObject.js";
import { TlvByteString, TlvString } from "#tlv/TlvString.js";
import { TlvVoid } from "#tlv/TlvVoid.js";
import { TlvWrapper } from "#tlv/TlvWrapper.js";

describe("TlvSchema.element", () => {
    describe("numerics", () => {
        it("TlvUInt8", () => {
            expect(TlvUInt8.element).deep.equals({ type: "uint8" });
        });

        it("TlvUInt16", () => {
            expect(TlvUInt16.element).deep.equals({ type: "uint16" });
        });

        it("TlvUInt24", () => {
            expect(TlvUInt24.element).deep.equals({ type: "uint24" });
        });

        it("TlvUInt32", () => {
            expect(TlvUInt32.element).deep.equals({ type: "uint32" });
        });

        it("TlvUInt64", () => {
            expect(TlvUInt64.element).deep.equals({ type: "uint64" });
        });

        it("TlvInt8", () => {
            expect(TlvInt8.element).deep.equals({ type: "int8" });
        });

        it("TlvInt16", () => {
            expect(TlvInt16.element).deep.equals({ type: "int16" });
        });

        it("TlvInt32", () => {
            expect(TlvInt32.element).deep.equals({ type: "int32" });
        });

        it("TlvInt64", () => {
            expect(TlvInt64.element).deep.equals({ type: "int64" });
        });

        it("TlvFloat", () => {
            expect(TlvFloat.element).deep.equals({ type: "single" });
        });

        it("TlvDouble", () => {
            expect(TlvDouble.element).deep.equals({ type: "double" });
        });
    });

    describe("bounded numerics", () => {
        it("bounded uint8 with min and max", () => {
            expect(TlvUInt8.bound({ min: 5, max: 200 }).element).deep.equals({
                type: "uint8",
                constraint: { min: 5, max: 200 },
            });
        });

        it("bounded uint8 with max only", () => {
            expect(TlvUInt8.bound({ max: 100 }).element).deep.equals({
                type: "uint8",
                constraint: { max: 100 },
            });
        });

        it("bounded uint16 with min only", () => {
            expect(TlvUInt16.bound({ min: 10 }).element).deep.equals({
                type: "uint16",
                constraint: { min: 10 },
            });
        });

        it("TlvPercent", () => {
            expect(TlvPercent.element).deep.equals({
                type: "uint8",
                constraint: { max: 100 },
            });
        });

        it("TlvPercent100ths", () => {
            expect(TlvPercent100ths.element).deep.equals({
                type: "uint16",
                constraint: { max: 10000 },
            });
        });
    });

    describe("boolean", () => {
        it("TlvBoolean", () => {
            expect(TlvBoolean.element).deep.equals({ type: "bool" });
        });
    });

    describe("strings", () => {
        it("TlvString", () => {
            expect(TlvString.element).deep.equals({ type: "string" });
        });

        it("TlvByteString", () => {
            expect(TlvByteString.element).deep.equals({ type: "octstr" });
        });

        it("bounded string with maxLength", () => {
            expect(TlvString.bound({ maxLength: 32 }).element).deep.equals({
                type: "string",
                constraint: { max: 32 },
            });
        });

        it("bounded string with minLength and maxLength", () => {
            expect(TlvString.bound({ minLength: 1, maxLength: 64 }).element).deep.equals({
                type: "string",
                constraint: { min: 1, max: 64 },
            });
        });

        it("bounded byte string", () => {
            expect(TlvByteString.bound({ minLength: 6, maxLength: 8 }).element).deep.equals({
                type: "octstr",
                constraint: { min: 6, max: 8 },
            });
        });
    });

    describe("objects", () => {
        it("simple struct", () => {
            const schema = TlvObject({
                x: TlvField(0, TlvUInt8),
                y: TlvOptionalField(1, TlvString),
            });

            const el = schema.element;
            expect(el?.type).equals("struct");
            expect(el?.children).length(2);

            expect(el?.children?.[0].name).equals("x");
            expect(el?.children?.[0].id).equals(0);
            expect(el?.children?.[0].type).equals("uint8");
            expect(el?.children?.[0].conformance).equals(undefined);

            expect(el?.children?.[1].name).equals("y");
            expect(el?.children?.[1].id).equals(1);
            expect(el?.children?.[1].type).equals("string");
            expect(el?.children?.[1].conformance).equals("O");
        });

        it("nested struct", () => {
            const inner = TlvObject({ a: TlvField(0, TlvBoolean) });
            const outer = TlvObject({ nested: TlvField(0, inner) });

            const el = outer.element;
            expect(el?.type).equals("struct");
            expect(el?.children?.[0].type).equals("struct");
            expect(el?.children?.[0].children?.[0].name).equals("a");
            expect(el?.children?.[0].children?.[0].type).equals("bool");
        });
    });

    describe("arrays", () => {
        it("simple array", () => {
            const el = TlvArray(TlvUInt8).element;
            expect(el?.type).equals("list");
            expect(el?.children).length(1);
            expect(el?.children?.[0].name).equals("entry");
            expect(el?.children?.[0].type).equals("uint8");
        });

        it("bounded array", () => {
            const el = TlvArray(TlvString, { minLength: 1, maxLength: 10 }).element;
            expect(el?.type).equals("list");
            expect(el?.constraint).deep.equals({ min: 1, max: 10 });
            expect(el?.children?.[0].type).equals("string");
        });
    });

    describe("nullable", () => {
        it("nullable uint8", () => {
            // NullableSchema adjusts inner numeric bounds to reserve the null sentinel value,
            // so the element reflects the narrowed max (254 instead of 255 for uint8)
            expect(TlvNullable(TlvUInt8).element).deep.equals({
                type: "uint8",
                constraint: { max: 254 },
                quality: "X",
            });
        });

        it("nullable string with constraint", () => {
            const el = TlvNullable(TlvString.bound({ maxLength: 32 })).element;
            expect(el?.type).equals("string");
            expect(el?.quality).equals("X");
            expect(el?.constraint).deep.equals({ max: 32 });
        });
    });

    describe("wrapper", () => {
        it("passes through to underlying schema", () => {
            const wrapper = new TlvWrapper(
                TlvUInt32,
                (v: number) => v,
                (v: number) => v,
            );
            expect(wrapper.element).deep.equals({ type: "uint32" });
        });
    });

    describe("void and any", () => {
        it("TlvVoid returns undefined", () => {
            expect(TlvVoid.element).equals(undefined);
        });

        it("TlvAny returns undefined", () => {
            expect(TlvAny.element).equals(undefined);
        });
    });
});
