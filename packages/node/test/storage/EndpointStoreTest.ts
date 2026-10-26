/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { EndpointStore } from "#storage/EndpointStore.js";
import { DatasourceStore } from "#storage/server/DatasourceStore.js";
import { ServerEndpointStore } from "#storage/server/ServerEndpointStore.js";
import { StoreClosedError } from "#storage/StoreLifecycle.js";
import { ImplementationError, Lifetime, MemoryStorageDriver, StorageManager, Transaction } from "@matter/general";
import { captureWarningsOf } from "../endpoint/validation/validation-helpers.js";
import { HoldingStorageDriver, WriteHold } from "./holding-storage-driver.js";

class InspectableEndpointStore extends EndpointStore {
    initialValuesOf(behaviorId: string) {
        return this.consumeInitialValues(behaviorId);
    }
}

class InspectableServerEndpointStore extends ServerEndpointStore {
    partStore(partId: string) {
        return this.storeForPartId(partId);
    }
}

async function loadedStore(prepare?: (context: ReturnType<StorageManager["createContext"]>) => Promise<void>) {
    const storage = new StorageManager(new MemoryStorageDriver());
    await storage.initialize();
    const context = storage.createContext("endpoint");
    await prepare?.(context);
    const store = new InspectableEndpointStore(context);
    await store.load();
    return { context, store };
}

describe("EndpointStore", () => {
    it("forgets the values it loaded once it is erased", async () => {
        const storage = new StorageManager(new MemoryStorageDriver());
        await storage.initialize();
        const context = storage.createContext("endpoint");
        await context.createContext("local").set("value", 1);
        const store = new InspectableEndpointStore(context);
        await store.load();

        await store.erase();

        expect(store.initialValuesOf("local")).equals(undefined);
        expect([...store.knownBehaviors]).deep.equals([]);
    });

    it("rejects a write once it is erased and stores nothing", async () => {
        const { context, store } = await loadedStore();
        await store.erase();

        await expect(store.set({ local: { value: 1 } })).rejectedWith(StoreClosedError);

        expect(await context.createContext("local").keys()).deep.equals([]);
    });

    it("lets a running write finish before it erases", async () => {
        const hold = new WriteHold("endpoint.local");
        const storage = new StorageManager(new HoldingStorageDriver({}, hold));
        await storage.initialize();
        const context = storage.createContext("endpoint");
        const store = new InspectableEndpointStore(context);
        await store.load();

        hold.arm();
        const writing = store.set({ local: { value: 1 } });
        await hold.writing.promise;
        const erasing = store.erase();
        await MockTime.yield();
        hold.write.resolver();
        await Promise.all([writing, erasing]);

        expect(await context.createContext("local").keys()).deep.equals([]);
    });

    it("lets a running write finish before it erases the storage of one behavior", async () => {
        const hold = new WriteHold("endpoint.local");
        const storage = new StorageManager(new HoldingStorageDriver({}, hold));
        await storage.initialize();
        const context = storage.createContext("endpoint");
        const store = new InspectableEndpointStore(context);
        await store.load();

        hold.arm();
        const writing = store.set({ local: { value: 1 } });
        await hold.writing.promise;
        const erasing = store.erase();
        await MockTime.yield();

        await expect(store.eraseStoreForBehavior("local")).rejectedWith(StoreClosedError);
        hold.write.resolver();
        await Promise.all([writing, erasing]);
        expect(await context.createContext("local").keys()).deep.equals([]);
    });

    it("does nothing when it is erased again", async () => {
        const { context, store } = await loadedStore();
        await store.erase();
        await context.createContext("local").set("value", 1);

        await store.erase();

        expect(await context.createContext("local").keys()).deep.equals(["value"]);
    });

    it("refuses an erase once it is closed and keeps its values", async () => {
        const { context, store } = await loadedStore(async context => {
            await context.createContext("local").set("value", 1);
        });
        await store.close();

        await expect(store.erase()).rejectedWith(StoreClosedError);
        expect(await context.createContext("local").keys()).deep.equals(["value"]);
    });

    it("completes a commit to an erased store without a warning and stores nothing", async () => {
        const { context, store } = await loadedStore();
        await store.erase();
        const datasourceStore = DatasourceStore(store, "local", undefined);

        const warnings = await captureWarningsOf(async () => {
            const transaction = Transaction.open("test", Lifetime.mock, "rw");
            await datasourceStore.set(transaction, { value: 1 });
            for (const participant of transaction.participants) {
                await participant.commit2?.();
            }
        });

        expect(warnings).deep.equals([]);
        expect(await context.createContext("local").keys()).deep.equals([]);
    });

    it("fails a commit whose write fails for another reason than an ended store", async () => {
        const { store } = await loadedStore();
        store.set = async () => {
            throw new ImplementationError("Write refused for test");
        };
        const datasourceStore = DatasourceStore(store, "local", undefined);
        const transaction = Transaction.open("test", Lifetime.mock, "rw");
        await datasourceStore.set(transaction, { value: 1 });

        const commits = [...transaction.participants].map(participant => participant.commit2?.());

        await expect(Promise.all(commits)).rejectedWith("Write refused for test");
    });

    async function rootWithPart() {
        const storage = new StorageManager(new MemoryStorageDriver());
        await storage.initialize();
        const context = storage.createContext("root");
        await context.createContext("parts").createContext("part1").createContext("local").set("value", 1);
        const root = new InspectableServerEndpointStore(context);
        await root.load();
        return { root, part: root.existingChildStore("part1")! };
    }

    it("ends the stores of its parts when it is erased", async () => {
        const { root, part } = await rootWithPart();

        await root.erase();

        await expect(part.set({ local: { value: 2 } })).rejectedWith(StoreClosedError);
    });

    it("refuses to persist its number once it is erased", async () => {
        const { root, part } = await rootWithPart();
        part.number = 7;

        await root.erase();

        await expect(part.saveNumber()).rejectedWith(StoreClosedError);
        await expect(root.saveNextNumber(8)).rejectedWith(StoreClosedError);
    });

    it("hands out no new part store and no behavior store once it is erased or closed", async () => {
        for (const end of ["erase", "close"] as const) {
            const { root } = await rootWithPart();

            await root[end]();

            expect(() => root.partStore("part2")).throws(StoreClosedError);
            expect(() => root.createStoreForBehavior("local")).throws(StoreClosedError);
        }
    });

    for (const end of ["erase", "close"] as const) {
        it(`refuses a new part store while a part store ends during its ${end}`, async () => {
            const hold = new WriteHold("parts.part1.local");
            const storage = new StorageManager(new HoldingStorageDriver({}, hold));
            await storage.initialize();
            const context = storage.createContext("root");
            const root = new InspectableServerEndpointStore(context);
            await root.load();
            const part = root.partStore("part1");

            hold.arm();
            const writing = part.set({ local: { value: 1 } });
            await hold.writing.promise;
            const ending = root[end]();
            await MockTime.yield();

            expect(() => root.partStore("part2")).throws(StoreClosedError);
            hold.write.resolver();
            await Promise.all([writing, ending]);
        });
    }

    it("ends the stores of its parts when it is closed", async () => {
        const { root, part } = await rootWithPart();

        await root.close();

        await expect(part.set({ local: { value: 2 } })).rejectedWith(StoreClosedError);
    });
});
