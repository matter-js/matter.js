/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { BaseEventStore } from "#events/BaseEventStore.js";
import type { Occurrence } from "#events/Occurrence.js";
import { OccurrenceManager } from "#events/OccurrenceManager.js";
import { VolatileEventStore } from "#events/VolatileEventStore.js";
import {
    createPromise,
    ImplementationError,
    InternalError,
    MaybePromise,
    MemoryStorageDriver,
    StorageManager,
    Timestamp,
    type StorageContext,
    type SupportedStorageTypes,
} from "@matter/general";
import { EventNumber, Priority } from "@matter/types";

/**
 * A memory driver whose writes wait for {@link hold} to settle while one is set.  With {@link holdEach}, each write
 * waits for its own release in {@link released}.
 */
class HeldStorageDriver extends MemoryStorageDriver {
    hold?: Promise<void>;
    holdEach = false;
    readonly released = new Array<() => void>();

    override set(
        contexts: string[],
        keyOrValues: string | Record<string, SupportedStorageTypes>,
        value?: SupportedStorageTypes,
    ) {
        if (this.holdEach) {
            const release = createPromise<void>();
            this.released.push(release.resolver);
            return release.promise.then(() => super.set(contexts, keyOrValues, value));
        }
        const hold = this.hold;
        if (hold === undefined) {
            return super.set(contexts, keyOrValues, value);
        }
        return hold.then(() => super.set(contexts, keyOrValues, value));
    }
}

async function context(driver = new MemoryStorageDriver()) {
    const manager = new StorageManager(driver);
    await manager.initialize();
    return manager.createContext("events");
}

/** Whether `promise` settles before pending microtasks run out. */
async function settlesNow(promise: PromiseLike<unknown>) {
    let settled = false;
    promise.then(
        () => (settled = true),
        () => (settled = true),
    );
    for (let i = 0; i < 10; i++) {
        await Promise.resolve();
    }
    return settled;
}

