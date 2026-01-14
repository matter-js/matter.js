/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { ValidationError } from "#common/ValidationError.js";
import { FabricIndex, TlvFabricIndex } from "#datatype/FabricIndex.js";
import { Bytes } from "#general";
import { TlvAny } from "#tlv/TlvAny.js";
import { TlvArray } from "#tlv/TlvArray.js";
import { TlvNullable } from "#tlv/TlvNullable.js";
import { TlvUInt8 } from "#tlv/TlvNumber.js";
import {
    TlvField,
    TlvObject,
    TlvOptionalField,
    TlvOptionalRepeatedField,
    TlvRepeatedField,
    TlvTaggedList,
} from "#tlv/TlvObject.js";
import { TypeFromSchema } from "#tlv/TlvSchema.js";
import { TlvString } from "#tlv/TlvString.js";

const schema = TlvObject({
    /** Mandatory field jsdoc */
    mandatoryField: TlvField(1, TlvUInt8),

    /** Optional field jsdoc */
    optionalField: TlvOptionalField(2, TlvString),
});
const schemaUnknownField1 = TlvObject({
    /** Optional field jsdoc */
    optionalField: TlvOptionalField(2, TlvString),
});

const schemaListOptional = TlvTaggedList({
    /** Optional field jsdoc */
    optionalField: TlvOptionalField(1, TlvString),
});

const schemaListRequiredAndOptional = TlvTaggedList({
    /** Optional field jsdoc */
    optionalField: TlvOptionalField(1, TlvString),
    /** Required field jsdoc */
    requiredField: TlvField(2, TlvString),
});

const schemaListOptionalRepeated = TlvTaggedList({
    /** Optional field jsdoc */
    optionalField: TlvOptionalField(1, TlvString),
    /** Optional field jsdoc */
    optionalRepeatedField: TlvOptionalRepeatedField(2, TlvString),
});

const schemaListOptionalRepeatedLimit = TlvTaggedList({
    /** Optional field jsdoc */
    optionalField: TlvOptionalField(1, TlvString),
    /** Optional field jsdoc */
    optionalRepeatedField: TlvOptionalRepeatedField(2, TlvString, { maxLength: 2 }),
});

const schemaListRepeatedLimited = TlvTaggedList({
    /** Optional field jsdoc */
    requiredField: TlvField(1, TlvString),
    /** field jsdoc */
    repeatedField: TlvRepeatedField(2, TlvString, { minLength: 1, maxLength: 2 }),
});

const schemaListRepeatedUnlimited = TlvTaggedList({
    /** Optional field jsdoc */
    requiredField: TlvField(1, TlvString),
    /** field jsdoc */
    repeatedField: TlvRepeatedField(2, TlvString),
});

const schemaWithFabricIndex = TlvObject({
    /** Mandatory field jsdoc */
    mandatoryField: TlvField(1, TlvUInt8),

    /** Optional field jsdoc */
    optionalField: TlvOptionalField(2, TlvString),

    fabricIndex: TlvField(254, TlvFabricIndex),
});

type CodecVector<I, E> = { [valueDescription: string]: { encoded: E; decoded: I } };

const codecVector: CodecVector<TypeFromSchema<typeof schema>, string> = {
    "an object with all fields": {
        decoded: { mandatoryField: 1, optionalField: "test" },
        encoded: "152401012c02047465737418",
    },
    "an object without optional fields": { decoded: { mandatoryField: 1 }, encoded: "1524010118" },
};

