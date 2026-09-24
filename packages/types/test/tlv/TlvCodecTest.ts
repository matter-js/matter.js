/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { TlvAny } from "#tlv/TlvAny.js";
import { TlvCodec, TlvTag, TlvType } from "#tlv/TlvCodec.js";
import { TlvUInt8 } from "#tlv/TlvNumber.js";
import { TlvField, TlvObject } from "#tlv/TlvObject.js";
import { Bytes, DataReader, DataWriter, Endian, UnexpectedDataError } from "@matter/general";

function readTag(hex: string) {
    return TlvCodec.readTagType(new DataReader(Bytes.fromHex(hex), Endian.Little)).tag;
}

function writeTag(tag: TlvTag) {
    const writer = new DataWriter(Endian.Little);
    TlvCodec.writeTag(writer, { type: TlvType.UnsignedInt, length: 0 }, tag);
    return Bytes.toHex(writer.toByteArray());
}

// Tag encodings from Matter Core specification Appendix A.12 (vendor 0xFFF1, profile 0xDEED)
const FULLY_QUALIFIED_PROFILE = 0xdeed_fff1;
const tagVectors: { [description: string]: { encoded: string; tag: TlvTag } } = {
    "context tag": { encoded: "2401", tag: { id: 1 } },
    "common profile tag, 2 octets": { encoded: "440100", tag: { profile: 0, id: 1 } },
    "common profile tag, 4 octets": { encoded: "64a0860100", tag: { profile: 0, id: 100000 } },
    "fully qualified tag, 2 octets": {
        encoded: "c4f1ffedde0100",
        tag: { profile: FULLY_QUALIFIED_PROFILE, id: 1 },
    },
    "fully qualified tag, 4 octets": {
        encoded: "e4f1ffeddeedfe55aa",
        tag: { profile: FULLY_QUALIFIED_PROFILE, id: 0xaa55feed },
    },
};

describe("TlvCodec", () => {
    describe("tags", () => {
        for (const [description, { encoded, tag }] of Object.entries(tagVectors)) {
            it(`reads ${description}`, () => {
                expect(readTag(encoded)).deep.equal(tag);
            });

            it(`writes ${description}`, () => {
                expect(writeTag(tag)).equal(encoded);
            });
        }

        it("decodes a structure member with a 4-octet fully qualified tag", () => {
            expect(TlvAny.decode(Bytes.fromHex("15e4f1ffeddeedfe55aa2a18"))[1]).deep.equal({
                tag: { profile: FULLY_QUALIFIED_PROFILE, id: 0xaa55feed },
                typeLength: { type: TlvType.UnsignedInt, length: 0 },
                value: 42,
            });
        });

        for (const [description, encoded] of Object.entries({
            "implicit profile tag, 2 octets": "840100",
            "implicit profile tag, 4 octets": "a401000000",
        })) {
            it(`rejects ${description} as unexpected data`, () => {
                expect(() => readTag(encoded)).throw(UnexpectedDataError, "Implicit profile tag");
            });
        }

        it("rejects a structure containing an implicit profile tag as unexpected data", () => {
            const TlvStruct = TlvObject({ value: TlvField(1, TlvUInt8) });

            expect(() => TlvStruct.decode(Bytes.fromHex("158401002a18"))).throw(
                UnexpectedDataError,
                "Implicit profile tag",
            );
        });
    });
});
