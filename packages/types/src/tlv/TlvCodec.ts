/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import {
    Bytes,
    DataReader,
    DataWriter,
    Endian,
    INT16_MAX,
    INT16_MIN,
    INT32_MAX,
    INT32_MIN,
    INT8_MAX,
    INT8_MIN,
    NotImplementedError,
    UINT16_MAX,
    UINT32_MAX,
    UINT8_MAX,
    UnexpectedDataError,
} from "#general";
import { BitField, BitFieldEnum, BitmapSchema } from "../schema/BitmapSchema.js";

/**
 * TLV element types.
 *
 * @see {@link MatterSpecification.v10.Core} § A.7.1
 */
export enum TlvType {
    SignedInt = 0x00,
    UnsignedInt = 0x04,
    Boolean = 0x08,
    Float = 0x0a,
    Utf8String = 0x0c,
    ByteString = 0x10,
    Null = 0x14,
    Structure = 0x15,
    Array = 0x16,
    List = 0x17,
    EndOfContainer = 0x18,
}

/** Byte length of the encoded value or length. */
export enum TlvLength {
    OneByte = 0,
    TwoBytes = 1,
    FourBytes = 2,
    EightBytes = 3,
}

/** Type and length or value, when applicable. */
export type TlvTypeLength =
    | { type: TlvType.SignedInt; length: TlvLength }
    | { type: TlvType.UnsignedInt; length: TlvLength }
    | { type: TlvType.Boolean; value: boolean }
    | { type: TlvType.Float; length: TlvLength.FourBytes | TlvLength.EightBytes }
    | { type: TlvType.Utf8String; length: TlvLength }
    | { type: TlvType.ByteString; length: TlvLength }
    | { type: TlvType.Null }
    | { type: TlvType.Structure }
    | { type: TlvType.Array }
    | { type: TlvType.List }
    | { type: TlvType.EndOfContainer };

/** Converts {@link TlvType} to the js primitive type.  */
export type TlvToPrimitive = {
    [TlvType.SignedInt]: bigint | number;
    [TlvType.UnsignedInt]: bigint | number;
    [TlvType.Boolean]: never;
    [TlvType.Float]: number;
    [TlvType.Utf8String]: string;
    [TlvType.ByteString]: Bytes;
    [TlvType.Null]: null;
    [TlvType.Structure]: never;
    [TlvType.Array]: never;
    [TlvType.List]: never;
    [TlvType.EndOfContainer]: never;
};

/**
 * TLV element tag control.
 *
 * @see {@link MatterSpecification.v10.Core} § A.7.2
 */
const enum TagControl {
    Anonymous = 0,
    ContextSpecific = 1,
    CommonProfile16 = 2,
    CommonProfile32 = 3,
    ImplicitProfile16 = 4,
    ImplicitProfile32 = 5,
    FullyQualified48 = 6,
    FullyQualified64 = 7,
}

/**
 * Schema of the ControlByte.
 *
 * @see {@link MatterSpecification.v10.Core} § A.7.2
 */
const ControlByteSchema = BitmapSchema({
    typeLength: BitField(0, 5),
    tagControl: BitFieldEnum<TagControl>(5, 3),
});

/** {@link MatterSpecification.v10.Core} § 2.5.2 and § A.8.3 */
const MATTER_COMMON_PROFILE = 0x00000000;

/** {@link MatterSpecification.v10.Core} § A.2 */
export type TlvTag = {
    profile?: number;
    id?: number;
};

export class TlvCodec {
    public static getUIntTlvLength(value: number | bigint) {
        if (value <= UINT8_MAX) {
            return TlvLength.OneByte;
        } else if (value <= UINT16_MAX) {
            return TlvLength.TwoBytes;
        } else if (value <= UINT32_MAX) {
            return TlvLength.FourBytes;
        } else {
            return TlvLength.EightBytes;
        }
    }

    public static getIntTlvLength(value: number | bigint) {
        if (value > 0) {
            if (value <= INT8_MAX) {
                return TlvLength.OneByte;
            } else if (value <= INT16_MAX) {
                return TlvLength.TwoBytes;
            } else if (value <= INT32_MAX) {
                return TlvLength.FourBytes;
            } else {
                return TlvLength.EightBytes;
            }
        } else {
            if (value >= INT8_MIN) {
                return TlvLength.OneByte;
            } else if (value >= INT16_MIN) {
                return TlvLength.TwoBytes;
            } else if (value >= INT32_MIN) {
                return TlvLength.FourBytes;
            } else {
                return TlvLength.EightBytes;
            }
        }
    }

