/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { Bytes, camelize, InternalError, isObject } from "@matter/main";
import { MATTER_EPOCH_OFFSET_S } from "@matter/main/types";
import type { ClusterModel, ValueModel } from "@matter/model";
import type { CommandPayload } from "./tc-support.js";
import {
    chipCommandField,
    chipOctetStringField,
    describeValue,
    MATTERJS_EMPTY_PAYLOAD,
    MATTERJS_NO_PAYLOAD,
    requireId,
    SIGNED_TYPES,
} from "./tc-support.js";

/**
 * A field value: a number for an integer or enum field, a string, a boolean, {@link Bytes} for an octet string,
 * `null` for a nullable field, a {@link CommandStruct} for a struct or for the set bits of a bitmap, or a list.
 */
export type CommandValue = number | string | boolean | Bytes | null | CommandStruct | CommandValue[];

/** A struct value by field name, or a bitmap by bit name. A field left out is not sent; a bit left out is not set. */
export interface CommandStruct {
    [field: string]: CommandValue;
}

/** A command argument by field name. A field left out is not sent. */
export type CommandArgs = CommandStruct;

/** One value as both TH flavors print it. */
interface RenderedValue {
    /** chip's lines for the value, starting with the line that names its field id, if it has one. */
    chip: RegExp[];

    /** matter.js's text for the value inside a struct or list. */
    matterjs: string;
}

/** chip-tool's `command-by-id` orders struct members by the text of their ids, which is id order only below 10. */
const CHIP_TOOL_ORDERED_FIELD_IDS = 10;

const CHIP_STRUCT_OPEN = /\{\s*$/;
const CHIP_STRUCT_CLOSE = /\},\s*$/;
const CHIP_LIST_CLOSE = /\],\s*$/;

/** chip ends the line after a list's `[` and prints a line without text before the first entry. */
const CHIP_LIST_GAP = /\[DMG\]\s*$/;

/** The single-bit members of a bitmap field in model order, with their bit numbers. */
export function bitsOf(field: ValueModel) {
    const bitmap = field.definingModel ?? field;
    return bitmap.children.map(bit => {
        if (typeof bit.constraint.value !== "number") {
            throw new InternalError(`Bit ${bit.name} of ${field.name} has no single bit number`);
        }
        return { name: camelize(bit.name), bit: bit.constraint.value };
    });
}

/**
 * The TH-log payload of `command` sent with `args`, built from the command's model so both renderings name the sent
 * fields in model order.
 *
 * An `epoch-s` field takes Unix-epoch seconds. It travels as Matter-epoch seconds, which chip prints; matter.js
 * converts it back to Unix-epoch seconds before it prints it.
 *
 * chip prints one line per integer, enum, bitmap, string or boolean field (a signed integer as `(signed)`, a bitmap as
 * its number, a string with its byte count, a boolean without a type), `NULL` without a comma for a null, and an octet
 * string, a struct or a list over several lines: its field id, then `[` or `{`, its contents, and its close. A list
 * prints a line without text after its `[`, and its struct entries carry no field id. matter.js prints each top-level
 * field as `name: value` with a string unquoted, an octet string as hex, a bitmap as `{ bit: true, ... }` listing every
 * bit, and a struct as `{ name: value, ... }` with its strings JSON-quoted and its lists as `[ entry, ... ]`. A request
 * without fields prints as {@link MATTERJS_NO_PAYLOAD} if the command has none, and as {@link MATTERJS_EMPTY_PAYLOAD} if
 * it has some.
 *
 * Takes integer, enum, bitmap, string, octet-string, boolean and null values, and structs and lists of these, at any
 * depth. A bitmap is given as the object of its set bits and must have single-bit members only. A list must sit inside
 * a struct and carry struct entries: matter.js prints a top-level list as bare entries, and chip prints entries that
 * are not structs on one shared line. Field ids must stay below 10: chip-tool's `command-by-id` writes struct members
 * in the text order of their ids ("10" before "2"), so its wire order would differ from model order.
 *
 * Throws {@link InternalError} for an argument the command or a struct has no field for, for a value of the wrong
 * type, for a null in a field that is not nullable, for a field of any other type or with an id of 10 or more, for a
 * list this function cannot print, for an empty top-level string or octet string, which matter.js prints as nothing,
 * for a top-level string that ends in whitespace, which matter.js trims from the end of the line, and for a string
 * with a line break, which chip splits across lines. A case that needs one of these extends this function.
 */
