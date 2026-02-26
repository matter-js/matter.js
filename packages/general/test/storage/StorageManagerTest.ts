/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { StorageBackendMemory } from "#storage/StorageBackendMemory.js";
import { StorageError } from "#storage/StorageDriver.js";
import { StorageManager } from "#storage/StorageManager.js";

describe("StorageManager", () => {
    it("create StorageContext write and read success", async () => {
        const storage = new StorageBackendMemory();

        const storageManager = new StorageManager(storage);

        await storageManager.initialize();

        const storageContext = storageManager.createContext("context");

        storageContext.set("key", "value");

        const valueFromStorage = storageContext.get("key");
        expect(valueFromStorage).equal("value");
    });

    it("creating StorageManager without initialize throws error when creating StorageContext", async () => {
        const storage = new StorageBackendMemory();

        const storageManager = new StorageManager(storage);

        expect(() => {
            storageManager.createContext("context");
        }).throw(StorageError, "The storage needs to be initialized first!");
    });

    it("creating StorageContext with  dot in name fails", async () => {
        const storage = new StorageBackendMemory();

        const storageManager = new StorageManager(storage);
        await storageManager.initialize();

        expect(() => {
            storageManager.createContext("my.context");
        }).throw(StorageError, "Context must not contain dots!");
    });

    it("getting same StorageContext context access same data", async () => {
        const storage = new StorageBackendMemory();

        const storageManager = new StorageManager(storage);

        await storageManager.initialize();

        const storageContext1 = storageManager.createContext("context");
        const storageContext2 = storageManager.createContext("context");

        storageContext1.set("key", "value");

        const valueFromStorage2 = storageContext2.get("key");
        expect(valueFromStorage2).equal("value");
    });

    it("getting same StorageContext context access same data with subcontext", async () => {
        const storage = new StorageBackendMemory();

        const storageManager = new StorageManager(storage);

        await storageManager.initialize();

        const storageContext1 = storageManager.createContext("context");
        const storageSubContext1 = storageContext1.createContext("subcontext");
        const storageContext2 = storageManager.createContext("context");
        const storageSubContext2 = storageContext2.createContext("subcontext");

        storageSubContext1.set("key", "value");

        const valueFromStorage2 = storageSubContext2.get("key");
        expect(valueFromStorage2).equal("value");
    });
});
