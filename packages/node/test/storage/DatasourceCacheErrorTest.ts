/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { ClientCacheBuffer } from "#storage/client/ClientCacheBuffer.js";
import { DatasourceCache } from "#storage/client/DatasourceCache.js";
import { MemoryStorageDriver, Seconds, StorageDriver } from "@matter/general";
import { Val } from "@matter/protocol";
import { EndpointNumber } from "@matter/types";

function createCache(options?: {
    buffer?: ClientCacheBuffer;
    localWriter?: {
        persistInTransaction: (...args: any[]) => Promise<void>;
        persist: (...args: any[]) => Promise<void>;
    };
}) {
    return new DatasourceCache({
        writer: (() => {}) as any,
        endpointNumber: EndpointNumber(1),
        behaviorId: "test",
        localWriter: options?.localWriter as any,
        buffer: options?.buffer,
    });
}

function attrs(entries: Record<string, unknown>): Val.StructMap {
    return new Map(Object.entries(entries));
}

/** A localWriter that records persist calls without touching the transaction's type-safe set() */
function trackingWriter() {
    const persisted: Val.Struct[] = [];
    return {
        persisted,
        persistInTransaction: async (_tx: any, _ep: any, _bid: any, vals: Val.Struct) => {
            persisted.push(vals);
        },
        persist: async (_ep: any, _bid: any, vals: Val.Struct) => {
            persisted.push(vals);
        },
        erase: async () => {},
    };
}

/** A localWriter that always throws */
function failingWriter(message = "No endpoint store for endpoint 1") {
    return {
        persistInTransaction: async () => {
            throw new Error(message);
        },
        persist: async () => {
            throw new Error(message);
        },
        erase: async () => {},
    };
}

describe("DatasourceCache error handling", () => {
    describe("externalSet guard", () => {
        it("blocks after erase", async () => {
            const dirty: DatasourceCache[] = [];
            const buffer = { markDirty: (c: DatasourceCache) => dirty.push(c), removeDirty: () => {} } as any;
            const cache = createCache({ buffer });

            await cache.externalSet(attrs({ onOff: true }));
            expect(dirty).length(1);

            dirty.length = 0;
            await cache.erase();
            await cache.externalSet(attrs({ onOff: false }));
            expect(dirty).length(0);
        });

        it("blocks after reclaimValues but re-enables on consumer assignment", async () => {
            const dirty: DatasourceCache[] = [];
            const buffer = { markDirty: (c: DatasourceCache) => dirty.push(c), removeDirty: () => {} } as any;
            const cache = createCache({ buffer });

            await cache.externalSet(attrs({ onOff: true }));
            expect(dirty).length(1);

            dirty.length = 0;
            const mockConsumer = {
                releaseValues: () => ({}),
                readValues: () => ({}),
                integrateExternalChange: async () => {},
            } as any;
            cache.consumer = mockConsumer;
            cache.reclaimValues();

            // Blocked after reclaim
            await cache.externalSet(attrs({ onOff: false }));
            expect(dirty).length(0);

            // Re-enabled after new consumer
            cache.consumer = {
                releaseValues: () => ({}),
                readValues: () => ({}),
                integrateExternalChange: async () => {},
            } as any;
            await cache.externalSet(attrs({ onOff: true }));
            expect(dirty).length(1);
        });
    });

    describe("restoreDirtyKeys", () => {
        it("is a no-op after erase", async () => {
            const cache = createCache();
            await cache.erase();
            cache.restoreDirtyKeys(new Set(["onOff"]));

            const result = await cache.flush();
            expect(result).undefined;
        });
    });
});

describe("ClientCacheBuffer error handling", () => {
    it("drops erased cache without crashing the batch", async () => {
        const driver = MemoryStorageDriver.create();
        const buffer = new ClientCacheBuffer(driver, Seconds(60));

        const healthy = trackingWriter();
        const healthyCache = createCache({ buffer, localWriter: healthy });

        const erasedCache = createCache({ buffer, localWriter: failingWriter() });

        // Mark both dirty with initial values so flush has data to write
        healthyCache.initialValues = { onOff: true };
        await healthyCache.externalSet(attrs({ onOff: true }));

        erasedCache.initialValues = { level: 50 };
        await erasedCache.externalSet(attrs({ level: 50 }));

        // Erase the broken cache, then re-add to dirty to simulate the race
        await erasedCache.erase();
        buffer.markDirty(erasedCache);

        // Flush should succeed — healthy cache persisted, erased cache dropped
        await buffer.flush();
        expect(healthy.persisted).length(1);
    });

    it("restores dirty keys on commit failure", async () => {
        let commitShouldFail = false;

        const driver = MemoryStorageDriver.create();
        const originalBegin = driver.begin.bind(driver);
        driver.begin = () => {
            const tx = originalBegin() as StorageDriver.Transaction;
            const originalCommit = tx.commit.bind(tx);
            tx.commit = () => {
                if (commitShouldFail) {
                    throw new Error("Simulated commit failure");
                }
                return originalCommit();
            };
            return tx;
        };

        const writer = trackingWriter();
        const buffer = new ClientCacheBuffer(driver, Seconds(60));
        const cache = createCache({ buffer, localWriter: writer });

        cache.initialValues = { onOff: false };
        await cache.externalSet(attrs({ onOff: true }));

        // First flush with commit failure
        commitShouldFail = true;
        try {
            await buffer.flush();
        } catch {
            // Expected
        }

        // Writer was called but commit failed
        expect(writer.persisted).length(1);

        // Retry should work because dirty keys were restored
        commitShouldFail = false;
        writer.persisted.length = 0;
        await buffer.flush();

        // Writer called again on retry
        expect(writer.persisted).length(1);
    });

    it("skips erased caches on commit failure restore", async () => {
        let commitShouldFail = true;

        const driver = MemoryStorageDriver.create();
        const originalBegin = driver.begin.bind(driver);
        driver.begin = () => {
            const tx = originalBegin() as StorageDriver.Transaction;
            const originalCommit = tx.commit.bind(tx);
            tx.commit = () => {
                if (commitShouldFail) {
                    throw new Error("Simulated commit failure");
                }
                return originalCommit();
            };
            return tx;
        };

        const writer = trackingWriter();
        const buffer = new ClientCacheBuffer(driver, Seconds(60));
        const cache = createCache({ buffer, localWriter: writer });

        cache.initialValues = { onOff: false };
        await cache.externalSet(attrs({ onOff: true }));

        // Erase after marking dirty
        await cache.erase();
        buffer.markDirty(cache);

        // Flush will fail at commit, erased cache should not be restored
        try {
            await buffer.flush();
        } catch {
            // Expected
        }

        // Second flush should be a no-op (erased cache was not restored)
        commitShouldFail = false;
        writer.persisted.length = 0;
        await buffer.flush();
        expect(writer.persisted).length(0);
    });
});
