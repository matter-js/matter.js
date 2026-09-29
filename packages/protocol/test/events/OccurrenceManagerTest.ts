/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { EventStore, OccurrenceSummary } from "#events/EventStore.js";
import type { Occurrence } from "#events/Occurrence.js";
import { OccurrenceManager } from "#events/OccurrenceManager.js";
import { createPromise, InternalError, Timestamp } from "@matter/general";
import { ClusterId, EndpointNumber, EventId, EventNumber, Priority } from "@matter/types";

/** A store whose adds settle only when a test releases them, in any order. */
class ReleasedEventStore implements EventStore {
    readonly #events = new Map<EventNumber, Occurrence>();
    readonly #releases = new Map<bigint, () => void>();
    #next = 1n;

    load() {
        return [];
    }

    add(occurrence: Occurrence) {
        const number = EventNumber(this.#next++);
        this.#events.set(number, occurrence);
        const added = createPromise<OccurrenceSummary>();
        this.#releases.set(number, () => added.resolver(OccurrenceSummary(number, occurrence)));
        return added.promise;
    }

    release(number: bigint) {
        const release = this.#releases.get(number);
        if (release === undefined) {
            throw new InternalError(`No pending add #${number}`);
        }
        this.#releases.delete(number);
        release();
    }

    get(number: EventNumber) {
        const event = this.#events.get(number);
        if (event === undefined) {
            throw new InternalError(`Invalid event occurrence #${number}`);
        }
        return event;
    }

    delete(number: EventNumber) {
        this.#events.delete(number);
    }

    clear() {
        this.#events.clear();
    }

    close() {}
}

function occurrence(): Occurrence {
    return {
        epochTimestamp: Timestamp(1_000),
        priority: Priority.Info,
        endpointId: EndpointNumber(1),
        clusterId: ClusterId(0x28),
        eventId: EventId(0),
        payload: { value: 1 },
    };
}

async function numbersOf(events: OccurrenceManager, eventMin?: EventNumber) {
    const numbers = new Array<bigint>();
    for await (const { number } of events.get(eventMin)) {
        numbers.push(number);
    }
    return numbers;
}

describe("OccurrenceManager", () => {
    it("keeps its index in number order when adds settle out of order", async () => {
        const store = new ReleasedEventStore();
        const events = new OccurrenceManager({ store });
        await events.construction;
        const first = events.add(occurrence());
        const second = events.add(occurrence());

        store.release(2n);
        await second;
        store.release(1n);
        await first;

        expect(await numbersOf(events)).deep.equal([1n, 2n]);
        expect(await numbersOf(events, EventNumber(2))).deep.equal([2n]);
    });

    it("reads each occurrence once when one is added below the read position", async () => {
        const store = new ReleasedEventStore();
        const events = new OccurrenceManager({ store });
        await events.construction;
        const first = events.add(occurrence());
        const second = events.add(occurrence());
        const third = events.add(occurrence());
        store.release(1n);
        await first;
        store.release(3n);
        await third;

        const numbers = new Array<bigint>();
        for await (const { number } of events.get()) {
            numbers.push(number);
            if (number === 3n) {
                store.release(2n);
                await second;
            }
        }

        expect(numbers).deep.equal([1n, 3n]);
        expect(await numbersOf(events)).deep.equal([1n, 2n, 3n]);
    });

    it("continues after the current occurrence when it is removed during a read", async () => {
        const store = new ReleasedEventStore();
        const events = new OccurrenceManager({ store });
        await events.construction;
        for (const number of [1n, 2n, 3n]) {
            const added = events.add(occurrence());
            store.release(number);
            await added;
        }

        const numbers = new Array<bigint>();
        for await (const { number } of events.get()) {
            numbers.push(number);
            if (number === 1n) {
                await events.remove(EventNumber(1));
            }
        }

        expect(numbers).deep.equal([1n, 2n, 3n]);
    });

    it("ends a read when the occurrences are cleared during it (characterization)", async () => {
        const store = new ReleasedEventStore();
        const events = new OccurrenceManager({ store });
        await events.construction;
        for (const number of [1n, 2n]) {
            const added = events.add(occurrence());
            store.release(number);
            await added;
        }

        const numbers = new Array<bigint>();
        for await (const { number } of events.get()) {
            numbers.push(number);
            await events.clear();
        }

        expect(numbers).deep.equal([1n]);
    });
});