export function commandPayload(cluster: ClusterModel, command: string, args: CommandArgs): CommandPayload {
    const model = cluster.commands.require(command);
    const what = `${cluster.name}.${model.name}`;

    const chip = new Array<RegExp>();
    const matterjs = new Array<string>();
    for (const { field, name, value } of sentFields(model.children, args, what)) {
        const path = `${what}.${name}`;
        if (field.effectiveMetatype === "array") {
            throw new InternalError(`matter.js does not print the top-level list ${path} as one matchable value`);
        }
        if (value === "" || (Bytes.isBytes(value) && Bytes.of(value).byteLength === 0)) {
            throw new InternalError(`matter.js prints the empty top-level value ${path} as nothing`);
        }
        if (typeof value === "string" && /\s$/.test(value)) {
            throw new InternalError(`matter.js trims the whitespace that ends the top-level string ${path}`);
        }
        const rendered = renderValue(field, value, path, requireId(field.id, path));
        chip.push(...rendered.chip);
        matterjs.push(`${name}: ${typeof value === "string" ? value : rendered.matterjs}`);
    }

    return {
        label: `${model.name} carries exactly ${describeValue(args)}`,
        chip,
        matterjs: matterjs.length
            ? matterjs.join(" ")
            : model.children.length
              ? MATTERJS_EMPTY_PAYLOAD
              : MATTERJS_NO_PAYLOAD,
    };
}

/** The fields of `members` that `values` names, in model order; throws for a name no member has. */
function sentFields(members: Iterable<ValueModel>, values: CommandStruct, what: string) {
    const fields = [...members].map(field => ({ field, name: field.propertyName }));

    const unknown = Object.keys(values).filter(name => !fields.some(field => field.name === name));
    if (unknown.length) {
        throw new InternalError(`${what} has no field ${unknown.join(", ")}`);
    }

    return fields.flatMap(({ field, name }) => {
        const value = values[name];
        return value === undefined ? [] : [{ field, name, value }];
    });
}

/** `value` of the field `field` with id `id`, as both flavors print it. */
function renderValue(field: ValueModel, value: CommandValue, path: string, id: number): RenderedValue {
    if (id >= CHIP_TOOL_ORDERED_FIELD_IDS) {
        throw new InternalError(`${path} has field id ${id}, which chip-tool sends out of model order`);
    }
    if (value === null) {
        if (!field.nullable) {
            throw new InternalError(`${path} is not nullable`);
        }
        return { chip: [new RegExp(`0x${id.toString(16)} = NULL\\s*$`)], matterjs: "null" };
    }
    const metatype = field.effectiveMetatype;
    switch (metatype) {
        case "object":
            return renderStruct(field, value, path, id);

        case "array":
            return renderList(field, value, path, id);

        case "bitmap":
            return renderBitmap(field, value, path, id);

        case "integer":
        case "enum":
            if (typeof value !== "number") {
                throw new InternalError(`${path} needs a number`);
            }
            return {
                chip: [
                    chipCommandField({
                        id,
                        value: field.type === "epoch-s" ? value - MATTER_EPOCH_OFFSET_S : value,
                        signed: SIGNED_TYPES.has(field.primitiveBase?.name ?? ""),
                    }),
                ],
                matterjs: `${value}`,
            };

        case "string":
            if (typeof value !== "string") {
                throw new InternalError(`${path} needs a string`);
            }
            if (/[\n\r]/.test(value)) {
                throw new InternalError(`${path} "${value}" has a line break, which chip splits across lines`);
            }
            return {
                chip: [chipCommandField({ id, value })],
                matterjs: JSON.stringify(value),
            };

        case "bytes":
            if (!Bytes.isBytes(value)) {
                throw new InternalError(`${path} needs bytes`);
            }
            return { chip: chipOctetStringField(id, value), matterjs: Bytes.toHex(value) };

        case "boolean":
            if (typeof value !== "boolean") {
                throw new InternalError(`${path} needs a boolean`);
            }
            return { chip: [chipCommandField({ id, value })], matterjs: `${value}` };

        default:
            throw new InternalError(`${path} is a ${metatype} field, which commandPayload does not render`);
    }
}

