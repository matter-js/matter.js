/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { GROUP_DATA_COUNTER_RESERVE, GroupDataMessageCounter } from "#groups/GroupDataMessageCounter.js";
import { b$, MemoryStorageDriver, StandardCrypto, StorageContext, StorageManager } from "@matter/general";

const STORAGE_KEY = "groupDataCounter";

describe("GroupDataMessageCounter", () => {
    const crypto = new StandardCrypto();
    let storage: StorageContext;

    beforeEach(async () => {
        crypto.randomBytes = () => b$`12345678`;
        const driver = new MemoryStorageDriver();
        const manager = new StorageManager(driver);
        await manager.initialize();
        storage = manager.createContext("sessions");
    });

    it("random-inits in [1, 2^28] when no stored value and no seed", async () => {
        const counter = await GroupDataMessageCounter.create(crypto, storage, STORAGE_KEY);
        const expectedStart = (0x12345678 >>> 4) + 1;
        expect(await counter.getIncrementedCounter()).equal(expectedStart + 1);
    });

    it("reserves a block ahead on init (persists start + RESERVE)", async () => {
        const counter = await GroupDataMessageCounter.create(crypto, storage, STORAGE_KEY);
        const start = (0x12345678 >>> 4) + 1;
        expect(await storage.get<number>(STORAGE_KEY)).equal(start + GROUP_DATA_COUNTER_RESERVE);
        void counter;
    });

    it("does not write storage on increments within the reserved block", async () => {
        const counter = await GroupDataMessageCounter.create(crypto, storage, STORAGE_KEY);
        const persistedAfterInit = await storage.get<number>(STORAGE_KEY);
        await counter.getIncrementedCounter();
        await counter.getIncrementedCounter();
        expect(await storage.get<number>(STORAGE_KEY)).equal(persistedAfterInit);
    });

    it("re-reserves when crossing the reserved boundary", async () => {
        const counter = await GroupDataMessageCounter.create(crypto, storage, STORAGE_KEY);
        const start = (0x12345678 >>> 4) + 1;
        let last = 0;
        for (let i = 0; i < GROUP_DATA_COUNTER_RESERVE; i++) {
            last = await counter.getIncrementedCounter();
        }
        expect(last).equal(start + GROUP_DATA_COUNTER_RESERVE);
        expect(await storage.get<number>(STORAGE_KEY)).equal(start + 2 * GROUP_DATA_COUNTER_RESERVE);
    });

    it("never rolls back across a simulated restart", async () => {
        const first = await GroupDataMessageCounter.create(crypto, storage, STORAGE_KEY);
        const used = await first.getIncrementedCounter();

        const second = await GroupDataMessageCounter.create(crypto, storage, STORAGE_KEY);
        const resumed = await second.getIncrementedCounter();
        expect(resumed).greaterThan(used);
    });

    it("seeds from a migration value when no stored value exists", async () => {
        const seed = 5_000_000;
        const counter = await GroupDataMessageCounter.create(crypto, storage, STORAGE_KEY, seed);
        expect(await counter.getIncrementedCounter()).equal(seed + 1);
        expect(await storage.get<number>(STORAGE_KEY)).equal(seed + GROUP_DATA_COUNTER_RESERVE);
    });

    it("ignores the seed when a stored value already exists", async () => {
        await storage.set(STORAGE_KEY, 9_000_000);
        const counter = await GroupDataMessageCounter.create(crypto, storage, STORAGE_KEY, 1);
        expect(await counter.getIncrementedCounter()).equal(9_000_001);
    });

    it("rejects an out-of-range stored value", async () => {
        await storage.set(STORAGE_KEY, 0x1_0000_0000);
        await expect(GroupDataMessageCounter.create(crypto, storage, STORAGE_KEY)).rejectedWith(
            "Invalid group data counter value",
        );
    });
});