    /** @see {@link MatterSpecification.v10.Core} § A.7 */
    public static readTagType(reader: DataReader<Endian.Little>): { tag?: TlvTag; typeLength: TlvTypeLength } {
        const { tagControl, typeLength } = ControlByteSchema.decode(reader.readUInt8());
        return { tag: this.readTag(reader, tagControl), typeLength: this.parseTypeLength(typeLength) };
    }

    private static readTag(reader: DataReader<Endian.Little>, tagControl: TagControl): TlvTag | undefined {
        switch (tagControl) {
            case TagControl.Anonymous:
                return undefined;
            case TagControl.ContextSpecific:
                return { id: reader.readUInt8() };
            case TagControl.CommonProfile16:
                return { profile: MATTER_COMMON_PROFILE, id: reader.readUInt16() };
            case TagControl.CommonProfile32:
                return { profile: MATTER_COMMON_PROFILE, id: reader.readUInt32() };
            case TagControl.ImplicitProfile16:
            case TagControl.ImplicitProfile32:
                throw new NotImplementedError(`Unsupported implicit profile ${tagControl}`);
            case TagControl.FullyQualified48:
                return { profile: reader.readUInt32(), id: reader.readUInt16() };
            default:
                throw new NotImplementedError(`Unexpected tagControl ${tagControl}`);
        }
    }

    private static parseTypeLength(typeLength: number): TlvTypeLength {
        const length = (typeLength & 0x03) as TlvLength;
        const type = typeLength & 0xfc;
        switch (type) {
            case TlvType.Utf8String:
            case TlvType.ByteString:
            case TlvType.SignedInt:
            case TlvType.UnsignedInt:
                return { type, length };
            case TlvType.Boolean:
                switch (length) {
                    case TlvLength.OneByte:
                        return { type, value: false };
                    case TlvLength.TwoBytes:
                        return { type, value: true };
                    case TlvLength.FourBytes:
                        return { type: TlvType.Float, length };
                    case TlvLength.EightBytes:
                        return { type: TlvType.Float, length };
                    default:
                        throw new UnexpectedDataError(`Unexpected Boolean length ${length}`);
                }
            default:
                return { type: typeLength };
        }
    }

    public static readPrimitive<T extends TlvTypeLength, V = TlvToPrimitive[T["type"]]>(
        reader: DataReader<Endian.Little>,
        typeLength: T,
    ): V {
        switch (typeLength.type) {
            case TlvType.SignedInt: {
                const length = typeLength.length;
                switch (length) {
                    case TlvLength.OneByte:
                        return reader.readInt8() as V;
                    case TlvLength.TwoBytes:
                        return reader.readInt16() as V;
                    case TlvLength.FourBytes:
                        return reader.readInt32() as V;
                    case TlvLength.EightBytes:
                        return reader.readInt64() as V;
                    default:
                        throw new UnexpectedDataError(`Unexpected SignedInt length ${length}`);
                }
            }
            case TlvType.UnsignedInt: {
                const length = typeLength.length;
                switch (length) {
                    case TlvLength.OneByte:
                        return reader.readUInt8() as V;
                    case TlvLength.TwoBytes:
                        return reader.readUInt16() as V;
                    case TlvLength.FourBytes:
                        return reader.readUInt32() as V;
                    case TlvLength.EightBytes:
                        return reader.readUInt64() as V;
                    default:
                        throw new UnexpectedDataError(`Unexpected UnsignedInt length ${length}`);
                }
            }
            case TlvType.Float: {
                const length = typeLength.length;
                switch (length) {
                    case TlvLength.FourBytes:
                        return reader.readFloat() as V;
                    case TlvLength.EightBytes:
                        return reader.readDouble() as V;
                    default:
                        throw new UnexpectedDataError(`Unexpected Float length ${length}`);
                }
            }
            case TlvType.Utf8String: {
                const length = typeLength.length;
                switch (length) {
                    case TlvLength.OneByte:
                        return reader.readUtf8String(reader.readUInt8()) as V;
                    case TlvLength.TwoBytes:
                        return reader.readUtf8String(reader.readUInt16()) as V;
                    case TlvLength.FourBytes:
                        return reader.readUtf8String(reader.readUInt32()) as V;
                    case TlvLength.EightBytes:
                        return reader.readUtf8String(Number(reader.readUInt64())) as V;
                    default:
                        throw new UnexpectedDataError(`Unexpected Utf8String length ${length}`);
                }
            }
            case TlvType.ByteString: {
                const length = typeLength.length;
                switch (length) {
                    case TlvLength.OneByte:
                        return reader.readByteArray(reader.readUInt8()) as V;
                    case TlvLength.TwoBytes:
                        return reader.readByteArray(reader.readUInt16()) as V;
                    case TlvLength.FourBytes:
                        return reader.readByteArray(reader.readUInt32()) as V;
                    case TlvLength.EightBytes:
                        return reader.readByteArray(Number(reader.readUInt64())) as V;
                    default:
                        throw new UnexpectedDataError(`Unexpected ByteString length ${length}`);
                }
            }
            case TlvType.Boolean:
                return typeLength.value as V;
            case TlvType.Null:
                return null as V;
            default:
                throw new UnexpectedDataError(`Unexpected TLV type ${typeLength.type}`);
        }
    }

