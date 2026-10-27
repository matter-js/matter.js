/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { Bytes, Diagnostic, ImplementationError, isObject, Logger, UnexpectedDataError } from "@matter/general";
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
import { registerCertCustomCluster } from "../cert/custom-clusters.js";
import { UnitTestingCluster } from "../cert/unit-testing-cluster.js";

const logger = Logger.get("MatterServerWire");

/**
 * The clusters outside the Matter model that matterjs-server models too (its `custom-clusters` package) and a case
 * addresses. Each definition here must match the server's attribute for attribute.
 */
const SERVER_CUSTOM_CLUSTERS = [registerCertCustomCluster(UnitTestingCluster)];

/**
 * The model matterjs-server encodes and decodes `cluster` with, `undefined` for a cluster outside its model. The
 * server refuses to write or invoke anything outside its model.
 */
export function serverClusterModel(cluster: string | number): ClusterModel | undefined {
    return (
        Matter.clusters(cluster) ??
        SERVER_CUSTOM_CLUSTERS.find(({ id, name }) => (typeof cluster === "number" ? id : name) === cluster)
    );
}

/** A matterjs-server attribute or event value that is not shaped as its model says. */
export class MatterServerWireError extends UnexpectedDataError {}

/** One decoded attribute or event value, or the reason it has no in-process equivalent. */
export type WireValueResult = { kind: "value"; value: unknown } | { kind: "error"; error: MatterServerWireError };

/** One attribute of a `read` result or `subscription_report`. */
export interface WireAttribute {
    endpoint: number;
    cluster: number;
    attribute: number;
    result: WireValueResult;
}

/** One event of a `read` result or `subscription_report`, in the `node_event` shape. */
export interface WireEvent {
    endpoint: number;
    cluster: number;
    event: number;
    eventNumber: bigint;
    result: WireValueResult;
}

/** The status a device answered one path with instead of data. */
export interface WirePathStatus {
    status: number;
    clusterStatus?: number;
}

/**
 * A decoded `read` result or `subscription_report`. Status maps are keyed by the path in the request format, `*` where
 * the device left a wildcard in the path.
 */
export interface WireInteractionReport {
    attributes: WireAttribute[];
    events: WireEvent[];
    attributeStatus: Map<string, WirePathStatus>;
    eventStatus: Map<string, WirePathStatus>;

    /** The data version the device reported per cluster with an attribute value, keyed by {@link clusterKeyOf}. */
    dataVersions: Map<string, number>;
}

/** The key of {@link WireInteractionReport.dataVersions} for one cluster instance. */
export function clusterKeyOf(endpoint: number, cluster: number) {
    return `${endpoint}/${cluster}`;
}

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

/**
 * The model `InputChunk` decodes a data report with, which is what the in-process adapter returns. A cluster of
 * {@link SERVER_CUSTOM_CLUSTERS} decodes by its declared model, so a struct comes back keyed by field name where the
 * in-process adapter, which has no model for it, keys it by field id.
 */
function attributeModelOf(clusterId: number, attributeId: number): AttributeModel | undefined {
    const cluster = serverClusterModel(clusterId);
    if (cluster !== undefined) {
        return cluster.attributes(attributeId);
    }
    // `Matter.attributes` holds only the global attributes, which `InputChunk` decodes by their cluster-independent
    // model where the cluster is unknown; the server converts them by its own `GlobalAttributes`
    return Matter.attributes(attributeId);
}

const ATTRIBUTE_PATH = /^(\d+)\/(\d+)\/(\d+)$/;

/** Canonical decimals only, so two spellings of one cluster cannot both reach the version map. */
const CLUSTER_PATH = /^(0|[1-9]\d*)\/(0|[1-9]\d*)$/;

const DATA_VERSION_MAX = 0xffffffff;

