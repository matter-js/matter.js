/**
 * @license
 * Copyright 2022-2025 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { DataWriter } from "#util/DataWriter.js";
import { DataReader } from "#util/DataReader.js";
import { Endian } from "#util/Bytes.js";

describe("DataWriter", () => {
    describe("constructor", () => {
        it("creates writer with big endian by default", () => {
            const writer = new DataWriter();

            expect(writer).not.undefined;
        });

        it("creates writer with little endian when specified", () => {
            const writer = new DataWriter(Endian.Little);

            expect(writer).not.undefined;
        });
    });

    describe("writeUInt8", () => {
        it("writes unsigned 8-bit integer", () => {
            const writer = new DataWriter();

            writer.writeUInt8(0x12);
            writer.writeUInt8(0x34);
            writer.writeUInt8(0xff);

            const result = writer.toByteArray();
            expect(result).deep.equal(new Uint8Array([0x12, 0x34, 0xff]));
        });

        it("accepts bigint values", () => {
            const writer = new DataWriter();

            writer.writeUInt8(0x12n);

            const result = writer.toByteArray();
            expect(result).deep.equal(new Uint8Array([0x12]));
        });
    });

    describe("writeUInt16", () => {
        it("writes unsigned 16-bit integer in big endian", () => {
            const writer = new DataWriter(Endian.Big);

            writer.writeUInt16(0x1234);
            writer.writeUInt16(0xff00);

            const result = writer.toByteArray();
            expect(result).deep.equal(new Uint8Array([0x12, 0x34, 0xff, 0x00]));
        });

        it("writes unsigned 16-bit integer in little endian", () => {
            const writer = new DataWriter(Endian.Little);

            writer.writeUInt16(0x1234);
            writer.writeUInt16(0xff00);

            const result = writer.toByteArray();
            expect(result).deep.equal(new Uint8Array([0x34, 0x12, 0x00, 0xff]));
        });

        it("accepts bigint values", () => {
            const writer = new DataWriter(Endian.Big);

            writer.writeUInt16(0x1234n);

            const result = writer.toByteArray();
            expect(result).deep.equal(new Uint8Array([0x12, 0x34]));
        });
    });

    describe("writeUInt32", () => {
        it("writes unsigned 32-bit integer in big endian", () => {
            const writer = new DataWriter(Endian.Big);

            writer.writeUInt32(0x12345678);

            const result = writer.toByteArray();
            expect(result).deep.equal(new Uint8Array([0x12, 0x34, 0x56, 0x78]));
        });

        it("writes unsigned 32-bit integer in little endian", () => {
            const writer = new DataWriter(Endian.Little);

            writer.writeUInt32(0x12345678);

            const result = writer.toByteArray();
            expect(result).deep.equal(new Uint8Array([0x78, 0x56, 0x34, 0x12]));
        });

        it("accepts bigint values", () => {
            const writer = new DataWriter(Endian.Big);

            writer.writeUInt32(0x12345678n);

            const result = writer.toByteArray();
            expect(result).deep.equal(new Uint8Array([0x12, 0x34, 0x56, 0x78]));
        });
    });

    describe("writeUInt64", () => {
        it("writes unsigned 64-bit integer in big endian", () => {
            const writer = new DataWriter(Endian.Big);

            writer.writeUInt64(0x123456789abcdef0n);

            const result = writer.toByteArray();
            expect(result).deep.equal(new Uint8Array([0x12, 0x34, 0x56, 0x78, 0x9a, 0xbc, 0xde, 0xf0]));
        });

        it("writes unsigned 64-bit integer in little endian", () => {
            const writer = new DataWriter(Endian.Little);

            writer.writeUInt64(0x123456789abcdef0n);

            const result = writer.toByteArray();
            expect(result).deep.equal(new Uint8Array([0xf0, 0xde, 0xbc, 0x9a, 0x78, 0x56, 0x34, 0x12]));
        });

        it("accepts number values", () => {
            const writer = new DataWriter(Endian.Big);

            writer.writeUInt64(0x12345678);

            const result = writer.toByteArray();
            expect(result).deep.equal(new Uint8Array([0x00, 0x00, 0x00, 0x00, 0x12, 0x34, 0x56, 0x78]));
        });
    });

    describe("writeInt8", () => {
        it("writes signed 8-bit integer", () => {
            const writer = new DataWriter();

            writer.writeInt8(0x12);
            writer.writeInt8(-1);
            writer.writeInt8(-128);

            const result = writer.toByteArray();
            expect(result).deep.equal(new Uint8Array([0x12, 0xff, 0x80]));
        });

        it("accepts bigint values", () => {
            const writer = new DataWriter();

            writer.writeInt8(-1n);

            const result = writer.toByteArray();
            expect(result).deep.equal(new Uint8Array([0xff]));
        });
    });

    describe("writeInt16", () => {
        it("writes signed 16-bit integer in big endian", () => {
            const writer = new DataWriter(Endian.Big);

            writer.writeInt16(0x1234);
            writer.writeInt16(-1);
            writer.writeInt16(-32768);

            const result = writer.toByteArray();
            expect(result).deep.equal(new Uint8Array([0x12, 0x34, 0xff, 0xff, 0x80, 0x00]));
        });

        it("writes signed 16-bit integer in little endian", () => {
            const writer = new DataWriter(Endian.Little);

            writer.writeInt16(0x1234);
            writer.writeInt16(-1);

            const result = writer.toByteArray();
            expect(result).deep.equal(new Uint8Array([0x34, 0x12, 0xff, 0xff]));
        });

        it("accepts bigint values", () => {
            const writer = new DataWriter(Endian.Big);

            writer.writeInt16(-1n);

            const result = writer.toByteArray();
            expect(result).deep.equal(new Uint8Array([0xff, 0xff]));
        });
    });

    describe("writeInt32", () => {
        it("writes signed 32-bit integer in big endian", () => {
            const writer = new DataWriter(Endian.Big);

            writer.writeInt32(0x12345678);
            writer.writeInt32(-1);

            const result = writer.toByteArray();
            expect(result).deep.equal(new Uint8Array([0x12, 0x34, 0x56, 0x78, 0xff, 0xff, 0xff, 0xff]));
        });

        it("writes signed 32-bit integer in little endian", () => {
            const writer = new DataWriter(Endian.Little);

            writer.writeInt32(0x12345678);
            writer.writeInt32(-1);

            const result = writer.toByteArray();
            expect(result).deep.equal(new Uint8Array([0x78, 0x56, 0x34, 0x12, 0xff, 0xff, 0xff, 0xff]));
        });

        it("accepts bigint values", () => {
            const writer = new DataWriter(Endian.Big);

            writer.writeInt32(-1n);

            const result = writer.toByteArray();
            expect(result).deep.equal(new Uint8Array([0xff, 0xff, 0xff, 0xff]));
        });
    });

    describe("writeInt64", () => {
        it("writes signed 64-bit integer in big endian", () => {
            const writer = new DataWriter(Endian.Big);

            writer.writeInt64(0x123456789abcdef0n);
            writer.writeInt64(-1n);

            const result = writer.toByteArray();
            expect(result).deep.equal(
                new Uint8Array([0x12, 0x34, 0x56, 0x78, 0x9a, 0xbc, 0xde, 0xf0, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff]),
            );
        });

        it("writes signed 64-bit integer in little endian", () => {
            const writer = new DataWriter(Endian.Little);

            writer.writeInt64(0x123456789abcdef0n);
            writer.writeInt64(-1n);

            const result = writer.toByteArray();
            expect(result).deep.equal(
                new Uint8Array([0xf0, 0xde, 0xbc, 0x9a, 0x78, 0x56, 0x34, 0x12, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff]),
            );
        });

        it("accepts number values", () => {
            const writer = new DataWriter(Endian.Big);

            writer.writeInt64(-1);

            const result = writer.toByteArray();
            expect(result).deep.equal(new Uint8Array([0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff]));
        });
    });

    describe("writeFloat", () => {
        it("writes 32-bit float in big endian", () => {
            const writer = new DataWriter(Endian.Big);

            writer.writeFloat(3.14);

            const result = writer.toByteArray();
            const reader = new DataReader(result, Endian.Big);
            expect(reader.readFloat()).closeTo(3.14, 0.01);
        });

        it("writes 32-bit float in little endian", () => {
            const writer = new DataWriter(Endian.Little);

            writer.writeFloat(3.14);

            const result = writer.toByteArray();
            const reader = new DataReader(result, Endian.Little);
            expect(reader.readFloat()).closeTo(3.14, 0.01);
        });
    });

    describe("writeDouble", () => {
        it("writes 64-bit float in big endian", () => {
            const writer = new DataWriter(Endian.Big);

            writer.writeDouble(3.141592653589793);

            const result = writer.toByteArray();
            const reader = new DataReader(result, Endian.Big);
            expect(reader.readDouble()).equal(3.141592653589793);
        });

        it("writes 64-bit float in little endian", () => {
            const writer = new DataWriter(Endian.Little);

            writer.writeDouble(3.141592653589793);

            const result = writer.toByteArray();
            const reader = new DataReader(result, Endian.Little);
            expect(reader.readDouble()).equal(3.141592653589793);
        });
    });

    describe("writeByteArray", () => {
        it("writes byte array", () => {
            const writer = new DataWriter();

            writer.writeByteArray(new Uint8Array([0x12, 0x34, 0x56]));

            const result = writer.toByteArray();
            expect(result).deep.equal(new Uint8Array([0x12, 0x34, 0x56]));
        });

        it("writes multiple byte arrays", () => {
            const writer = new DataWriter();

            writer.writeByteArray(new Uint8Array([0x12, 0x34]));
            writer.writeByteArray(new Uint8Array([0x56, 0x78]));

            const result = writer.toByteArray();
            expect(result).deep.equal(new Uint8Array([0x12, 0x34, 0x56, 0x78]));
        });
    });

    describe("toByteArray", () => {
        it("returns empty array when no data written", () => {
            const writer = new DataWriter();

            const result = writer.toByteArray();
            expect(result).deep.equal(new Uint8Array(0));
        });

        it("returns single chunk when only one write", () => {
            const writer = new DataWriter();

            writer.writeByteArray(new Uint8Array([0x12, 0x34]));

            const result = writer.toByteArray();
            expect(result).deep.equal(new Uint8Array([0x12, 0x34]));
        });

        it("concatenates multiple chunks", () => {
            const writer = new DataWriter();

            writer.writeUInt8(0x12);
            writer.writeUInt16(0x3456);
            writer.writeUInt32(0x789abcde);

            const result = writer.toByteArray();
            expect(result.length).equal(7);
        });

        it("consolidates chunks after first call", () => {
            const writer = new DataWriter();

            writer.writeUInt8(0x12);
            writer.writeUInt8(0x34);

            const result1 = writer.toByteArray();
            const result2 = writer.toByteArray();

            expect(result1).equal(result2); // Should be same reference after consolidation
        });
    });

    describe("mixed writes", () => {
        it("writes multiple types sequentially", () => {
            const writer = new DataWriter(Endian.Big);

            writer.writeUInt8(0x12);
            writer.writeUInt16(0x3456);
            writer.writeUInt32(0x789abcde);
            writer.writeFloat(3.14);

            const result = writer.toByteArray();
            const reader = new DataReader(result, Endian.Big);

            expect(reader.readUInt8()).equal(0x12);
            expect(reader.readUInt16()).equal(0x3456);
            expect(reader.readUInt32()).equal(0x789abcde);
            expect(reader.readFloat()).closeTo(3.14, 0.01);
        });
    });

    describe("round-trip with DataReader", () => {
        it("writes and reads back identical data in big endian", () => {
            const writer = new DataWriter(Endian.Big);

            writer.writeUInt8(0x12);
            writer.writeUInt16(0x3456);
            writer.writeUInt32(0x789abcde);
            writer.writeUInt64(0x123456789abcdef0n);
            writer.writeInt8(-1);
            writer.writeInt16(-1000);
            writer.writeInt32(-100000);
            writer.writeInt64(-1n);
            writer.writeFloat(3.14);
            writer.writeDouble(2.718281828459045);
            writer.writeByteArray(new Uint8Array([0xaa, 0xbb, 0xcc]));

            const buffer = writer.toByteArray();
            const reader = new DataReader(buffer, Endian.Big);

            expect(reader.readUInt8()).equal(0x12);
            expect(reader.readUInt16()).equal(0x3456);
            expect(reader.readUInt32()).equal(0x789abcde);
            expect(reader.readUInt64()).equal(0x123456789abcdef0n);
            expect(reader.readInt8()).equal(-1);
            expect(reader.readInt16()).equal(-1000);
            expect(reader.readInt32()).equal(-100000);
            expect(reader.readInt64()).equal(-1n);
            expect(reader.readFloat()).closeTo(3.14, 0.01);
            expect(reader.readDouble()).equal(2.718281828459045);
            expect(reader.readByteArray(3)).deep.equal(new Uint8Array([0xaa, 0xbb, 0xcc]));
        });

        it("writes and reads back identical data in little endian", () => {
            const writer = new DataWriter(Endian.Little);

            writer.writeUInt16(0x3456);
            writer.writeUInt32(0x789abcde);
            writer.writeInt16(-1000);
            writer.writeInt32(-100000);

            const buffer = writer.toByteArray();
            const reader = new DataReader(buffer, Endian.Little);

            expect(reader.readUInt16()).equal(0x3456);
            expect(reader.readUInt32()).equal(0x789abcde);
            expect(reader.readInt16()).equal(-1000);
            expect(reader.readInt32()).equal(-100000);
        });
    });
});