    /** @see {@link MatterSpecification.v10.Core} § A.7 & A.8 */
    public static writeTag(writer: DataWriter<Endian.Little>, typeLengthValue: TlvTypeLength, tag?: TlvTag) {
        const { profile, id } = tag ?? {};
        let typeLength: number;
        switch (typeLengthValue.type) {
            case TlvType.Utf8String:
            case TlvType.ByteString:
            case TlvType.SignedInt:
            case TlvType.UnsignedInt:
            case TlvType.Float:
                typeLength = typeLengthValue.type | typeLengthValue.length;
                break;
            case TlvType.Boolean:
                typeLength = typeLengthValue.type + (typeLengthValue.value ? 1 : 0);
                break;
            default:
                typeLength = typeLengthValue.type;
        }

        if (profile === undefined && id === undefined) {
            writer.writeUInt8(ControlByteSchema.encode({ tagControl: TagControl.Anonymous, typeLength }));
        } else if (profile === undefined) {
            if (id === undefined)
                throw new UnexpectedDataError("Invalid TLV tag: id should be defined for a context specific tag.");
            writer.writeUInt8(ControlByteSchema.encode({ tagControl: TagControl.ContextSpecific, typeLength }));
            writer.writeUInt8(id);
        } else if (profile === MATTER_COMMON_PROFILE) {
            if (id === undefined)
                throw new UnexpectedDataError("Invalid TLV tag: id should be defined for a datatype profile.");
            if ((id & 0xffff0000) === 0) {
                writer.writeUInt8(ControlByteSchema.encode({ tagControl: TagControl.CommonProfile16, typeLength }));
                writer.writeUInt16(id);
            } else {
                writer.writeUInt8(ControlByteSchema.encode({ tagControl: TagControl.CommonProfile32, typeLength }));
                writer.writeUInt32(id);
            }
        } else {
            if (id === undefined)
                throw new UnexpectedDataError("Invalid TLV tag: id should be defined for a custom profile.");
            if ((id & 0xffff0000) === 0) {
                writer.writeUInt8(ControlByteSchema.encode({ tagControl: TagControl.FullyQualified48, typeLength }));
                writer.writeUInt32(profile);
                writer.writeUInt16(id);
            } else {
                writer.writeUInt8(ControlByteSchema.encode({ tagControl: TagControl.FullyQualified64, typeLength }));
                writer.writeUInt32(profile);
                writer.writeUInt32(id);
            }
        }
    }

    public static getTagByteLength(tag?: TlvTag) {
        const { profile, id } = tag ?? {};

        if (profile === undefined && id === undefined) {
            return 1;
        } else if (profile === undefined) {
            if (id === undefined)
                throw new UnexpectedDataError("Invalid TLV tag: id should be defined for a context specific tag.");
            return 2;
        } else if (profile === MATTER_COMMON_PROFILE) {
            if (id === undefined)
                throw new UnexpectedDataError("Invalid TLV tag: id should be defined for a datatype profile.");
            if ((id & 0xffff0000) === 0) {
                return 3;
            } else {
                return 5;
            }
        } else {
            if (id === undefined)
                throw new UnexpectedDataError("Invalid TLV tag: id should be defined for a custom profile.");
            if ((id & 0xffff0000) === 0) {
                return 7;
            } else {
                return 9;
            }
        }
    }

