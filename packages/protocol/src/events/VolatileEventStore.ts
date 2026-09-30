/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { InternalError, Logger, MaybePromise, StorageContext } from "@matter/general";
import { EventNumber } from "@matter/types";

import { BaseEventStore } from "./BaseEventStore.js";
import { EventStore, OccurrenceSummary } from "./EventStore.js";
import { Occurrence } from "./Occurrence.js";

const logger = Logger.get("EphemeralEventStore");

/**
 * In-memory event store.
 *
 * Keeps event numbers increasing across restarts but otherwise discards all state on restart.
 */
export class VolatileEventStore extends BaseEventStore {
    #events = new Map<EventNumber, Occurrence>();

    /**
     * Uses {@link storage} for persistence of the event number reservation across restarts.
     *
     * @param numberBlockSize how many numbers one reservation write covers
     */
    constructor(storage: StorageContext, numberBlockSize = 1_000) {
        super(storage, numberBlockSize);
    }

    override async load() {
        const { eventIds } = await this.loadInitialState();

        if (eventIds.length) {
            logger.warn("Converting non-volatile state store to volatile");
            await this.reserveCurrentNumbering();
            await this.eventStorage.clearAll();
        }

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
        this.#events.delete(number);
    }

    override add(occurrence: Occurrence): MaybePromise<OccurrenceSummary> {
        return MaybePromise.then(this.allocateNumber(), number => {
            this.#events.set(number, occurrence);
            return OccurrenceSummary(number, occurrence);
        });
    }

    override clear(options?: EventStore.ClearOptions) {
        return MaybePromise.then(super.clear(options), () => {
            this.#events = new Map();
        });
    }
}
