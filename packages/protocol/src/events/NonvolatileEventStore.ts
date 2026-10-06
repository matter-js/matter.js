/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { Logger, MatterAggregateError, MaybePromise, StorageContext } from "@matter/general";
import { EventNumber } from "@matter/types";
import { BaseEventStore } from "./BaseEventStore.js";
import { OccurrenceSummary } from "./EventStore.js";
import { Occurrence } from "./Occurrence.js";

const logger = Logger.get("NonvolatileEventStore");

/**
 * Event store that maintains event state across restarts.
 *
 * Reduces memory usage vs. volatile storage and maintains auditability across restarts.  Requires a write for every
 * event, plus one per block of event numbers.
 */
export class NonvolatileEventStore extends BaseEventStore {
    #iops = new Set<PromiseLike<unknown>>();

    /**
     * Create new store that persists events into {@link storage}.
     *
     * @param numberBlockSize how many numbers one reservation write covers
     */
    constructor(storage: StorageContext, numberBlockSize = 1_000) {
        super(storage, numberBlockSize);
    }

    override async load(): Promise<OccurrenceSummary[]> {
        const { eventIds: eventNumbers } = await this.loadInitialState();

        const index = Array<OccurrenceSummary>();
        for (const number of eventNumbers) {
            const occurrence = (await this.eventStorage.get(number.toString())) as unknown as Occurrence;
            if (typeof occurrence !== "object" || occurrence === null) {
                logger.warn("Ignoring invalid stored event occurrence");
                continue;
            }

            index.push(OccurrenceSummary(number, occurrence));
        }

        this.logLoad("non-volatile");

        return index;
    }

    override add(occurrence: Occurrence): MaybePromise<OccurrenceSummary> {
        // If a save fails but a subsequent save succeeds we skip the number, but this is unlikely, shouldn't be fatal,
        // and this way we can run writes in parallel
        const result = MaybePromise.then(this.allocateNumber(), number =>
            MaybePromise.then(this.eventStorage.set(number.toString(), occurrence as any), () =>
                OccurrenceSummary(number, occurrence),
            ),
        );

        return this.#trackIop(result);
    }

    override get(number: EventNumber): MaybePromise<Occurrence> {
        return this.#trackIop(this.eventStorage.get(number.toString()) as unknown as MaybePromise<Occurrence>);
    }

    override delete(number: EventNumber): MaybePromise<void> {
        return this.#trackIop(this.eventStorage.delete(number.toString()));
    }

    override close() {
        const reservation = () => super.close();
        if (this.#iops.size) {
            return MatterAggregateError.allSettled(this.#iops, "Error closing event store")
                .then(() => {})
                .catch(error => logger.warn("Error settling event store on close:", error))
                .then(reservation);
        }
        return reservation();
    }

    /**
     * All operations may be async depending on storage so we track them in a set so we can ensure we don't close until
     * they complete.  This should happen at higher levels so this is just for completeness.
     */
    #trackIop<T>(result: MaybePromise<T>): MaybePromise<T> {
        if (MaybePromise.is(result)) {
            logger.warn("Waiting on ongoing write before event store closure");
            result = Promise.resolve(result).finally(() => this.#iops.delete(result as PromiseLike<unknown>));
            this.#iops.add(result);
        }
        return result;
    }
}
