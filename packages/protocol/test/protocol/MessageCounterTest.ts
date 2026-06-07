/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { MAX_COUNTER_VALUE_32BIT, MessageCounter, PersistedMessageCounter } from "#protocol/MessageCounter.js";
import {
    b$,
    InternalError,
    MemoryStorageDriver,
    StandardCrypto,
    StorageContext,
    StorageManager,
} from "@matter/general";

describe("MessageCounter", () => {
    const crypto = new StandardCrypto();
    let testStorageContext: StorageContext;

    beforeEach(async () => {
        crypto.randomBytes = () => b$`12345678`;
        const testStorage = new MemoryStorageDriver();
        const testStorageManager = new StorageManager(testStorage);
        await testStorageManager.initialize();
        testStorageContext = testStorageManager.createContext("TestContext");
    });

    describe("General Messagecounter tests", () => {
        it("gets initialized with a random value modified to 28bit", async () => {
            const messageCounter = new MessageCounter(crypto);
            expect(await messageCounter.getIncrementedCounter()).to.equal((0x12345679 >>> 4) + 2);
        });

        it("counter increases by 1", async () => {
            const messageCounter = new MessageCounter(crypto);
            const initCounter = await messageCounter.getIncrementedCounter();
            expect(initCounter).to.equal((0x12345679 >>> 4) + 2);
            expect(await messageCounter.getIncrementedCounter()).to.equal(initCounter + 1);
        });
    });

    describe("Persisted MessageCounter tests", () => {
        it("persistent initialization of counter with no persisted value", async () => {
            const messageCounter = await PersistedMessageCounter.create(crypto, testStorageContext, "counter");
            const counter = await messageCounter.getIncrementedCounter();
            expect(counter).to.equal((0x12345679 >>> 4) + 2);
            expect(testStorageContext.get<number>("counter"), counter.toString());
        });

        it("persistent initialization of counter with persisted value", async () => {
            await testStorageContext.set("counter", 0x12345678);
            const messageCounter = await PersistedMessageCounter.create(crypto, testStorageContext, "counter");
            const counter = await messageCounter.getIncrementedCounter();
            expect(counter).to.equal(0x12345679);
            expect(testStorageContext.get<number>("counter"), counter.toString());
        });

        it("persisted counter increases by 1", async () => {
            crypto.randomBytes = () => b$`23456789`;
            await testStorageContext.set("counter", 0x12345678);
            const messageCounter = await PersistedMessageCounter.create(crypto, testStorageContext, "counter");
            const initCounter = await messageCounter.getIncrementedCounter();
            expect(initCounter).to.equal(0x12345679);
            expect(testStorageContext.get<number>("counter"), initCounter.toString());
            expect(await messageCounter.getIncrementedCounter()).to.equal(initCounter + 1);
            expect(testStorageContext.get<number>("counter"), (initCounter + 1).toString());
        });

        it("persisted counter constructor throws in negative value in storage", async () => {
            await testStorageContext.set("counter", -1);
            await expect(PersistedMessageCounter.create(crypto, testStorageContext, "counter")).rejectedWith(
                "Invalid message counter value: -1",
            );
        });

        it("persisted counter constructor throws in too large value in storage", async () => {
            const tooLarge = MAX_COUNTER_VALUE_32BIT + 1;
            await testStorageContext.set("counter", tooLarge);
            await expect(PersistedMessageCounter.create(crypto, testStorageContext, "counter")).rejectedWith(
                `Invalid message counter value: ${tooLarge}`,
            );
        });
    });

    // Rollover tests use persisted message counter class because easier to inject the "high" value and code is the same
    describe("MessageCounter rollover tests", () => {
        it("Message counter throws if rollover is not allowed", async () => {
            await testStorageContext.set("counter", MAX_COUNTER_VALUE_32BIT);
            const messageCounter = await PersistedMessageCounter.create(crypto, testStorageContext, "counter");
            await expect(messageCounter.getIncrementedCounter()).rejectedWith(
                InternalError,
                "Message counter rollover not allowed.",
            );
        });

        it("emits 0xFFFFFFFF before rolling over to 0", async () => {
            await testStorageContext.set("counter", 0xfffffffe);
            const messageCounter = await PersistedMessageCounter.create(crypto, testStorageContext, "counter", {
                aboutToRolloverCallback: async () => {},
            });
            expect(await messageCounter.getIncrementedCounter()).equals(0xffffffff);
            expect(await messageCounter.getIncrementedCounter()).equals(0);
        });

        it("Message counter rolls over if allowed", async () => {
            await testStorageContext.set("counter", MAX_COUNTER_VALUE_32BIT);
            const messageCounter = await PersistedMessageCounter.create(crypto, testStorageContext, "counter", {
                aboutToRolloverCallback: async () => {},
            });
            expect(await messageCounter.getIncrementedCounter()).equals(0);
        });

        it("Message counter rolls over if allowed and calls callback on increase once", async () => {
            const initCounter = MAX_COUNTER_VALUE_32BIT - 101;
            await testStorageContext.set("counter", initCounter);
            let callbackCalled = false;
            const messageCounter = await PersistedMessageCounter.create(crypto, testStorageContext, "counter", {
                aboutToRolloverCallback: async () => {
                    callbackCalled = true;
                },
                rolloverInfoDifference: 100,
            });
            expect(callbackCalled).to.be.false;
            expect(await messageCounter.getIncrementedCounter()).equals(initCounter + 1);
            expect(callbackCalled).to.be.true;
            callbackCalled = false;
            expect(await messageCounter.getIncrementedCounter()).equals(initCounter + 2);
            expect(callbackCalled).to.be.false;
        });

        it("Message counter rolls over if allowed and calls callback already on init once", async () => {
            const initCounter = MAX_COUNTER_VALUE_32BIT - 100;
            await testStorageContext.set("counter", initCounter);
            let callbackCalled = false;
            const messageCounter = await PersistedMessageCounter.create(crypto, testStorageContext, "counter", {
                aboutToRolloverCallback: async () => {
                    callbackCalled = true;
                },
                rolloverInfoDifference: 100,
            });
            expect(callbackCalled).to.be.true;
            callbackCalled = false;
            expect(await messageCounter.getIncrementedCounter()).equals(initCounter + 1);
            expect(callbackCalled).to.be.false;
        });

        it("reserves a block ahead and does not write storage within the block", async () => {
            const messageCounter = await PersistedMessageCounter.create(crypto, testStorageContext, "counter", {
                reserve: 1000,
            });
            const start = (0x12345678 >>> 4) + 1;
            expect(await testStorageContext.get<number>("counter")).equal(start + 1000);
            await messageCounter.getIncrementedCounter();
            await messageCounter.getIncrementedCounter();
            expect(await testStorageContext.get<number>("counter")).equal(start + 1000);
        });

        it("never rolls back across a restart when reserving", async () => {
            const first = await PersistedMessageCounter.create(crypto, testStorageContext, "counter", {
                reserve: 1000,
            });
            const used = await first.getIncrementedCounter();
            const second = await PersistedMessageCounter.create(crypto, testStorageContext, "counter", {
                reserve: 1000,
            });
            expect(await second.getIncrementedCounter()).greaterThan(used);
        });

        it("seeds the initial value when nothing is persisted", async () => {
            const messageCounter = await PersistedMessageCounter.create(crypto, testStorageContext, "counter", {
                seed: 5_000_000,
            });
            expect(await messageCounter.getIncrementedCounter()).equal(5_000_001);
        });

        it("ignores the seed when a value is already persisted", async () => {
            await testStorageContext.set("counter", 9_000_000);
            const messageCounter = await PersistedMessageCounter.create(crypto, testStorageContext, "counter", {
                seed: 1,
            });
            expect(await messageCounter.getIncrementedCounter()).equal(9_000_001);
        });

        it("rejects a non-numeric persisted value", async () => {
            await testStorageContext.set("counter", "not-a-number");
            await expect(PersistedMessageCounter.create(crypto, testStorageContext, "counter")).rejectedWith(
                "Invalid message counter value",
            );
        });
    });
});
