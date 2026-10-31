/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { PeerAddress } from "#peer/PeerAddress.js";
import { PeerAddressStore } from "#peer/PeerAddressStore.js";
import { MemoryStorageDriver, StorageContext, SupportedStorageTypes } from "@matter/general";
import { FabricIndex, NodeId } from "@matter/types";

const PEER_1 = PeerAddress({ fabricIndex: FabricIndex(1), nodeId: NodeId(0x1a) });
const PEER_2 = PeerAddress({ fabricIndex: FabricIndex(1), nodeId: NodeId(0x2b) });
const PEER_3 = PeerAddress({ fabricIndex: FabricIndex(2), nodeId: NodeId(0x3c) });

describe("PeerAddressStore", () => {
    let storage: MemoryStorageDriver;
    let store: PeerAddressStore<string>;

    beforeEach(() => {
        storage = new MemoryStorageDriver();
        storage.initialize();
        store = new PeerAddressStore(new StorageContext(storage, ["peers"]));
    });

    it("stores each peer under its fabric index and hex node ID", async () => {
        await store.set(PEER_1, "one");
        await store.set(PEER_3, "three");

        expect(storage.get(["peers", "1"], "1a")).equal("one");
        expect(storage.get(["peers", "2"], "3c")).equal("three");
    });

    it("loads the addresses back from the layout", async () => {
        await store.set(PEER_1, "one");
        await store.set(PEER_3, "three");

        const loaded = await store.load();

        expect([...loaded]).deep.equal([
            [PEER_1, "one"],
            [PEER_3, "three"],
        ]);
        expect([...loaded.keys()][0]).equal(PEER_1);
    });

    it("deletes one peer, one fabric or everything", async () => {
        await store.set(PEER_1, "one");
        await store.set(PEER_2, "two");
        await store.set(PEER_3, "three");

        await store.delete(PEER_1);
        expect([...(await store.load()).keys()]).deep.equal([PEER_2, PEER_3]);

        await store.deleteFabric(FabricIndex(1));
        expect([...(await store.load()).keys()]).deep.equal([PEER_3]);

        await store.clear();
        expect((await store.load()).size).equal(0);
    });

    it("deletes entries the load filter rejects", async () => {
        await store.set(PEER_1, "one");
        await store.set(PEER_2, "two");

        const loaded = await store.load(address => address !== PEER_1);

        expect([...loaded.keys()]).deep.equal([PEER_2]);
        expect(storage.keys(["peers", "1"])).deep.equal(["2b"]);
    });

    it("deletes entries the driver cannot read", async () => {
        class UnreadableKeyStorage extends MemoryStorageDriver {
            override get(contexts: string[], key: string) {
                return key === "1a" ? undefined : super.get(contexts, key);
            }
        }
        const unreadableStorage = new UnreadableKeyStorage();
        unreadableStorage.initialize();
        const unreadableStore = new PeerAddressStore<string>(new StorageContext(unreadableStorage, ["peers"]));
        await unreadableStore.set(PEER_1, "one");
        await unreadableStore.set(PEER_2, "two");

        const loaded = await unreadableStore.load();

        expect([...loaded.keys()]).deep.equal([PEER_2]);
        expect(unreadableStorage.keys(["peers", "1"])).deep.equal(["2b"]);
    });

    it("ignores contexts and keys outside its layout", async () => {
        await store.set(PEER_1, "one");
        storage.set(["peers", "other"], "1a", "foreign");
        storage.set(["peers", "1"], "not-hex", "foreign");

        const loaded = await store.load();

        expect([...loaded.keys()]).deep.equal([PEER_1]);
        expect(storage.get(["peers", "other"], "1a")).equal("foreign");
        expect(storage.get(["peers", "1"], "not-hex")).equal("foreign");
    });

    it("keeps the value passed last when calls for one peer overlap on a driver with slow writes", async () => {
        class SlowFirstWriteStorage extends MemoryStorageDriver {
            override async set(
                contexts: string[],
                keyOrValues: string | Record<string, SupportedStorageTypes>,
                value?: SupportedStorageTypes,
            ) {
                for (let tick = 0; value === "first" && tick < 10; tick++) {
                    await Promise.resolve();
                }
                if (typeof keyOrValues === "string") {
                    return super.set(contexts, keyOrValues, value);
                }
                return super.set(contexts, keyOrValues);
            }
        }
        const slowStorage = new SlowFirstWriteStorage();
        slowStorage.initialize();
        const slowStore = new PeerAddressStore<string>(new StorageContext(slowStorage, ["peers"]));

        await Promise.all([slowStore.set(PEER_1, "first"), slowStore.set(PEER_1, "last")]);

        expect((await slowStore.load()).get(PEER_1)).equal("last");
    });

    it("replaces all values", async () => {
        await store.set(PEER_1, "one");
        await store.set(PEER_3, "three");

        await store.replaceAll([[PEER_2, "two"]]);

        expect([...(await store.load())]).deep.equal([[PEER_2, "two"]]);
    });
});
