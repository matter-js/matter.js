/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { ImplementationError, UnexpectedDataError } from "@matter/general";
import { Bytes, camelize, isObject } from "@matter/main";
import { MATTER_EPOCH_OFFSET_S, MATTER_EPOCH_OFFSET_US } from "@matter/main/types";
import { ClusterModel, FieldModel, FieldValue, SchemaImplementationError, ValueModel } from "@matter/model";

/** Octet-string prefix: chip-tool's own results always carry `base64:`; `CustomArgument` input accepts `hex:`. */
export type OctetEncoding = "hex" | "base64";

const enum ConvKind {
    Passthrough,
    EpochS,
    EpochUS,
    Bytes,
    Bitmap,
    Struct,
    List,
}

const modelKindCache = new WeakMap<ValueModel, ConvKind>();

function classifyModel(model: ValueModel): ConvKind {
    let kind = modelKindCache.get(model);
    if (kind !== undefined) return kind;

    if (model.type === "list") {
        kind = ConvKind.List;
    } else if (model.metabase?.name === "struct") {
        kind = ConvKind.Struct;
    } else if (model.metabase?.metatype === "bitmap") {
        kind = ConvKind.Bitmap;
    } else if (model.metabase?.metatype === "bytes") {
        kind = ConvKind.Bytes;
    } else if (model.metabase?.metatype === "integer") {
        kind =
            model.type === "epoch-s"
                ? ConvKind.EpochS
                : model.type === "epoch-us"
                  ? ConvKind.EpochUS
                  : ConvKind.Passthrough;
    } else {
        kind = ConvKind.Passthrough;
    }

    modelKindCache.set(model, kind);
    return kind;
}

interface StructMemberEntry {
    readonly name: string;
    readonly id: number;
    readonly model: ValueModel;
}

/** Precomputed struct member info for the encode direction: avoids re-walking `model.members` per value. */
const structMemberCache = new WeakMap<ValueModel, StructMemberEntry[]>();

function getStructMembers(model: ValueModel): StructMemberEntry[] {
    let members = structMemberCache.get(model);
    if (members !== undefined) return members;

    members = new Array<StructMemberEntry>();
    for (const member of model.members) {
        if (member.name !== undefined && member.id !== undefined) {
            members.push({ name: member.propertyName, id: member.id, model: member });
        }
    }
    structMemberCache.set(model, members);
    return members;
}

/** Struct member lookup by numeric field id, for the decode direction. */
const structMembersByIdCache = new WeakMap<ValueModel, Map<number, ValueModel>>();

function getStructMembersById(model: ValueModel): Map<number, ValueModel> {
    let members = structMembersByIdCache.get(model);
    if (members !== undefined) return members;

    members = new Map();
    for (const member of model.members) {
        if (member.id !== undefined) members.set(member.id, member);
    }
    structMembersByIdCache.set(model, members);
    return members;
}

/**
 * Cached bitmap member resolution. Bit fields resolve via the cluster scope rather than the model
 * alone, so the cache is keyed by clusterModel first, then model.
 */
const bitmapMemberCache = new WeakMap<ClusterModel, WeakMap<ValueModel, FieldModel[]>>();

function getBitmapMembers(model: ValueModel, clusterModel: ClusterModel): FieldModel[] {
    let byModel = bitmapMemberCache.get(clusterModel);
    if (byModel === undefined) {
        byModel = new WeakMap();
        bitmapMemberCache.set(clusterModel, byModel);
    }

    let members = byModel.get(model);
    if (members !== undefined) return members;

    members = [...clusterModel.scope.membersOf(model)];
    byModel.set(model, members);
    return members;
}

/**
 * A bitmap member's key in the decoded object.
 *
 * `FeatureMap`'s bits are named by their (non-abbreviated) title rather than the short feature-code
 * `propertyName` every other bitmap uses.
 */
function bitmapMemberName(member: FieldModel, model: ValueModel): string | undefined {
    if (member.name !== undefined && model.name !== "FeatureMap") {
        return member.propertyName;
    }
    return member.title !== undefined ? camelize(member.title) : undefined;
}

/**
 * A bitmap member's value in an object being encoded. Unlike decode, encode tries `propertyName`
 * first regardless of `FeatureMap`, falling back to the title: the object may have come from
 * anywhere, not just this codec's own decode.
 */
function bitmapMemberValue(member: FieldModel, value: Record<string, unknown>): unknown {
    if (member.name !== undefined && value[member.propertyName]) {
        return value[member.propertyName];
    }
    const memberTitle = member.title !== undefined ? camelize(member.title) : undefined;
    return memberTitle !== undefined ? value[memberTitle] : undefined;
}

function bitFieldMask(minBit: number, maxBit: number): number {
    return ((1 << (maxBit - minBit + 1)) - 1) << minBit;
}