/** A field whose tag the model does not know is left out, as a TLV decode of the struct leaves it out. */
function structFromTagWire(value: Record<string, unknown>, model: ValueModel) {
    const result: Record<string, unknown> = {};
    for (const [tag, fieldValue] of Object.entries(value)) {
        if (!/^\d+$/.test(tag)) {
            throw new MatterServerWireError(
                `Struct "${model.name}" has a field keyed "${tag}", which is no tag number`,
            );
        }
        const member = model.members.find(({ id }) => id === Number(tag));
        if (member !== undefined) {
            result[member.propertyName] = fromWire(fieldValue, member, "tag");
        }
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

/**
 * A value of a cluster, attribute or event without a model, which the server sends as matter.js decoded its TLV:
 * a structure keyed by tag number, a list as an array. That is what an in-process read returns for it, except that a
 * string stays the text the server sent: the server sends an octet string as base64 text and a character string as
 * the text, so the wire cannot tell the two apart.
 */
function decodeUnmodeled(wire: unknown, path: string): unknown {
    logger.debug(`Value of ${path} is outside the model and decodes as the server sent it:`, Diagnostic.json(wire));
    return decodeUnmodeledEntry(wire, path);
}

function decodeUnmodeledEntry(wire: unknown, path: string): unknown {
    if (Array.isArray(wire)) {
        return wire.map(entry => decodeUnmodeledEntry(entry, path));
    }
    if (isObject(wire)) {
        const result: Record<string, unknown> = {};
        for (const [tag, value] of Object.entries(wire)) {
            if (!/^\d+$/.test(tag)) {
                throw new MatterServerWireError(
                    `matterjs-server sent the unmodeled value of ${path} with field "${tag}", which is no tag number`,
                );
            }
            result[tag] = decodeUnmodeledEntry(value, path);
        }
        return result;
    }
    return wire;
}

function decodeAttributeValue(path: string, clusterId: number, attributeId: number, wire: unknown): unknown {
    const attribute = attributeModelOf(clusterId, attributeId);
    const schema = attribute === undefined ? undefined : TlvOfModel(attribute);

    // A model without a type decodes in-process as an unknown value, as an unmodeled attribute does
    if (attribute === undefined || schema === undefined || schema === TlvAny) {
        return decodeUnmodeled(wire, path);
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

/**
 * A matterjs-server attribute map (`read` result, `subscription_report`) -> each attribute's value as
 * `InProcessControllerAdapter.readAttribute` returns it for the same device data, or the reason it has no such value.
 * One value failing leaves the others decoded.
 *
 * The wire does not carry a value's TLV width, so a 64-bit integer decodes as `bigint` only beyond 32 bits, which is
 * what a device's minimal-width encoding decodes to in-process.
 */
export function decodeAttributeResult(wire: Record<string, unknown>): WireAttribute[] {
    const result = new Array<WireAttribute>();
    for (const [path, value] of Object.entries(wire)) {
        const match = ATTRIBUTE_PATH.exec(path);
        if (match === null) {
            throw new UnexpectedDataError(`matterjs-server attribute path "${path}" is not endpoint/cluster/attribute`);
        }
        const [endpoint, cluster, attribute] = match.slice(1).map(Number);
        try {
            result.push({
                endpoint,
                cluster,
                attribute,
                result: { kind: "value", value: decodeAttributeValue(path, cluster, attribute, value) },
            });
        } catch (error) {
            if (!(error instanceof MatterServerWireError)) {
                throw error;
            }
            result.push({ endpoint, cluster, attribute, result: { kind: "error", error } });
        }
    }
    return result;
}

function decodeEventValue(path: string, clusterId: number, eventId: number, wire: unknown): unknown {
    // The server sends `null` for an event that carried no data, which an in-process read reports as `undefined`
    if (wire === null) {
        return undefined;
    }

    const event = Matter.clusters(clusterId)?.events(eventId);
    if (event === undefined) {
        return decodeUnmodeled(wire, path);
    }

    let value;
    try {
        value = fromWire(wire, event, "name");
    } catch (cause) {
        if (!(cause instanceof MatterServerWireError)) {
            throw cause;
        }
        throw new MatterServerWireError(
            `matterjs-server data of event ${path} (${event.name}) does not fit its model: ${Diagnostic.json(wire)}`,
            { cause },
        );
    }

    // An event without fields decodes in-process as `undefined`, and its TLV schema encodes no value at all
    if (event.members.length === 0) {
        return undefined;
    }
    return normalizeThroughTlv(TlvOfModel(event), value);
}

function isInteger(value: unknown): value is number | bigint {
    return (typeof value === "number" && Number.isInteger(value)) || typeof value === "bigint";
}

function decodeEvent(wire: unknown): WireEvent {
    if (
        !isObject(wire) ||
        typeof wire.endpoint_id !== "number" ||
        typeof wire.cluster_id !== "number" ||
        typeof wire.event_id !== "number" ||
        !isInteger(wire.event_number)
    ) {
        throw new UnexpectedDataError(
            `matterjs-server sent an event without its path or number: ${Diagnostic.json(wire)}`,
        );
    }
    const { endpoint_id: endpoint, cluster_id: cluster, event_id: event } = wire;
    const path = `${endpoint}/${cluster}/${event}`;

    let result: WireValueResult;
    try {
        result = { kind: "value", value: decodeEventValue(path, cluster, event, wire.data) };
    } catch (error) {
        if (!(error instanceof MatterServerWireError)) {
            throw error;
        }
        result = { kind: "error", error };
    }
    return { endpoint, cluster, event, eventNumber: BigInt(wire.event_number), result };
}

function decodeStatuses(wire: unknown, field: string): Map<string, WirePathStatus> {
    const statuses = new Map<string, WirePathStatus>();
    if (wire === undefined) {
        return statuses;
    }
    if (!isObject(wire)) {
        throw new UnexpectedDataError(`matterjs-server sent ${field} that is not an object: ${Diagnostic.json(wire)}`);
    }
    for (const [path, entry] of Object.entries(wire)) {
        if (
            !isObject(entry) ||
            typeof entry.status !== "number" ||
            (entry.cluster_status !== undefined && typeof entry.cluster_status !== "number")
        ) {
            throw new UnexpectedDataError(`matterjs-server sent ${field} for ${path} as ${Diagnostic.json(entry)}`);
        }
        statuses.set(
            path,
            entry.cluster_status === undefined
                ? { status: entry.status }
                : { status: entry.status, clusterStatus: entry.cluster_status },
        );
    }
    return statuses;
}

/** `data_versions`: a uint32 per `endpoint/cluster`; absent when the device reported no attribute value. */
function decodeDataVersions(wire: unknown): Map<string, number> {
    const versions = new Map<string, number>();
    if (wire === undefined) {
        return versions;
    }
    if (!isObject(wire)) {
        throw new UnexpectedDataError(
            `matterjs-server sent data_versions that is not an object: ${Diagnostic.json(wire)}`,
        );
    }
    for (const [path, version] of Object.entries(wire)) {
        const match = CLUSTER_PATH.exec(path);
        if (match === null) {
            throw new UnexpectedDataError(
                `matterjs-server sent a data version for "${path}", which is not endpoint/cluster`,
            );
        }
        if (typeof version !== "number" || !Number.isInteger(version) || version < 0 || version > DATA_VERSION_MAX) {
            throw new UnexpectedDataError(
                `matterjs-server sent data version ${Diagnostic.json(version)} for ${path}, which is no uint32`,
            );
        }
        const [endpoint, cluster] = match.slice(1).map(Number);
        versions.set(clusterKeyOf(endpoint, cluster), version);
    }
    return versions;
}

/**
 * A matterjs-server `read` result or `subscription_report` -> each value as the in-process adapter reports it for the
 * same device data, the statuses the device answered paths with, and the clusters' data versions.
 *
 * A value without an in-process equivalent leaves the others decoded, as {@link decodeAttributeResult}. A report that
 * does not have the documented shape throws {@link UnexpectedDataError}.
 */
export function decodeInteractionReport(wire: unknown): WireInteractionReport {
    if (!isObject(wire) || !isObject(wire.attributes) || !Array.isArray(wire.events)) {
        throw new UnexpectedDataError(
            `matterjs-server sent a report without attributes and events: ${Diagnostic.json(wire)}`,
        );
    }
    return {
        attributes: decodeAttributeResult(wire.attributes),
        events: wire.events.map(decodeEvent),
        attributeStatus: decodeStatuses(wire.attribute_status, "attribute_status"),
        eventStatus: decodeStatuses(wire.event_status, "event_status"),
        dataVersions: decodeDataVersions(wire.data_versions),
    };
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
    const cluster = serverClusterModel(clusterId);
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
