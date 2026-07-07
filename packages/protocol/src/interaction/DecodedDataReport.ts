/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { DataReport, TlvAttributeReport, TypeFromSchema } from "@matter/types";
import {
    DecodedAttributeReportStatus,
    DecodedAttributeReportValue,
    normalizeAndDecodeReadAttributeReport,
} from "./AttributeDataDecoder.js";
import {
    DecodedEventReportStatus,
    DecodedEventReportValue,
    normalizeAndDecodeReadEventReport,
} from "./EventDataDecoder.js";

/**
 * @deprecated since 0.17 — will be removed in 0.18. Import `DecodedDataReport` from `@project-chip/matter.js/cluster` instead.
 */
export interface DecodedDataReport extends DataReport {
    isNormalized: true;
    attributeReports: DecodedAttributeReportValue<any>[];
    attributeStatus?: DecodedAttributeReportStatus[];
    eventReports: DecodedEventReportValue<any>[];
    eventStatus?: DecodedEventReportStatus[];
    subscriptionId?: number;
}

/**
 * @deprecated since 0.17 — will be removed in 0.18. Use `decodeDataReport` from `@project-chip/matter.js/cluster`, or consume the
 *   streaming `InputChunk` API directly.
 */
export function DecodedDataReport(
    report: DataReport,
    leftoverAttributeReports?: TypeFromSchema<typeof TlvAttributeReport>[],
): DecodedDataReport {
    if ((report as DecodedDataReport).isNormalized) {
        if (leftoverAttributeReports !== undefined && leftoverAttributeReports.length > 0) {
            throw new Error("Cannot provide leftoverAttributeReports for already normalized DecodedDataReport");
        }
        return report as DecodedDataReport;
    }

    if (leftoverAttributeReports !== undefined && leftoverAttributeReports.length > 0) {
        // Prepend leftover values from last run
        if (report.attributeReports === undefined) {
            report.attributeReports = [...leftoverAttributeReports];
        } else {
            report.attributeReports = [...leftoverAttributeReports, ...report.attributeReports];
        }
        leftoverAttributeReports.length = 0;
    }

    const { attributeData: attributeReports, attributeStatus } =
        report.attributeReports === undefined
            ? { attributeData: [] }
            : normalizeAndDecodeReadAttributeReport(
                  report.attributeReports,
                  report.moreChunkedMessages ? leftoverAttributeReports : undefined,
              );

    const { eventData: eventReports, eventStatus } =
        report.eventReports === undefined ? { eventData: [] } : normalizeAndDecodeReadEventReport(report.eventReports);

    return {
        ...report,
        isNormalized: true,
        attributeReports,
        attributeStatus,
        eventReports,
        eventStatus,
    };
}
