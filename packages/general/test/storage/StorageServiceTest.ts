/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { MemoryStorageDriver } from "#storage/MemoryStorageDriver.js";
import { StorageService } from "#storage/StorageService.js";
import { Environment } from "../../src/environment/Environment.js";

describe("StorageService", () => {
    let env: Environment;
    let storageService: StorageService;

    beforeEach(() => {
        env = new Environment("test-storage-service");
        storageService = env.get(StorageService);

        storageService.defaultDriver = "memory";
        storageService.registerDriver({
            id: "memory",
            create() {
                return MemoryStorageDriver.create();
            },
        });
    });

    it("opening the same namespace twice returns usable managers", async () => {
        const manager1 = await storageService.open("ns");
        const manager2 = await storageService.open("ns");

        // Both managers must be fully initialized and functional
        const ctx1 = manager1.createContext("a");
        ctx1.set("key", "from-manager1");

        const ctx2 = manager2.createContext("a");
        expect(ctx2.get("key")).equal("from-manager1");

        await manager1.close();
        await manager2.close();
    });

    it("second open after close creates fresh driver", async () => {
        const manager1 = await storageService.open("ns");
        const ctx1 = manager1.createContext("a");
        ctx1.set("key", "value1");
        await manager1.close();

        const manager2 = await storageService.open("ns");
        const ctx2 = manager2.createContext("a");
        // Fresh driver — no data from previous session
        expect(ctx2.has("key")).equal(false);

        await manager2.close();
    });
});
