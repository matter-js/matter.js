/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { ReadResult } from "#action/response/ReadResult.js";
import { decodeAttributeValueWithSchema, decodeUnknownAttributeValue } from "#interaction/AttributeDataDecoder.js";
import { decodeUnknownEventValue } from "#interaction/EventDataDecoder.js";
import { Diagnostic, Logger, UnexpectedDataError } from "@matter/general";
import { Matter } from "@matter/model";
import {
    AttributeId,
    ClusterId,
    DataReport,
    EndpointNumber,
    NodeId,
    Status,
    TlvAny,
    TlvAttributeData,
    TlvAttributeReport,
    TlvAttributeStatus,
    TlvDecodingOptions,
    TlvEventData,
    TlvEventStatus,
    TlvOfModel,
    TlvType,
    TypeFromSchema,
} from "@matter/types";

const logger = Logger.get("InputChunk");

/**
 * Decode options for incoming data reports. Integer signed/unsigned mismatches from non-compliant devices are tolerated
 * here (and only here) so a single malformed value does not drop the whole report; the value is still range-validated.
 */
const DATA_REPORT_DECODE_OPTIONS: TlvDecodingOptions = { relaxNumberTypeChecks: true };

interface ResolvedAttributePath {
    nodeId?: NodeId;
    endpointId: EndpointNumber;
    clusterId: ClusterId;
    attributeId: AttributeId;
    dataVersion?: number;
}

interface AttributeDataGroup {
    path: ResolvedAttributePath;
    dataVersion?: number;
    entries: TypeFromSchema<typeof TlvAttributeData>[];
}

/**
 * Streaming decode of a {@link DataReport} into a {@link ReadResult.Chunk}.
 *
 * Adjacent same-path `attributeData` entries accumulate for chunked-array reassembly per Matter Core §8.5.6.3.
 * Tag compression resolves against the last fully-qualified path per §10.7.5. When the report ends mid-chunked-array
 * and `moreChunkedMessages` is set, the trailing entries are stashed in `leftoverAttributeReports` for the next
 * report. See #3785 for event-order semantics.
 */
export async function* InputChunk(
    input: DataReport,
    leftoverAttributeReports?: TypeFromSchema<typeof TlvAttributeReport>[],
): AsyncGenerator<ReadResult.Report> {
    yield* emitAttributes(input, leftoverAttributeReports);
    yield* emitEvents(input);
}

function* emitAttributes(
    input: DataReport,
    leftover: TypeFromSchema<typeof TlvAttributeReport>[] | undefined,
): Generator<ReadResult.AttributeValue | ReadResult.AttributeStatus> {
    let attrs = input.attributeReports;
    if (leftover?.length) {
        attrs = attrs === undefined ? [...leftover] : [...leftover, ...attrs];
        leftover.length = 0;
    }
    if (attrs === undefined || attrs.length === 0) {
        return;
    }

    let lastPath: ResolvedAttributePath | undefined;
    let group: AttributeDataGroup | undefined;

    for (const entry of attrs) {
        if (entry.attributeData !== undefined) {
            const data = entry.attributeData;
            const resolved = resolvePath(data.path, lastPath);
            if (
                data.path.enableTagCompression &&
                data.dataVersion === undefined &&
                lastPath?.dataVersion !== undefined
            ) {
                data.dataVersion = lastPath.dataVersion;
            }
            if (!data.path.enableTagCompression) {
                lastPath = { ...resolved, dataVersion: data.dataVersion };
            }
            if (group !== undefined && !samePath(group.path, resolved)) {
                yield* flushDataGroup(group);
                group = undefined;
            }
            if (group === undefined) {
                group = { path: resolved, dataVersion: data.dataVersion, entries: [data] };
            } else {
                group.entries.push(data);
                if (group.dataVersion === undefined) group.dataVersion = data.dataVersion;
            }
        } else if (entry.attributeStatus !== undefined) {
            const statusSrc = entry.attributeStatus;
            const resolved = resolvePath(statusSrc.path, lastPath);
            // Status entry has no dataVersion of its own; preserve whatever the previous data entry installed.
            if (!statusSrc.path.enableTagCompression) {
                lastPath = { ...resolved, dataVersion: lastPath?.dataVersion };
            }
            if (group !== undefined) {
                yield* flushDataGroup(group);
                group = undefined;
            }
            yield buildAttrStatus(resolved, statusSrc);
        }
    }

    if (
        group !== undefined &&
        input.moreChunkedMessages &&
        leftover !== undefined &&
        mayContinueInNextReport(group.entries[group.entries.length - 1])
    ) {
        for (const d of group.entries) leftover.push({ attributeData: d });
        return;
    }
    if (group !== undefined) {
        yield* flushDataGroup(group);
    }
}

