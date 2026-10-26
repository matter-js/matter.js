/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import type { ResultStatus } from "#action/response/ResultStatus.js";
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
    TlvSchema,
} from "@matter/types";

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
    /**
     * One block of reports yielded by a {@link ReadResult}. Async-iterable producers (e.g. wire-decode pipelines)
     * can interleave work between reports; sync producers (e.g. small in-memory yields) keep their literal array
     * shape. Consumers iterate with `for await … of chunk` either way.
     */
    export type Chunk = AsyncIterable<Report> | Iterable<Report>;

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

    export interface AttributeStatus extends ResultStatus {
        kind: "attr-status";
        path: ConcreteAttributePath;
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

        /**
         * Collapsed numeric form of whichever wire timestamp variant the publisher sent. For a delta variant this is
         * the delta; use {@link resolvedTimestamp} for the absolute time.
         */
        timestamp: number;

        /**
         * Absolute timestamp in milliseconds, on the clock of whichever variant the publisher sent. Equals the absolute
         * variant when the publisher sent one. For a delta it is the absolute time of the event directly before it in
         * the same ReportData message plus the delta. Undefined when the publisher sent no timestamp, or sent a delta
         * and the event directly before it has no absolute time on the same clock.
         *
         * @see {@link MatterSpecification.v161.Core} § 10.7.3.1
         */
        resolvedTimestamp?: number;

        /** Absolute Posix epoch timestamp (milliseconds). Matter Core §10.6.9 allows a peer to send only one of the four. */
        epochTimestamp?: number | bigint;

        /** Absolute system-time timestamp (milliseconds). */
        systemTimestamp?: number | bigint;

        /** Relative epoch-time delta from the prior event (milliseconds). */
        deltaEpochTimestamp?: number | bigint;

        /** Relative system-time delta from the prior event (milliseconds). */
        deltaSystemTimestamp?: number | bigint;

        priority: Priority;
        value: unknown;
        tlv: TlvSchema<unknown>;
    }

    export interface EventStatus extends ResultStatus {
        kind: "event-status";
        path: ConcreteEventPath;
    }
}
