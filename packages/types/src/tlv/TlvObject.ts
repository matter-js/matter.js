/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { Bytes, ImplementationError, InternalError, Merge, UnexpectedDataError } from "#general";
import { FabricIndex } from "#model";
import {
    ValidationDatatypeMismatchError,
    ValidationError,
    ValidationMandatoryFieldMissingError,
    ValidationOutOfBoundsError,
} from "../common/ValidationError.js";
import { TlvAny } from "./TlvAny.js";
import { LengthConstraints } from "./TlvArray.js";
import { TlvTag, TlvType, TlvTypeLength } from "./TlvCodec.js";
import { TlvEncodingOptions, TlvReader, TlvSchema, TlvWriter } from "./TlvSchema.js";

export interface FieldType<T> {
    id: number;
    schema: TlvSchema<T>;
    optional?: boolean;
    repeated?: boolean;
    fallback?: T;
}

export interface RepeatedFieldType<T> extends FieldType<T> {
    repeated: true;
    minLength?: number;
    maxLength?: number;
}

export interface OptionalFieldType<T> extends FieldType<T> {
    optional: true;
}

export interface OptionalRepeatedFieldType<T> extends OptionalFieldType<T> {
    repeated: true;
    maxLength?: number;
}

export type TlvFields = { [field: string]: FieldType<any> };

type MandatoryFieldNames<F extends TlvFields> = {
    [K in keyof F]: F[K] extends OptionalFieldType<any> ? never : K;
}[keyof F];
type OptionalFieldNames<F extends TlvFields> = {
    [K in keyof F]: F[K] extends OptionalFieldType<any> ? K : never;
}[keyof F];
type TypeFromField<F extends FieldType<any>> = F extends FieldType<infer T> ? T : never;
type TypeForMandatoryFields<F extends TlvFields, MF extends keyof F> = { [K in MF]: TypeFromField<F[K]> };
type TypeForOptionalFields<F extends TlvFields, MF extends keyof F> = { [K in MF]?: TypeFromField<F[K]> };
export type TypeFromFields<F extends TlvFields> = Merge<
    TypeForMandatoryFields<F, MandatoryFieldNames<F>>,
    TypeForOptionalFields<F, OptionalFieldNames<F>>
>;

/**
 * Schema to encode an object in TLV.
 *
 * @see {@link MatterSpecification.v10.Core} § A.5.1 and § A.11.4
 */
export class ObjectSchema<F extends TlvFields> extends TlvSchema<TypeFromFields<F>> {
    readonly isFabricScoped: boolean;
    private readonly fieldById = new Array<{ name: string; field: FieldType<any> }>();

    constructor(
        private readonly fieldDefinitions: F,
        private readonly type: TlvType.Structure | TlvType.List = TlvType.Structure,
        private readonly allowProtocolSpecificTags = false,
    ) {
        super();

        let isFabricScoped = false;
        // TODO Add sorting option to enforce order of fields in encoded TLV If Ty is Structure
        //  Requirements @see {@link MatterSpecification.Core.v12} § A.2.4
        for (const name in this.fieldDefinitions) {
            const field = this.fieldDefinitions[name];
            if (field.repeated && type !== TlvType.List) {
                throw new Error("Repeated fields are only allowed in TLV List.");
            }
            this.fieldById[field.id] = { name, field };
            if (field.id === FabricIndex.id) {
                isFabricScoped = true;
            }
        }
        this.isFabricScoped = isFabricScoped;
    }

