/**
 * @license
 * Copyright 2022-2025 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import type {
    AttributeId,
    AttributePath,
    ClusterId,
    EndpointNumber,
    EventId,
    EventNumber,
    EventPath,
    NodeId,
    Priority,
    Status,
    StatusCode,
    TlvSchema,
} from "#types";

/**
 * Streaming result for a Matter protocol-level read.
 *
 * These structures contain data for AttributeReportIB and EventReportIB.  We don't use the deeply-nested native TLV
 * structure directly for reasons of performance and developer convenience.
 *
 * Iteration occurs in chunks for performance reasons.  A chunk is an iterable of reports, one per output attribute or
 * event.
 */
export interface ReadResult<Chunk = ReadResult.Chunk> extends AsyncIterable<Chunk> {}

export namespace ReadResult {
    export type Chunk = Iterable<Report>;

    export type Report = AttributeValue | AttributeStatus | EventValue | EventStatus;

    export interface ConcreteAttributePath extends AttributePath {
        nodeId?: NodeId;
        endpointId: EndpointNumber;
        clusterId: ClusterId;
        attributeId: AttributeId;
    }

    export interface AttributeValue {
        kind: "attr-value";
        path: ConcreteAttributePath;
        value: unknown;
        version: number;
        tlv: TlvSchema<unknown>; // TODO: Remove when we also move encoding to the new format
    }

    export interface AttributeStatus {
        kind: "attr-status";
        path: ConcreteAttributePath;
        status: StatusCode;
        clusterStatus?: number;
    }

    export interface ConcreteEventPath extends EventPath {
        nodeId?: NodeId;
        endpointId: EndpointNumber;
        clusterId: ClusterId;
        eventId: EventId;
    }

    export interface EventValue {
        kind: "event-value";
        path: ConcreteEventPath;
        number: EventNumber;
        timestamp: number;
        priority: Priority;
        value: unknown;
        tlv: TlvSchema<unknown>;
    }

    export interface EventStatus {
        kind: "event-status";
        path: ConcreteEventPath;
        status: Status;
        clusterStatus?: number;
    }
}
