/**
 * @license
 * Copyright 2022-2025 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { ReadResult } from "#action/response/ReadResult.js";
import { DecodedDataReport } from "#interaction/DecodedDataReport.js";
import { DataReport, Status, TlvAny, TlvAttributeReport, TypeFromSchema } from "#types";

/**
 * Converts a {@link DataReport} into a {@link ReadResult.Chunk}.
 */
export function* InputChunk(
    input: DataReport,
    leftoverAttributeReports?: TypeFromSchema<typeof TlvAttributeReport>[],
): ReadResult.Chunk {
    const report = DecodedDataReport(input, leftoverAttributeReports);

    for (const attr of report.attributeReports) {
        yield {
            kind: "attr-value",
            tlv: TlvAny,
            ...attr,
        };
    }

    if (report.attributeStatus) {
        for (const attr of report.attributeStatus) {
            yield {
                kind: "attr-status",
                path: attr.path,
                status: attr.status ?? Status.Failure, // TODO - attr.status shouldn't be optional?
                clusterStatus: attr.clusterStatus,
            };
        }
    }

    for (const event of report.eventReports) {
        for (const occurrence of event.events) {
            yield {
                kind: "event-value",
                path: event.path,
                value: occurrence.data,
                number: occurrence.eventNumber,
                priority: occurrence.priority,
                timestamp: Number(
                    // TODO - this may not be useful, need to determine correct form
                    occurrence.epochTimestamp ??
                        occurrence.systemTimestamp ??
                        occurrence.deltaEpochTimestamp ??
                        occurrence.deltaSystemTimestamp ??
                        0,
                ),

                // TODO - temporary, field will be removed
                tlv: TlvAny,
            };
        }
    }

    if (report.eventStatus) {
        for (const event of report.eventStatus) {
            if (event.status !== undefined) {
                yield {
                    kind: "event-status",
                    path: event.path,
                    status: event.status,
                    clusterStatus: event.clusterStatus,
                };
            }
            if (event.clusterStatus !== undefined) {
                yield {
                    kind: "event-status",
                    path: event.path,
                    status: event.status ?? Status.Failure,
                    clusterStatus: event.clusterStatus,
                };
            }
        }
    }
}
