/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { Bytes, Diagnostic, ImplementationError, isObject, UnexpectedDataError } from "@matter/general";
import {
    MATTER_EPOCH_OFFSET_S,
    MATTER_EPOCH_OFFSET_US,
    TlvByteArrayReader,
    TlvAny,
    TlvByteArrayWriter,
    TlvOfModel,
    TlvSchema,
    TlvUInt64,
} from "@matter/main/types";
import { AttributeModel, ClusterModel, Matter, SchemaImplementationError, ValueModel } from "@matter/model";

/** A matterjs-server attribute value that has no in-process equivalent: unmodeled, or not shaped as its model says. */
export class MatterServerWireError extends UnexpectedDataError {}

/** A {@link MatterServerWireError} for a path outside the Matter model, rather than a value that does not fit it. */
export class MatterServerUnmodeledError extends MatterServerWireError {}

/** One path of a decoded `read_attribute` result. */
export type WireAttributeResult = { kind: "value"; value: unknown } | { kind: "error"; error: MatterServerWireError };

/**
 * How matterjs-server's `Converters.ts` treats a model. The classification is the server's own (`classifyModel`), so
 * a type it passes through unchanged is passed through here too.
 */
const enum WireKind {
    Passthrough,
    EpochS,
    EpochUs,
    Bytes,
    Bitmap,
    Struct,
    List,
}

function wireKindOf(model: ValueModel): WireKind {
    if (model.type === "list" || model.metabase?.name === "list") {
        return WireKind.List;
    }
    if (model.metabase?.name === "struct") {
        return WireKind.Struct;
    }
    switch (model.metabase?.metatype) {
        case "bitmap":
            return WireKind.Bitmap;
        case "bytes":
            return WireKind.Bytes;
        case "integer":
            return model.type === "epoch-s"
                ? WireKind.EpochS
                : model.type === "epoch-us"
                  ? WireKind.EpochUs
                  : WireKind.Passthrough;
    }
    return WireKind.Passthrough;
}

function listElementOf(model: ValueModel) {
    const element = model.members.at(0);
    if (element === undefined) {
        throw new SchemaImplementationError(model, "list model declares no element type");
    }
    return element;
}

const BASE64 = /^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/;

const INT64_MIN = -(2n ** 63n);
const INT64_MAX = 2n ** 63n - 1n;
const UINT64_MAX = 2n ** 64n - 1n;

/**
 * An integer in the range of the model's base type family. The TLV writer stores a negative value in an unsigned field,
 * or one beyond 64 bits, as different bits rather than refusing it.
 */
function isIntegerOf(value: unknown, model: ValueModel) {
    let integer: bigint;
    if (typeof value === "bigint") {
        integer = value;
    } else if (typeof value === "number" && Number.isInteger(value)) {
        integer = BigInt(value);
    } else {
        return false;
    }
    const unsigned = model.effectiveMetatype === "enum" || model.metabase?.name.startsWith("uint") === true;
    return unsigned ? integer >= 0n && integer <= UINT64_MAX : integer >= INT64_MIN && integer <= INT64_MAX;
}

/** The JS type a passed-through value of each metatype has after a TLV decode. */
function isPrimitiveOf(value: unknown, model: ValueModel) {
    switch (model.effectiveMetatype) {
        case "integer":
        case "enum":
            return isIntegerOf(value, model);
        case "float":
            return typeof value === "number";
        case "boolean":
            return typeof value === "boolean";
        case "string":
            return typeof value === "string";
        default:
            return true;
    }
}

function wrongShape(model: ValueModel, value: unknown): never {
    throw new MatterServerWireError(`"${model.name}" (${model.type}) arrived as ${Diagnostic.json(value)}`);
}

/**
 * Wire value -> the value matter.js held before the server converted it, up to TLV normalization.
 *
 * Inverts `convertMatterToWebSocketTagBased` (struct fields by tag) or `convertMatterToWebSocketNameBased` (struct
 * fields by name): octet strings as base64, bitmaps as a number, epochs shifted to the Matter epoch. Every shape is
 * checked here because the round trip that follows encodes without validation, as the in-process decode does.
 */
