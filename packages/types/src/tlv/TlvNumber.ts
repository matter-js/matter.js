/**
 * @license
 * Copyright 2022-2025 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */
import {
    FLOAT32_MAX,
    FLOAT32_MIN,
    FLOAT64_MAX,
    FLOAT64_MIN,
    INT16_MAX,
    INT16_MIN,
    INT32_MAX,
    INT32_MIN,
    INT64_MAX,
    INT64_MIN,
    INT8_MAX,
    INT8_MIN,
    ImplementationError,
    UINT16_MAX,
    UINT24_MAX,
    UINT32_MAX,
    UINT64_MAX,
    UINT8_MAX,
    UnexpectedDataError,
    maxValue,
    minValue,
} from "#general";
import { ValidationDatatypeMismatchError, ValidationOutOfBoundsError } from "../common/ValidationError.js";
import { BitSchema, BitmapSchema, TypeFromPartialBitSchema } from "../schema/BitmapSchema.js";
import { Schema } from "../schema/Schema.js";
import { TlvCodec, TlvLength, TlvTag, TlvType, TlvTypeLength } from "./TlvCodec.js";
import { TlvReader, TlvSchema, TlvWriter } from "./TlvSchema.js";
import { TlvWrapper } from "./TlvWrapper.js";

/**
 * Schema to encode an unsigned integer in TLV.
 *
 * @see {@link MatterSpecification.v10.Core} § A.11.1
 */
export class TlvNumericSchema<T extends bigint | number> extends TlvSchema<T> {
    #min?: T;
    #max?: T;

    constructor(
        readonly type: TlvType.UnsignedInt | TlvType.SignedInt | TlvType.Float,
        protected readonly lengthProvider: (value: T) => TlvLength,
        readonly baseTypeMin: T,
        readonly baseTypeMax: T,
        min?: T,
        max?: T,
    ) {
        super();
        if (min !== undefined && min > baseTypeMin) {
            this.#min = min;
        }
        if (max !== undefined && max < baseTypeMax) {
            this.#max = max;
        }
    }

    get min() {
        return this.#min ?? this.baseTypeMin;
    }

    get max() {
        return this.#max ?? this.baseTypeMax;
    }

    override encodeTlvInternal(writer: TlvWriter, value: T, tag?: TlvTag): void {
        const typeLength = { type: this.type, length: this.lengthProvider(value) } as TlvTypeLength;
        writer.writeTag(typeLength, tag);
        writer.writePrimitive(typeLength, value);
    }

    override decodeTlvInternalValue(reader: TlvReader, typeLength: TlvTypeLength): T {
        if (typeLength.type !== this.type)
            throw new UnexpectedDataError(`Unexpected type ${typeLength.type}, was expecting ${this.type}.`);
        return reader.readPrimitive(typeLength);
    }

    override validate(value: T): void {
        if (typeof value !== "number" && typeof value !== "bigint")
            throw new ValidationDatatypeMismatchError(`Expected number, got ${typeof value}.`);
        this.validateBoundaries(value);
    }

    validateBoundaries(value: T): void {
        if (this.min !== undefined && value < this.min)
            throw new ValidationOutOfBoundsError(`Invalid value: ${value} is below the minimum, ${this.min}.`);
        if (this.max !== undefined && value > this.max)
            throw new ValidationOutOfBoundsError(`Invalid value: ${value} is above the maximum, ${this.max}.`);
    }

    /** Restrict value range. */
    bound({ min, max }: NumericConstraints<T>): TlvNumericSchema<T> {
        return new TlvNumericSchema(
            this.type,
            this.lengthProvider,
            maxValue(min, this.min) as T,
            minValue(max, this.max) as T,
        );
    }
}

export type NumericConstraints<T extends number | bigint = number | bigint> = {
    min?: T;
    max?: T;
};

export class TlvNumberSchema extends TlvNumericSchema<number> {
    constructor(
        type: TlvType.UnsignedInt | TlvType.SignedInt | TlvType.Float,
        lengthProvider: (value: number) => TlvLength,
        baseTypeMin: number,
        baseTypeMax: number,
        min?: number,
        max?: number,
    ) {
        super(type, lengthProvider, baseTypeMin, baseTypeMax, min, max);
    }

    override decodeTlvInternalValue(reader: TlvReader, typeLength: TlvTypeLength) {
        const value = super.decodeTlvInternalValue(reader, typeLength);
        return typeof value === "bigint" ? Number(value) : value;
    }

    override bound({ min, max }: NumericConstraints<number>): TlvNumericSchema<number> {
        return new TlvNumberSchema(
            this.type,
            this.lengthProvider,
            this.baseTypeMin,
            this.baseTypeMax,
            maxValue(min, this.min),
            minValue(max, this.max),
        );
    }

    override validate(value: number): void {
        if (typeof value !== "number")
            throw new ValidationDatatypeMismatchError(`Expected number, got ${typeof value}.`);
        this.validateBoundaries(value);
    }
}

export const TlvLongNumberSchema = TlvNumericSchema<number | bigint>;