/** A struct as both flavors print it; `id` is its field id, `undefined` for a list entry. */
function renderStruct(field: ValueModel, value: CommandValue, path: string, id: number | undefined): RenderedValue {
    if (!isObject(value)) {
        throw new InternalError(`${path} needs a struct`);
    }

    const members = sentFields(field.members, value, path).map(({ field, name, value }) => ({
        name,
        rendered: renderValue(field, value, `${path}.${name}`, requireId(field.id, `${path}.${name}`)),
    }));

    return {
        chip: [
            ...(id === undefined ? [] : [chipFieldOpening(id, "")]),
            CHIP_STRUCT_OPEN,
            ...members.flatMap(({ rendered }) => rendered.chip),
            CHIP_STRUCT_CLOSE,
        ],
        matterjs: members.length
            ? `{ ${members.map(({ name, rendered }) => `${name}: ${rendered.matterjs}`).join(", ")} }`
            : "{}",
    };
}

function renderList(field: ValueModel, value: CommandValue, path: string, id: number): RenderedValue {
    if (!Array.isArray(value)) {
        throw new InternalError(`${path} needs a list`);
    }
    const entry = field.listEntry;
    if (entry?.effectiveMetatype !== "object") {
        throw new InternalError(
            `${path} is a list of ${entry?.effectiveMetatype} entries, which chip prints on one line`,
        );
    }

    const entries = value.map((item, index) => renderStruct(entry, item, `${path}[${index}]`, undefined));

    return {
        chip: [chipFieldOpening(id, "\\["), CHIP_LIST_GAP, ...entries.flatMap(({ chip }) => chip), CHIP_LIST_CLOSE],
        matterjs: entries.length ? `[ ${entries.map(({ matterjs }) => matterjs).join(", ")} ]` : "[]",
    };
}

/** A bitmap given as its set bits: chip prints the number, matter.js the decoded object with every bit. */
function renderBitmap(field: ValueModel, value: CommandValue, path: string, id: number): RenderedValue {
    if (!isObject(value)) {
        throw new InternalError(`${path} needs an object of set bits`);
    }
    const bits = bitsOf(field);
    const unknown = Object.keys(value).filter(name => !bits.some(bit => bit.name === name));
    if (unknown.length) {
        throw new InternalError(`${path} has no bit ${unknown.join(", ")}`);
    }
    if (Object.values(value).some(set => typeof set !== "boolean")) {
        throw new InternalError(`${path} needs a boolean per bit`);
    }

    return {
        chip: [
            chipCommandField({ id, value: bits.reduce((sum, { name, bit }) => sum + (value[name] ? 2 ** bit : 0), 0) }),
        ],
        matterjs: `{ ${bits.map(({ name }) => `${name}: ${value[name] === true}`).join(", ")} }`,
    };
}

/** chip's line naming a struct field (`opening` empty, `{` on the next line) or a list field (`opening` `[`). */
function chipFieldOpening(id: number, opening: string) {
    return new RegExp(`0x${id.toString(16)} = ${opening}\\s*$`);
}
