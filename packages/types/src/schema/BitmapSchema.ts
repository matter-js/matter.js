/**
 * @license
 * Copyright 2022-2025 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { Bytes, capitalize, Merge, UnexpectedDataError } from "#general";
import { Schema } from "./Schema.js";

const enum BitRangeType {
    Flag,
    Number,
    Enum,
}

type BitRange<T, TType extends BitRangeType = BitRangeType> = {
    type: TType;
    offset: number;
    length: number;
    _type?: T;
};
const BitRange = <T, TType extends BitRangeType = BitRangeType>(
    type: TType,
    offset: number,
    length: number,
): BitRange<T, TType> => ({ type, offset, length });

/** Defines the bit position of a boolean flag. */
export type BitFlag = BitRange<boolean, BitRangeType.Flag>;
export const BitFlag = (offset: number): BitFlag => BitRange(BitRangeType.Flag, offset, 1);

/** Defines the bit position and bit length of a numeric value. */
export type BitField = BitRange<number, BitRangeType.Number>;
export const BitField = (offset: number, length: number): BitField => BitRange(BitRangeType.Number, offset, length);

/** Defines the bit position and bit length of an enum flag. */
export type BitFieldEnum<E extends number> = BitRange<E, BitRangeType.Enum>;
export const BitFieldEnum = <E extends number>(offset: number, length: number): BitFieldEnum<E> =>
    BitRange(BitRangeType.Enum, offset, length);

export type BitSchema = { [key: string]: BitFlag | BitField | BitFieldEnum<any> };
export type TypeFromBitSchema<T extends BitSchema> = {
    [K in keyof T]: T[K] extends BitFieldEnum<infer E> ? E : T[K] extends BitField ? number : boolean;
};
export type TypeFromPartialBitSchema<T extends BitSchema> = {
    [K in keyof T]?: T[K] extends BitFieldEnum<infer E> ? E : T[K] extends BitField ? number : boolean;
};
export type TypeFromBitmapSchema<S extends Schema<any, any>> = S extends Schema<infer T, any> ? T : never;

type MaskFromBitSchema<T extends BitSchema> = { [K in keyof T]: number };
type MaskOffsetFromBitSchema<T extends BitSchema> = {
    [K in keyof T]: { mask: number; byteOffset: number; bitOffset: number };
};

export class BitmapSchemaInternal<T extends BitSchema> extends Schema<TypeFromBitSchema<T>, number> {
    private readonly masks: MaskFromBitSchema<T>;

    constructor(private readonly bitSchemas: T) {
        super();

        const masks = <MaskFromBitSchema<T>>{};
        for (const name in this.bitSchemas) {
            const { offset, length } = this.bitSchemas[name];
            masks[name] = ((1 << length) - 1) << offset;
        }
        this.masks = masks;
        // TODO: validate that bitSchemas is coherent
    }

    /**
     * Allow to use a fully defined Bitmap schema as input, but also allow one where only the entries of bits set are
     * provided, rest is unset.
     */
    override encode(value: TypeFromPartialBitSchema<T>) {
        return super.encode(value as TypeFromBitSchema<T>);
    }

    override encodeInternal(value: TypeFromPartialBitSchema<T>) {
        let result = 0;
        for (const name in this.bitSchemas) {
            const { type, offset } = this.bitSchemas[name];
            switch (type) {
                case BitRangeType.Flag:
                    if (value[name]) result |= this.masks[name];
                    break;
                case BitRangeType.Enum:
                case BitRangeType.Number:
                    result |= (value[name] as number) << offset;
            }
        }
        return result;
    }

    override decodeInternal(bitmap: number) {
        const result = {} as any;
        for (const name in this.bitSchemas) {
            const { type, offset } = this.bitSchemas[name];
            const mask = this.masks[name];
            if (type === BitRangeType.Flag) {
                result[name] = (bitmap & mask) !== 0;
            } else {
                result[name] = (bitmap & mask) >> offset;
            }
        }
        return result as TypeFromBitSchema<T>;
    }
}

export class ByteArrayBitmapSchemaInternal<T extends BitSchema> extends Schema<TypeFromBitSchema<T>> {
    private readonly byteArrayLength: number;
    private readonly maskOffset: MaskOffsetFromBitSchema<T>;