function fromWire(value: unknown, model: ValueModel, keys: FieldKeys): unknown {
    if (value === null) {
        return model.nullable ? null : wrongShape(model, value);
    }

    switch (wireKindOf(model)) {
        case WireKind.List: {
            if (!Array.isArray(value)) {
                return wrongShape(model, value);
            }
            const element = listElementOf(model);
            return value.map(entry => fromWire(entry, element, keys));
        }

        case WireKind.Struct:
            if (!isObject(value)) {
                return wrongShape(model, value);
            }
            return keys === "tag" ? structFromTagWire(value, model) : structFromNameWire(value, model);

        case WireKind.Bitmap:
            // The server sends a bitmap it holds no cluster for (a vendor cluster's FeatureMap) as the object itself
            if (isObject(value)) {
                return value;
            }
            if ((typeof value !== "number" || !Number.isSafeInteger(value)) && typeof value !== "bigint") {
                return wrongShape(model, value);
            }
            if (value < 0) {
                return wrongShape(model, value);
            }
            // The model's own TLV schema names the bits, so the keys are the ones a TLV decode produces
            return TlvOfModel(model).decodeTlv(TlvUInt64.encodeTlv(value));

        case WireKind.Bytes:
            return typeof value === "string" && BASE64.test(value) ? Bytes.fromBase64(value) : wrongShape(model, value);

        // A Matter-epoch value below zero is refused here: the TLV epoch codecs throw ImplementationError for it
        case WireKind.EpochS:
            return typeof value === "number" && Number.isInteger(value) && value >= 0
                ? value + MATTER_EPOCH_OFFSET_S
                : wrongShape(model, value);

        case WireKind.EpochUs:
            if ((typeof value !== "number" || !Number.isInteger(value)) && typeof value !== "bigint") {
                return wrongShape(model, value);
            }
            return value >= 0 ? BigInt(value) + MATTER_EPOCH_OFFSET_US : wrongShape(model, value);

        case WireKind.Passthrough:
            return isPrimitiveOf(value, model) ? value : wrongShape(model, value);
    }
}

/** The model `InputChunk` decodes a data report with, which is what the in-process adapter returns. */
function attributeModelOf(clusterId: number, attributeId: number): AttributeModel | undefined {
    const cluster = Matter.clusters(clusterId);
    if (cluster !== undefined) {
        return cluster.attributes(attributeId);
    }
    // `Matter.attributes` holds only the global attributes, which `InputChunk` decodes by their cluster-independent
    // model where the cluster is unknown; the server converts them by its own `GlobalAttributes`
    return Matter.attributes(attributeId);
}

const ATTRIBUTE_PATH = /^(\d+)\/(\d+)\/(\d+)$/;

function structFromTagWire(value: Record<string, unknown>, model: ValueModel) {
    const result: Record<string, unknown> = {};
    for (const [tag, fieldValue] of Object.entries(value)) {
        const member = /^\d+$/.test(tag) ? model.members.find(({ id }) => id === Number(tag)) : undefined;
        if (member === undefined) {
            throw new MatterServerWireError(`Struct "${model.name}" has no field with tag "${tag}"`);
        }
        result[member.propertyName] = fromWire(fieldValue, member, "tag");
    }
    return result;
}

/**
 * The server writes every field it knows under its property name, and under its wire name as well where the two
 * differ, so the property name finds each field and every other key is such a duplicate.
 */
function structFromNameWire(value: Record<string, unknown>, model: ValueModel) {
    const result: Record<string, unknown> = {};
    for (const member of model.members) {
        if (member.id === undefined || member.name === undefined) {
            continue;
        }
        const { propertyName } = member;
        if (!Object.hasOwn(value, propertyName)) {
            if (member.mandatory) {
                throw new MatterServerWireError(`Struct "${model.name}" lacks mandatory field "${propertyName}"`);
            }
            continue;
        }
        result[propertyName] = fromWire(value[propertyName], member, "name");
    }
    return result;
}

