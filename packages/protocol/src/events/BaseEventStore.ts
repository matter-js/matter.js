/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { InternalError, Logger, MaybePromise, StorageContext } from "#general";
import { EventNumber } from "#types";
import { EventStore, OccurrenceSummary } from "./EventStore.js";
import { Occurrence } from "./Occurrence.js";

const logger = Logger.get("BaseEventStore");

/**
 * Common base class for standard event stores.
 *
 * This supports data load for both persistent and ephemeral stores so stores can manage conversion when the
 * implementation changes across restarts.
 */
export abstract class BaseEventStore implements EventStore {
    #storage: StorageContext;
    #eventStorage: StorageContext;
    #nextNumber?: bigint;

    constructor(storage: StorageContext) {
        this.#storage = storage;
        this.#eventStorage = storage.createContext(BaseEventStore.EVENTS_KEY);
    }

    abstract load(): MaybePromise<OccurrenceSummary[]>;

    abstract add(occurrence: Occurrence): MaybePromise<OccurrenceSummary>;

    abstract get(number: EventNumber): MaybePromise<Occurrence>;

    abstract delete(number: EventNumber): MaybePromise<void>;

    clear() {
        return MaybePromise.then(this.close(), () =>
            MaybePromise.then(this.#storage.clear(), () =>
                MaybePromise.then(this.#eventStorage.clear(), () => {
                    this.#nextNumber = 1n;
                }),
            ),
        );
    }

    abstract close(): MaybePromise<void>;

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

        return { reservationEnd, eventIds: eventNumbers };
    }

    protected get nextNumber() {
        if (this.#nextNumber === undefined) {
            throw new InternalError("Event store numbering accessed before load");
        }
        return this.#nextNumber;
    }

    protected allocateNumber() {
        const number = this.nextNumber;
        this.#nextNumber = this.nextNumber + 1n;
        return number as EventNumber;
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
     * If present in the store, this value designates the next event value to use on startup.
     *
     * This should really be "lastReservedNumber" but keeping old name for backwards compatibility.
     */
    static LAST_RESERVED_NUMBER_KEY = "lastEventNumber";
}
