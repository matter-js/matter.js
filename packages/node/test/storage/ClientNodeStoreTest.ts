/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { ClientCacheBuffer } from "#storage/client/ClientCacheBuffer.js";
import { ClientNodeStore } from "#storage/client/ClientNodeStore.js";
import { ClientNodeStores } from "#storage/client/ClientNodeStores.js";
import { DatasourceCache } from "#storage/client/DatasourceCache.js";
import { StoreClosedError } from "#storage/StoreLifecycle.js";
import {
    createPromise,
    DestroyedDependencyError,
    ImplementationError,
    InternalError,
    Lifecycle,
    MatterAggregateError,
    MemoryStorageDriver,
    Seconds,
    StorageError,
    StorageManager,
} from "@matter/general";
import { EndpointNumber } from "@matter/types";
import { HoldingStorageDriver, WriteHold } from "./holding-storage-driver.js";

async function storeWith(prepare?: (storage: StorageManager) => Promise<void>, driver = new MemoryStorageDriver()) {
    const storage = new StorageManager(driver);
    await storage.initialize();
    await prepare?.(storage);
    const store = new ClientNodeStore("peer1", storage.createContext("peer1"), true);
    store.construction.start();
    await store.construction.ready;
    return { driver, storage, store };
}

const legacyNetworkOf = (storage: StorageManager) =>
    storage.createContext("peer1").createContext("endpoints").createContext("0").createContext("network");

const behaviorStorageOf = (storage: StorageManager, endpoint: string, behaviorId: string) =>
    storage.createContext("peer1").createContext("endpoints").createContext(endpoint).createContext(behaviorId);

