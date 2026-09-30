/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { MaybePromise } from "@matter/general";
import { ClusterId, EndpointNumber, EventId, EventNumber, Priority } from "@matter/types";
import { Occurrence } from "./Occurrence.js";
import type { OccurrenceManager } from "./OccurrenceManager.js";

/**
 * Index entry associated with an event occurrence.
 */
export interface OccurrenceSummary {
    number: EventNumber;
    priority: Priority;
    endpointId: EndpointNumber;
    clusterId: ClusterId;
    eventId: EventId;
}

export function OccurrenceSummary(number: bigint, occurrence: Occurrence): OccurrenceSummary {
    return {
        number: number as EventNumber,
        priority: occurrence.priority,
        endpointId: occurrence.endpointId,
        clusterId: occurrence.clusterId,
        eventId: occurrence.eventId,
    };
}

/**
 * Backing store for {@link OccurrenceManager}.
 */
export interface EventStore {
    load(): MaybePromise<OccurrenceSummary[]>;
    add(event: Occurrence): MaybePromise<OccurrenceSummary>;
    get(number: EventNumber): MaybePromise<Occurrence>;
    delete(number: EventNumber): MaybePromise<void>;
    clear(options?: EventStore.ClearOptions): MaybePromise<void>;
    close(): MaybePromise<void>;
}

export namespace EventStore {
    export interface ClearOptions {
        /**
         * Discard the stored occurrences but continue numbering after the numbers already used, also across a
         * restart.  Without it the store numbers from 1 again, which is only correct where the node's life ends.
         * matter.js treats a factory reset as such an end, which the specification does not count as a restart.
         *
         * An implementation that ignores this option still compiles, and numbers from 1 again.
         *
         * @see {@link MatterSpecification.v161.Core} § 7.14.1.1
         * @see {@link MatterSpecification.v161.Core} § 7.12.1
         */
        keepNumbering?: boolean;
    }
}