/** Unsigned integer TLV schema. */
export const TlvFloat = new TlvNumberSchema(TlvType.Float, _value => TlvLength.FourBytes, FLOAT32_MIN, FLOAT32_MAX);
export const TlvDouble = new TlvNumberSchema(TlvType.Float, _value => TlvLength.EightBytes, FLOAT64_MIN, FLOAT64_MAX);
export const TlvInt8 = new TlvNumberSchema(
    TlvType.SignedInt,
    value => TlvCodec.getIntTlvLength(value),
    INT8_MIN,
    INT8_MAX,
);
export const TlvInt16 = new TlvNumberSchema(
    TlvType.SignedInt,
    value => TlvCodec.getIntTlvLength(value),
    INT16_MIN,
    INT16_MAX,
);
export const TlvInt32 = new TlvNumberSchema(
    TlvType.SignedInt,
    value => TlvCodec.getIntTlvLength(value),
    INT32_MIN,
    INT32_MAX,
);
export const TlvInt64 = new TlvLongNumberSchema(
    TlvType.SignedInt,
    value => TlvCodec.getIntTlvLength(value),
    INT64_MIN,
    INT64_MAX,
);
export const TlvUInt8 = new TlvNumberSchema(
    TlvType.UnsignedInt,
    value => TlvCodec.getUIntTlvLength(value),
    0,
    UINT8_MAX,
);
export const TlvUInt16 = new TlvNumberSchema(
    TlvType.UnsignedInt,
    value => TlvCodec.getUIntTlvLength(value),
    0,
    UINT16_MAX,
);
export const TlvUInt24 = new TlvNumberSchema(
    TlvType.UnsignedInt,
    value => TlvCodec.getUIntTlvLength(value),
    0,
    UINT24_MAX,
);
export const TlvUInt32 = new TlvNumberSchema(
    TlvType.UnsignedInt,
    value => TlvCodec.getUIntTlvLength(value),
    0,
    UINT32_MAX,
);
export const TlvUInt64 = new TlvLongNumberSchema(
    TlvType.UnsignedInt,
    value => TlvCodec.getUIntTlvLength(value),
    0,
    UINT64_MAX,
);

// We use internally 32bit here - in fact encoding is done by real value length anyway
export const TlvEnum = <T>() => TlvUInt32 as TlvSchema<number> as TlvSchema<T>;

export const TlvBitmap = <T extends BitSchema>(underlyingSchema: TlvNumberSchema, bitSchema: T) => {
    // BitmapSchema supports encoding partial bit schemas but specifies its
    // type as TypeFromBitSchema.  Changing to TypeFromPartialBitSchema there
    // probably the right thing to do but this would force us to treat all
    // decoded values as potentially having missing fields.
    //
    // Best would probably be to support different types on decode and encode.
    // In the meantime though we can just cast here as this utility function is
    // only used in places where we want to support partial bitmaps.
    const bitmapSchema = BitmapSchema(bitSchema) as Schema<TypeFromPartialBitSchema<T>, number>;

    return new TlvWrapper(
        underlyingSchema,
        (bitmapData: TypeFromPartialBitSchema<T>) => bitmapSchema.encode(bitmapData),
        value => bitmapSchema.decode(value),
    );
};

// Relative Number types
export const TlvPercent = TlvUInt8.bound({ max: 100 });
export const TlvPercent100ths = TlvUInt16.bound({ max: 10000 });

// Time Number types
export const TlvPosixMs = TlvUInt64;
export const TlvSysTimeUs = TlvUInt64;
export const TlvSysTimeMS = TlvUInt64;

/** Seconds from Unix epoch (1970-01-01) to Matter epoch (2000-01-01) */
export const MATTER_EPOCH_OFFSET_S = 10957 * 24 * 60 * 60;

/** Microseconds from Unix epoch (1970-01-01) to Matter epoch (2000-01-01) */
export const MATTER_EPOCH_OFFSET_US = BigInt(MATTER_EPOCH_OFFSET_S * 1_000_000);

/**
 * TLV Schema for Epoch time in seconds since Matter epoch (2000-01-01). You can just use the normal unix epoch
 * time (since 1970-01-01) number and it will be converted automatically.
 */
export const TlvEpochS = new TlvWrapper<number, number>(
    TlvUInt32,
    unixEpoch => {
        const value = unixEpoch - MATTER_EPOCH_OFFSET_S;
        if (value < 0) {
            throw new ImplementationError(
                "Do not convert Epoch-values yourself, use TlvEpochS directly with unix epoch values.",
            );
        }
        return value;
    },
    epochS => epochS + MATTER_EPOCH_OFFSET_S,
);

/**
 * TLV Schema for Epoch time in microseconds since Matter epoch (2000-01-01). You can just use the unix epoch as
 * microseconds (since 1970-01-01) number and it will be converted automatically.
 */
export const TlvEpochUs = new TlvWrapper<number | bigint, number | bigint>(
    TlvUInt64,
    unixEpoch => {
        const result = BigInt(unixEpoch) - MATTER_EPOCH_OFFSET_US;
        if (result < BigInt(0)) {
            throw new ImplementationError(
                "Do not convert Epoch-values yourself, use TlvEpochUs directly with unix epoch values.",
            );
        }
        return result;
    },
    epochUs => BigInt(epochUs) + MATTER_EPOCH_OFFSET_US,
);
