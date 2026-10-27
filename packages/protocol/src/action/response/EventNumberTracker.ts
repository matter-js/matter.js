/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import type { EventNumber } from "@matter/types";
import type { ReadResult } from "./ReadResult.js";

/**
 * Tracks the highest event number among the reports a consumer pulled through {@link observe}.
 *
 * @see {@link MatterSpecification.v161.Core} § 7.14.1.1
 */
export class EventNumberTracker {
    #value?: EventNumber;

    /**
     * The highest event number seen so far, or undefined before the first event.
     */
    get value() {
        return this.#value;
    }

    /**
     * Pass {@link result} through and record the number of each event its consumer pulls.
     */
    async *observe(result: ReadResult): ReadResult {
        for await (const chunk of result) {
            yield Symbol.iterator in chunk ? this.#observeReports(chunk) : this.#observeReportsAsync(chunk);
        }
    }

    *#observeReports(reports: Iterable<ReadResult.Report>) {
        for (const report of reports) {
            this.#record(report);
            yield report;
        }
    }

    async *#observeReportsAsync(reports: AsyncIterable<ReadResult.Report>) {
        for await (const report of reports) {
            this.#record(report);
            yield report;
        }
    }

    #record(report: ReadResult.Report) {
        if (report.kind === "event-value" && (this.#value === undefined || report.number > this.#value)) {
            this.#value = report.number;
        }
    }
}
