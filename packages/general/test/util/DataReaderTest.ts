/**
 * @license
 * Copyright 2022-2025 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { DataReader } from "#util/DataReader.js";
import { Endian } from "#util/Bytes.js";

describe("DataReader", () => {
    describe("constructor", () => {
        it("creates reader with big endian by default", () => {
            const buffer = new Uint8Array([0x12, 0x34]);
            const reader = new DataReader(buffer);

            expect(reader.length).equal(2);
            expect(reader.offset).equal(0);
        });

        it("creates reader with little endian when specified", () => {
            const buffer = new Uint8Array([0x12, 0x34]);
            const reader = new DataReader(buffer, Endian.Little);

            expect(reader.length).equal(2);
        });
    });

    describe("readUInt8", () => {
        it("reads unsigned 8-bit integer", () => {
            const buffer = new Uint8Array([0x12, 0x34, 0xff]);
            const reader = new DataReader(buffer);

            expect(reader.readUInt8()).equal(0x12);
            expect(reader.readUInt8()).equal(0x34);
            expect(reader.readUInt8()).equal(0xff);
        });

        it("advances offset by 1", () => {
            const buffer = new Uint8Array([0x12, 0x34]);
            const reader = new DataReader(buffer);

            reader.readUInt8();
            expect(reader.offset).equal(1);

            reader.readUInt8();
            expect(reader.offset).equal(2);
        });
    });

    describe("readUInt16", () => {
        it("reads unsigned 16-bit integer in big endian", () => {
            const buffer = new Uint8Array([0x12, 0x34, 0xff, 0x00]);
            const reader = new DataReader(buffer, Endian.Big);

            expect(reader.readUInt16()).equal(0x1234);
            expect(reader.readUInt16()).equal(0xff00);
        });

        it("reads unsigned 16-bit integer in little endian", () => {
            const buffer = new Uint8Array([0x12, 0x34, 0xff, 0x00]);
            const reader = new DataReader(buffer, Endian.Little);

            expect(reader.readUInt16()).equal(0x3412);
            expect(reader.readUInt16()).equal(0x00ff);
        });

        it("advances offset by 2", () => {
            const buffer = new Uint8Array([0x12, 0x34, 0x56, 0x78]);
            const reader = new DataReader(buffer);

            reader.readUInt16();
            expect(reader.offset).equal(2);
        });
    });

    describe("readUInt32", () => {
        it("reads unsigned 32-bit integer in big endian", () => {
            const buffer = new Uint8Array([0x12, 0x34, 0x56, 0x78]);
            const reader = new DataReader(buffer, Endian.Big);

            expect(reader.readUInt32()).equal(0x12345678);
        });

        it("reads unsigned 32-bit integer in little endian", () => {
            const buffer = new Uint8Array([0x12, 0x34, 0x56, 0x78]);
            const reader = new DataReader(buffer, Endian.Little);

            expect(reader.readUInt32()).equal(0x78563412);
        });

        it("advances offset by 4", () => {
            const buffer = new Uint8Array([0x12, 0x34, 0x56, 0x78]);
            const reader = new DataReader(buffer);

            reader.readUInt32();
            expect(reader.offset).equal(4);
        });
    });

    describe("readUInt64", () => {
        it("reads unsigned 64-bit integer in big endian", () => {
            const buffer = new Uint8Array([0x12, 0x34, 0x56, 0x78, 0x9a, 0xbc, 0xde, 0xf0]);
            const reader = new DataReader(buffer, Endian.Big);

            expect(reader.readUInt64()).equal(0x123456789abcdef0n);
        });

        it("reads unsigned 64-bit integer in little endian", () => {
            const buffer = new Uint8Array([0x12, 0x34, 0x56, 0x78, 0x9a, 0xbc, 0xde, 0xf0]);
            const reader = new DataReader(buffer, Endian.Little);

            expect(reader.readUInt64()).equal(0xf0debc9a78563412n);
        });

        it("advances offset by 8", () => {
            const buffer = new Uint8Array([0x12, 0x34, 0x56, 0x78, 0x9a, 0xbc, 0xde, 0xf0]);
            const reader = new DataReader(buffer);

            reader.readUInt64();
            expect(reader.offset).equal(8);
        });
    });

    describe("readInt8", () => {
        it("reads signed 8-bit integer", () => {
            const buffer = new Uint8Array([0x12, 0xff, 0x80]);
            const reader = new DataReader(buffer);

            expect(reader.readInt8()).equal(0x12);
            expect(reader.readInt8()).equal(-1);
            expect(reader.readInt8()).equal(-128);
        });
    });

    describe("readInt16", () => {
        it("reads signed 16-bit integer in big endian", () => {
            const buffer = new Uint8Array([0x12, 0x34, 0xff, 0xff, 0x80, 0x00]);
            const reader = new DataReader(buffer, Endian.Big);

            expect(reader.readInt16()).equal(0x1234);
            expect(reader.readInt16()).equal(-1);
            expect(reader.readInt16()).equal(-32768);
        });

        it("reads signed 16-bit integer in little endian", () => {
            const buffer = new Uint8Array([0x34, 0x12, 0xff, 0xff]);
            const reader = new DataReader(buffer, Endian.Little);

            expect(reader.readInt16()).equal(0x1234);
            expect(reader.readInt16()).equal(-1);
        });
    });

    describe("readInt32", () => {
        it("reads signed 32-bit integer in big endian", () => {
            const buffer = new Uint8Array([0x12, 0x34, 0x56, 0x78, 0xff, 0xff, 0xff, 0xff]);
            const reader = new DataReader(buffer, Endian.Big);

            expect(reader.readInt32()).equal(0x12345678);
            expect(reader.readInt32()).equal(-1);
        });

        it("reads signed 32-bit integer in little endian", () => {
            const buffer = new Uint8Array([0x78, 0x56, 0x34, 0x12, 0xff, 0xff, 0xff, 0xff]);
            const reader = new DataReader(buffer, Endian.Little);

            expect(reader.readInt32()).equal(0x12345678);
            expect(reader.readInt32()).equal(-1);
        });
    });

    describe("readInt64", () => {
        it("reads signed 64-bit integer in big endian", () => {
            const buffer = new Uint8Array([0x12, 0x34, 0x56, 0x78, 0x9a, 0xbc, 0xde, 0xf0, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff]);
            const reader = new DataReader(buffer, Endian.Big);

            expect(reader.readInt64()).equal(0x123456789abcdef0n);
            expect(reader.readInt64()).equal(-1n);
        });

        it("reads signed 64-bit integer in little endian", () => {
            const buffer = new Uint8Array([0xf0, 0xde, 0xbc, 0x9a, 0x78, 0x56, 0x34, 0x12, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff]);
            const reader = new DataReader(buffer, Endian.Little);

            expect(reader.readInt64()).equal(0x123456789abcdef0n);
            expect(reader.readInt64()).equal(-1n);
        });
    });

    describe("readFloat", () => {
        it("reads 32-bit float in big endian", () => {
            const buffer = new Uint8Array(4);
            new DataView(buffer.buffer).setFloat32(0, 3.14, false);
            const reader = new DataReader(buffer, Endian.Big);

            const value = reader.readFloat();
            expect(value).closeTo(3.14, 0.01);
        });

        it("reads 32-bit float in little endian", () => {
            const buffer = new Uint8Array(4);
            new DataView(buffer.buffer).setFloat32(0, 3.14, true);
            const reader = new DataReader(buffer, Endian.Little);

            const value = reader.readFloat();
            expect(value).closeTo(3.14, 0.01);
        });

        it("advances offset by 4", () => {
            const buffer = new Uint8Array(4);
            const reader = new DataReader(buffer);

            reader.readFloat();
            expect(reader.offset).equal(4);
        });
    });

    describe("readDouble", () => {
        it("reads 64-bit float in big endian", () => {
            const buffer = new Uint8Array(8);
            new DataView(buffer.buffer).setFloat64(0, 3.141592653589793, false);
            const reader = new DataReader(buffer, Endian.Big);

            const value = reader.readDouble();
            expect(value).equal(3.141592653589793);
        });

        it("reads 64-bit float in little endian", () => {
            const buffer = new Uint8Array(8);
            new DataView(buffer.buffer).setFloat64(0, 3.141592653589793, true);
            const reader = new DataReader(buffer, Endian.Little);

            const value = reader.readDouble();
            expect(value).equal(3.141592653589793);
        });

        it("advances offset by 8", () => {
            const buffer = new Uint8Array(8);
            const reader = new DataReader(buffer);

            reader.readDouble();
            expect(reader.offset).equal(8);
        });
    });

    describe("readUtf8String", () => {
        it("reads UTF-8 string", () => {
            const buffer = new Uint8Array([0x48, 0x65, 0x6c, 0x6c, 0x6f]); // "Hello"
            const reader = new DataReader(buffer);

            const value = reader.readUtf8String(5);
            expect(value).equal("Hello");
        });

        it("reads UTF-8 string with multi-byte characters", () => {
            const buffer = new TextEncoder().encode("Hello 世界");
            const reader = new DataReader(buffer);

            const value = reader.readUtf8String(buffer.length);
            expect(value).equal("Hello 世界");
        });

        it("advances offset by string length", () => {
            const buffer = new Uint8Array([0x48, 0x65, 0x6c, 0x6c, 0x6f]);
            const reader = new DataReader(buffer);

            reader.readUtf8String(3);
            expect(reader.offset).equal(3);
        });
    });

    describe("readByteArray", () => {
        it("reads byte array", () => {
            const buffer = new Uint8Array([0x12, 0x34, 0x56, 0x78]);
            const reader = new DataReader(buffer);

            const value = reader.readByteArray(3);
            expect(value).deep.equal(new Uint8Array([0x12, 0x34, 0x56]));
        });

        it("advances offset by array length", () => {
            const buffer = new Uint8Array([0x12, 0x34, 0x56, 0x78]);
            const reader = new DataReader(buffer);

            reader.readByteArray(2);
            expect(reader.offset).equal(2);
        });

        it("returns view of original buffer", () => {
            const buffer = new Uint8Array([0x12, 0x34, 0x56, 0x78]);
            const reader = new DataReader(buffer);

            const value = reader.readByteArray(2);

            // Modify the returned array
            value[0] = 0xff;

            // Original buffer should be modified
            expect(buffer[0]).equal(0xff);
        });
    });

    describe("remainingBytesCount", () => {
        it("returns number of remaining bytes", () => {
            const buffer = new Uint8Array([0x12, 0x34, 0x56, 0x78]);
            const reader = new DataReader(buffer);

            expect(reader.remainingBytesCount).equal(4);

            reader.readUInt16();
            expect(reader.remainingBytesCount).equal(2);

            reader.readUInt16();
            expect(reader.remainingBytesCount).equal(0);
        });
    });

    describe("remainingBytes", () => {
        it("returns remaining bytes as Uint8Array", () => {
            const buffer = new Uint8Array([0x12, 0x34, 0x56, 0x78]);
            const reader = new DataReader(buffer);

            reader.readUInt16();

            const remaining = reader.remainingBytes;
            expect(remaining).deep.equal(new Uint8Array([0x56, 0x78]));
        });

        it("returns empty array when at end", () => {
            const buffer = new Uint8Array([0x12, 0x34]);
            const reader = new DataReader(buffer);

            reader.readUInt16();

            const remaining = reader.remainingBytes;
            expect(remaining).deep.equal(new Uint8Array(0));
        });
    });

    describe("offset", () => {
        it("can be set to arbitrary position", () => {
            const buffer = new Uint8Array([0x12, 0x34, 0x56, 0x78]);
            const reader = new DataReader(buffer);

            reader.offset = 2;
            expect(reader.offset).equal(2);
            expect(reader.readUInt8()).equal(0x56);
        });

        it("throws when set beyond buffer length", () => {
            const buffer = new Uint8Array([0x12, 0x34]);
            const reader = new DataReader(buffer);

            expect(() => {
                reader.offset = 5;
            }).throws(Error, "Offset 5 is out of bounds");
        });

        it("allows setting to buffer length", () => {
            const buffer = new Uint8Array([0x12, 0x34]);
            const reader = new DataReader(buffer);

            reader.offset = 2;
            expect(reader.remainingBytesCount).equal(0);
        });
    });

    describe("boundary conditions", () => {
        it("throws when reading past end", () => {
            const buffer = new Uint8Array([0x12, 0x34]);
            const reader = new DataReader(buffer);

            // Reading past end throws an error
            expect(() => reader.readUInt32()).throws();
        });

        it("handles reading from empty buffer", () => {
            const buffer = new Uint8Array(0);
            const reader = new DataReader(buffer);

            expect(reader.length).equal(0);
            expect(reader.remainingBytesCount).equal(0);
            expect(reader.remainingBytes).deep.equal(new Uint8Array(0));
        });
    });

    describe("mixed reads", () => {
        it("reads multiple types sequentially", () => {
            const buffer = new Uint8Array(20);
            const view = new DataView(buffer.buffer);

            // Write test data
            view.setUint8(0, 0x12);
            view.setUint16(1, 0x3456, false);
            view.setUint32(3, 0x789abcde, false);
            view.setFloat32(7, 3.14, false);

            const reader = new DataReader(buffer, Endian.Big);

            expect(reader.readUInt8()).equal(0x12);
            expect(reader.readUInt16()).equal(0x3456);
            expect(reader.readUInt32()).equal(0x789abcde);
            expect(reader.readFloat()).closeTo(3.14, 0.01);
            expect(reader.offset).equal(11);
        });
    });
});
