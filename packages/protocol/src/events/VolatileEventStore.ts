/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { InternalError, Logger, MaybePromise, StorageContext } from "#general";
import { EventNumber } from "#types";

import { BaseEventStore } from "./BaseEventStore.js";
import { OccurrenceSummary } from "./EventStore.js";
import { Occurrence } from "./Occurrence.js";

const logger = Logger.get("EphemeralEventStore");

/**
 * In-memory event store.
 *
 * Ensures event numbers remain sequential but otherwise discards all state on restart.
 */
export class VolatileEventStore extends BaseEventStore {
    #numbersReservedTo: bigint | undefined;
    #numberBlockSize = 1_000;
    #events = new Map<EventNumber, Occurrence>();
    #reservationWrite?: Promise<unknown>;

    /**
     * Uses {@link storage} for persistence of "next" event number across restarts.
     *
     * {@link numberBlockSize} specifies how often storage is update with a new starting point.  A larger number reduces
     * writes but must remain small enough to avoid exhausting the full 64-bit even numbering space.
     */
    constructor(storage: StorageContext, numberBlockSize = 1_000) {
        super(storage);
        this.#numberBlockSize = numberBlockSize;
    }

    override async load() {
        const { reservationEnd, eventIds } = await this.loadInitialState();

        if (eventIds.length) {
            logger.warn("Converting non-volatile state store to volatile");
            await this.eventStorage.clear();
        }

        this.#numbersReservedTo = reservationEnd;

        this.logLoad("volatile");

        return [];
    }

    override get(number: EventNumber) {
        const event = this.#events.get(number);
        if (event === undefined) {
            throw new InternalError(`Invalid event occurrence #${number}`);
        }
        return event;
    }

    override delete(number: EventNumber) {
        return this.storage.delete(number.toString());
    }

    override add(occurrence: Occurrence): MaybePromise<OccurrenceSummary> {
        if (this.#reservationWrite) {
            let write: undefined | Promise<OccurrenceSummary> = undefined;

            const whenReady = () => {
                if (this.#reservationWrite === write) {
                    this.#reservationWrite = undefined;
                }
                return this.add(occurrence);
            };

            write = this.#reservationWrite.then(whenReady, whenReady);
        }

        const number = this.allocateNumber();
        const key = OccurrenceSummary(number, occurrence);

        const reservedTo = this.#numbersReservedTo ?? 1n;
        if (number >= reservedTo) {
            const reserveTo = reservedTo + BigInt(this.#numberBlockSize);
            let write: MaybePromise<void | OccurrenceSummary> = undefined;
            write = MaybePromise.then(this.storage.set(BaseEventStore.LAST_RESERVED_NUMBER_KEY, reserveTo), () => {
                this.#numbersReservedTo = reserveTo;
                this.#events.set(number, occurrence);
                if (write !== undefined && this.#reservationWrite === write) {
                    this.#reservationWrite = undefined;
                }
                return key;
            });
        }

        this.#events.set(number, occurrence);
        return key;
    }

    override clear() {
        return MaybePromise.then(super.clear(), () => {
            this.#events = new Map();
            this.#numbersReservedTo = undefined;
        });
    }

    override close() {
        if (this.#reservationWrite) {
            return this.#reservationWrite?.then(
                () => {},
                () => {},
            );
        }
    }
}
