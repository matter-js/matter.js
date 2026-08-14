/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { Diagnostic, Logger, UnexpectedDataError } from "@matter/general";
import { Matter } from "@matter/model";
import { InputChunk, ReadResult } from "@matter/protocol";
import {
    AttributeId,
    ClusterId,
    DataReport,
    EndpointNumber,
    EventId,
    EventNumber,
    NodeId,
    Priority,
    Status,
    TlvAttributeReport,
    TypeFromSchema,
} from "@matter/types";

const logger = Logger.get("DecodedDataReport");

/** @deprecated Legacy API, removed in 0.19. Migrate to @matter/node — see docs/MIGRATION_CONTROLLER_018.md. */
export type DecodedAttributeReportEntry = {
    path: {
        nodeId?: NodeId;
        endpointId: EndpointNumber;
        clusterId: ClusterId;
        attributeId: AttributeId;
        attributeName: string;
    };
};

/**
 * Represents a fully qualified and decoded attribute value from a received DataReport.
 * @deprecated Legacy API, removed in 0.19. Migrate to @matter/node — see docs/MIGRATION_CONTROLLER_018.md.
 */
export type DecodedAttributeReportValue<T> = DecodedAttributeReportEntry & {
    version: number;
    value: T;
};

/**
 * Represents a fully qualified and decoded attribute status from a received DataReport.
 * @deprecated Legacy API, removed in 0.19. Migrate to @matter/node — see docs/MIGRATION_CONTROLLER_018.md.
 */
export type DecodedAttributeReportStatus = DecodedAttributeReportEntry & {
    status: Status;
    clusterStatus?: number;
};

/** @deprecated Legacy API, removed in 0.19. Migrate to @matter/node — see docs/MIGRATION_CONTROLLER_018.md. */
export type DecodedEventData<T> = {
    eventNumber: EventNumber;
    priority: Priority;
    epochTimestamp?: number | bigint;
    systemTimestamp?: number | bigint;
    deltaEpochTimestamp?: number | bigint;
    deltaSystemTimestamp?: number | bigint;
    data?: T;
};

/** @deprecated Legacy API, removed in 0.19. Migrate to @matter/node — see docs/MIGRATION_CONTROLLER_018.md. */
export type DecodedEventReportEntry = {
    path: {
        nodeId?: NodeId;
        endpointId: EndpointNumber;
        clusterId: ClusterId;
        eventId: EventId;
        eventName: string;
    };
};

/**
 * Represents a fully qualified and decoded event value from a received DataReport.
 * @deprecated Legacy API, removed in 0.19. Migrate to @matter/node — see docs/MIGRATION_CONTROLLER_018.md.
 */
export type DecodedEventReportValue<T> = DecodedEventReportEntry & {
    events: DecodedEventData<T>[];
};

/**
 * Represents a fully qualified and decoded event status from a received DataReport.
 * @deprecated Legacy API, removed in 0.19. Migrate to @matter/node — see docs/MIGRATION_CONTROLLER_018.md.
 */
export type DecodedEventReportStatus = DecodedEventReportEntry & {
    status: Status;
    clusterStatus?: number;
};

/**
 * Legacy 4-array shape produced by {@link decodeDataReport}. Inherits wire-level fields (`moreChunkedMessages`,
 * `subscriptionId`, `interactionModelRevision`, `suppressResponse`) from {@link DataReport}; callers that want only
 * the decoded payload should strip them via `Omit<DecodedDataReport, …>`.
 *
 * Kept here in the matter.js package while the legacy `InteractionClient` / `ClusterClient` / `EventClient` /
 * `PairedNode` callbacks consume it. The modern path consumes `ReadResult.Chunk` directly via {@link InputChunk}.
 *
 * @deprecated Legacy API, removed in 0.19. Migrate to @matter/node — see docs/MIGRATION_CONTROLLER_018.md.
 */
export interface DecodedDataReport extends DataReport {
    attributeReports: DecodedAttributeReportValue<any>[];
    attributeStatus?: DecodedAttributeReportStatus[];
    eventReports: DecodedEventReportValue<any>[];
    eventStatus?: DecodedEventReportStatus[];
}

/**
 * Build the legacy 4-array shape from a wire {@link DataReport} by collecting the streamed {@link ReadResult.Chunk}s
 * produced by {@link InputChunk}. Honors the same `leftoverAttributeReports` handoff for chunked-array tails that
 * span multiple incoming reports.
 *
 * For new code prefer consuming the chunk stream directly.
 *
 * @deprecated Legacy API, removed in 0.19. Migrate to @matter/node — see docs/MIGRATION_CONTROLLER_018.md.
 */