    public static writePrimitive<T extends TlvTypeLength>(
        writer: DataWriter<Endian.Little>,
        typeLength: T,
        value: TlvToPrimitive[T["type"]],
    ) {
        switch (typeLength.type) {
            case TlvType.SignedInt:
                return this.writeUInt(writer, typeLength.length, value as TlvToPrimitive[typeof typeLength.type]);
            case TlvType.UnsignedInt: {
                const length = typeLength.length;
                switch (length) {
                    case TlvLength.OneByte:
                        return writer.writeUInt8(value as TlvToPrimitive[typeof typeLength.type]);
                    case TlvLength.TwoBytes:
                        return writer.writeUInt16(value as TlvToPrimitive[typeof typeLength.type]);
                    case TlvLength.FourBytes:
                        return writer.writeUInt32(value as TlvToPrimitive[typeof typeLength.type]);
                    case TlvLength.EightBytes:
                        return writer.writeUInt64(value as TlvToPrimitive[typeof typeLength.type]);
                    default:
                        throw new UnexpectedDataError(`Unexpected UnsignedInt length ${length}`);
                }
            }
            case TlvType.Float: {
                const length = typeLength.length;
                switch (length) {
                    case TlvLength.FourBytes:
                        return writer.writeFloat(value as TlvToPrimitive[typeof typeLength.type]);
                    case TlvLength.EightBytes:
                        return writer.writeDouble(value as TlvToPrimitive[typeof typeLength.type]);
                    default:
                        throw new UnexpectedDataError(`Unexpected Float length ${length}`);
                }
            }
            case TlvType.Utf8String: {
                const string = value as TlvToPrimitive[typeof typeLength.type];
                const stringData = Bytes.fromString(string);
                this.writeUInt(writer, typeLength.length, stringData.byteLength);
                return writer.writeByteArray(stringData);
            }
            case TlvType.ByteString: {
                const byteArray = value as TlvToPrimitive[typeof typeLength.type];
                this.writeUInt(writer, typeLength.length, byteArray.byteLength);
                return writer.writeByteArray(byteArray);
            }
            case TlvType.Boolean:
                return;
            default:
                throw new UnexpectedDataError(`Unexpected TLV type ${typeLength.type}`);
        }
    }

    public static getPrimitiveByteLength<T extends TlvTypeLength>(typeLength: T, value: TlvToPrimitive[T["type"]]) {
        switch (typeLength.type) {
            case TlvType.SignedInt:
            case TlvType.UnsignedInt:
            case TlvType.Float:
                return this.getUIntByteLength(typeLength.length);
            case TlvType.Utf8String: {
                const string = value as TlvToPrimitive[typeof typeLength.type];
                const stringData = Bytes.fromString(string);
                return this.getUIntByteLength(typeLength.length) + stringData.byteLength;
            }
            case TlvType.ByteString: {
                const byteArray = value as TlvToPrimitive[typeof typeLength.type];
                return this.getUIntByteLength(typeLength.length) + byteArray.byteLength;
            }
            case TlvType.Boolean:
                return 0;
            default:
                throw new UnexpectedDataError(`Unexpected TLV type ${typeLength.type}`);
        }
    }

    private static writeUInt(writer: DataWriter<Endian.Little>, length: TlvLength, value: number | bigint) {
        switch (length) {
            case TlvLength.OneByte:
                return writer.writeInt8(value);
            case TlvLength.TwoBytes:
                return writer.writeInt16(value);
            case TlvLength.FourBytes:
                return writer.writeInt32(value);
            case TlvLength.EightBytes:
                return writer.writeInt64(value);
        }
    }

    private static getUIntByteLength(length: TlvLength) {
        switch (length) {
            case TlvLength.OneByte:
                return 1;
            case TlvLength.TwoBytes:
                return 2;
            case TlvLength.FourBytes:
                return 4;
            case TlvLength.EightBytes:
                return 8;
        }
    }
}
