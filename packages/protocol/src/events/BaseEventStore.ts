/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { ImplementationError, InternalError, Logger, MaybePromise, StorageContext } from "@matter/general";
import { EventNumber } from "@matter/types";
import { EventStore, OccurrenceSummary } from "./EventStore.js";
import { Occurrence } from "./Occurrence.js";

const logger = Logger.get("BaseEventStore");

/**
 * Common base class for standard event stores.
 *
 * Owns event numbering for both persistent and ephemeral stores: numbers are reserved in blocks under
 * {@link BaseEventStore.LAST_RESERVED_NUMBER_KEY}, and a number is handed out only once a reservation covering it is
 * stored.  A restart therefore never reuses a number, whatever the store keeps of its events; only {@link clear}
 * without `keepNumbering` starts again at 1.
 *
 * Also supports data load for both kinds of store so stores can manage conversion when the implementation changes
 * across restarts.
 *
 * @see {@link MatterSpecification.v161.Core} § 7.14.1.1
 */
export abstract class BaseEventStore implements EventStore {
    #storage: StorageContext;
    #eventStorage: StorageContext;
    #numberBlockSize: number;
    #nextNumber?: bigint;

    /** The first number the reservation being stored does not cover, or `undefined` while none is. */
    #reservedTo?: bigint;

    /** The latest reservation write while it is pending. */
    #pending?: Promise<void>;

    /**
     * @param numberBlockSize how many numbers one reservation write covers; 0 counts as 1.  A larger number reduces
     * writes but must remain small enough to avoid exhausting the full 64-bit event numbering space.
     */
    constructor(storage: StorageContext, numberBlockSize = 1_000) {
        if (!Number.isInteger(numberBlockSize) || numberBlockSize < 0) {
            throw new ImplementationError(
                `Event number block size must be a non-negative integer, not ${numberBlockSize}`,
            );
        }
        this.#storage = storage;
        this.#eventStorage = storage.createContext(BaseEventStore.EVENTS_KEY);
        this.#numberBlockSize = Math.max(numberBlockSize, 1);
    }

    abstract load(): MaybePromise<OccurrenceSummary[]>;

    abstract add(occurrence: Occurrence): MaybePromise<OccurrenceSummary>;

    abstract get(number: EventNumber): MaybePromise<Occurrence>;

    abstract delete(number: EventNumber): MaybePromise<void>;

    clear(options?: EventStore.ClearOptions): MaybePromise<void> {
        if (options?.keepNumbering) {
            // Reservation before the events go, so no point in between restarts the numbering
            return MaybePromise.then(this.close(), () =>
                MaybePromise.then(this.reserveCurrentNumbering(), () => this.#eventStorage.clearAll()),
            );
        }

        return MaybePromise.then(this.close(), () =>
            MaybePromise.then(this.#storage.clearAll(), () =>
                MaybePromise.then(this.#eventStorage.clearAll(), () => {
                    this.#nextNumber = 1n;
                    this.#reservedTo = undefined;
                }),
            ),
        );
    }

    /**
     * Settles the pending reservation write.  A store that overrides this settles its own writes and then calls it.
     */
    close(): MaybePromise<void> {
        return this.#pending?.then(
            () => {},
            () => {},
        );
    }

    protected async loadInitialState() {
        let reservationEnd;
        if (await this.#storage.has(BaseEventStore.LAST_RESERVED_NUMBER_KEY)) {
            reservationEnd = await this.#storage.get<bigint>(BaseEventStore.LAST_RESERVED_NUMBER_KEY);
            if (reservationEnd !== undefined) {
                try {
                    reservationEnd = BigInt(reservationEnd);
                } catch (e) {
                    logger.warn(`Ignoring invalid value for last persisted event number: ${e}`);
                    reservationEnd = undefined;
                }
                if (reservationEnd !== undefined && reservationEnd < 1n) {
                    logger.warn(`Ignoring invalid value for last persisted event number: ${reservationEnd}`);
                    reservationEnd = undefined;
                }
            }
        }
        let nextNumber = reservationEnd;

        const eventNumbers = Array<bigint>();
        for (const key of await this.#storage.createContext(BaseEventStore.EVENTS_KEY).keys()) {
            let number: bigint;
            try {
                number = BigInt(key);
            } catch (e) {
                if (e instanceof SyntaxError) {
                    logger.warn(`Ignoring event stored with invalid key ${key}`);
                    continue;
                }
                throw e;
            }
            eventNumbers.push(number);
            if (nextNumber === undefined || nextNumber <= number) {
                nextNumber = number + 1n;
            }
        }

        this.#nextNumber = (nextNumber ?? 1n) as EventNumber;
        this.#reservedTo = reservationEnd;

        return { reservationEnd, eventIds: eventNumbers };
    }

    protected get nextNumber() {
        if (this.#nextNumber === undefined) {
            throw new InternalError("Event store numbering accessed before load");
        }
        return this.#nextNumber;
    }

    /**
     * Stores the current numbering as the number to continue from after a restart, before a store discards the events
     * it would otherwise continue from.
     */
    protected reserveCurrentNumbering(): MaybePromise<void> {
        return this.#reserve(this.nextNumber);
    }

    /**
     * The next event number, available once a stored reservation covers it.  Synchronous while no reservation write is
     * pending.
     */
    protected allocateNumber(): MaybePromise<EventNumber> {
        const number = this.nextNumber as EventNumber;
        this.#nextNumber = number + 1n;

        if (this.#reservedTo === undefined || number >= this.#reservedTo) {
            this.#reserve(number + BigInt(this.#numberBlockSize));
        }

        return MaybePromise.then(this.#pending, () => number);
    }

    /**
     * Stores `reserveTo` as the number to continue from after a restart, after the pending write so writes land in
     * order.  Every number handed out stays below the stored value.
     */
    #reserve(reserveTo: bigint): MaybePromise<void> {
        this.#reservedTo = reserveTo;

        const store = () => this.#storage.set(BaseEventStore.LAST_RESERVED_NUMBER_KEY, reserveTo);
        const previous = this.#pending;
        const result = previous === undefined ? store() : previous.then(store);
        if (!MaybePromise.is(result)) {
            return;
        }

        const write = Promise.resolve(result);
        this.#pending = write;
        write.then(
            () => {
                if (this.#pending === write) {
                    this.#pending = undefined;
                }
            },
            error => logger.error("Failed to store the event number reservation", error),
        );
        return write;
    }

    protected get storage() {
        return this.#storage;
    }

    protected get eventStorage() {
        return this.#eventStorage;
    }

    protected logLoad(type: string) {
        if (this.nextNumber === 1n) {
            logger.info(`Initialized new ${type} event store`);
        } else {
            logger.info(`Loaded ${type} event store with next number ${this.nextNumber}`);
        }
    }

    /**
     * If present in the store, this sub-context contains persisted events.
     */
    static EVENTS_KEY = "events";

    /**
     * If present in the store, this value designates the next event value to use on startup.  Every number handed out
     * is below it.
     *
     * This should really be "lastReservedNumber" but keeping old name for backwards compatibility.
     */
    static LAST_RESERVED_NUMBER_KEY = "lastEventNumber";
}