function* flushDataGroup(group: AttributeDataGroup): Generator<ReadResult.AttributeValue> {
    const value = decodeAttributeGroup(group.path, group.dataVersion, group.entries);
    if (value !== undefined) yield value;
}

function resolvePath(
    path: TypeFromSchema<typeof TlvAttributeData>["path"],
    lastPath: ResolvedAttributePath | undefined,
): ResolvedAttributePath {
    if (path.enableTagCompression) {
        if (lastPath === undefined) {
            throw new UnexpectedDataError("Tag compression enabled, but no previous path");
        }
        if (path.nodeId === undefined && lastPath.nodeId !== undefined) path.nodeId = lastPath.nodeId;
        if (path.endpointId === undefined) path.endpointId = lastPath.endpointId;
        if (path.clusterId === undefined) path.clusterId = lastPath.clusterId;
        if (path.attributeId === undefined) path.attributeId = lastPath.attributeId;
    } else if (path.endpointId === undefined || path.clusterId === undefined || path.attributeId === undefined) {
        throw new UnexpectedDataError("Tag compression disabled, but path is incomplete: " + Diagnostic.json(path));
    }
    return {
        nodeId: path.nodeId,
        endpointId: path.endpointId!,
        clusterId: path.clusterId!,
        attributeId: path.attributeId!,
    };
}

function samePath(a: ResolvedAttributePath, b: ResolvedAttributePath): boolean {
    return (
        a.nodeId === b.nodeId &&
        a.endpointId === b.endpointId &&
        a.clusterId === b.clusterId &&
        a.attributeId === b.attributeId
    );
}

function mayContinueInNextReport(data: TypeFromSchema<typeof TlvAttributeData>): boolean {
    // Two signals: a list-action `listIndex` (definitely chunked) or a bare array-typed value (could still grow).
    if (data.path.listIndex !== undefined) return true;
    const tlvData = data.data;
    return Array.isArray(tlvData) && tlvData.length > 1 && tlvData[0].typeLength.type === TlvType.Array;
}

function decodeAttributeGroup(
    path: ResolvedAttributePath,
    dataVersion: number | undefined,
    entries: TypeFromSchema<typeof TlvAttributeData>[],
): ReadResult.AttributeValue | undefined {
    const { nodeId, endpointId, clusterId, attributeId } = path;

    try {
        const clusterModel = Matter.clusters(clusterId);
        const attributeModel = clusterModel?.attributes(attributeId) ?? Matter.attributes(attributeId);

        let value: unknown;
        if (attributeModel === undefined) {
            value = decodeUnknownAttributeValue(entries);
        } else {
            let schema;
            try {
                schema = TlvOfModel(attributeModel);
            } catch {
                // Attribute is known but has no schema (e.g. deprecated global attributes) — decode as unknown
                schema = undefined;
            }
            value =
                schema === undefined
                    ? decodeUnknownAttributeValue(entries)
                    : decodeAttributeValueWithSchema(schema, entries, undefined, DATA_REPORT_DECODE_OPTIONS);
        }
        return {
            kind: "attr-value",
            path: { nodeId, endpointId, clusterId, attributeId },
            tlv: TlvAny,
            value,
            // dataVersion is optional on the wire; default to 0 to satisfy the version: number contract
            version: dataVersion ?? 0,
        };
    } catch (error) {
        // Skip a malformed entry; unrelated errors re-throw.
        UnexpectedDataError.accept(error);
        logger.warn(
            `Error decoding attribute ${endpointId}/${Diagnostic.hex(clusterId)}/${Diagnostic.hex(attributeId)}: ${error.message}`,
        );
        return undefined;
    }
}

