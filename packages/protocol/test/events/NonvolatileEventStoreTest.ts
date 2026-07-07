/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { NonvolatileEventStore } from "#events/NonvolatileEventStore.js";
import type { Occurrence } from "#events/Occurrence.js";
import { MemoryStorageDriver, StorageManager, Timestamp, type StorageContext } from "@matter/general";
import { Priority } from "@matter/types";

async function context() {
    const manager = new StorageManager(new MemoryStorageDriver());
    await manager.initialize();
    return manager.createContext("events");
}

async function newStore(ctx: StorageContext) {
    const store = new NonvolatileEventStore(ctx);
    await store.load();
    return store;
}

function occurrence(): Occurrence {
    return { epochTimestamp: Timestamp(1_000), priority: Priority.Info, payload: { value: 1 } } as Occurrence;
}

describe("NonvolatileEventStore", () => {
    it("assigns sequential event numbers", async () => {
        const store = await newStore(await context());

        const first = await store.add(occurrence());
        const second = await store.add(occurrence());

        expect(second.number).equal(first.number + 1n);
    });

    it("persists an occurrence retrievable by number", async () => {
        const store = await newStore(await context());
        const occ = occurrence();

        const summary = await store.add(occ);

        expect(await store.get(summary.number)).deep.equal(occ);
    });

    it("reloads persisted events into a new store", async () => {
        const ctx = await context();
        const summary = await (await newStore(ctx)).add(occurrence());

        const index = await new NonvolatileEventStore(ctx).load();

        expect(index.map(entry => entry.number)).deep.contain(summary.number);
    });

    it("deletes an event", async () => {
        const ctx = await context();
        const store = await newStore(ctx);
        const summary = await store.add(occurrence());

        await store.delete(summary.number);

        const index = await new NonvolatileEventStore(ctx).load();
        expect(index.map(entry => entry.number)).not.deep.contain(summary.number);
    });
});