    #encodeEntryToTlv(writer: TlvWriter, name: string, value: TypeFromFields<F>, options?: TlvEncodingOptions) {
        const { id, schema, optional: isOptional, repeated: isRepeated } = this.fieldDefinitions[name];
        const { forWriteInteraction = false, allowMissingFieldsForNonFabricFilteredRead = false } = options ?? {};
        if (forWriteInteraction && allowMissingFieldsForNonFabricFilteredRead) {
            throw new InternalError(
                "Encode options cannot indicate a write interaction and a fabric filtered read interaction at the same time.",
            );
        }
        const fieldValue = (value as any)[name];
        if (fieldValue === undefined) {
            if (!isOptional && !allowMissingFieldsForNonFabricFilteredRead) {
                if (forWriteInteraction && id === <number>FabricIndex.id) {
                    // FabricIndex field should not be included in encoded data for write interactions
                    return;
                }
                throw new ValidationMandatoryFieldMissingError(`Missing mandatory field ${name}`, name);
            }
            return;
        }
        if (isRepeated) {
            if (!Array.isArray(fieldValue)) {
                throw new ValidationDatatypeMismatchError(`Repeated field ${name} should be an array.`, name);
            }
            for (const element of fieldValue) {
                schema.encodeTlvInternal(writer, element, { id }, options);
            }
        } else {
            schema.encodeTlvInternal(writer, fieldValue, { id }, options);
        }
    }

    /**
     * Encode the object as Structure, by the order of field definitions.
     */
    #encodeStructure(writer: TlvWriter, value: TypeFromFields<F>, options?: TlvEncodingOptions) {
        for (const name in this.fieldDefinitions) {
            this.#encodeEntryToTlv(writer, name, value, options);
        }
    }

    /**
     * Encode the object as List, by the order of the fields in the object.
     */
    #encodeList(writer: TlvWriter, value: TypeFromFields<F>, options?: TlvEncodingOptions) {
        const encodedFields = new Set<string>();
        // Encode object fields
        for (const name of Object.keys(value)) {
            this.#encodeEntryToTlv(writer, name, value, options);
            encodedFields.add(name);
        }
        // Verify the potentially missing fields
        for (const name in this.fieldDefinitions) {
            if (encodedFields.has(name)) continue;
            this.#encodeEntryToTlv(writer, name, value, options);
        }
    }

    override encodeTlvInternal(
        writer: TlvWriter,
        value: TypeFromFields<F>,
        tag?: TlvTag,
        options?: TlvEncodingOptions,
    ): void {
        writer.writeTag({ type: this.type }, tag);

        if (this.type === TlvType.Structure) {
            // Encode in order of field definitions
            this.#encodeStructure(writer, value, options);
        } else {
            this.#encodeList(writer, value, options);
        }

        writer.writeTag({ type: TlvType.EndOfContainer });
    }

    override decodeTlvInternalValue(reader: TlvReader, typeLength: TlvTypeLength): TypeFromFields<F> {
        if (typeLength.type !== this.type)
            throw new UnexpectedDataError(`Unexpected type ${typeLength.type} (expected ${this.type}).`);
        const result: any = {};
        while (true) {
            const { tag: { profile, id } = {}, typeLength: elementTypeLength } = reader.readTagType();
            if (elementTypeLength.type === TlvType.EndOfContainer) break;
            if (profile !== undefined && !this.allowProtocolSpecificTags)
                throw new UnexpectedDataError("Structure element tags should be context-specific.");
            if (id === undefined) throw new UnexpectedDataError("Structure element tags should have an id.");
            const fieldName = this.fieldById[id];
            if (fieldName === undefined) {
                // Ignore unknown field by decoding it as raw TLV so we skip forward the proper length.
                TlvAny.decodeTlvInternalValue(reader, elementTypeLength);
                continue;
            }
            const { field, name } = fieldName;
            const decoded = field.schema.decodeTlvInternalValue(reader, elementTypeLength);
            if (field.repeated) {
                if (result[name] === undefined) {
                    result[name] = [decoded];
                } else {
                    result[name].push(decoded);
                }
            } else {
                result[name] = decoded;
            }
        }
        // Check mandatory fields and, if missing, populate with fallback value if defined.
        for (const name in this.fieldDefinitions) {
            const { optional, fallback, repeated } = this.fieldDefinitions[name];
            if (optional) continue;
            const value = result[name];
            if (value !== undefined) continue;
            if (fallback !== undefined) {
                if (repeated) {
                    result[name] = [fallback];
                } else {
                    result[name] = fallback;
                }
            }
        }
        return result as TypeFromFields<F>;
    }

    override validate(value: TypeFromFields<F>): void {
        for (const name in this.fieldDefinitions) {
            const { optional, schema, repeated: isRepeated } = this.fieldDefinitions[name];
            const data = (value as any)[name];
            if (data === undefined) {
                if (optional) {
                    continue;
                }
                throw new ValidationMandatoryFieldMissingError(`Missing mandatory field ${name}`, name);
            }
            if (isRepeated) {
                const { minLength = 2, maxLength = 65535 } = this.fieldDefinitions[name] as RepeatedFieldType<any>;
                if (!Array.isArray(data)) {
                    throw new ValidationDatatypeMismatchError(`Repeated field ${name} should be an array.`, name);
                }
                if (data.length > maxLength)
                    throw new ValidationOutOfBoundsError(
                        `Repeated field list for ${name} is too long: ${data.length}, max ${maxLength}.`,
                        name,
                    );
                if (data.length < minLength)
                    throw new ValidationOutOfBoundsError(
                        `Repeated field list for ${name} is too short: ${data.length}, min ${minLength}.`,
                        name,
                    );
                for (const element of data) {
                    try {
                        schema.validate(element);
                    } catch (e) {
                        ValidationError.accept(e);
                        e.fieldName = `${name}${e.fieldName !== undefined ? `.${e.fieldName}` : ""}`;
                        throw e;
                    }
                }
            } else {
                try {
                    schema.validate(data);
                } catch (e) {
                    ValidationError.accept(e);
                    e.fieldName = `${name}${e.fieldName !== undefined ? `.${e.fieldName}` : ""}`;
                    throw e;
                }
            }
        }
    }

    override injectField(
        value: TypeFromFields<F>,
        fieldId: number,
        fieldValue: any,
        injectChecker: (fieldValue: any) => boolean,
    ): TypeFromFields<F> {
        for (const k in this.fieldDefinitions) {
            const field = this.fieldDefinitions[k] as FieldType<any>;

            if (field.id === fieldId) {
                if (injectChecker((value as any)[k])) {
                    field.schema.validate(fieldValue); // Make sure type matches
                    (value as any)[k] = fieldValue;
                }
            } else {
                (value as any)[k] = field.schema.injectField((value as any)[k], fieldId, fieldValue, injectChecker);
            }
        }
        return value;
    }

    override removeField(
        value: TypeFromFields<F>,
        fieldId: number,
        removeChecker: (fieldValue: any) => boolean,
    ): TypeFromFields<F> {
        for (const k in this.fieldDefinitions) {
            const field = this.fieldDefinitions[k] as FieldType<any>;

            if (field.id === fieldId) {
                if ((value as any)[k] !== undefined && removeChecker((value as any)[k])) {
                    delete (value as any)[k];
                }
            } else {
                (value as any)[k] = field.schema.removeField((value as any)[k], fieldId, removeChecker);
            }
        }
        return value;
    }
}