function buildAttrStatus(
    path: ResolvedAttributePath,
    src: TypeFromSchema<typeof TlvAttributeStatus>,
): ReadResult.AttributeStatus {
    const { nodeId, endpointId, clusterId, attributeId } = path;
    return {
        kind: "attr-status",
        path: { nodeId, endpointId, clusterId, attributeId },
        status: src.status.status ?? Status.Failure,
        clusterStatus: src.status.clusterStatus,
    };
}

function* emitEvents(input: DataReport): Generator<ReadResult.EventValue | ReadResult.EventStatus> {
    const events = input.eventReports;
    if (events === undefined || events.length === 0) return;

    for (const entry of events) {
        if (entry.eventData !== undefined) {
            const value = decodeEventValue(entry.eventData);
            if (value !== undefined) yield value;
        } else if (entry.eventStatus !== undefined) {
            const status = buildEventStatus(entry.eventStatus);
            if (status !== undefined) yield status;
        }
    }
}

function decodeEventValue(eventData: TypeFromSchema<typeof TlvEventData>): ReadResult.EventValue | undefined {
    const {
        path: { nodeId, endpointId, clusterId, eventId },
        eventNumber,
        priority,
        epochTimestamp,
        systemTimestamp,
        deltaEpochTimestamp,
        deltaSystemTimestamp,
        data,
    } = eventData;

    if (endpointId === undefined || clusterId === undefined || eventId === undefined) {
        throw new UnexpectedDataError(`Invalid event path ${endpointId}/${clusterId}/${eventId}`);
    }

    try {
        const clusterModel = Matter.clusters(clusterId);
        const eventModel = clusterModel?.events(eventId);

        let value: unknown;
        if (eventModel === undefined) {
            logger.debug(
                `Decode unknown event ${Diagnostic.hex(clusterId)}/${Diagnostic.hex(eventId)} via the AnySchema.`,
            );
            value = data === undefined ? undefined : decodeUnknownEventValue(data);
        } else {
            const schema = TlvOfModel(eventModel);
            value = data === undefined ? undefined : schema.decodeTlv(data, DATA_REPORT_DECODE_OPTIONS);
        }

        // `timestamp` is a lossy convenience: callers needing the specific wire variant read the explicit field below.
        const timestamp = Number(epochTimestamp ?? systemTimestamp ?? deltaEpochTimestamp ?? deltaSystemTimestamp ?? 0);

        return {
            kind: "event-value",
            path: { nodeId, endpointId, clusterId, eventId },
            value,
            number: eventNumber,
            priority,
            timestamp,
            epochTimestamp,
            systemTimestamp,
            deltaEpochTimestamp,
            deltaSystemTimestamp,
            tlv: TlvAny,
        };
    } catch (error) {
        // Skip a malformed entry; unrelated errors re-throw.
        UnexpectedDataError.accept(error);
        logger.warn(
            `Error decoding event ${endpointId}/${Diagnostic.hex(clusterId)}/${Diagnostic.hex(eventId)}: ${error.message}`,
        );
        return undefined;
    }
}

function buildEventStatus(src: TypeFromSchema<typeof TlvEventStatus>): ReadResult.EventStatus | undefined {
    const {
        path: { nodeId, endpointId, clusterId, eventId },
        status,
    } = src;
    if (endpointId === undefined || clusterId === undefined || eventId === undefined) {
        throw new UnexpectedDataError(`Invalid event path ${endpointId}/${clusterId}/${eventId}`);
    }
    if (status.status === undefined && status.clusterStatus === undefined) {
        return undefined;
    }
    return {
        kind: "event-status",
        path: { nodeId, endpointId, clusterId, eventId },
        status: status.status ?? Status.Failure,
        clusterStatus: status.clusterStatus,
    };
}