function listElementModel(model: ValueModel): ValueModel {
    const member = model.members.at(0);
    if (member === undefined) {
        throw new SchemaImplementationError(model, "list model declares no element type");
    }
    return member;
}

function decodeOctetString(value: string): Bytes {
    if (value.startsWith("base64:")) {
        return Bytes.fromBase64(value.slice(7));
    }
    if (value.startsWith("hex:")) {
        return Bytes.fromHex(value.slice(4));
    }
    throw new UnexpectedDataError(`Octet string "${value}" has neither a "base64:" nor a "hex:" prefix`);
}

/** chip tag-based JSON value -> matter.js value, driven by the model. */
export function chipJsonToMatter(value: unknown, model: ValueModel, clusterModel: ClusterModel): unknown {
    if (value === null) {
        return null;
    }

    switch (classifyModel(model)) {
        case ConvKind.List: {
            if (!Array.isArray(value)) return value;
            const memberModel = listElementModel(model);
            return value.map(v => chipJsonToMatter(v, memberModel, clusterModel));
        }

        case ConvKind.Struct: {
            if (!isObject(value)) return value;
            const memberById = getStructMembersById(model);
            const result: { [key: string]: unknown } = {};
            for (const key of Object.keys(value)) {
                const member = /^\d+$/.test(key) ? memberById.get(Number(key)) : undefined;
                if (member !== undefined) {
                    result[member.propertyName] = chipJsonToMatter(value[key], member, clusterModel);
                } else {
                    result[key] = value[key];
                }
            }
            return result;
        }

        case ConvKind.Bitmap: {
            if (typeof value !== "number") return value;
            const bitmapValue: { [key: string]: boolean | number } = {};
            for (const member of getBitmapMembers(model, clusterModel)) {
                const memberName = bitmapMemberName(member, model);
                if (memberName === undefined) continue;

                const constraintValue = FieldValue.numericValue(member.constraint.value);
                if (constraintValue !== undefined) {
                    bitmapValue[memberName] = (value & (1 << constraintValue)) !== 0;
                } else {
                    const minBit = FieldValue.numericValue(member.constraint.min) ?? 0;
                    const maxBit = FieldValue.numericValue(member.constraint.max);
                    if (maxBit !== undefined) {
                        bitmapValue[memberName] = (value & bitFieldMask(minBit, maxBit)) >> minBit;
                    } else {
                        bitmapValue[memberName] = (value & (1 << minBit)) !== 0;
                    }
                }
            }
            return bitmapValue;
        }

        case ConvKind.Bytes:
            return typeof value === "string" ? decodeOctetString(value) : value;

        case ConvKind.EpochS:
            return typeof value === "number" ? value + MATTER_EPOCH_OFFSET_S : value;

        case ConvKind.EpochUS:
            return typeof value === "number" || typeof value === "bigint"
                ? BigInt(value) + MATTER_EPOCH_OFFSET_US
                : value;

        case ConvKind.Passthrough:
            return value;
    }
}

/**
 * matter.js value -> chip tag-based JSON value. `octets` picks the octet-string prefix: chip-tool's
 * `CustomArgument` input parser accepts `hex:`, its own result output always carries `base64:`.
 */
export function matterToChipJson(
    value: unknown,
    model: ValueModel,
    clusterModel: ClusterModel,
    octets: OctetEncoding,
): unknown {
    if (value === null) {
        return null;
    }

    switch (classifyModel(model)) {
        case ConvKind.List: {
            if (!Array.isArray(value)) return value;
            const memberModel = listElementModel(model);
            return value.map(v => matterToChipJson(v, memberModel, clusterModel, octets));
        }

        case ConvKind.Struct: {
            if (!isObject(value)) return value;
            const result: { [key: string]: unknown } = {};
            for (const { name, id, model: memberModel } of getStructMembers(model)) {
                if (Object.hasOwn(value, name)) {
                    result[id] = matterToChipJson(value[name], memberModel, clusterModel, octets);
                }
            }
            return result;
        }

        case ConvKind.Bitmap: {
            if (!isObject(value)) return value;
            let numberValue = 0;
            for (const member of getBitmapMembers(model, clusterModel)) {
                const memberValue = bitmapMemberValue(member, value);
                if (!memberValue) continue;
                if (typeof memberValue !== "boolean" && typeof memberValue !== "number") {
                    throw new ImplementationError(
                        `Bitmap member "${member.propertyName}" of "${model.name}" must be boolean or number, got ${typeof memberValue}`,
                    );
                }

                const constraintValue = FieldValue.numericValue(member.constraint.value);
                if (constraintValue !== undefined) {
                    numberValue |= 1 << constraintValue;
                } else {
                    const minBit = FieldValue.numericValue(member.constraint.min) ?? 0;
                    const maxBit = FieldValue.numericValue(member.constraint.max);
                    const raw = typeof memberValue === "boolean" ? 1 : memberValue;
                    numberValue |=
                        maxBit !== undefined ? (raw << minBit) & bitFieldMask(minBit, maxBit) : raw << minBit;
                }
            }
            return numberValue;
        }

        case ConvKind.Bytes:
            return Bytes.isBytes(value)
                ? `${octets}:${octets === "hex" ? Bytes.toHex(value) : Bytes.toBase64(value)}`
                : value;

        case ConvKind.EpochS:
            return typeof value === "number" ? value - MATTER_EPOCH_OFFSET_S : value;

        case ConvKind.EpochUS:
            return typeof value === "number" || typeof value === "bigint"
                ? BigInt(value) - MATTER_EPOCH_OFFSET_US
                : value;

        case ConvKind.Passthrough:
            return value;
    }
}

