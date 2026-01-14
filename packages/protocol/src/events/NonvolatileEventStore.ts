/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { Logger, MatterAggregateError, MaybePromise, StorageContext } from "#general";
import { EventNumber } from "#types";
import { BaseEventStore } from "./BaseEventStore.js";
import { OccurrenceSummary } from "./EventStore.js";
import { Occurrence } from "./Occurrence.js";

const logger = Logger.get("NonvolatileEventStore");

/**
 * Event store that maintains even state across restarts.
 *
 * Reduces memory usage vs. non-volatle storage and maintains auditibility across restarts.  Requires a write for every
 * event.
 */
export class NonvolatileEventStore extends BaseEventStore {
    #removeNumberReservation = false;
    #iops = new Set<PromiseLike<unknown>>();

    /**
     * Create new store that persistes events into {@link storage}.
     */
    constructor(storage: StorageContext) {
        super(storage);
    }

    override async load(): Promise<OccurrenceSummary[]> {
        const { reservationEnd, eventIds: eventNumbers } = await this.loadInitialState();

        if (reservationEnd !== undefined) {
            logger.warn("Converting volatile state store to non-volatile");

            // We cannot remove the number reservation marker until we persist our first event
            this.#removeNumberReservation = true;
        }

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
        // Allocate a new number immediately.  If save fails but a subsequent save succeeds we will skip the number, but
        // this is unlikely, shouldn't be fatal, and this way we can run writes in parallel
        const number = this.allocateNumber();

        // Persist the occurrence
        const result = MaybePromise.then(this.eventStorage.set(number.toString(), occurrence as any), () => {
            const summary = OccurrenceSummary(number, occurrence);

            // We've now persisted at least one event so can clear the reservation key.  Not super critical, this just
            // prevents the related warning from appearing on next restart
            if (this.#removeNumberReservation) {
                this.#removeNumberReservation = false;
                const conversion = this.storage.delete(BaseEventStore.LAST_RESERVED_NUMBER_KEY);
                return MaybePromise.then(
                    conversion,
                    () => summary,
                    error => {
                        console.warn("Error clearing volatile event number reservation", error);
                        return summary;
                    },
                );
            }

            return summary;
        });

        return this.#trackIop(result);
    }

    override get(number: EventNumber): MaybePromise<Occurrence> {
        return this.#trackIop(this.eventStorage.get(number.toString()) as unknown as MaybePromise<Occurrence>);
    }

    override delete(number: EventNumber): MaybePromise<void> {
        return this.#trackIop(this.eventStorage.delete(number.toString()));
    }

    override clear() {
        this.#removeNumberReservation = false;
        return super.clear();
    }

    override close() {
        if (this.#iops.size) {
            return MatterAggregateError.allSettled(this.#iops, "Error closing event store")
                .then(() => {})
                .catch(error => logger.error(error));
        }
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
