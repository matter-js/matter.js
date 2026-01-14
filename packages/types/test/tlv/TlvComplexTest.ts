/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { ValidationError } from "#common/ValidationError.js";
import { FabricId, TlvFabricId } from "#datatype/FabricId.js";
import { FabricIndex, TlvFabricIndex } from "#datatype/FabricIndex.js";
import { Bytes } from "#general";
import { TlvAny } from "#tlv/TlvAny.js";
import { TlvArray } from "#tlv/TlvArray.js";
import { TlvBoolean } from "#tlv/TlvBoolean.js";
import { TlvNullable } from "#tlv/TlvNullable.js";
import { TlvUInt8 } from "#tlv/TlvNumber.js";
import { TlvField, TlvObject, TlvOptionalField } from "#tlv/TlvObject.js";
import { TypeFromSchema } from "#tlv/TlvSchema.js";
import { TlvByteString, TlvString } from "#tlv/TlvString.js";

const schema = TlvObject({
    /** Mandatory field jsdoc */
    arrayField: TlvField(
        1,
        TlvArray(
            TlvObject({
                /** Mandatory array field jsdoc */
                mandatoryNumber: TlvField(1, TlvUInt8),

                /** Optional array field jsdoc */
                optionalByteString: TlvOptionalField(2, TlvByteString.bound({ minLength: 3, maxLength: 3 })),
            }),
            { minLength: 1, maxLength: 2 },
        ),
    ),

    /** Optional field jsdoc */
    optionalString: TlvOptionalField(2, TlvString),

    /** Nullable field jsdoc */
    nullableBoolean: TlvField(3, TlvNullable(TlvBoolean)),

    /** Optional Wrapper bigint type */
    optionalWrapperBigInt: TlvOptionalField(4, TlvFabricId),

    /** Optional Wrapper number type */
    optionalWrapperNumber: TlvOptionalField(5, TlvFabricIndex),
});

type CodecVector<I, E> = { [valueDescription: string]: { encoded: E; decoded: I } };
type CodecErrorVector<I> = {
    [valueDescription: string]: { structure: I; expectedError?: string; errorFieldName?: string };
};

const codecVector: CodecVector<TypeFromSchema<typeof schema>, string> = {
    "an object with all fields": {
        decoded: {
            arrayField: [
                { mandatoryNumber: 1, optionalByteString: Bytes.of(Bytes.fromHex("000000")) },
                { mandatoryNumber: 2, optionalByteString: Bytes.of(Bytes.fromHex("999999")) },
            ],
            optionalString: "test",
            nullableBoolean: true,
            optionalWrapperBigInt: FabricId(BigInt(1)),
            optionalWrapperNumber: FabricIndex(2),
        },
        encoded: "15360115240101300203000000181524010230020399999918182c020474657374290324040124050218",
    },
    "an object with minimum fields": {
        decoded: {
            arrayField: [{ mandatoryNumber: 1 }],
            nullableBoolean: null,
        },
        encoded: "153601152401011818340318",
    },
    "an object without wrapped fields": {
        decoded: {
            arrayField: [
                { mandatoryNumber: 1, optionalByteString: Bytes.of(Bytes.fromHex("000000")) },
                { mandatoryNumber: 2, optionalByteString: Bytes.of(Bytes.fromHex("999999")) },
            ],
            optionalString: "test",
            nullableBoolean: true,
        },
        encoded: "15360115240101300203000000181524010230020399999918182c020474657374290318",
    },
};

const codecErrorVector: CodecErrorVector<TypeFromSchema<typeof schema>> = {
    // "as any" used to bypass TS compiler checks to properly test validation logic
    "an object with no fields": {
        structure: {} as any,
        expectedError: "(ValidationMandatoryFieldMissingError/128) Missing mandatory field arrayField",
        errorFieldName: "arrayField",
    },
    "an object with empty array": {
        structure: {
            arrayField: [],
        } as any,
        expectedError: "(ValidationOutOfBoundsError/135) Array [] is too short: 0, min 1.",
        errorFieldName: "arrayField",
    },
    "an object with missing nullable value": {
        structure: {
            arrayField: [{ mandatoryNumber: 1 }],
        } as any,
        expectedError: "(ValidationMandatoryFieldMissingError/128) Missing mandatory field nullableBoolean",
        errorFieldName: "nullableBoolean",
    },
    "an object with invalid datatype in array": {
        structure: {
            arrayField: [
                {
                    mandatoryNumber: "test",
                },
            ],
        } as any,
        expectedError: "(ValidationDatatypeMismatchError/128) Expected number, got string.",
        errorFieldName: "arrayField.[0].mandatoryNumber",
    },
    "an object with invalid datatype in array #2": {
        structure: {
            arrayField: [
                {
                    mandatoryNumber: [
                        {
                            mandatoryNumber: 1,
                        },
                    ],
                },
            ],
        } as any,
        expectedError: "(ValidationDatatypeMismatchError/128) Expected number, got object.",
        errorFieldName: "arrayField.[0].mandatoryNumber",
    },
    "an object with invalid number wrapper value": {
        structure: {
            arrayField: [
                {
                    mandatoryNumber: 1,
                },
            ],
            nullableBoolean: null,
            optionalWrapperNumber: FabricIndex(0x12345678),
        },
        expectedError: "(ValidationOutOfBoundsError/135) Invalid value: 305419896 is above the maximum, 254.",
        errorFieldName: "optionalWrapperNumber",
    },
};

describe("TlvObject", () => {
    describe("encode", () => {
        for (const valueDescription in codecVector) {
            const { encoded, decoded } = codecVector[valueDescription];
            it(`encodes ${valueDescription}`, () => {
                expect(Bytes.toHex(schema.encode(decoded))).equal(encoded);
            });
        }
    });

    describe("decode", () => {
        for (const valueDescription in codecVector) {
            const { encoded, decoded } = codecVector[valueDescription];
            it(`decodes ${valueDescription}`, () => {
                expect(schema.decode(Bytes.fromHex(encoded))).deep.equal(decoded);
            });
        }
    });

    describe("calculate byte length", () => {
        for (const valueDescription in codecVector) {
            const { encoded, decoded } = codecVector[valueDescription];
            it(`calculate byte length ${valueDescription}`, () => {
                const tlvEncoded = schema.encodeTlv(decoded);
                expect(TlvAny.getEncodedByteLength(tlvEncoded)).equal(encoded.length / 2);
            });
        }
    });

    describe("encodeTlv with decodeTlv", () => {
        for (const valueDescription in codecVector) {
            const { decoded } = codecVector[valueDescription];
            it(`encodes/decodes ${valueDescription}`, () => {
                const tlvEncoded = schema.encodeTlv(decoded);
                const tlvDecoded = schema.decodeTlv(tlvEncoded);
                expect(tlvDecoded).deep.equal(decoded);
            });
        }
    });

    describe("errors", () => {
        for (const valueDescription in codecErrorVector) {
            const { structure, expectedError, errorFieldName } = codecErrorVector[valueDescription];
            it(`checks ${valueDescription}`, () => {
                try {
                    schema.validate(structure);
                } catch (error) {
                    expect(error).instanceof(ValidationError);
                    expect((error as ValidationError).message).equal(expectedError);
                    expect((error as ValidationError).fieldName).equal(errorFieldName);
                }
            });

            it(`encodes ${valueDescription}, expect error`, () => {
                try {
                    schema.encode(structure);
                } catch (error) {
                    expect(error).instanceof(ValidationError);
                    expect((error as ValidationError).message).equal(expectedError);
                    expect((error as ValidationError).fieldName).equal(errorFieldName);
                }
            });
        }
    });
});