/**
 * A per-call marker for round-tripping a value through a string placeholder (`JSON.parse`'s reviver,
 * or a post-`stringify` text replacement). Generated fresh each call — a fixed marker could collide
 * with a legitimate string value that happens to contain it.
 */
function uniqueMarker(prefix: string): string {
    return `${prefix}${Math.random().toString(36).slice(2)}${Math.random().toString(36).slice(2)}`;
}

/**
 * `JSON.parse` that survives integers above `Number.MAX_SAFE_INTEGER`: a chip-tool reply can carry a
 * uint64 value (e.g. an attribute's data version or a NOC's fabric id) that `JSON.parse` would
 * otherwise silently round. Digit runs of 15 or more outside string literals are pre-extracted and
 * parsed as `BigInt`; those exceeding the safe integer range come back as `bigint`, everything else as
 * a `number`.
 */
export function parseChipJson(json: string): unknown {
    const marker = uniqueMarker("chip-bigint-");
    const result = new Array<string>();
    let i = 0;
    let inString = false;

    while (i < json.length) {
        const char = json[i];

        if (inString) {
            if (char === "\\") {
                result.push(char);
                i++;
                if (i < json.length) {
                    result.push(json[i]);
                    i++;
                }
            } else if (char === '"') {
                result.push(char);
                inString = false;
                i++;
            } else {
                result.push(char);
                i++;
            }
            continue;
        }

        if (char === '"') {
            result.push(char);
            inString = true;
            i++;
            continue;
        }

        if (char >= "0" && char <= "9") {
            const hasMinus = result.length > 0 && result[result.length - 1] === "-";
            if (hasMinus) {
                result.pop();
            }

            const start = i;
            while (i < json.length && json[i] >= "0" && json[i] <= "9") {
                i++;
            }

            let isFloat = false;
            if (i < json.length && json[i] === ".") {
                isFloat = true;
                i++;
                while (i < json.length && json[i] >= "0" && json[i] <= "9") {
                    i++;
                }
            }
            if (i < json.length && (json[i] === "e" || json[i] === "E")) {
                isFloat = true;
                i++;
                if (i < json.length && (json[i] === "+" || json[i] === "-")) {
                    i++;
                }
                while (i < json.length && json[i] >= "0" && json[i] <= "9") {
                    i++;
                }
            }

            const numberStr = (hasMinus ? "-" : "") + json.slice(start, i);
            if (!isFloat && numberStr.length - (hasMinus ? 1 : 0) >= 15) {
                const num = BigInt(numberStr);
                if (num > Number.MAX_SAFE_INTEGER || num < Number.MIN_SAFE_INTEGER) {
                    result.push(`"${marker}${numberStr}"`);
                } else {
                    result.push(numberStr);
                }
            } else {
                result.push(numberStr);
            }
            continue;
        }

        result.push(char);
        i++;
    }

    return JSON.parse(result.join(""), (_key, value) => {
        if (typeof value === "string" && value.startsWith(marker)) {
            return BigInt(value.slice(marker.length));
        }
        return value;
    });
}

/**
 * `JSON.stringify` that emits a `bigint` as an unquoted integer literal (chip JSON, unlike JS JSON,
 * has no numeric type wide enough to survive quoting) rather than throwing or silently truncating it.
 * A `bigint` within the safe integer range is emitted as a plain number.
 */
export function stringifyChipJson(value: unknown): string {
    const marker = uniqueMarker("chip-bigint-");
    const replacements = new Array<{ from: string; to: string }>();
    const stringified = JSON.stringify(value, (_key, v) => {
        if (typeof v === "bigint") {
            if (v > Number.MAX_SAFE_INTEGER || v < Number.MIN_SAFE_INTEGER) {
                replacements.push({ from: `"${marker}${v.toString()}"`, to: v.toString() });
                return `${marker}${v.toString()}`;
            }
            return Number(v);
        }
        return v;
    });
    if (stringified === undefined) {
        throw new ImplementationError(`stringifyChipJson cannot serialize a top-level ${typeof value}`);
    }

    let result = stringified;
    for (const { from, to } of replacements) {
        result = result.replaceAll(from, to);
    }

    return result;
}