describe("ClientNodeStore", () => {
    it("does not write the disabled flag again when it is unchanged", async () => {
        const { driver, store } = await storeWith();
        let writes = 0;
        const set = driver.set.bind(driver);
        driver.set = (...args: Parameters<typeof set>) => {
            writes++;
            return set(...args);
        };

        await store.recordNodeDisabled(true);
        await store.recordNodeDisabled(true);

        expect(store.isNodeDisabled).equals(true);
        expect(writes).equals(1);
    });

    it("adopts the disabled flag an earlier version stored in the network state and removes it", async () => {
        const { storage, store } = await storeWith(async storage => {
            await legacyNetworkOf(storage).set({ isDisabled: true, autoSubscribe: true });
        });

        expect(store.isNodeDisabled).equals(true);
        expect(await legacyNetworkOf(storage).has("isDisabled")).equals(false);
        expect(await legacyNetworkOf(storage).get("autoSubscribe")).equals(true);
    });

    // Characterization: the cache erase never touched the settings storage
    it("keeps the disabled flag when it erases its caches", async () => {
        const { storage, store } = await storeWith();
        await store.recordNodeDisabled(true);

        await store.eraseCaches();

        expect(store.isNodeDisabled).equals(true);
        expect(await storage.createContext("peer1").createContext("settings").get("isDisabled")).equals(true);
    });

    it("erases a cluster cache persisted without a data version and keeps local state", async () => {
        const { storage, store } = await storeWith(async storage => {
            // A report of a non-wildcard read persists attribute values without a data version
            await behaviorStorageOf(storage, "1", "6").set({ 0: true });
            await behaviorStorageOf(storage, "0", "commissioning").set({ addresses: [] });
        });

        await store.eraseCaches();

        expect(await behaviorStorageOf(storage, "1", "6").keys()).deep.equals([]);
        expect(await behaviorStorageOf(storage, "0", "commissioning").keys()).deep.equals(["addresses"]);
    });

    it("refuses to cache a cluster under a key other than its ID", async () => {
        const { store } = await storeWith(async storage => {
            await behaviorStorageOf(storage, "1", "6").set({ 0: true });
        });

        expect(() => store.storeForEndpointNumber(EndpointNumber(1)).createStoreForBehavior("onOff")).throws(
            ImplementationError,
            /under a key that is not its ID/,
        );
    });

    it("refuses to store a local behavior under a cluster ID", async () => {
        const { store } = await storeWith(async storage => {
            await behaviorStorageOf(storage, "1", "6").set({ 0: true });
        });

        expect(() => store.storeForEndpointNumber(EndpointNumber(1)).createStoreForLocalBehavior("6")).throws(
            ImplementationError,
            /under a cluster ID/,
        );
    });

    it("stops handing out the store of an endpoint whose erase failed", async () => {
        const { driver, store } = await storeWith(async storage => {
            await behaviorStorageOf(storage, "1", "6").set({ 0: true });
        });
        const clearAll = driver.clearAll.bind(driver);
        driver.clearAll = async () => {
            throw new ImplementationError("Clear refused for test");
        };

        await expect(store.eraseEndpointStore(EndpointNumber(1))).rejectedWith(
            StorageError,
            /^Cannot erase storage:.*endpoints\.1$/,
        );
        driver.clearAll = clearAll;

        expect(() => store.storeForEndpointNumber(EndpointNumber(1))).throws(InternalError, /No endpoint store/);
    });

    it("forgets a cache once the cache is erased", async () => {
        const { store } = await storeWith(async storage => {
            await behaviorStorageOf(storage, "1", "6").set({ 0: true });
        });
        store.write = async () => [];
        const endpointStore = store.storeForEndpointNumber(EndpointNumber(1));
        for (let i = 0; i < 3; i++) {
            await endpointStore.createStoreForBehavior("6").erase();
        }
        const live = endpointStore.createStoreForBehavior("6");

        const discarded = new Array<DatasourceCache>();
        const discard = DatasourceCache.prototype.discard;
        DatasourceCache.prototype.discard = function (this: DatasourceCache) {
            discarded.push(this);
            discard.call(this);
        };
        try {
            await endpointStore.erase();
        } finally {
            DatasourceCache.prototype.discard = discard;
        }

        expect(discarded.length).equals(1);
        expect(discarded[0]).equals(live);
    });

    // Characterization: the earlier fence waited for the flush as well; the clear now runs as the next job instead
    it("erases the cache of a dropped cluster after the flush that is held writing it", async () => {
        const hold = new WriteHold("endpoints.1.6");
        const { driver, storage, store } = await storeWith(
            async storage => {
                await behaviorStorageOf(storage, "1", "6").set({ 0: false });
            },
            new HoldingStorageDriver({}, hold),
        );
        store.write = async () => [];
        const buffer = new ClientCacheBuffer(driver, Seconds(60));
        store.buffer = buffer;
        const cache = store.storeForEndpointNumber(EndpointNumber(1)).createStoreForBehavior("6");
        await cache.externalSet(new Map([[0, true]]));

        hold.arm();
        const flushing = buffer.flush();
        await MockTime.resolve(hold.writing.promise);
        const erasing = cache.erase();
        for (let i = 0; i < 10; i++) {
            await MockTime.yield();
        }
        hold.write.resolver();
        await Promise.all([flushing, erasing]);
        await buffer.close();

        expect(await behaviorStorageOf(storage, "1", "6").keys()).deep.equals([]);
    });

    it("refuses writes and new behavior stores of its endpoints once it is closed", async () => {
        const { store } = await storeWith(async storage => {
            await behaviorStorageOf(storage, "1", "6").set({ 0: true });
            await behaviorStorageOf(storage, "1", "commissioning").set({ addresses: [] });
        });
        const endpointStore = store.storeForEndpointNumber(EndpointNumber(1));

        await store.close();

        await expect(endpointStore.set({ commissioning: { addresses: [] } })).rejectedWith(StoreClosedError);
        await expect(endpointStore.eraseStoreForBehavior("6")).rejectedWith(StoreClosedError);
        expect(() => endpointStore.createStoreForBehavior("6")).throws(StoreClosedError);
        expect(() => endpointStore.createStoreForLocalBehavior("commissioning")).throws(StoreClosedError);
    });

    it("ends the store also when it fails to erase its caches", async () => {
        const { driver, store } = await storeWith();
        driver.clearAll = async () => {
            throw new ImplementationError("Clear refused for test");
        };

        await expect(store.eraseCaches()).rejectedWith(MatterAggregateError);

        expect(store.construction.status).equals(Lifecycle.Status.Destroyed);
    });

    it("forgets the disabled flag when it is erased", async () => {
        const { storage, store } = await storeWith();
        await store.recordNodeDisabled(true);

        await store.erase();

        expect(store.isNodeDisabled).equals(false);
        expect(await storage.createContext("peer1").createContext("settings").has("isDisabled")).equals(false);
    });

    it("refuses to record the disabled flag before it loads", async () => {
        const storage = new StorageManager(new MemoryStorageDriver());
        await storage.initialize();
        const store = new ClientNodeStore("peer1", storage.createContext("peer1"), true);

        await expect(store.recordNodeDisabled(true)).rejectedWith(InternalError, /before load/);
    });
});

