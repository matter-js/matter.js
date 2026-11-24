/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { Bytes } from "@matter/general";
import { ValueModel } from "@matter/model";
import { ValidationDatatypeMismatchError } from "@matter/types";

function jsonTypeOf(data: unknown) {
    if (data === null) {
        return "null";
    }
    return Array.isArray(data) ? "array" : typeof data;
}

export function convertJsonDataWithModel(model: ValueModel, data: any): any {
    if (data === undefined || (data === null && model.effectiveQuality.nullable)) {
        return data;
    }

    const definingModel = model.definingModel ?? model;
    switch (definingModel.effectiveMetatype) {
        case "array":
            if (!Array.isArray(data)) {
                throw new ValidationDatatypeMismatchError(`Expected array, got ${jsonTypeOf(data)}`);
            }
            return data.map(item => convertJsonDataWithModel(definingModel.children[0], item));
        case "object":
            if (typeof data !== "object" || data === null || Array.isArray(data)) {
                throw new ValidationDatatypeMismatchError(`Expected object, got ${jsonTypeOf(data)}`);
            }
            for (const child of definingModel.children) {
                const childKeyName = child.propertyName;
                data[childKeyName] = convertJsonDataWithModel(child, data[childKeyName]);
            }
            return data;
        case "integer":
            if (typeof data === "string") {
                if (definingModel.metabase?.byteSize !== undefined && definingModel.metabase.byteSize > 6) {
                    // If we have an integer with byteSize > 6 and a string value, we need to convert the string to a
                    // BigInt also handles 0x prefixed hex strings
                    return BigInt(data);
                } else if (data.startsWith("0x")) {
                    // Else if hex string convert to number
                    return parseInt(data.substring(2), 16);
                }
            }
            break;
        case "bytes":
            if (typeof data === "string") {
                // ByteArray encoded as hex-String ... so convert to ByteArray
                return Bytes.fromHex(data);
            }
            break;
    }

    return data;
}
