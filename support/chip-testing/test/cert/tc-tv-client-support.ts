/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { InternalError, isObject } from "@matter/main";
import { MATTER_EPOCH_OFFSET_S } from "@matter/main/types";
import type { ClusterModel, ValueModel } from "@matter/model";
import type { CertStepContext, TimedInteractionOptions } from "@matter/testing";
import type { CommandPayload, CommissionedRefs } from "./tc-support.js";
import {
    chipCommandField,
    describeValue,
    MATTERJS_EMPTY_PAYLOAD,
    MATTERJS_NO_PAYLOAD,
    requireId,
    sendCommand,
    SIGNED_TYPES,
} from "./tc-support.js";

/**
 * The endpoint of the `tv` TH that acts as the video player. chip's tv-app hosts KeypadInput, TargetNavigator,
 * Channel, ContentLauncher, MediaInput, MediaPlayback, AudioOutput and ApplicationLauncher there (`tv-app.matter`);
 * matter.js's `TvTestInstance` hosts the clusters the cases send to on the same endpoint.
 */
export const TV_VIDEO_PLAYER_ENDPOINT = 1;

/**
 * The endpoint of the `tv` TH that acts as a content app. chip's tv-app hosts AccountLogin there (`tv-app.matter`);
 * matter.js's `TvTestInstance` hosts it on the same endpoint.
 */
export const TV_CONTENT_APP_ENDPOINT = 3;

/**
 * An application both `tv` THs launch, stop and hide with success. chip never checks CatalogList: for any catalog but
 * its own platform catalog 0xFFF1, which it matches without mapping, it maps `exampleid` to the content app it installs
 * and loads at startup for vendor 1. matter.js's `TestApplicationLauncherServer` knows the same ID and needs the
 * catalog in its CatalogList, which lists 123.
 */
export const TV_KNOWN_APPLICATION = { catalogVendorId: 123, applicationId: "exampleid" };

/** A field value: a number for an integer or enum field, a string, a boolean, a {@link TvStruct} or a list. */
export type TvValue = number | string | boolean | TvStruct | TvValue[];

/** A struct value by field name. A field left out is not sent. */
export interface TvStruct {
    [field: string]: TvValue;
}

/** A command argument by field name. A field left out is not sent. */
export type TvCommandArgs = TvStruct;

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

/**
 * The TH-log payload of `command` sent with `args`, built from the command's model so both renderings name the sent
 * fields in model order.
 *
 * An `epoch-s` field takes Unix-epoch seconds. It travels as Matter-epoch seconds, which chip prints; matter.js
 * converts it back to Unix-epoch seconds before it prints it.
 *
 * chip prints one line per integer, enum, string or boolean field (a signed integer as `(signed)`, a string with its
 * byte count, a boolean without a type), and a struct or list over several lines: its field id, then `{` or `[`, its
 * members, and `},` or `],`. A list prints a line without text after its `[`, and its struct entries carry no field id.
 * matter.js prints each top-level field as `name: value` with a string unquoted, and a struct as
 * `{ name: value, ... }` with its strings JSON-quoted and its lists as `[ entry, ... ]`. A request without fields prints
 * as {@link MATTERJS_NO_PAYLOAD} if the command has none, and as {@link MATTERJS_EMPTY_PAYLOAD} if it has some.
 *
 * Takes integer, enum, string and boolean fields, and structs and lists of these, at any depth. A list must sit inside
 * a struct and carry struct entries: matter.js prints a top-level list as bare entries, and chip prints entries that
 * are not structs on one shared line. Field ids must stay below 10: chip-tool's `command-by-id` writes struct members
 * in the text order of their ids ("10" before "2"), so its wire order would differ from model order.
 *
 * Throws {@link InternalError} for an argument the command or a struct has no field for, for a value of the wrong
 * type, for a field of any other type or with an id of 10 or more, for a list this function cannot print, for an empty
 * top-level string, which matter.js prints as nothing, for a top-level string that ends in whitespace, which matter.js
 * trims from the end of the line, and for a string with a line break, which chip splits across lines. A case that needs
 * one of these extends this function.
 */
export function tvCommandPayload(cluster: ClusterModel, command: string, args: TvCommandArgs): CommandPayload {
    const model = cluster.commands.require(command);
    const what = `${cluster.name}.${model.name}`;

    const chip = new Array<RegExp>();
    const matterjs = new Array<string>();
    for (const { field, name, value } of sentFields(model.children, args, what)) {
        const path = `${what}.${name}`;
        if (field.effectiveMetatype === "array") {
            throw new InternalError(`matter.js does not print the top-level list ${path} as one matchable value`);
        }
        if (value === "") {
            throw new InternalError(`matter.js prints the empty top-level string ${path} as nothing`);
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
function sentFields(members: Iterable<ValueModel>, values: TvStruct, what: string) {
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
function renderValue(field: ValueModel, value: TvValue, path: string, id: number): RenderedValue {
    if (id >= CHIP_TOOL_ORDERED_FIELD_IDS) {
        throw new InternalError(`${path} has field id ${id}, which chip-tool sends out of model order`);
    }
    const metatype = field.effectiveMetatype;
    switch (metatype) {
        case "object":
            return renderStruct(field, value, path, id);

        case "array":
            return renderList(field, value, path, id);

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

        case "boolean":
            if (typeof value !== "boolean") {
                throw new InternalError(`${path} needs a boolean`);
            }
            return { chip: [chipCommandField({ id, value })], matterjs: `${value}` };

        default:
            throw new InternalError(`${path} is a ${metatype} field, which tvCommandPayload does not render`);
    }
}

/** A struct as both flavors print it; `id` is its field id, `undefined` for a list entry. */
function renderStruct(field: ValueModel, value: TvValue, path: string, id: number | undefined): RenderedValue {
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

function renderList(field: ValueModel, value: TvValue, path: string, id: number): RenderedValue {
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

/** chip's line naming a struct field (`opening` empty, `{` on the next line) or a list field (`opening` `[`). */
function chipFieldOpening(id: number, opening: string) {
    return new RegExp(`0x${id.toString(16)} = ${opening}\\s*$`);
}

/** Where {@link sendsTvCommand} sends a command, and whether as a timed invoke. */
export interface TvCommandTarget {
    /** Default {@link TV_VIDEO_PLAYER_ENDPOINT}. */
    endpoint?: number;

    /** Set for a command with the timed quality; the TH refuses it untimed. */
    options?: TimedInteractionOptions;
}

/**
 * A step in which the DUT sends `command` with `args` to the TH, the TH answers with success and the TH's log shows
 * exactly that payload; see {@link sendCommand}.
 */
export function sendsTvCommand(
    commissioned: CommissionedRefs,
    cluster: ClusterModel,
    command: string,
    args: TvCommandArgs,
    { endpoint = TV_VIDEO_PLAYER_ENDPOINT, options }: TvCommandTarget = {},
): (cx: CertStepContext) => Promise<void> {
    return commissioned.withRef("dut", (cx, ref) =>
        sendCommand(cx, ref, { cluster, endpoint, command, args, options }, tvCommandPayload(cluster, command, args)),
    );
}