/**
 * A TLV round trip through the model's own schema settles every representation choice the way a data report decode
 * does: a subject id is a bigint, a 64-bit integer is one only beyond 32 bits, and so on. It runs on bytes because
 * only bytes carry the encoded width; the wire loses it, so this assumes the device encoded minimally. Neither
 * direction validates, as the in-process decode does not: a non-fabric-filtered read carries other fabrics' entries as
 * fabricIndex alone, and a value outside the model's constraints is for the case's own assertion to see. Without
 * validation the TLV writer corrupts a value it cannot hold instead of refusing it, so `fromWire` checks every shape
 * and range first, and a failure here is a defect of this codec or the model.
 */
function normalizeThroughTlv(schema: TlvSchema<unknown>, value: unknown) {
    const writer = new TlvByteArrayWriter();
    schema.encodeTlvInternal(writer, value, undefined, { allowMissingFieldsForNonFabricFilteredRead: true });
    return schema.decodeTlvInternal(new TlvByteArrayReader(writer.toByteArray())).value;
}

function decodeAttributeValue(path: string, wire: unknown): unknown {
    const match = ATTRIBUTE_PATH.exec(path);
    if (match === null) {
        throw new MatterServerWireError(`matterjs-server attribute path "${path}" is not endpoint/cluster/attribute`);
    }
    const clusterId = Number(match[2]);
    const attributeId = Number(match[3]);

    const attribute = attributeModelOf(clusterId, attributeId);
    if (attribute === undefined) {
        throw unmodeled(path, clusterId, attributeId);
    }

    const schema = TlvOfModel(attribute);

    // A model without a type decodes in-process as an unknown value, which the server sends lossily as well
    if (schema === TlvAny) {
        throw unmodeled(path, clusterId, attributeId);
    }

    let value;
    try {
        value = fromWire(wire, attribute, "tag");
    } catch (cause) {
        if (!(cause instanceof MatterServerWireError)) {
            throw cause;
        }
        throw new MatterServerWireError(
            `matterjs-server value for ${path} (${attribute.name}) does not fit its model: ${Diagnostic.json(wire)}`,
            { cause },
        );
    }

    return normalizeThroughTlv(schema, value);
}

function unmodeled(path: string, clusterId: number, attributeId: number) {
    return new MatterServerUnmodeledError(
        `matterjs-server reported ${path}, but cluster ${clusterId} attribute ${attributeId} has no model; ` +
            "the server sends such values lossily, so no value comparable to an in-process read exists",
    );
}

/**
 * A matterjs-server `read_attribute` result -> each path's value as `InProcessControllerAdapter.readAttribute`
 * returns it for the same device data, or the reason that path has no such value.
 *
 * Keys stay the server's `"endpoint/cluster/attribute"` strings. One path failing leaves the others decoded.
 *
 * The wire does not carry a value's TLV width, so a 64-bit integer decodes as `bigint` only beyond 32 bits, which is
 * what a device's minimal-width encoding decodes to in-process.
 */
export function decodeAttributeResult(wire: Record<string, unknown>): Map<string, WireAttributeResult> {
    const result = new Map<string, WireAttributeResult>();
    for (const [path, value] of Object.entries(wire)) {
        try {
            result.set(path, { kind: "value", value: decodeAttributeValue(path, value) });
        } catch (error) {
            if (!(error instanceof MatterServerWireError)) {
                throw error;
            }
            result.set(path, { kind: "error", error });
        }
    }
    return result;
}

/**
 * A matterjs-server `device_command` result -> what `InProcessControllerAdapter.invoke` returns for the same device
 * answer.
 *
 * The server sends `null` for an answer that carried a success status and no data, which an in-process invoke
 * returns as `undefined`. A response whose shape does not fit the command's response model throws
 * {@link MatterServerWireError}; the server answers `{}` for a command its own model lacks, which fails that way.
 */
