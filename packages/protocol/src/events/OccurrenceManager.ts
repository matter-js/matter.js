/**
 * @license
 * Copyright 2022-2025 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import {
    asyncNew,
    Construction,
    Diagnostic,
    ImplementationError,
    InternalError,
    isObject,
    Logger,
    MatterAggregateError,
    MaybePromise,
    Observable,
} from "#general";
import {
    EventNumber,
    FabricIndex,
    Priority,
    resolveEventName,
    TlvEventFilter,
    TlvEventPath,
    TypeFromSchema,
} from "#types";
import { EventStore, OccurrenceSummary } from "./EventStore.js";
import { NumberedOccurrence, Occurrence } from "./Occurrence.js";

const logger = Logger.get("OccurrenceManager");

export interface OccurrenceManagerContext {
    store: EventStore;

    bufferConfig?: OccurrenceManager.BufferConfig;
}

/**
 * Manages event occurrences.
 *
 * Each time an event is triggered it is stored as an {@link Occurrence} in this manager.  Occurrences are persisted in
 * an {@link EventStore} and may be retrieved using Matter query semantics.
 *
 * Drops occurrences when the store becomes too full as configured by {@link OccurrenceManager.BufferConfig}.
 *
 * TODO - query is extremely inefficient.  For new code paths should build internal index and bypass EventServer to
 * deliver query in wire form directly here
 */
export class OccurrenceManager {
    #store: EventStore;
    #bufferConfig: OccurrenceManager.BufferConfig;
    #cull?: Promise<void>;
    #iteratingValuesInProgress = false;
    #added = new Observable<[occurrence: NumberedOccurrence]>();

    // As we don't (yet) have storage with secondary indices we currently maintain indices in memory regardless of
    // whether underlying store is volatile
    #occurrences = new Array<OccurrenceSummary>();

    #construction: Construction<OccurrenceManager>;

    get construction() {
        return this.#construction;
    }

    static async create(context: OccurrenceManagerContext) {
        return asyncNew(OccurrenceManager, context);
    }

