/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { BaseEventStore } from "#events/BaseEventStore.js";
import { NonvolatileEventStore } from "#events/NonvolatileEventStore.js";
import type { Occurrence } from "#events/Occurrence.js";
import { OccurrenceManager } from "#events/OccurrenceManager.js";
import {
    MemoryStorageDriver,
    StorageManager,
    Timestamp,
    type StorageContext,
    type SupportedStorageTypes,
} from "@matter/general";
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

    it("continues numbering across a restart after every event was deleted", async () => {
        const ctx = await context();
        const store = await newStore(ctx);
        const first = await store.add(occurrence());
        const last = await store.add(occurrence());
        await store.delete(first.number);
        await store.delete(last.number);

        const restarted = await newStore(ctx);

        expect((await restarted.add(occurrence())).number > last.number).equal(true);
    });

    it("keeps its reservation once events are stored", async () => {
        const ctx = await context();
        const store = await newStore(ctx);

        await store.add(occurrence());

        expect(await ctx.has(BaseEventStore.LAST_RESERVED_NUMBER_KEY)).equal(true);
    });

    it("continues after the events an older version stored without a reservation", async () => {
        const ctx = await context();
        await ctx.createContext("events").set("7", occurrence() as unknown as SupportedStorageTypes);

        const store = await newStore(ctx);

        expect((await store.add(occurrence())).number).equal(8n);
    });

    describe("clear", () => {
        it("numbers from 1 again without keepNumbering (characterization)", async () => {
            const ctx = await context();
            const store = await newStore(ctx);
            await store.add(occurrence());
            await store.add(occurrence());

            await store.clear();

            expect((await store.add(occurrence())).number).equal(1n);
            expect(await new NonvolatileEventStore(ctx).load()).length(1);
        });

        it("discards persisted events and continues numbering across a restart with keepNumbering", async () => {
            const ctx = await context();
            const store = await newStore(ctx);
            await store.add(occurrence());
            const last = await store.add(occurrence());

            await store.clear({ keepNumbering: true });
            expect(await new NonvolatileEventStore(ctx).load()).deep.equal([]);

            const restarted = await newStore(ctx);

            expect((await restarted.add(occurrence())).number).equal(last.number + 1n);
        });

        it("continues numbering across a restart after events were persisted again", async () => {
            const ctx = await context();
            const store = await newStore(ctx);
            await store.add(occurrence());
            await store.clear({ keepNumbering: true });
            const last = await store.add(occurrence());

            const restarted = await newStore(ctx);

            expect((await restarted.add(occurrence())).number > last.number).equal(true);
        });

        it("is passed through by OccurrenceManager", async () => {
            const ctx = await context();
            const store = await newStore(ctx);
            const events = new OccurrenceManager({ store });
            await events.construction;
            const last = await events.add(occurrence());

            await events.clear({ keepNumbering: true });

            expect((await events.add(occurrence())).number).equal(last.number + 1n);
        });
    });
});
