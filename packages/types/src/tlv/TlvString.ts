/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { Bytes, ImplementationError, serialize, UnexpectedDataError } from "#general";
import { ValidationDatatypeMismatchError, ValidationOutOfBoundsError } from "../common/ValidationError.js";
import { TlvCodec, TlvTag, TlvToPrimitive, TlvType, TlvTypeLength } from "./TlvCodec.js";
import { TlvReader, TlvSchema, TlvWriter } from "./TlvSchema.js";

type LengthConstraints = {
    minLength?: number;
    maxLength?: number;
    length?: number;
};

/**
 * Schema to encode an byte string or an Utf8 string in TLV.
 *
 * @see {@link MatterSpecification.v10.Core} § A.11.2
 */
export class StringSchema<T extends TlvType.ByteString | TlvType.Utf8String> extends TlvSchema<TlvToPrimitive[T]> {
    constructor(
        readonly type: T,
        readonly minLength: number = 0,
        // Formally, Matter Spec defines 2^64-1 as length limit, but we want to protect against memory overflow as default
        readonly maxLength: number = 1024,
    ) {
        super();

        if (minLength < 0) throw new ImplementationError("Minimum length should be a positive number.");
        if (maxLength < 0) throw new ImplementationError("Maximum length should be a positive number.");
        if (minLength > maxLength)
            throw new ImplementationError("Minimum length should be smaller than maximum length.");
    }

    override encodeTlvInternal(writer: TlvWriter, value: TlvToPrimitive[T], tag?: TlvTag): void {
        const length = typeof value === "string" ? value.length : value.byteLength;
        const typeLength: TlvTypeLength = { type: this.type, length: TlvCodec.getUIntTlvLength(length) };
        writer.writeTag(typeLength, tag);
        writer.writePrimitive(typeLength, value);
    }

    override decodeTlvInternalValue(reader: TlvReader, typeLength: TlvTypeLength): TlvToPrimitive[T] {
        if (typeLength.type !== this.type) throw new UnexpectedDataError(`Unexpected type ${typeLength.type}.`);
        return reader.readPrimitive(typeLength);
    }

    override validate(value: TlvToPrimitive[T]): void {
        if (this.type === TlvType.Utf8String && typeof value !== "string")
            throw new ValidationDatatypeMismatchError(`Expected string, got ${typeof value}.`);
        if (this.type === TlvType.ByteString && !Bytes.isBytes(value))
            throw new ValidationDatatypeMismatchError(`Expected bytes, got ${typeof value}.`);
        const length = typeof value === "string" ? value.length : value.byteLength;
        if (length > this.maxLength)
            throw new ValidationOutOfBoundsError(
                `String ${serialize(value)} is too long: ${length}, max ${this.maxLength}.`,
            );
        if (length < this.minLength)
            throw new ValidationOutOfBoundsError(
                `String ${serialize(value)} is too short: ${length}, min ${this.minLength}.`,
            );
    }

    bound({ minLength, maxLength, length }: LengthConstraints) {
        return new StringSchema(
            this.type,
            length ?? minLength ?? this.minLength,
            length ?? maxLength ?? this.maxLength,
        );
    }
}

/** ByteString TLV schema. */
export const TlvByteString = new StringSchema(TlvType.ByteString);

/** String TLV schema. */
export const TlvString = new StringSchema(TlvType.Utf8String);

/** String TLV schema. */
export const TlvString32max = TlvString.bound({ maxLength: 32 });

/** String TLV schema. */
export const TlvString64max = TlvString.bound({ maxLength: 64 });

/** String TLV schema. */
export const TlvString256max = TlvString.bound({ maxLength: 256 });

export const TlvHardwareAddress = TlvByteString.bound({ minLength: 6, maxLength: 8 });