describe("TlvObject tests", () => {
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

            it("ignores unknown fields", () => {
                const result = schemaUnknownField1.decode(schema.encode({ mandatoryField: 1, optionalField: "test" }));

                expect(result).deep.equal({ optionalField: "test" });
            });
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
                it(`encode/decodes ${valueDescription}`, () => {
                    const tlvEncoded = schema.encodeTlv(decoded);
                    const tlvDecoded = schema.decodeTlv(tlvEncoded);
                    expect(tlvDecoded).deep.equal(decoded);
                });
            }
        });

        describe("encodeTlv with decodeTlv with fabric index", () => {
            it(`encode/decodes with fabricIndex`, () => {
                const tlvEncoded = schemaWithFabricIndex.encodeTlv({
                    mandatoryField: 1,
                    optionalField: "test",
                    fabricIndex: FabricIndex(1),
                });
                const tlvDecoded = schemaWithFabricIndex.decodeTlv(tlvEncoded);
                expect(tlvDecoded).deep.equal({
                    mandatoryField: 1,
                    optionalField: "test",
                    fabricIndex: FabricIndex(1),
                });
            });

            it(`encode/decodes with ignoring fabricIndex for write interaction`, () => {
                const noFabricEncoded = schema.encodeTlv({ mandatoryField: 1, optionalField: "test" });

                const tlvEncoded = schemaWithFabricIndex.encodeTlv(
                    // @ts-expect-error fabricIndex missing because undefined and ok for writeInteraction
                    {
                        mandatoryField: 1,
                        optionalField: "test",
                    },
                    { forWriteInteraction: true },
                );

                // THe Tlv encoded data is the same as without FabricIndex
                expect(tlvEncoded).deep.equal(noFabricEncoded);

                const tlvDecoded = schemaWithFabricIndex.decodeTlv(tlvEncoded);
                expect(tlvDecoded).deep.equal({
                    mandatoryField: 1,
                    optionalField: "test",
                });
            });
        });

        describe("inject Field value", () => {
            it("injects field value on missing value", () => {
                const result = schema.injectField({ mandatoryField: 1 }, 2, "test", () => true);
                expect(result).deep.equal({ mandatoryField: 1, optionalField: "test" });
            });

            it("injects field value on existing", () => {
                const result = schema.injectField(
                    { mandatoryField: 1, optionalField: "original" },
                    2,
                    "test",
                    () => true,
                );
                expect(result).deep.equal({ mandatoryField: 1, optionalField: "test" });
            });

            it("do not inject field value when not wanted", () => {
                const result = schema.injectField({ mandatoryField: 1 }, 2, "test", () => false);
                expect(result).deep.equal({ mandatoryField: 1 });
            });

            it("do not inject field value when existing", () => {
                const result = schema.injectField(
                    { mandatoryField: 1, optionalField: "original" },
                    2,
                    "test",
                    () => false,
                );
                expect(result).deep.equal({ mandatoryField: 1, optionalField: "original" });
            });

            it("throw error on invalid field value", () => {
                expect(() => schema.injectField({ mandatoryField: 1 }, 2, 2, () => true)).throw(
                    "Expected string, got number.",
                );
            });

            it("injects field value also on nullable array schema", () => {
                const schema = TlvNullable(
                    TlvArray(
                        TlvObject({
                            /** Mandatory field jsdoc */
                            mandatoryField: TlvField(1, TlvUInt8),

                            /** Optional field jsdoc */
                            optionalField: TlvOptionalField(2, TlvString),
                        }),
                    ),
                );

                const result = schema.injectField(
                    [{ mandatoryField: 1 }, { mandatoryField: 2 }],
                    2,
                    "test",
                    () => true,
                );
                expect(result).deep.equal([
                    { mandatoryField: 1, optionalField: "test" },
                    { mandatoryField: 2, optionalField: "test" },
                ]);
            });
        });

        describe("ValidationError", () => {
            it("throws error on invalid field value", () => {
                let hasThrown = false;
                try {
                    // @ts-expect-error  test case
                    schema.validate({ mandatoryField: 1, optionalField: 2 });
                } catch (error) {
                    hasThrown = true;
                    expect(error).instanceof(ValidationError);
                    if (error instanceof ValidationError) {
                        expect(error.message).equal(
                            "(ValidationDatatypeMismatchError/128) Expected string, got number.",
                        );
                        expect(error.fieldName).equal("optionalField");
                    }
                }
                expect(hasThrown).true;
            });
        });

        describe("remove Field value", () => {
            it("remove field value on missing value", () => {
                const result = schema.removeField({ mandatoryField: 1, optionalField: "test" }, 2, () => true);
                expect(result).deep.equal({ mandatoryField: 1 });
            });

            it("do not change field value when missing", () => {
                const result = schema.removeField({ mandatoryField: 1 }, 2, () => true);
                expect(result).deep.equal({ mandatoryField: 1 });
            });

            it("do not remove field value when existing but unwanted", () => {
                const result = schema.removeField({ mandatoryField: 1, optionalField: "original" }, 2, () => false);
                expect(result).deep.equal({ mandatoryField: 1, optionalField: "original" });
            });

            it("removes field value also on nullable array schema", () => {
                const schema = TlvNullable(
                    TlvArray(
                        TlvObject({
                            /** Mandatory field jsdoc */
                            mandatoryField: TlvField(1, TlvUInt8),

                            /** Optional field jsdoc */
                            optionalField: TlvOptionalField(2, TlvString),
                        }),
                    ),
                );

                const result = schema.removeField(
                    [
                        { mandatoryField: 1, optionalField: "test" },
                        { mandatoryField: 2, optionalField: "test" },
                    ],
                    2,
                    () => true,
                );
                expect(result).deep.equal([{ mandatoryField: 1 }, { mandatoryField: 2 }]);
            });
        });
    });

    describe("TlvTaggedList", () => {
        it("encode and decode list with optional fields", () => {
            const data = { optionalField: "test" };
            const encoded = schemaListOptional.encode(data);
            expect(Bytes.toHex(encoded)).equal("172c01047465737418");
            expect(schemaListOptional.decode(encoded)).deep.equal(data);
        });

        it("encode and decode list with optional and required fields in list order", () => {
            const data = { optionalField: "test", requiredField: "testreq" };
            const encoded = schemaListRequiredAndOptional.encode(data);
            expect(Bytes.toHex(encoded)).equal("172c0104746573742c02077465737472657118");
            expect(schemaListRequiredAndOptional.decode(encoded)).deep.equal(data);
        });

        it("encode and decode list with optional and required fields in switched order", () => {
            const data = { requiredField: "testreq", optionalField: "test" };
            const encoded = schemaListRequiredAndOptional.encode(data);
            expect(Bytes.toHex(encoded)).equal("172c0207746573747265712c01047465737418");
            expect(schemaListRequiredAndOptional.decode(encoded)).deep.equal(data);
        });

        it("encode and decode list with optional and required fields without optional field", () => {
            const data = { requiredField: "testreq" };
            const encoded = schemaListRequiredAndOptional.encode(data);
            expect(Bytes.toHex(encoded)).equal("172c02077465737472657118");
            expect(schemaListRequiredAndOptional.decode(encoded)).deep.equal(data);
        });

        it("encode and decode list with optional repeated fields", () => {
            const data = {
                optionalField: "test",
                optionalRepeatedField: ["test1", "test2"],
            };
            const encoded = schemaListOptionalRepeated.encode(data);
            expect(Bytes.toHex(encoded)).equal("172c0104746573742c020574657374312c0205746573743218");
            expect(schemaListOptionalRepeated.decode(encoded)).deep.equal(data);
        });

        it("encode and decode list with optional repeated fields with limit", () => {
            const data = {
                optionalField: "test",
                optionalRepeatedField: ["test1", "test2"],
            };
            const encoded = schemaListOptionalRepeatedLimit.encode(data);
            expect(Bytes.toHex(encoded)).equal("172c0104746573742c020574657374312c0205746573743218");
            expect(schemaListOptionalRepeatedLimit.decode(encoded)).deep.equal(data);
        });

        it("throws error on too long repeated optional fields encoding", () => {
            expect(() =>
                schemaListOptionalRepeatedLimit.encode({
                    optionalField: "test",
                    optionalRepeatedField: ["test1", "test2", "test3"],
                }),
            ).throw("Repeated field list for optionalRepeatedField is too long: 3, max 2.");
        });

        it("throws error on too long repeated optional fields decoding", () => {
            const encoded = schemaListRepeatedUnlimited.encode({
                requiredField: "test",
                repeatedField: ["test1", "test2", "test3"],
            });
            expect(Bytes.toHex(encoded)).equal("172c0104746573742c020574657374312c020574657374322c0205746573743318");

            expect(() => schemaListOptionalRepeatedLimit.decode(encoded)).throw(
                "Repeated field list for optionalRepeatedField is too long: 3, max 2.",
            );
        });

        it("encode and decode list with repeated fields", () => {
            const data = {
                requiredField: "test",
                repeatedField: ["test1", "test2"],
            };
            const encoded = schemaListRepeatedLimited.encode(data);
            expect(Bytes.toHex(encoded)).equal("172c0104746573742c020574657374312c0205746573743218");
            expect(schemaListRepeatedLimited.decode(encoded)).deep.equal(data);
        });

        it("encode and decode list with switched repeated fields", () => {
            const data = {
                repeatedField: ["test1", "test2"],
                requiredField: "test",
            };
            const encoded = schemaListRepeatedLimited.encode(data);
            expect(Bytes.toHex(encoded)).equal("172c020574657374312c020574657374322c01047465737418");
            expect(schemaListRepeatedLimited.decode(encoded)).deep.equal(data);
        });

        it("encode and decode list with repeated fields with limit #1", () => {
            const data = {
                requiredField: "test",
                repeatedField: ["test1", "test2"],
            };
            const encoded = schemaListRepeatedLimited.encode(data);
            expect(Bytes.toHex(encoded)).equal("172c0104746573742c020574657374312c0205746573743218");
            expect(schemaListRepeatedLimited.decode(encoded)).deep.equal(data);
        });

        it("encode and decode list with repeated fields with limit #2", () => {
            const data = {
                requiredField: "test",
                repeatedField: ["test1"],
            };
            const encoded = schemaListRepeatedLimited.encode(data);
            expect(Bytes.toHex(encoded)).equal("172c0104746573742c0205746573743118");
            expect(schemaListRepeatedLimited.decode(encoded)).deep.equal(data);
        });

        it("throws error on missing required fields", () => {
            // @ts-expect-error test case
            expect(() => schemaListRepeatedLimited.encode({ requiredField: "test" })).throw(
                "(ValidationMandatoryFieldMissingError/128) Missing mandatory field repeatedField",
            );
        });

        it("throws error on too short or too long repeated fields", () => {
            expect(() => schemaListRepeatedLimited.encode({ requiredField: "test", repeatedField: [] })).throw(
                "Repeated field list for repeatedField is too short: 0, min 1.",
            );
            expect(() =>
                schemaListRepeatedLimited.encode({ requiredField: "test", repeatedField: ["test1", "test2", "test3"] }),
            ).throw("Repeated field list for repeatedField is too long: 3, max 2.");
        });

        it("throws error on decoding list with repeated fields without limit", () => {
            const encoded = schemaListRepeatedUnlimited.encode({
                requiredField: "test",
                repeatedField: ["test1", "test2", "test3"],
            });
            expect(Bytes.toHex(encoded)).equal("172c0104746573742c020574657374312c020574657374322c0205746573743318");

            // Decode with limit
            expect(() => schemaListRepeatedLimited.decode(encoded)).throw(
                "Repeated field list for repeatedField is too long: 3, max 2.",
            );
        });

        it("preserves the field order also when different from field definition with repeated fields", () => {
            const data = {
                repeatedField: ["test1"],
                requiredField: "test",
            };
            const encoded = schemaListRepeatedLimited.encode(data);
            expect(Bytes.toHex(encoded)).equal("172c020574657374312c01047465737418");
            expect(schemaListRepeatedLimited.decode(encoded)).deep.equal(data);
        });
    });

    describe("Tlv Lists with protocol specific tags", () => {
        it("decodes list with protocol specific tags", () => {
            const data = Bytes.fromHex(
                "17D00000F1FF01003D48656C6C6F20576F726C642E205468697320697320612073696E676C6520656C656D656E74206C6976696E6720617320612063686172737472696E670018",
            );
            const result = TlvTaggedList({} /* No fields, sufficient for validation */, true).decode(data);
            expect(result).deep.equal({});
        });

        it("fails when protocol specific tags are not allowed", () => {
            const data = Bytes.fromHex(
                "17D00000F1FF01003D48656C6C6F20576F726C642E205468697320697320612073696E676C6520656C656D656E74206C6976696E6720617320612063686172737472696E670018",
            );
            expect(() => TlvTaggedList({} /* No fields, sufficient for validation */, false).decode(data)).to.throw(
                "Structure element tags should be context-specific.",
            );
        });
    });
});