export async function decodeDataReport(
    report: DataReport,
    leftoverAttributeReports?: TypeFromSchema<typeof TlvAttributeReport>[],
): Promise<DecodedDataReport> {
    const attributeReports = new Array<DecodedAttributeReportValue<any>>();
    const attributeStatus = new Array<DecodedAttributeReportStatus>();
    const eventReports = new Array<DecodedEventReportValue<any>>();
    const eventStatus = new Array<DecodedEventReportStatus>();

    for await (const chunk of InputChunk(report, leftoverAttributeReports)) {
        switch (chunk.kind) {
            case "attr-value":
                attributeReports.push(toDecodedAttributeReportValue(chunk));
                break;
            case "attr-status":
                attributeStatus.push(toDecodedAttributeReportStatus(chunk));
                break;
            case "event-value":
                eventReports.push(toDecodedEventReportValue(chunk));
                break;
            case "event-status":
                eventStatus.push(toDecodedEventReportStatus(chunk));
                break;
        }
    }

    return {
        ...report,
        attributeReports,
        attributeStatus: attributeStatus.length > 0 ? attributeStatus : undefined,
        eventReports,
        eventStatus: eventStatus.length > 0 ? eventStatus : undefined,
    };
}

/**
 * Build a legacy {@link DecodedAttributeReportValue} from a streaming chunk.
 * @deprecated Legacy API, removed in 0.19. Migrate to @matter/node — see docs/MIGRATION_CONTROLLER_018.md.
 */
export function toDecodedAttributeReportValue(chunk: ReadResult.AttributeValue): DecodedAttributeReportValue<any> {
    return {
        path: resolveAttributePath(chunk.path),
        version: chunk.version,
        value: chunk.value,
    };
}

/**
 * Build a legacy {@link DecodedAttributeReportStatus} from a streaming chunk.
 * @deprecated Legacy API, removed in 0.19. Migrate to @matter/node — see docs/MIGRATION_CONTROLLER_018.md.
 */
export function toDecodedAttributeReportStatus(chunk: ReadResult.AttributeStatus): DecodedAttributeReportStatus {
    return {
        path: resolveAttributePath(chunk.path),
        status: chunk.status,
        clusterStatus: chunk.clusterStatus,
    };
}

/**
 * Build a legacy {@link DecodedEventReportValue} from a streaming chunk; forwards all four wire timestamp variants.
 * @deprecated Legacy API, removed in 0.19. Migrate to @matter/node — see docs/MIGRATION_CONTROLLER_018.md.
 */
export function toDecodedEventReportValue(chunk: ReadResult.EventValue): DecodedEventReportValue<any> {
    return {
        path: resolveEventPath(chunk.path),
        events: [
            {
                eventNumber: chunk.number,
                priority: chunk.priority,
                epochTimestamp: chunk.epochTimestamp,
                systemTimestamp: chunk.systemTimestamp,
                deltaEpochTimestamp: chunk.deltaEpochTimestamp,
                deltaSystemTimestamp: chunk.deltaSystemTimestamp,
                data: chunk.value,
            },
        ],
    };
}

/**
 * Build a legacy {@link DecodedEventReportStatus} from a streaming chunk.
 * @deprecated Legacy API, removed in 0.19. Migrate to @matter/node — see docs/MIGRATION_CONTROLLER_018.md.
 */
export function toDecodedEventReportStatus(chunk: ReadResult.EventStatus): DecodedEventReportStatus {
    return {
        path: resolveEventPath(chunk.path),
        status: chunk.status,
        clusterStatus: chunk.clusterStatus,
    };
}

function resolveAttributePath(path: ReadResult.ConcreteAttributePath): DecodedAttributeReportEntry["path"] {
    const { nodeId, endpointId, clusterId, attributeId } = path;
    if (endpointId === undefined || clusterId === undefined || attributeId === undefined) {
        throw new UnexpectedDataError(`Invalid attribute path ${endpointId}/${clusterId}/${attributeId}`);
    }
    const clusterModel = Matter.clusters(clusterId);
    const attributeModel = clusterModel?.attributes(attributeId) ?? Matter.attributes(attributeId);
    if (attributeModel === undefined) {
        logger.debug(
            `Unresolved attribute path ${endpointId}/${Diagnostic.hex(clusterId)}/${Diagnostic.hex(attributeId)} — reporting with placeholder name.`,
        );
    }
    return {
        nodeId,
        endpointId,
        clusterId,
        attributeId,
        attributeName: attributeModel?.propertyName ?? `Unknown (${Diagnostic.hex(attributeId)})`,
    };
}

function resolveEventPath(path: ReadResult.ConcreteEventPath): DecodedEventReportEntry["path"] {
    const { nodeId, endpointId, clusterId, eventId } = path;
    if (endpointId === undefined || clusterId === undefined || eventId === undefined) {
        throw new UnexpectedDataError(`Invalid event path ${endpointId}/${clusterId}/${eventId}`);
    }
    const clusterModel = Matter.clusters(clusterId);
    const eventModel = clusterModel?.events(eventId);
    return {
        nodeId,
        endpointId,
        clusterId,
        eventId,
        eventName: eventModel?.propertyName ?? `Unknown (${Diagnostic.hex(eventId)})`,
    };
}