export function decodeCommandResponse(clusterId: number, commandName: string, wire: unknown): unknown {
    const cluster = clusterModelFor(clusterId);
    const command = cluster.commands(commandName);
    if (command === undefined) {
        throw new ImplementationError(`Cluster ${cluster.name} has no command "${commandName}"`);
    }

    if (wire === null) {
        return undefined;
    }

    const response = command.responseModel;
    if (response === undefined) {
        throw new MatterServerWireError(
            `matterjs-server answered ${cluster.name}.${command.name}, which has no response, with ${Diagnostic.json(wire)}`,
        );
    }

    let value;
    try {
        value = fromWire(wire, response, "name");
    } catch (cause) {
        if (!(cause instanceof MatterServerWireError)) {
            throw cause;
        }
        throw new MatterServerWireError(
            `matterjs-server response to ${cluster.name}.${command.name} does not fit ${response.name} ` +
                `(${cause.message}): ${Diagnostic.json(wire)}`,
            { cause },
        );
    }

    return normalizeThroughTlv(TlvOfModel(response), value);
}

/**
 * How the server reads struct fields: an invoke payload by name (`convertCommandDataToMatter`), an attribute write by
 * tag (`convertWebSocketTagBasedToMatter`).
 */
type FieldKeys = "name" | "tag";

/**
 * Matter.js value -> the wire value the server's inbound converter turns back into it.
 *
 * A bitmap stays the matter.js object: the server hands an object to matter.js unchanged, while a number it would
 * unpack under its own member names.
 */
function toWire(value: unknown, model: ValueModel, keys: FieldKeys): unknown {
    if (value === null) {
        return null;
    }

    switch (wireKindOf(model)) {
        case WireKind.List: {
            if (!Array.isArray(value)) {
                return value;
            }
            const element = listElementOf(model);
            return value.map(entry => toWire(entry, element, keys));
        }

        case WireKind.Struct:
            return isObject(value) ? structToWire(value, model, keys) : value;

        case WireKind.Bytes:
            return Bytes.isBytes(value) ? Bytes.toBase64(value) : value;

        case WireKind.EpochS:
            return typeof value === "number" ? value - MATTER_EPOCH_OFFSET_S : value;

        case WireKind.EpochUs:
            return typeof value === "number" || typeof value === "bigint"
                ? BigInt(value) - MATTER_EPOCH_OFFSET_US
                : value;

        case WireKind.Bitmap:
        case WireKind.Passthrough:
            return value;
    }
}

/** A field the model does not name keeps its key and value, as both the server and a matter.js TLV encode ignore it. */
function structToWire(value: object, model: ValueModel, keys: FieldKeys): Record<string, unknown> {
    const result: Record<string, unknown> = {};
    for (const [name, fieldValue] of Object.entries(value)) {
        const member = model.members.find(({ propertyName }) => propertyName === name);
        if (member === undefined) {
            result[name] = fieldValue;
            continue;
        }
        const key = keys === "tag" && member.id !== undefined ? String(member.id) : name;
        result[key] = toWire(fieldValue, member, keys);
    }
    return result;
}

function clusterModelFor(clusterId: number): ClusterModel {
    const cluster = Matter.clusters(clusterId);
    if (cluster === undefined) {
        throw new ImplementationError(`Cluster ${clusterId} has no model, so matterjs-server cannot address it`);
    }
    return cluster;
}

/**
 * Command arguments as the in-process adapter takes them -> the `data` of a matterjs-server `device_command`.
 *
 * Unlike an in-process invoke, which refuses it, the server drops a `null` given for an optional non-nullable field
 * and sends the field absent.
 */
export function encodeCommandPayload(clusterId: number, commandName: string, args: object): object {
    const cluster = clusterModelFor(clusterId);
    const command = cluster.commands(commandName);
    if (command === undefined) {
        throw new ImplementationError(`Cluster ${cluster.name} has no command "${commandName}"`);
    }
    return structToWire(args, command, "name");
}

/**
 * An attribute value as the in-process adapter writes it -> the `value` of a matterjs-server `write_attribute`.
 *
 * Unlike an in-process write, which refuses it, the server drops a `null` given for an optional non-nullable struct
 * field and writes the field absent.
 */
export function encodeAttributeValue(clusterId: number, attributeId: number, value: unknown): unknown {
    const cluster = clusterModelFor(clusterId);
    const attribute = cluster.attributes(attributeId);
    if (attribute === undefined) {
        throw new ImplementationError(
            `Cluster ${cluster.name} has no attribute ${attributeId}; matterjs-server refuses to write it`,
        );
    }
    return toWire(value, attribute, "tag");
}
