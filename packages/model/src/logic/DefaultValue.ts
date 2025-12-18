/**
 * @license
 * Copyright 2022-2025 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { Bytes, camelize, Duration, NotImplementedError } from "#general";
import { FieldValue, Metatype } from "../common/index.js";
import type { ValueModel } from "../models/ValueModel.js";
import { DecodedBitmap } from "./DecodedBitmap.js";
import { Scope } from "./Scope.js";

/**
 * Obtain a native JS default value for a ValueModel.
 *
 * This code assumes defaults have been previously validated (e.g. by model validator).  It throws errors for a few
 * structural issues but generally returns undefined if the model's default value cannot be converted to the correct
 * type.
 *
 * @param scope the scope in which the model is referenced
 * @param model the model from which the default value is extracted
 * @param ifValid some structs only have partial defaults defined so would be invalid; do not return these
 */
export function DefaultValue(scope: Scope, model: ValueModel, ifValid = false): any {
    const value = castValue(model, model.default);
    if (value === undefined) {
        return createValue(scope, model, ifValid);
    }
    return value;
}

/**
 * When an explicit value is present, cast to native JS type.
 */
function castValue(model: ValueModel, modelDefault?: FieldValue): unknown {
    if (modelDefault === undefined) {
        return;
    }

    if (modelDefault === null) {
        if (model.nullable) {
            return null;
        }
        return;
    }

    const metatype = model.effectiveMetatype;
    switch (metatype) {
        case undefined:
        case Metatype.any:
            return FieldValue.unwrap(modelDefault);

        case Metatype.integer:
        case Metatype.float:
            return FieldValue.numericValue(modelDefault, model.type);

        case Metatype.enum:
            let enumValueModel;
            if (typeof modelDefault === "number" || typeof modelDefault === "string") {
                enumValueModel = model.member(modelDefault);
            }
            if (enumValueModel) {
                return enumValueModel.effectiveId;
            }
            return;

        case Metatype.bitmap:
            // Bitmaps defaults may be encoded three ways - number, bitfield k/v object, or via defaults on individual
            // bit fields (composed above)
            if (typeof modelDefault === "number" || typeof modelDefault === "bigint") {
                // Default value is a number
                return DecodedBitmap(model, modelDefault);
            }

            // Default value may be an object
            return FieldValue.objectValue(modelDefault);

        case Metatype.object:
            return FieldValue.objectValue(modelDefault);

        case Metatype.string:
            return `${modelDefault}`;

        case Metatype.bytes:
            if (ArrayBuffer.isView(modelDefault)) {
                return new Uint8Array(modelDefault.buffer, modelDefault.byteOffset, modelDefault.byteLength);
            }
            if (typeof modelDefault === "string") {
                return Bytes.fromHex(modelDefault);
            }
            return;

        case Metatype.date:
            if (modelDefault instanceof Date) {
                return modelDefault;
            }
            if (typeof modelDefault === "number" || typeof modelDefault === "string") return new Date(modelDefault);
            return;

        case Metatype.duration:
            if (typeof modelDefault === "number" || typeof modelDefault === "string")
                return Duration(modelDefault as Duration | string);
            break;

        case Metatype.array:
            if (Array.isArray(modelDefault)) {
                const entry = model.member("entry");
                if (entry?.isType) {
                    return modelDefault.map(value => castValue(entry as ValueModel, value));
                }
                return modelDefault;
            }
            return;

        case Metatype.boolean:
            return !!modelDefault;

        default:
            throw new NotImplementedError(`Unsupported metatype "${metatype}"`);
    }
}

/**
 * When an explicit default value is not present, for some types we generate a default.
 */
function createValue(scope: Scope, model: ValueModel, ifValid: boolean) {
    switch (model.effectiveMetatype) {
        case Metatype.array:
            // We don't really build default array values except in the case of non-nullable arrays where zero items is
            // allowed; then we create an empty array
            if (
                !model.nullable &&
                model.effectiveMetatype === Metatype.array &&
                !model.constraint.min &&
                !model.constraint.value
            ) {
                return [];
            }
            return;

        case Metatype.object:
            return buildObject(scope, model, ifValid);

        case Metatype.bitmap:
            return buildBitmap(scope, model);
    }
}

function buildObject(scope: Scope, model: ValueModel, ifValid: boolean) {
    let result: { [key: string]: any } | undefined;

    for (const child of scope.membersOf(model, { conformance: "conformant" })) {
        const name = camelize(child.name);
        if (result && result[name] !== undefined) {
            continue;
        }

        const value = DefaultValue(scope, child);
        if (value !== undefined) {
            if (!result) {
                result = {};
            }

            result[name] = value;
            continue;
        }

        if (ifValid && !child.nullable) {
            // We can't create a valid default object because we don't have default values for all nullable fields
            return;
        }
    }

    return result;
}

function buildBitmap(scope: Scope, model: ValueModel) {
    let result;
    let fieldsDefined = 0;

    for (const m of scope.membersOf(model, { conformance: "conformant" })) {
        const defaultValue = FieldValue.numericValue(m.default);
        if (defaultValue === undefined) {
            continue;
        }

        if (result === undefined) {
            result = 0;
        }

        let minBit, maxBit;

        const constraintValue = FieldValue.numericValue(m.constraint.value);
        if (constraintValue !== undefined) {
            minBit = constraintValue;
            maxBit = constraintValue + 1;
        } else {
            minBit = FieldValue.numericValue(m.constraint.min);
            maxBit = FieldValue.numericValue(m.constraint.max);
        }

        if (minBit === undefined) {
            minBit = 0;
        }
        if (maxBit === undefined) {
            maxBit = Math.trunc(Math.log2(defaultValue)) + 1;
        }

        for (let i = 0, mask = 1 << minBit; i < maxBit - minBit; i++, mask <<= 1) {
            if (fieldsDefined & mask) {
                continue;
            }
            fieldsDefined |= mask;
            if (defaultValue & (1 << i)) {
                result |= mask;
            }
        }
    }

    return result;
}