describe("ClientNodeStores", () => {
    async function storesWithPeer() {
        const driver = new MemoryStorageDriver();
        const storage = new StorageManager(driver);
        await storage.initialize();
        await storage
            .createContext("nodes")
            .createContext("peer1")
            .createContext("endpoints")
            .createContext("0")
            .createContext("commissioning")
            .set({ addresses: [] });
        const stores = new ClientNodeStores(storage.createContext("nodes"));
        await stores.construction.ready;
        return { driver, storage, stores, store: stores.storeForNode("peer1") };
    }

    /** The messages of the failures {@link promise} rejects with, unwrapping aggregates */
    async function failuresOf(promise: Promise<unknown>) {
        const messages = (e: unknown): string[] =>
            e instanceof MatterAggregateError
                ? e.errors.flatMap(messages)
                : [e instanceof Error ? e.message : String(e)];
        return promise.then(
            () => [],
            (e: unknown) => messages(e),
        );
    }

    const keysOf = (storage: StorageManager, id: string) => storage.createContext("nodes").createContext(id).contexts();

    it("keeps the store of a new node when an earlier store with the same ID erases again", async () => {
        const { storage, stores, store: earlier } = await storesWithPeer();
        await stores.eraseStore("peer1");

        const later = stores.storeForNode("peer1");
        await later.construction.ready;
        await later.recordNodeDisabled(true);
        await earlier.erase();

        expect(stores.storeOf("peer1")).equals(later);
        expect(
            await storage.createContext("nodes").createContext("peer1").createContext("settings").get("isDisabled"),
        ).equals(true);
        await stores.close();
    });

    it("erases also when what it waits for before the erase fails", async () => {
        const { storage, stores } = await storesWithPeer();

        const erasing = stores.eraseStore("peer1", async () => {
            throw new ImplementationError("Close refused for test");
        });

        await expect(erasing).rejectedWith(MatterAggregateError);
        expect(await failuresOf(erasing)).deep.equals(["Close refused for test"]);
        expect(await keysOf(storage, "peer1")).deep.equals([]);
        await stores.close();
    });

    it("reports both a failure before the erase and a failure of the erase", async () => {
        const { driver, stores } = await storesWithPeer();
        driver.clearAll = async () => {
            throw new ImplementationError("Clear refused for test");
        };

        const failures = await failuresOf(
            stores.eraseStore("peer1", async () => {
                throw new ImplementationError("Close refused for test");
            }),
        );

        expect(failures[0]).equals("Close refused for test");
        expect(failures.slice(1)).contains("Clear refused for test");
        await stores.close();
    });

    it("opens no store while all stores are erased", async () => {
        const { stores } = await storesWithPeer();
        const prepared = createPromise<void>();
        const erasing = stores.eraseStore("peer1", () => prepared.promise);

        const resetting = stores.erase();
        expect(() => stores.storeForNode("peer2")).throws(StoreClosedError, /all client stores are being erased/);
        expect(stores.storeOf("peer3")).undefined;
        prepared.resolver();
        await Promise.all([erasing, resetting]);

        expect(stores.storeForNode("peer2")).not.undefined;
        await stores.close();
    });

    it("registers an erase before what it waits for runs", async () => {
        const { stores } = await storesWithPeer();
        let handedOut: unknown;

        await stores.eraseStore("peer1", async () => {
            try {
                handedOut = stores.storeForNode("peer1");
            } catch (e) {
                handedOut = e;
            }
        });

        expect(handedOut).instanceOf(StoreClosedError);
        await stores.close();
    });

    it("hands out a new store that loads what remains once it erases the cache of a store", async () => {
        const { stores, store } = await storesWithPeer();

        await stores.eraseCaches("peer1");

        const renewed = stores.storeOf("peer1");
        expect(renewed).not.undefined;
        expect(renewed).not.equals(store);
        expect([...(renewed?.endpointStores ?? [])].map(({ number }) => number)).deep.equals([0]);
        await expect(store.recordNodeDisabled(true)).rejectedWith(StoreClosedError);
        expect(() =>
            store.storeForEndpointNumber(EndpointNumber(0)).createStoreForLocalBehavior("commissioning"),
        ).throws(StoreClosedError);
        await stores.close();
    });

    it("gives the new store of an erased cache the buffer of the store it replaces", async () => {
        const { driver, stores, store } = await storesWithPeer();
        const buffer = new ClientCacheBuffer(driver, Seconds(60));
        store.buffer = buffer;

        await stores.eraseCaches("peer1");

        expect(stores.storeOf("peer1")?.buffer).equals(buffer);
        await stores.close();
        await buffer.close();
    });

    it("hands out a new store also when the cache erase fails", async () => {
        const { stores, store } = await storesWithPeer();
        store.eraseCaches = async () => {
            throw new ImplementationError("Cache erase refused for test");
        };

        expect(await failuresOf(stores.eraseCaches("peer1"))).deep.equals(["Cache erase refused for test"]);

        const renewed = stores.storeOf("peer1");
        expect(renewed).not.undefined;
        expect(renewed).not.equals(store);
        await renewed?.recordNodeDisabled(true);
        expect(renewed?.isNodeDisabled).equals(true);
        await stores.close();
    });

    it("hands out no store while it erases one and never opens one on a lookup", async () => {
        const { stores } = await storesWithPeer();
        const prepared = createPromise<void>();

        const erasing = stores.eraseStore("peer1", () => prepared.promise);

        expect(stores.storeOf("peer1")).undefined;
        expect(stores.storeOf("peer2")).undefined;
        expect(stores.knownIds).deep.equals([]);
        prepared.resolver();
        await erasing;
        await stores.close();
    });

    it("runs a second erase of the same ID after the first, on the store the first one opened", async () => {
        const { storage, stores } = await storesWithPeer();

        await Promise.all([stores.eraseCaches("peer1"), stores.eraseStore("peer1")]);

        expect(stores.storeOf("peer1")).undefined;
        expect(await keysOf(storage, "peer1")).deep.equals([]);
        await stores.close();
    });

    it("waits for an erase of a store that was requested before it erases everything", async () => {
        const { stores } = await storesWithPeer();
        const prepared = createPromise<void>();
        const erasing = stores.eraseStore("peer1", () => prepared.promise);

        let erasedAll = false;
        const erasingAll = stores.erase().then(() => (erasedAll = true));
        for (let i = 0; i < 10; i++) {
            await MockTime.yield();
        }

        expect(erasedAll).equals(false);
        prepared.resolver();
        await Promise.all([erasing, erasingAll]);
        await stores.close();
    });

    it("waits for an erase that was requested before it closes and refuses one requested later", async () => {
        const { storage, stores } = await storesWithPeer();
        const prepared = createPromise<void>();
        const erasing = stores.eraseStore("peer1", () => prepared.promise);

        const order = new Array<string>();
        const closing = stores.close().then(() => order.push("closed"));
        const erased = erasing.then(
            () => order.push("erased"),
            (e: unknown) => order.push(`erase failed: ${e}`),
        );
        const refused = stores.eraseStore("peer2").then(
            () => undefined,
            (e: unknown) => e,
        );
        for (let i = 0; i < 10; i++) {
            await MockTime.yield();
        }
        prepared.resolver();
        await Promise.all([erased, closing]);

        expect(order).deep.equals(["erased", "closed"]);
        expect(await keysOf(storage, "peer1")).deep.equals([]);
        expect(await refused).instanceOf(DestroyedDependencyError);
    });

    it("still runs what it waits for when it refuses an erase once it closed", async () => {
        const { stores } = await storesWithPeer();
        await stores.close();
        let prepared = false;

        const erasing = stores.eraseStore("peer1", async () => {
            prepared = true;
        });

        await expect(erasing).rejectedWith(DestroyedDependencyError);
        expect(prepared).equals(true);
        await expect(stores.eraseCaches("peer1")).rejectedWith(DestroyedDependencyError);
    });

    it("hands out no store of any ID while it erases all stores", async () => {
        const { stores } = await storesWithPeer();
        const other = stores.storeForNode("peer2");
        await other.construction.ready;
        const prepared = createPromise<void>();
        const erasing = stores.eraseStore("peer1", () => prepared.promise);

        const resetting = stores.erase();

        expect(stores.storeOf("peer2")).undefined;
        expect(stores.knownIds).deep.equals([]);
        prepared.resolver();
        await Promise.all([erasing, resetting]);
        await stores.close();
    });

    it("runs what a second erase of an ID waits for only once the first erase of it ended", async () => {
        const { stores } = await storesWithPeer();
        const first = createPromise<void>();
        const erasing = stores.eraseStore("peer1", () => first.promise);
        let secondPrepared = false;

        const second = stores.eraseStore("peer1", async () => {
            secondPrepared = true;
        });
        for (let i = 0; i < 10; i++) {
            await MockTime.yield();
        }

        expect(secondPrepared).equals(false);
        first.resolver();
        await Promise.all([erasing, second]);
        expect(secondPrepared).equals(true);
        await stores.close();
    });

    it("hands out no store of an ID once an erase of it ended while a later erase of it waits", async () => {
        const { stores } = await storesWithPeer();
        const later = createPromise<void>();
        const erasing = stores.eraseStore("peer1");
        const waiting = stores.eraseStore("peer1", () => later.promise);

        await erasing;

        expect(stores.storeOf("peer1")).undefined;
        expect(() => stores.storeForNode("peer1")).throws(StoreClosedError);
        later.resolver();
        await waiting;
        await stores.close();
    });

    it("reports what it waits for and the refusal when it refuses an erase once it closed", async () => {
        const { stores } = await storesWithPeer();
        await stores.close();

        const failures = await failuresOf(
            stores.eraseStore("peer1", async () => {
                throw new ImplementationError("Close refused for test");
            }),
        );

        expect(failures.length).equals(2);
        expect(failures[0]).equals("Close refused for test");
        expect(failures[1]).contains("closed");
    });

    it("keeps a store loaded from storage preexisting when it erases its cache", async () => {
        const { stores, store } = await storesWithPeer();
        expect(store.isPreexisting).equals(true);

        await stores.eraseCaches("peer1");

        expect(stores.storeOf("peer1")?.isPreexisting).equals(true);
        await stores.close();
    });

    it("opens no store for an ID while an erase of it runs", async () => {
        const { stores } = await storesWithPeer();
        const prepared = createPromise<void>();
        const erasing = stores.eraseStore("peer1", () => prepared.promise);

        expect(() => stores.storeForNode("peer1")).throws(StoreClosedError);
        prepared.resolver();
        await erasing;

        const reopened = stores.storeForNode("peer1");
        await reopened.construction.ready;
        expect(stores.storeOf("peer1")).equals(reopened);
        await stores.close();
    });

    it("hands out no new store of an erased cache while another erase of the ID waits for it", async () => {
        const { driver, stores, store } = await storesWithPeer();
        const loading = createPromise<void>();
        const loadStarted = createPromise<void>();
        const has = driver.has.bind(driver);
        const eraseCaches = store.eraseCaches.bind(store);
        store.eraseCaches = async () => {
            await eraseCaches();
            driver.has = async (...args: Parameters<typeof has>) => {
                driver.has = has;
                loadStarted.resolver();
                await loading.promise;
                return has(...args);
            };
        };

        const renewing = stores.eraseCaches("peer1");
        const erasing = stores.eraseStore("peer1");
        await loadStarted.promise;

        expect(stores.storeOf("peer1")).undefined;
        expect(stores.knownIds).deep.equals([]);
        loading.resolver();
        await Promise.all([renewing, erasing]);
        expect(stores.storeOf("peer1")).undefined;
        await stores.close();
    });

    it("erases the storage of an ID whose new store of an erased cache failed to load", async () => {
        const { driver, storage, stores, store } = await storesWithPeer();
        const has = driver.has.bind(driver);
        const eraseCaches = store.eraseCaches.bind(store);
        store.eraseCaches = async () => {
            await eraseCaches();
            driver.has = () => {
                driver.has = has;
                throw new ImplementationError("Load refused for test");
            };
        };
        expect(await failuresOf(stores.eraseCaches("peer1"))).deep.equals(["Load refused for test"]);

        await stores.eraseStore("peer1");

        expect(await keysOf(storage, "peer1")).deep.equals([]);
        await stores.close();
    });

    it("drops a new store of an erased cache that fails to load, so the next lookup opens one that loads", async () => {
        const { driver, stores, store } = await storesWithPeer();
        const has = driver.has.bind(driver);
        const eraseCaches = store.eraseCaches.bind(store);
        store.eraseCaches = async () => {
            await eraseCaches();
            driver.has = () => {
                driver.has = has;
                throw new ImplementationError("Load refused for test");
            };
        };

        expect(await failuresOf(stores.eraseCaches("peer1"))).deep.equals(["Load refused for test"]);

        expect(stores.storeOf("peer1")).undefined;
        const reopened = stores.storeForNode("peer1");
        await reopened.construction.ready;
        await reopened.recordNodeDisabled(true);
        expect(reopened.isNodeDisabled).equals(true);
        await stores.close();
    });
});
