/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import type { Occurrence } from "#events/Occurrence.js";
import { VolatileEventStore } from "#events/VolatileEventStore.js";
import { InternalError, MemoryStorageDriver, StorageManager, Timestamp } from "@matter/general";
import { EventNumber, Priority } from "@matter/types";

async function newStore() {
    const manager = new StorageManager(new MemoryStorageDriver());
    await manager.initialize();
    const store = new VolatileEventStore(manager.createContext("events"));
    await store.load();
    return store;
}

function occurrence(): Occurrence {
    return { epochTimestamp: Timestamp(1_000), priority: Priority.Info, payload: { value: 1 } } as Occurrence;
}

describe("VolatileEventStore", () => {
    it("loads empty on a fresh store", async () => {
        const manager = new StorageManager(new MemoryStorageDriver());
        await manager.initialize();
        const store = new VolatileEventStore(manager.createContext("events"));

        expect(await store.load()).deep.equal([]);
    });

    it("assigns sequential event numbers", async () => {
        const store = await newStore();

        const first = await store.add(occurrence());
        const second = await store.add(occurrence());

        expect(second.number).equal(first.number + 1n);
    });

    it("retrieves a stored occurrence by number", async () => {
        const store = await newStore();
        const occ = occurrence();

        const summary = await store.add(occ);

        expect(store.get(summary.number)).equal(occ);
    });

    it("throws for an unknown event number", async () => {
        const store = await newStore();

        expect(() => store.get(EventNumber(999n))).throws(InternalError, "Invalid event occurrence");
    });
});