/** Object TLV schema. */
export const TlvObject = <F extends TlvFields>(fields: F) => new ObjectSchema(fields, TlvType.Structure);

export class ObjectSchemaWithMaxSize<F extends TlvFields> extends ObjectSchema<F> {
    constructor(
        fieldDefinitions: F,
        protected readonly maxSize: number,
        type: TlvType.Structure | TlvType.List = TlvType.Structure,
        allowProtocolSpecificTags = false,
    ) {
        super(fieldDefinitions, type, allowProtocolSpecificTags);
    }

    override encode(value: TypeFromFields<F>): Bytes {
        const encoded = super.encode(value);
        if (encoded.byteLength > this.maxSize) {
            throw new ImplementationError(
                `Encoded TLV object with ${encoded.byteLength} bytes exceeds maximum size of ${this.maxSize} bytes.`,
            );
        }
        return encoded;
    }
}

export const TlvObjectWithMaxSize = <F extends TlvFields>(fields: F, maxSize: number) =>
    new ObjectSchemaWithMaxSize(fields, maxSize, TlvType.Structure);

/**
 * List TLV schema with all tagged entries.
 * List entries that can appear multiple times can be defined using TlvRepeatedField/TlvOptionalRepeatedField and are
 * represented as Arrays.
 * TODO: We represent Tlv Lists right now as named object properties. This formally does not match the spec, which
 *      defines a list as a sequence of TLV elements with optional tag where the order matters. That's ok for now
 *      (also with the help of "Repeated Fields") because it not makes any real difference for now for the current
 *      existing data structures. We need to change once this changes.
 */
export const TlvTaggedList = <F extends TlvFields>(fields: F, allowProtocolSpecificTags = false) =>
    new ObjectSchema(fields, TlvType.List, allowProtocolSpecificTags);

// TODO Implement a real TlvList schema that matches the spec to represent a ordered list of TLV elements with optional
//      tag.

/**
 * Object TLV mandatory field. Optionally provide a fallback value to initialize the field value when devices omit
 * providing a value against the specifications or in special use cases. Make sure to use a value that is an equivalent
 * to the value being empty.
 */
export const TlvField = <T>(id: number, schema: TlvSchema<T>, fallback?: T) =>
    ({ id, schema, fallback, optional: false }) as FieldType<T>;

/** Object TLV optional field. */
export const TlvOptionalField = <T>(id: number, schema: TlvSchema<T>) =>
    ({ id, schema, optional: true }) as OptionalFieldType<T>;

/**
 * Object TLV mandatory field that can exist repeated in a TLV List structure. The order is preserved on encoding and
 * decoding.
 */
export const TlvRepeatedField = <T>(id: number, schema: TlvSchema<T>, lengthOptions?: LengthConstraints) => {
    const { minLength, maxLength, length } = lengthOptions ?? {};
    return {
        id,
        schema,
        optional: false,
        repeated: true,
        minLength: length ?? minLength,
        maxLength: length ?? maxLength,
    } as RepeatedFieldType<T[]>;
};

/**
 * Object TLV optional field that can exist repeated in a TLV List structure. The order is preserved on encoding and
 * decoding.
 */
export const TlvOptionalRepeatedField = <T>(
    id: number,
    schema: TlvSchema<T>,
    lengthOptions?: { maxLength: number },
) => {
    const { maxLength } = lengthOptions ?? {};
    return {
        id,
        schema,
        optional: true,
        repeated: true,
        minLength: 0,
        maxLength,
    } as OptionalRepeatedFieldType<T[]>;
};
