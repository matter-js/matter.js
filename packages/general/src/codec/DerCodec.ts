/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */
import { UnexpectedDataError } from "../MatterError.js";
import { Bytes } from "../util/Bytes.js";
import { DataReader } from "../util/DataReader.js";
import { toHex } from "../util/Number.js";
import { isObject } from "../util/Type.js";

export class DerError extends UnexpectedDataError {}

export enum DerType {
    Boolean = 0x01,
    Integer = 0x02,
    BitString = 0x03,
    OctetString = 0x04,
    Null = 0x05,
    ObjectIdentifier = 0x06,
    UTF8String = 0x0c,
    Sequence = 0x10,
    Set = 0x11,
    PrintableString = 0x13,
    T16String = 0x14,
    IA5String = 0x16,
    UtcDate = 0x17,
    GeneralizedTime = 0x18,
}

const CONSTRUCTED = 0x20;

const enum DerClass {
    Universal = 0x00,
    Application = 0x40,
    ContextSpecific = 0x80,
    Private = 0xc0,
}

export interface ObjectId {
    _tag: DerType.ObjectIdentifier;
    _bytes: Bytes;
}

export const ObjectId = (objectId: string | bigint): ObjectId => ({
    _tag: DerType.ObjectIdentifier as number,
    _bytes: typeof objectId === "bigint" ? Bytes.fromBigInt(objectId) : Bytes.fromHex(objectId),
});

export interface DerObject {
    readonly _tag?: undefined;
    readonly _objectId: ObjectId;
    readonly [field: string]: unknown;
}

export const DerObject = (objectId: string | bigint, content: Record<string, unknown> = {}): DerObject => ({
    _objectId: ObjectId(objectId),
    ...content,
});

export interface DerTagged {
    _tag: number;
    _bytes: Bytes;
}

export interface DerBitString extends DerTagged {
    _tag: DerType.BitString;
    _bytes: Bytes;
    _padding: number;
}

export const DerBitString = (data: Bytes, padding = 0): DerBitString => ({
    _tag: DerType.BitString,
    _bytes: data,
    _padding: padding,
});

export const ContextTagged = (tagId: number, value?: any): DerTagged => ({
    _tag: tagId | DerClass.ContextSpecific | CONSTRUCTED,
    _bytes: value === undefined ? new Uint8Array(0) : DerCodec.encode(value),
});

export const ContextTaggedBytes = (tagId: number, value: Bytes): DerTagged => ({
    _tag: tagId | DerClass.ContextSpecific,
    _bytes: value,
});

export type DatatypeOverride =
    | {
          _tag?: undefined;
          _type: DerType.Integer;
          _raw: Bytes;
      }
    | {
          _tag?: undefined;
          _type: DerType.BitString;
          _raw: number;
      }
    | {
          _tag?: undefined;
          _type: DerType.PrintableString | DerType.IA5String;
          _raw: string;
      };

export const DatatypeOverride = <T extends DatatypeOverride["_type"]>(
    type: T,
    value: (DatatypeOverride & { _type: T })["_raw"],
) =>
    ({
        _type: type,
        _raw: value,
    }) as DatatypeOverride;

export interface RawBytes {
    _bytes: Bytes;
}

export const RawBytes = (bytes: Bytes): RawBytes => ({
    _bytes: bytes,
});

/**
 * Optimized path for encoding raw bytes that represent an unsigned integer.
 *
 * This allows to avoid e.g. round tripping a 256-bit number through a bigint when encoding.
 */
export const DerRawUint = (number: Bytes): DerTagged => {
    const numberData = Bytes.of(number);

    if (numberData[0] & 0x80) {
        // Add 0 prefix so number does not encode as negative
        number = Bytes.concat(new Uint8Array([0]), numberData);
    } else {
        // Drop non-conformant high-value zeros
        let firstByte = 0;
        while (firstByte < numberData.length - 1) {
            if (numberData[firstByte] || numberData[firstByte + 1] & 0x80) {
                break;
            }
            firstByte++;
        }
        if (firstByte) {
            number = numberData.slice(firstByte);
        }
    }

    return {
        _tag: DerType.Integer,
        _bytes: number,
    };
};

export type DerNode = {
    _tag: number;
    _bytes: Bytes;
    _elements?: DerNode[];
    _padding?: number;
};

/**
 * Arrays define a DER set.
 */
export type DerSetDefinition = Array<DerNodeDefinition>;

/**
 * Objects without special fields define an "object".
 *
 * Under this somewhat strange construct, the field name is effectively just documentation.  The object order and
 * ObjectID of the referenced nodes define the actual serialized format.
 */
export type DerSequenceDefinition = {
    _tag?: undefined;
    _type?: undefined;
    _bytes?: undefined;
    _objectId?: ObjectId;
    [field: string]: DerNodeDefinition;
};