async function newStore(ctx?: StorageContext) {
    const store = new VolatileEventStore(ctx ?? (await context()));
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

    it("forgets a deleted occurrence", async () => {
        const store = await newStore();
        const summary = await store.add(occurrence());

        await store.delete(summary.number);

        expect(() => store.get(summary.number)).throws(InternalError, "Invalid event occurrence");
    });

    describe("numbering", () => {
        it("hands out a number only once the reservation covering it is stored", async () => {
            const driver = new HeldStorageDriver();
            const store = new VolatileEventStore(await context(driver));
            await store.load();
            const release = createPromise<void>();
            driver.hold = release.promise;

            const added = store.add(occurrence());

            expect(await settlesNow(Promise.resolve(added))).equal(false);
            release.resolver();
            expect((await added).number).equal(1n);
        });

        it("waits on close for the reservation being stored", async () => {
            const driver = new HeldStorageDriver();
            const store = new VolatileEventStore(await context(driver));
            await store.load();
            const release = createPromise<void>();
            driver.hold = release.promise;
            const added = store.add(occurrence());

            const closed = store.close();

            expect(await settlesNow(Promise.resolve(closed))).equal(false);
            release.resolver();
            await closed;
            await added;
        });

        it("hands out numbers synchronously again once the reservation is stored", async () => {
            const driver = new HeldStorageDriver();
            const store = new VolatileEventStore(await context(driver));
            await store.load();
            const release = createPromise<void>();
            driver.hold = release.promise;
            const first = store.add(occurrence());
            release.resolver();
            await first;

            const next = store.add(occurrence());

            expect(MaybePromise.is(next)).equal(false);
        });

        it("stores queued reservations in order", async () => {
            const driver = new HeldStorageDriver();
            const ctx = await context(driver);
            const store = new VolatileEventStore(ctx, 1);
            await store.load();
            driver.holdEach = true;

            // Latest write released first, so writes that were not queued would land out of order
            const both = Promise.all([store.add(occurrence()), store.add(occurrence())]);
            let settled = false;
            both.then(
                () => (settled = true),
                () => (settled = true),
            );
            while (!settled) {
                driver.released.pop()?.();
                await new Promise(resolve => setTimeout(resolve, 0));
            }
            const [, last] = await both;

            driver.holdEach = false;
            const restarted = await newStore(ctx);
            expect((await restarted.add(occurrence())).number > last.number).equal(true);
        });

        it("converts events a non-volatile store left behind", async () => {
            const ctx = await context();
            await ctx.createContext("events").set("7", { value: 1 });

            const store = await newStore(ctx);

            expect((await store.add(occurrence())).number).equal(8n);
        });

        it("keeps the numbering of converted events across a restart before the next event", async () => {
            const ctx = await context();
            await ctx.createContext("events").set("7", { value: 1 });
            await newStore(ctx);

            const restarted = await newStore(ctx);

            expect((await restarted.add(occurrence())).number).equal(8n);
        });

        it("ignores a stored reservation below 1", async () => {
            const ctx = await context();
            await ctx.set(BaseEventStore.LAST_RESERVED_NUMBER_KEY, 0n);

            const store = await newStore(ctx);

            expect((await store.add(occurrence())).number).equal(1n);
        });

        it("refuses a block size that is not a non-negative integer", async () => {
            const ctx = await context();

            expect(() => new VolatileEventStore(ctx, 1.5)).throws(ImplementationError, "block size");
        });

        it("covers at least the number it hands out with a block size of 0", async () => {
            const ctx = await context();
            const store = new VolatileEventStore(ctx, 0);
            await store.load();
            const last = await store.add(occurrence());

            const restarted = await newStore(ctx);

            expect((await restarted.add(occurrence())).number).equal(last.number + 1n);
        });
    });

    it("throws for an unknown event number", async () => {
        const store = await newStore();

        expect(() => store.get(EventNumber(999n))).throws(InternalError, "Invalid event occurrence");
    });

    describe("clear", () => {
        it("numbers from 1 again without keepNumbering (characterization)", async () => {
            const store = await newStore();
            await store.add(occurrence());
            await store.add(occurrence());

            await store.clear();

            expect((await store.add(occurrence())).number).equal(1n);
        });

        it("reserves again for the numbers it hands out after a plain clear", async () => {
            const ctx = await context();
            const store = await newStore(ctx);
            await store.add(occurrence());
            await store.clear();
            const last = await store.add(occurrence());

            const restarted = await newStore(ctx);

            expect((await restarted.add(occurrence())).number > last.number).equal(true);
        });

        it("continues numbering with keepNumbering", async () => {
            const store = await newStore();
            await store.add(occurrence());
            const last = await store.add(occurrence());

            await store.clear({ keepNumbering: true });

            expect((await store.add(occurrence())).number).equal(last.number + 1n);
        });

        it("continues numbering across a restart with keepNumbering", async () => {
            const ctx = await context();
            const store = await newStore(ctx);
            const last = await store.add(occurrence());
            await store.clear({ keepNumbering: true });

            const restarted = await newStore(ctx);

            expect((await restarted.add(occurrence())).number).equal(last.number + 1n);
        });

        it("reserves numbers from the kept numbering on, not from 1", async () => {
            const ctx = await context();
            const store = new VolatileEventStore(ctx, 2);
            await store.load();
            for (let i = 0; i < 5; i++) {
                await store.add(occurrence());
            }
            await store.clear({ keepNumbering: true });
            const last = await store.add(occurrence());

            const restarted = await newStore(ctx);

            expect((await restarted.add(occurrence())).number > last.number).equal(true);
        });

        it("is passed through by OccurrenceManager", async () => {
            const store = await newStore();
            const events = new OccurrenceManager({ store });
            await events.construction;
            const last = await store.add(occurrence());

            await events.clear({ keepNumbering: true });

            expect((await store.add(occurrence())).number).equal(last.number + 1n);
        });
    });
});
