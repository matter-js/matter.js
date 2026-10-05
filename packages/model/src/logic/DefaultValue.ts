/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { Bytes, Duration, NotImplementedError } from "@matter/general";
import { FieldValue, Metatype } from "../common/index.js";
import type { ValueModel } from "../models/ValueModel.js";
import { BitmapMembers } from "./BitmapMembers.js";
import { DecodedBitmap } from "./DecodedBitmap.js";
import { EncodedValue } from "./EncodedValue.js";
import { Scope } from "./Scope.js";

/**
 * Obtain a native JS default value for a ValueModel.
 *
 * Validation is not required: a default that cannot be converted is treated as absent, as is the "no value" marker
 * an override uses to remove a default (see {@link FieldValue.stated}). The usual synthesized default may then be
 * returned for arrays, objects, and bitmaps. It throws errors for a few structural issues.
 *
 * @param scope the scope in which the model is referenced
 * @param model the model from which the default value is extracted
 * @param ifValid some structs only have partial defaults defined so would be invalid; do not return these
 */
export function DefaultValue(scope: Scope, model: ValueModel, ifValid = false): any {
    const value = castValue(scope, model, FieldValue.stated(model.default));
    if (value === undefined) {
        return createValue(scope, model, ifValid);
    }
    return value;
}

/**
 * When an explicit value is present, cast to native JS type.
 */
function castValue(scope: Scope, model: ValueModel, modelDefault?: FieldValue): unknown {
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
            // Restated in encoding units the same way a constraint's bounds are, or a unit would mean one thing in a
            // bound and another in a default
            return EncodedValue(model, modelDefault);

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
                return DecodedBitmap(model, modelDefault, scope);
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
                    return modelDefault.map(value => castValue(scope, entry as ValueModel, FieldValue.stated(value)));
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
                !model.effectiveConstraint.min &&
                !model.effectiveConstraint.value
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
        const name = child.propertyName;
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
    let bitmap: bigint | undefined;

    // Where members overlap, the first to claim a bit decides it
    let claimed = 0n;

    for (const member of BitmapMembers.of(model, scope, { conformance: "conformant" })) {
        const defaultValue = FieldValue.numericValue(member.default);
        if (typeof defaultValue !== "number" && typeof defaultValue !== "bigint") {
            continue;
        }

        bitmap ??= 0n;

        const range = BitmapMembers.rangeOf(member, defaultValue);
        if (range === undefined) {
            continue;
        }

        bitmap |= BitmapMembers.place(range, defaultValue) & ~claimed;
        claimed |= BitmapMembers.maskOf(range);
    }

    return bitmap === undefined ? undefined : BitmapMembers.toNumeric(bitmap);
}
