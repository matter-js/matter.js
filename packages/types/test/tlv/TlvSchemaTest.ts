/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { Bytes } from "#general";
import { TlvAny } from "#tlv/TlvAny.js";
import { TlvArray } from "#tlv/TlvArray.js";
import { TlvBoolean } from "#tlv/TlvBoolean.js";
import {
    TlvDouble,
    TlvFloat,
    TlvInt16,
    TlvInt32,
    TlvInt64,
    TlvInt8,
    TlvUInt16,
    TlvUInt32,
    TlvUInt64,
    TlvUInt8,
} from "#tlv/TlvNumber.js";
import { TlvField, TlvObject } from "#tlv/TlvObject.js";
import { TlvSchema } from "#tlv/TlvSchema.js";
import { TlvString } from "#tlv/TlvString.js";
import { TlvWrapper } from "#tlv/TlvWrapper.js";

type TestEntry<T> = {
    name: string;
    schema: TlvSchema<T>;
    tlv: string;
    jsObj: T;
};

class CustomObject {
    constructor(readonly value: number) {}
}

const theTestTlvVector = [
    {
        name: "TlvObject: TlvUInt16 and TlvBoolean fields",
        schema: TlvObject({
            field2: TlvField(2, TlvUInt16),
            field3: TlvField(3, TlvUInt16),
            field4: TlvField(4, TlvBoolean),
        }),
        tlv: "15240201240300280418",
        jsObj: { field2: 1, field3: 0, field4: false },
    },
    {
        name: "TlvObject: TlvString fields",
        schema: TlvObject({
            field1: TlvField(1, TlvString),
            field2: TlvField(2, TlvString),
        }),
        tlv: "152c010648656c6c6f212c02174865792074686572652c20686f772061726520796f753f18",
        jsObj: { field1: "Hello!", field2: "Hey there, how are you?" },
    },
    {
        name: "TlvObject: TlvArray field",
        schema: TlvObject({
            field1: TlvField(1, TlvArray(TlvString)),
        }),
        tlv: "1536010c01610c01620c01630c037a7a7a1818",
        jsObj: { field1: ["a", "b", "c", "zzz"] },
    },
    {
        name: "TlvObject: TlvNumber fields",
        schema: TlvObject({
            fieldFloat: TlvField(1, TlvFloat),
            fieldDouble: TlvField(2, TlvDouble),
            fieldInt8: TlvField(3, TlvInt8),
            fieldInt16: TlvField(4, TlvInt16),
            fieldInt32: TlvField(5, TlvInt32),
            fieldInt64: TlvField(6, TlvInt64),
            fieldUInt8: TlvField(7, TlvUInt8),
            fieldUInt16: TlvField(8, TlvUInt16),
            fieldUInt32: TlvField(9, TlvUInt32),
            fieldUInt64: TlvField(10, TlvUInt64),
        }),
        tlv: "152a010892cc452b022fdd24064192b9402003ff2004ff2005ff2006ff240701240801240901240a0118",
        jsObj: {
            fieldFloat: 6546.25390625,
            fieldDouble: 6546.254,
            fieldInt8: -1,
            fieldInt16: -1,
            fieldInt32: -1,
            fieldInt64: -1,
            fieldUInt8: 1,
            fieldUInt16: 1,
            fieldUInt32: 1,
            fieldUInt64: 1,
        },
    },
    {
        name: "TlvObject: nested struct and array of struct",
        schema: TlvObject({
            fieldNested1: TlvField(
                1,
                TlvObject({
                    field1: TlvField(1, TlvString),
                    field2: TlvField(2, TlvString),
                }),
            ),
            fieldNested2: TlvField(
                2,
                TlvObject({
                    field1: TlvField(1, TlvString),
                    field2: TlvField(2, TlvString),
                }),
            ),
            fieldArrayOfStructs: TlvField(
                3,
                TlvArray(
                    TlvObject({
                        fieldString: TlvField(5, TlvString),
                    }),
                ),
            ),
        }),
        tlv: "1535012c010574657374312c020574657374321835022c010574657374332c02057465737434183603152c0505746573743518152c0505746573743618152c05057465737437181818",
        jsObj: {
            fieldNested1: {
                field1: "test1",
                field2: "test2",
            },
            fieldNested2: {
                field1: "test3",
                field2: "test4",
            },
            fieldArrayOfStructs: [{ fieldString: "test5" }, { fieldString: "test6" }, { fieldString: "test7" }],
        },
    },
    {
        name: "TlvWrapper",
        schema: new TlvWrapper(
            TlvUInt16,
            (object: CustomObject) => object.value,
            value => new CustomObject(value),
        ),
        tlv: "040c",
        jsObj: new CustomObject(12),
    },
];

function testTlvSchemaEncode(testEntry: TestEntry<any>) {
    const { name, schema, tlv, jsObj } = testEntry;
    const testName = "TlvSchema.encode " + name;

    it(testName, () => {
        const tlvByteArray = schema.encode(jsObj);
        const tlvHex = Bytes.toHex(tlvByteArray);
        expect(tlvHex).equal(tlv);
    });
}

function testTlvSchemaCalculateByteLength(testEntry: TestEntry<any>) {
    const { name, schema, tlv, jsObj } = testEntry;
    const testName = "TlvSchema.calculateByteLength " + name;

    it(testName, () => {
        const tlvEncoded = schema.encodeTlv(jsObj);
        expect(TlvAny.getEncodedByteLength(tlvEncoded)).equal(tlv.length / 2);
    });
}

function testTlvSchemaDecode(testEntry: TestEntry<any>) {
    const { name, schema, tlv, jsObj } = testEntry;
    const testName = "TlvSchema.decode " + name;

    it(testName, () => {
        const tlvBuffer = Bytes.fromHex(tlv);
        const decoded = schema.decode(tlvBuffer);
        expect(decoded).deep.equal(jsObj);
    });
}

describe("Test TlvSchema", () => {
    theTestTlvVector.forEach(testEntry => {
        testTlvSchemaEncode(testEntry);
        testTlvSchemaCalculateByteLength(testEntry);
        testTlvSchemaDecode(testEntry);
    });
});
