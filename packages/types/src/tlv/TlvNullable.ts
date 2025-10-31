/**
 * @license
 * Copyright 2022-2025 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { TlvNumericSchema } from "#tlv/TlvNumber.js";
import { ArraySchema } from "./TlvArray.js";
import { TlvTag, TlvType, TlvTypeLength } from "./TlvCodec.js";
import { TlvEncodingOptions, TlvReader, TlvSchema, TlvWriter } from "./TlvSchema.js";
import { StringSchema } from "./TlvString.js";

/**
 * Schema to encode a nullable value in TLV.
 *
 * @see {@link MatterSpecification.v10.Core} § A.11.6
 */
export class NullableSchema<T> extends TlvSchema<T | null> {
    readonly schema: TlvSchema<T>;

    constructor(schema: TlvSchema<T>) {
        super();

        // According to Matter specification, nullable numeric types cannot use the full range of the base type.
        // They use one value to represent null in some cases.
        // That's why adjust the max value accordingly if needed.
        if (schema instanceof TlvNumericSchema && schema.type !== TlvType.Float) {
            // Unsigned integers use the max value of the base type to represent null
            if (schema.baseTypeMin === 0 && schema.max === schema.baseTypeMax) {
                if (typeof schema.baseTypeMax === "number") {
                    schema = schema.bound({ min: schema.min, max: schema.baseTypeMax - 1 });
                } else {
                    schema = schema.bound({ min: schema.min, max: schema.baseTypeMax - BigInt(1) });
                }
            } else if (schema.baseTypeMin < 0 && schema.min === schema.baseTypeMin) {
                // Signed integers use the min value of the base type to represent null
                if (typeof schema.baseTypeMin === "number") {
                    schema = schema.bound({ min: schema.baseTypeMin + 1, max: schema.max });
                } else {
                    schema = schema.bound({ min: schema.baseTypeMin + BigInt(1), max: schema.max });
                }
            }
        }
        this.schema = schema;
    }

    override encodeTlvInternal(writer: TlvWriter, value: T | null, tag?: TlvTag, options?: TlvEncodingOptions): void {
        if (value === null) {
            writer.writeTag({ type: TlvType.Null }, tag);
        } else {
            this.schema.encodeTlvInternal(writer, value, tag, options);
        }
    }

    override decodeTlvInternalValue(reader: TlvReader, typeLength: TlvTypeLength): T | null {
        if (typeLength.type === TlvType.Null) return null;
        const value = this.schema.decodeTlvInternalValue(reader, typeLength);
        // The Matter standard allows to send an empty string or Array for nullable elements that have a length.
        // This should be handled like null, so make sure to convert that correctly when decoding.
        // @see {@link MatterSpecification.v12.Core} § 7.17.1
        if (
            value !== null &&
            (this.schema instanceof ArraySchema || this.schema instanceof StringSchema) &&
            (value as any).length === 0
        ) {
            // But because of Spec vs SDK interpretation issues we only map empty data where the min length is >0 as null
            // and leave the handling of null vs "" (and only for empty strings and arrays) to the implementation.
            // see https://github.com/CHIP-Specifications/connectedhomeip-spec/issues/11387
            // Empty UInt8Arrays are mapped to null as before for convenience until this also makes issues in the future.
            if (
                (this.schema instanceof StringSchema && this.schema.type === TlvType.ByteString) ||
                (this.schema.minLength !== undefined && this.schema.minLength > 0)
            ) {
                return null;
            }
        }
        return value;
    }

    override validate(value: T | null): void {
        if (value !== null) this.schema.validate(value);
    }

    override injectField(value: T, fieldId: number, fieldValue: any, injectChecker: (fieldValue: any) => boolean): T {
        if (value !== null) {
            return this.schema.injectField(value, fieldId, fieldValue, injectChecker);
        }
        return value;
    }

    override removeField(value: T, fieldId: number, removeChecker: (fieldValue: any) => boolean): T {
        if (value !== null) {
            return this.schema.removeField(value, fieldId, removeChecker);
        }
        return value;
    }
}

/** Nullable TLV schema. */
export const TlvNullable = <T>(schema: TlvSchema<T>) => new NullableSchema(schema);