    constructor({ store, bufferConfig }: OccurrenceManagerContext) {
        if (bufferConfig === undefined) {
            bufferConfig = OccurrenceManager.DefaultBufferConfig;
        }

        const { minEventAllowance, maxEventAllowance } = bufferConfig;

        if (maxEventAllowance < minEventAllowance) {
            throw new ImplementationError(
                `Maximum allowance ${maxEventAllowance} is less than minimum allowance ${minEventAllowance}`,
            );
        }

        this.#store = store;
        this.#bufferConfig = bufferConfig;

        this.#construction = Construction(this, () => {
            return MaybePromise.then(this.#store.load(), index => {
                // To be sure, sort the entries by number
                index.sort(
                    // sort that way because Bigint & Number mix
                    ({ number: numberA }, { number: numberB }) => (numberA < numberB ? -1 : numberA > numberB ? 1 : 0),
                );
                this.#occurrences.push(...index);
                if (this.#occurrences.length > this.#bufferConfig.minEventAllowance) {
                    this.#startCull();
                }
            });
        });
    }

    get added() {
        return this.#added;
    }

    async clear() {
        await this.construction;
        await this.#store.clear();
        this.#occurrences.length = 0;
    }

    /**
     * Find the index of the first event number in the list that is greater than or equal to eventMin to optimize
     * searching.
     */
    #findMinEventNumberIndex(eventMin: EventNumber) {
        // if the list is empty or the eventMin is less than the last event number, no entry is relevant

        if (this.#occurrences.length === 0 || eventMin > this.#occurrences[this.#occurrences.length - 1].number) {
            return -1;
        }
        if (eventMin <= this.#occurrences[0].number) {
            return 0; // The first event number is greater than or equal to eventMin, so all entries are relevant
        }

        let low = this.#occurrences.length - 1;
        let high = low;
        let step = 1;

        // Because it is more likely that events we want are in the upper ranges we first fine a starting point from there
        while (low > 0 && this.#occurrences[low].number >= eventMin) {
            high = low;
            low = Math.max(0, low - step);
            step *= 2; // increase the step size to skip more entries
        }

        while (low <= high) {
            const mid = Math.floor((low + high) / 2);
            if (this.#occurrences[mid].number < eventMin) {
                low = mid + 1;
            } else {
                high = mid - 1;
            }
        }

        return low; // The index of the first event number that is greater than or equal to eventMin
    }

    /**
     * Query the event store for events matching the given path and filters.
     * @deprecated
     */
    query(
        eventPath: TypeFromSchema<typeof TlvEventPath>,
        filters?: TypeFromSchema<typeof TlvEventFilter>[],
        filterForFabricIndex?: FabricIndex,
    ): MaybePromise<NumberedOccurrence[]> {
        if (filters !== undefined && filters.length > 1) {
            throw new InternalError("Multiple filters not supported");
        }
        // Search the index and load applicable events
        const startIndex = filters?.length ? this.#findMinEventNumberIndex(EventNumber(filters[0].eventMin)) : 0;
        if (startIndex === -1) {
            return []; // No entry matches the filter
        }

        let isAsyncLoad = false;
        const { endpointId, clusterId, eventId } = eventPath;
        const occurrences = new Array<MaybePromise<NumberedOccurrence>>();
        for (let i = startIndex; i < this.#occurrences.length; i++) {
            const entry = this.#occurrences[i];
            if (endpointId === entry.endpointId && clusterId === entry.clusterId && eventId === entry.eventId) {
                let occurrence = this.#store.get(entry.number) as MaybePromise<NumberedOccurrence>;
                occurrence = MaybePromise.then(occurrence, occurrence => {
                    occurrence.number = entry.number;
                    return occurrence;
                });
                occurrences.push(occurrence);
                if (MaybePromise.is(occurrence)) {
                    isAsyncLoad = true;
                }
            }
        }

        // TODO - log after fabric filtering and include fabric filter in log message?
        logger.debug(
            `Got ${occurrences.length} events for ${resolveEventName(eventPath)} with filters: ${Diagnostic.json(filters)}`,
        );

        // Convert from MaybePromise[] to MaybePromise<[]>
        let result: MaybePromise<NumberedOccurrence[]>;
        if (isAsyncLoad) {
            result = Promise.all(occurrences);
        } else {
            result = occurrences as NumberedOccurrence[];
        }

        // Apply fabric filtering if required
        if (filterForFabricIndex !== undefined) {
            result = MaybePromise.then(result, (occurrences: NumberedOccurrence[]) =>
                occurrences.filter(({ payload }) => {
                    if (!isObject(payload)) {
                        return true;
                    }
                    const { fabricIndex } = payload;
                    return fabricIndex === undefined || fabricIndex === filterForFabricIndex;
                }),
            );
        }

        // Log result
        result = MaybePromise.then(result, occurrences => {
            let filterDesc;
            if (filters?.length) {
                filterDesc = filters.map(({ nodeId, eventMin }) => `${nodeId}:${eventMin}`).join(",");
            }
            if (filterForFabricIndex) {
                if (filterDesc !== undefined) {
                    filterDesc = `${filterDesc} and fabric #${filterForFabricIndex}`;
                } else {
                    filterDesc = `fabric #${filterForFabricIndex}`;
                }
            }

            if (filterDesc) {
                filterDesc = ` (filters: ${filterDesc})`;
            } else {
                filterDesc = "";
            }

            logger.debug(
                `Loaded ${occurrences.length} occurrence${occurrences.length === 1 ? "" : "s"} for ${resolveEventName(eventPath)}${filterDesc}`,
            );
            return occurrences;
        });

        return result;
    }

    /**
     * Return an iterator over all occurrences in the store that are bigger or equal to the minimum eventNumber,
     * if provided.
     */
    async *get(eventMin?: EventNumber) {
        if (this.#cull) {
            await this.#cull;
        }
        const startIndex = eventMin === undefined ? 0 : this.#findMinEventNumberIndex(eventMin);
        if (startIndex === -1) {
            return; // No entry matches the filter
        }
        this.#iteratingValuesInProgress = true;
        try {
            for (let i = startIndex; i < this.#occurrences.length; i++) {
                const eventNumber = this.#occurrences[i].number;
                const occurrence = this.#store.get(eventNumber);
                if (MaybePromise.is(occurrence)) {
                    yield {
                        ...(await occurrence),
                        number: eventNumber,
                    };
                } else {
                    yield {
                        ...occurrence,
                        number: eventNumber,
                    };
                }
            }
        } finally {
            this.#iteratingValuesInProgress = false;
        }
    }

    close(): MaybePromise<void> {
        return MaybePromise.then(this.#cull, () => this.#store.close());
    }

    add(occurrence: Occurrence): MaybePromise<NumberedOccurrence> {
        return MaybePromise.then(this.#store.add(occurrence), entry => {
            logger.debug(`Recorded event #${entry.number}`, Diagnostic.dict(occurrence));
            this.#occurrences.push(entry);
            if (this.#occurrences.length > this.#bufferConfig.maxEventAllowance) {
                this.#startCull();
            }
            const numberedOccurrence = {
                number: entry.number,
                ...occurrence,
            };
            this.#added.emit(numberedOccurrence);
            return numberedOccurrence;
        });
    }

    remove(number: EventNumber) {
        const index = this.#occurrences.findIndex(entry => entry.number === number);
        if (index === -1) {
            // Should not happen but just in case
            return;
        }
        this.#occurrences.splice(index, 1);
        if (this.#cull) {
            return this.#cull.then(() => this.#store.delete(number));
        }
        return this.#store.delete(number);
    }

    #startCull() {
        if (this.#cull || this.#iteratingValuesInProgress) {
            return;
        }
        const cull = this.#dropOldOccurrences();
        if (MaybePromise.is(cull)) {
            this.#cull = Promise.resolve(cull).finally(() => (this.#cull = undefined));
        }
    }

    #dropOldOccurrences() {
        let toDelete = this.#occurrences.length - this.#bufferConfig.minEventAllowance;
        if (toDelete <= 0) {
            return;
        }

        logger.debug(`Event store is full; dropping ${toDelete} old occurrence${toDelete === 1 ? "s" : ""}`);

        const prioData = {
            [Priority.Info]: {
                count: this.#bufferConfig.minPriorityEventAllowance["info"],
                minPosition: -1,
            },
            [Priority.Debug]: {
                count: this.#bufferConfig.minPriorityEventAllowance["debug"],
                minPosition: -1,
            },
        };

        const asyncDrops = Array<PromiseLike<void>>();

        // Find out on which index positions we reached the minimum allowed entries for each priority.
        // For that we count the entries for Non-Critical priorities from the end of the list to the beginning.
        for (let i = this.#occurrences.length - 1; i >= 0; i--) {
            const { priority } = this.#occurrences[i];

            if (priority !== Priority.Critical) {
                const data = prioData[priority];
                if (data.count > 0) {
                    data.count--;
                    if (data.count === 0) {
                        data.minPosition = i;
                        if (prioData[Priority.Info].minPosition > -1 && prioData[Priority.Debug].minPosition > -1) {
                            // We have found the minimum position for both priorities, we can stop
                            break;
                        }
                    }
                }
            }
        }

        // Now we can drop the occurrences from the beginning of the list until we reach the minimum allowed entries
        // for each priority, started with the lowest priority, until we reached the maximum number of entries we need
        // to remove. Critical events are removed last from the beginning as many as needed to reach the maximum number
        // of entries to remove.
        // Deleted entries are marked as undefined in the array, so we can filter them out later in one pass.
        const occurrences = this.#occurrences as Array<OccurrenceSummary | undefined>;
        for (const priority of [Priority.Debug, Priority.Info, Priority.Critical]) {
            const checkUpTo =
                priority === Priority.Critical ? this.#occurrences.length : prioData[priority].minPosition;
            if (checkUpTo === -1) {
                // We have less than the minimum of this event type, so we can not remove any
                continue;
            }
            for (let i = 0; i < checkUpTo && toDelete > 0; i++) {
                if (occurrences[i] === undefined) continue;
                const { priority: entryPriority, number } = occurrences[i]!;
                if (entryPriority === priority) {
                    const drop = MaybePromise.catch(this.#store.delete(number), error =>
                        logger.warn(`Error dropping occurrence #${number}: ${error}`),
                    );
                    if (MaybePromise.is(drop)) {
                        asyncDrops.push(drop);
                    }
                    occurrences[i] = undefined;
                    toDelete--;
                }
            }
            if (toDelete <= 0) {
                break;
            }
        }
        this.#occurrences = occurrences.filter(entry => entry) as OccurrenceSummary[];

        if (asyncDrops.length) {
            return MatterAggregateError.allSettled(asyncDrops, "Error dropping occurrences")
                .then(() => {})
                .catch(error => logger.error(error));
        }
    }
}

export namespace OccurrenceManager {
    /**
     * Buffer management configuration.  Controls
     */
    export interface BufferConfig {
        /**
         * The minimum number of events that will be buffered.
         */
        minEventAllowance: number;

        /**
         * The maximum number of events that will be buffered.
         *
         * When the buffer hits this size the manager discard events to reduce the buffer size to
         * {@link minimumEventAllowance}.
         */
        maxEventAllowance: number;

        /**
         * Minimum allowances by priority.  This ensures a minimum number of non-critical events avoid LRU
         * harvesting. Critical events take the rest of the entries up to the defined global minimum.
         */
        minPriorityEventAllowance: {
            info: number;
            debug: number;
        };
    }

    export const DefaultBufferConfig: BufferConfig = {
        minEventAllowance: 10_000,
        maxEventAllowance: 11_000,
        minPriorityEventAllowance: {
            info: 2_000,
            debug: 2_000,
        },
    };
}