    constructor(private readonly bitSchemas: T) {
        super();

        let maxBitLength = 0;
        const maskOffset = <MaskOffsetFromBitSchema<T>>{};
        for (const name in this.bitSchemas) {
            const { type, offset, length } = this.bitSchemas[name];
            const bitOffset = offset % 8;
            const byteOffset = (offset - bitOffset) / 8;
            let mask: number;
            if (type === BitRangeType.Flag) {
                mask = 1 << bitOffset;
            } else {
                // Do not shift number mask, they might go beyond 2^32
                mask = (1 << length) - 1;
            }
            maskOffset[name] = { bitOffset, byteOffset, mask };
            maxBitLength = Math.max(maxBitLength, offset + length);
        }
        this.byteArrayLength = Math.ceil(maxBitLength / 8);
        this.maskOffset = maskOffset;
    }

    override encodeInternal(value: TypeFromBitSchema<T>) {
        const result = new Uint8Array(this.byteArrayLength);
        for (const name in this.bitSchemas) {
            const { type } = this.bitSchemas[name];
            let { bitOffset, byteOffset } = this.maskOffset[name];
            const { mask } = this.maskOffset[name];
            switch (type) {
                case BitRangeType.Flag:
                    if (value[name]) result[byteOffset] |= mask;
                    break;
                case BitRangeType.Enum:
                case BitRangeType.Number: {
                    let numValue = (value[name] as number) & mask;
                    while (numValue !== 0) {
                        result[byteOffset++] |= (numValue << bitOffset) & 0xff;
                        const bitWritten = 8 - bitOffset;
                        bitOffset = 0;
                        numValue = numValue >> bitWritten;
                    }
                }
            }
        }
        return result;
    }

    override decodeInternal(data: Bytes) {
        const bitmap = Bytes.of(data);
        if (bitmap.length !== this.byteArrayLength)
            throw new UnexpectedDataError(`Unexpected length: ${bitmap.length}. Expected ${this.byteArrayLength}`);
        const result = {} as any;
        for (const name in this.bitSchemas) {
            const { type } = this.bitSchemas[name];
            let { mask, bitOffset, byteOffset } = this.maskOffset[name];
            if (type === BitRangeType.Flag) {
                result[name] = (bitmap[byteOffset] & mask) !== 0;
            } else {
                let value = 0;
                let valueBitOffset = 0;
                while (mask !== 0) {
                    value |= ((bitmap[byteOffset++] >> bitOffset) & mask) << valueBitOffset;
                    const bitRead = 8 - bitOffset;
                    bitOffset = 0;
                    valueBitOffset += bitRead;
                    mask = mask >> bitRead;
                }
                result[name] = value;
            }
        }
        return result as TypeFromBitSchema<T>;
    }
}

/** Create a partial bitmap from a flag sequence */
export type FlagsToBitmap<T extends string[]> = {
    [name in Uncapitalize<T[number]>]: true;
};

/** Create a type with specified bit flags set */
export type BitFlags<T extends BitSchema, F extends Capitalize<Extract<keyof T, string>>[]> = Merge<
    { [key in keyof T]: false },
    FlagsToBitmap<F>
>;

/** Create a bitmap schema with a named subset of flags set */
export function BitFlags<T extends BitSchema, F extends Capitalize<Extract<keyof T, string>>[]>(
    bitSchemas: T,
    ...flags: [...F]
) {
    return Object.fromEntries(
        Object.keys(bitSchemas).map(name => [
            name,
            !(flags.indexOf(capitalize(name as Extract<keyof T, string>)) === -1),
        ]),
    ) as BitFlags<T, F>;
}

/** Create a full bitmap schema from a partial bitmap schema */
export function BitsFromPartial<S extends BitSchema, P extends TypeFromPartialBitSchema<S>>(schema: S, bits: P) {
    const result = {} as { [key: string]: boolean | number };

    for (const k in schema) {
        const value = bits[k];
        if (value !== undefined) {
            result[k] = value;
        } else {
            result[k] = 0;
        }
    }

    return result as TypeFromBitSchema<S>;
}

/** Declares a bitmap schema by indicating the bit position and their names. */
export const BitmapSchema = <T extends BitSchema>(bitSchemas: T) => new BitmapSchemaInternal(bitSchemas);

/** Declares a bitmap schema backed by a ByteArray by indicating the bit position and their names. */
export const ByteArrayBitmapSchema = <T extends BitSchema>(bitSchemas: T) =>
    new ByteArrayBitmapSchemaInternal(bitSchemas);
