/**
 * @license
 * Copyright 2022-2025 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { DataReport } from "#types";
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

export interface DecodedDataReport extends DataReport {
    isNormalized: true;
    attributeReports: DecodedAttributeReportValue<any>[];
    attributeStatus?: DecodedAttributeReportStatus[];
    eventReports: DecodedEventReportValue<any>[];
    eventStatus?: DecodedEventReportStatus[];
    subscriptionId?: number;
}

export function DecodedDataReport(report: DataReport): DecodedDataReport {
    if ((report as DecodedDataReport).isNormalized) {
        return report as DecodedDataReport;
    }

    const { attributeData: attributeReports, attributeStatus } =
        report.attributeReports === undefined
            ? { attributeData: [] }
            : normalizeAndDecodeReadAttributeReport(report.attributeReports);

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