/**
 * Input to {@link DerCodec.encode}.
 *
 * This is a lenient mapping of native JS types we accept on encoding.  We map each of these to a {@link DerNode} and
 * then encode.
 */
export type DerNodeDefinition =
    | string
    | number
    | bigint
    | Date
    | boolean
    | Bytes
    | undefined
    | DerNode
    | DerSetDefinition
    | DerSequenceDefinition
    | DerObject
    | RawBytes
    | DatatypeOverride;

export class DerCodec {
    static encode(value: DerNodeDefinition): Bytes {
        if (Array.isArray(value)) {
            return this.#encodeArray(value);
        } else if (Bytes.isBytes(value)) {
            return this.#encodeOctetString(value);
        } else if (value instanceof Date) {
            return this.#encodeDate(value);
        } else if (typeof value === "string") {
            return this.#encodeString(value);
        } else if (typeof value === "number" || typeof value === "bigint") {
            return this.#encodeInteger(value);
        } else if (typeof value === "boolean") {
            return this.#encodeBoolean(value);
        } else if (value === undefined) {
            return new Uint8Array(0);
        } else if (isObject(value)) {
            if (value._tag !== undefined) {
                const { _tag: tagId, _padding: bitsPadding, _bytes: bytes } = value;
                if (typeof tagId !== "number") {
                    throw new DerError("Tag ID is non-numeric");
                }
                if (bitsPadding !== undefined && typeof bitsPadding !== "number") {
                    throw new DerError("Bits padding is not a numeric byte value");
                }
                if (bytes === undefined || !Bytes.isBytes(bytes)) {
                    throw new DerError("DER bytes is not a byte array");
                }
                return this.#encodeAsn1(
                    tagId,
                    bitsPadding === undefined ? bytes : Bytes.concat(Uint8Array.of(bitsPadding), Bytes.of(bytes)),
                );
            } else if (value._type !== undefined && value._raw !== undefined) {
                if (value._type === DerType.Integer && Bytes.isBytes(value._raw)) {
                    return this.#encodeInteger(value._raw);
                } else if (value._type === DerType.BitString && typeof value._raw === "number") {
                    return this.#encodeBitString(value._raw);
                } else if (value._type === DerType.PrintableString && typeof value._raw === "string") {
                    return this.#encodePrintableString(value._raw);
                } else if (value._type === DerType.IA5String && typeof value._raw === "string") {
                    return this.#encodeIA5String(value._raw);
                } else {
                    throw new DerError(`Unsupported override type ${value._type}`);
                }
            } else if (
                "_bytes" in value &&
                value._bytes !== undefined &&
                Bytes.isBytes(value._bytes) &&
                Object.keys(value).length === 1
            ) {
                // Raw Data
                return Bytes.of(value._bytes);
            } else if (value._type === undefined && value._bytes === undefined) {
                return this.#encodeSequence(value);
            } else {
                throw new DerError(`Unsupported object type ${typeof value}`);
            }
        } else {
            throw new DerError(`Unsupported type ${typeof value}`);
        }
    }

    static decode(data: Bytes): DerNode {
        return this.#decodeRec(new DataReader(data));
    }

    /**
     * Extract a large integer value to a byte array with a specific number of bytes.
     */
    static decodeBigUint(value: DerNode | undefined, byteLength: number) {
        if (value === undefined) {
            throw new DerError("Missing number in DER object");
        }

        if (value._tag !== DerType.Integer) {
            throw new DerError(`Expected integer but DER tag is ${DerType[value._tag]}`);
        }

        if (!Bytes.isBytes(value._bytes)) {
            throw new DerError("Incorrect DER object type");
        }
        const bytes = Bytes.of(value._bytes);

        // The common case
        if (bytes.length === byteLength) {
            return bytes;
        }

        // Handle case where single "0" prefix ensures correct sign
        if (bytes.length === byteLength + 1 && !bytes[0]) {
            return bytes.slice(1);
        }

        // Pad out as necessary
        if (bytes.length < byteLength) {
            return Bytes.concat(new Uint8Array(byteLength - bytes.length), bytes);
        }

        // Invalid
        throw new DerError("Encoded integer contains too many bytes");
    }

    static #encodeDate(date: Date) {
        if (date.getFullYear() > 2049) {
            // Dates 2050+ are encoded as GeneralizedTime. This includes the special Non Well Defined date 9999-12-31.
            return this.#encodeAsn1(
                DerType.GeneralizedTime,
                Bytes.fromString(
                    date
                        .toISOString()
                        .replace(/[-:.T]/g, "")
                        .slice(0, 14) + "Z",
                ),
            );
        } else {
            return this.#encodeAsn1(
                DerType.UtcDate,
                Bytes.fromString(
                    date
                        .toISOString()
                        .replace(/[-:.T]/g, "")
                        .slice(2, 14) + "Z",
                ),
            );
        }
    }

    static #encodeBoolean(bool: boolean) {
        return this.#encodeAsn1(DerType.Boolean, Uint8Array.of(bool ? 0xff : 0));
    }

    static #encodeArray(array: Array<any>) {
        return this.#encodeAsn1(DerType.Set | CONSTRUCTED, Bytes.concat(...array.map(element => this.encode(element))));
    }

    static #encodeOctetString(value: Bytes) {
        return this.#encodeAsn1(DerType.OctetString, value);
    }

    static #encodeSequence(object: any) {
        const attributes = new Array<Bytes>();
        for (const key in object) {
            attributes.push(this.encode(object[key]));
        }
        return this.#encodeAsn1(DerType.Sequence | CONSTRUCTED, Bytes.concat(...attributes));
    }

    static #encodeString(value: string) {
        return this.#encodeAsn1(DerType.UTF8String, Bytes.fromString(value));
    }

    static #encodePrintableString(value: string) {
        if (!/^[a-z0-9 '()+,\-./:=?]*$/i.test(value)) {
            throw new DerError(`String ${value} is not a printable string.`);
        }
        return this.#encodeAsn1(DerType.PrintableString, Bytes.fromString(value));
    }

    static #encodeIA5String(value: string) {
        /*oxlint-disable-next-line no-control-regex */
        if (!/^[\x00-\x7F]*$/.test(value)) {
            throw new DerError(`String ${value} is not an IA5 string.`);
        }
        return this.#encodeAsn1(DerType.IA5String, Bytes.fromString(value));
    }

    static #encodeInteger(value: number | bigint | Bytes) {
        const valueBytes = Bytes.isBytes(value) ? value : Bytes.fromHex(toHex(value));

        const byteArray = Bytes.concat(new Uint8Array(1), valueBytes);
        const dataView = Bytes.dataViewOf(byteArray);
        let start = 0;
        while (true) {
            if (dataView.getUint8(start) !== 0) break;
            if (dataView.getUint8(start + 1) >= 0x80) break;
            start++;
            if (start === byteArray.byteLength - 1) break;
        }
        return this.#encodeAsn1(DerType.Integer, start === 0 ? byteArray : Bytes.of(byteArray).slice(start));
    }

    static #encodeBitString(value: number) {
        const reversedBits = value.toString(2).padStart(8, "0");
        const unusedBits = reversedBits.indexOf("1");
        const bitByteArray = Uint8Array.of(parseInt(reversedBits.split("").reverse().join(""), 2));
        return this.encode(DerBitString(bitByteArray, unusedBits === -1 ? 8 : unusedBits));
    }

    static #encodeLengthBytes(value: number) {
        const byteArray = new Uint8Array(5);
        const dataView = Bytes.dataViewOf(byteArray);
        dataView.setUint32(1, value);
        let start = 0;
        while (true) {
            if (dataView.getUint8(start) !== 0) break;
            start++;
            if (start === 4) break;
        }
        const lengthLength = byteArray.length - start;
        if (lengthLength > 1 || dataView.getUint8(start) >= 0x80) {
            start--;
            dataView.setUint8(start, 0x80 + lengthLength);
        }
        return byteArray.slice(start);
    }

    static #encodeAsn1(tag: number, data: Bytes) {
        return Bytes.concat(Uint8Array.of(tag), this.#encodeLengthBytes(data.byteLength), data);
    }

    static #decodeRec(reader: DataReader): DerNode {
        const { tag, bytes } = this.#decodeAsn1(reader);
        if (tag === DerType.BitString) {
            const data = Bytes.of(bytes);
            return { _tag: tag, _bytes: data.slice(1), _padding: data[0] };
        }
        if ((tag & CONSTRUCTED) === 0) return { _tag: tag, _bytes: bytes };
        const elementsReader = new DataReader(bytes);
        const elements: DerNode[] = [];
        while (elementsReader.remainingBytesCount > 0) {
            elements.push(this.#decodeRec(elementsReader));
        }
        return { _tag: tag, _bytes: bytes, _elements: elements };
    }

    static #decodeAsn1(reader: DataReader): { tag: number; bytes: Bytes } {
        const tag = reader.readUInt8();
        let length = reader.readUInt8();
        if ((length & 0x80) !== 0) {
            let lengthLength = length & 0x7f;
            length = 0;
            while (lengthLength > 0) {
                length = (length << 8) + reader.readUInt8();
                lengthLength--;
            }
        }
        const bytes = reader.readByteArray(length);
        return { tag, bytes };
    }
}
