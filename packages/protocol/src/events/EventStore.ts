/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { MaybePromise } from "#general";
import { ClusterId, EndpointNumber, EventId, EventNumber, Priority } from "#types";
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
    clear(): MaybePromise<void>;
    close(): MaybePromise<void>;
}
