/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { OnOffClient } from "#behaviors/on-off";
import type { ClientNode } from "#node/ClientNode.js";
import type { ServerNode } from "#node/ServerNode.js";
import { ClientCacheBuffer } from "#storage/client/ClientCacheBuffer.js";
import { ServerNodeStore } from "#storage/server/ServerNodeStore.js";
import {
    createPromise,
    Crypto,
    deepCopy,
    Duration,
    Instant,
    MemoryStorageDriver,
    Minutes,
    MockCrypto,
    Seconds,
    StorageDriver,
    StorageManager,
    SupportedStorageTypes,
    Time,
} from "@matter/general";
import { MockSite, subscribedPeer } from "@matter/node/testing";
import { EndpointNumber, GroupId, NodeId } from "@matter/types";
import { OnOff } from "@matter/types/clusters/on-off";
import { HoldingStorageDriver, WriteHold } from "../storage/holding-storage-driver.js";

/** Memory storage does not benefit from buffering, so tests that exercise the buffer need a driver that asks for it */
class BufferingStorageDriver extends MemoryStorageDriver {
    override get writeCoalescingInterval(): Duration {
        return Minutes(20);
    }
}

/**
 * A buffering driver whose transactions apply their writes only when they commit, and whose commit waits for
 * {@link commitHold} once that is set.
 */
class CommittingStorageDriver extends BufferingStorageDriver {
    commitHold?: { committing: () => void; commit: Promise<void> };

    override begin() {
        const driver = this;
        const writes = new Array<() => void>();
        return new (class extends StorageDriver.Transaction {
            override set(
                contexts: string[],
                keyOrValues: string | Record<string, SupportedStorageTypes>,
                value?: SupportedStorageTypes,
            ) {
                writes.push(() => {
                    if (typeof keyOrValues === "string") {
                        driver.set(contexts, keyOrValues, value!);
                    } else {
                        driver.set(contexts, keyOrValues);
                    }
                });
            }

            override async commit() {
                const hold = driver.commitHold;
                driver.commitHold = undefined;
                if (hold !== undefined) {
                    hold.committing();
                    await hold.commit;
                }
                for (const write of writes) {
                    write();
                }
                await super.commit();
            }
        })(this);
    }
}

function bufferingSite() {
    return new MockSite({ createStorageDriver: store => new BufferingStorageDriver(store) });
}

async function expectUnbuffered(site: MockSite, configure?: (controller: ServerNode) => Promise<void>) {
    const { controller, device } = await site.addUncommissionedPair();
    await configure?.(controller);

    const controllerCrypto = controller.env.get(Crypto) as MockCrypto;
    const deviceCrypto = device.env.get(Crypto) as MockCrypto;
    controllerCrypto.entropic = deviceCrypto.entropic = true;

    await controller.start();

    const { passcode, discriminator } = device.state.commissioning;
    await MockTime.resolve(controller.peers.commission({ passcode, discriminator, timeout: Seconds(90) }), {
        macrotasks: true,
    });

    controllerCrypto.entropic = deviceCrypto.entropic = false;

    const peer = await subscribedPeer(controller, "peer1");

    const storage = site.storageFor("controller1");
    const storageSnapshot = deepCopy(storage);

    const ep1 = peer.endpoints.require(1);
    const update = new Promise<boolean>(resolve => ep1.eventsOf(OnOffClient).onOff$Changed.on(resolve));
    await MockTime.resolve(ep1.commandsOf(OnOffClient).toggle());
    await MockTime.resolve(update);

    expect(deepCopy(storage)).not.deep.equals(storageSnapshot);
}

describe("ClientCacheBuffer", () => {
    before(() => {
        MockTime.init();
    });

    it("buffers writes until flush", async () => {
        await using site = bufferingSite();
        const { controller } = await site.addCommissionedPair();
        const peer = await subscribedPeer(controller, "peer1");

        // Capture storage state after subscription establishment flush
        const storage = site.storageFor("controller1");
        const storageSnapshot = deepCopy(storage);

        // Toggle onOff via command — triggers subscription update back to the controller
        const ep1 = peer.endpoints.require(1);
        const update = new Promise<boolean>(resolve => ep1.eventsOf(OnOffClient).onOff$Changed.on(resolve));
        await MockTime.resolve(ep1.commandsOf(OnOffClient).toggle());
        await MockTime.resolve(update);

        // Verify the peer sees the change in memory
        expect(ep1.stateOf(OnOffClient).onOff).true;

        // But storage should NOT have been updated yet (buffered)
        expect(deepCopy(storage)).deep.equals(storageSnapshot);

        // Now flush — storage should be updated
        await controller.env.get(ClientCacheBuffer).flush();
        expect(deepCopy(storage)).not.deep.equals(storageSnapshot);
    });

    it("flushes on shutdown", async () => {
        await using site = bufferingSite();
        const { controller } = await site.addCommissionedPair();
        const peer = await subscribedPeer(controller, "peer1");

        const storage = site.storageFor("controller1");
        const storageSnapshot = deepCopy(storage);

        // Toggle onOff
        const ep1 = peer.endpoints.require(1);
        const update = new Promise<boolean>(resolve => ep1.eventsOf(OnOffClient).onOff$Changed.on(resolve));
        await MockTime.resolve(ep1.commandsOf(OnOffClient).toggle());
        await MockTime.resolve(update);

        // Still buffered
        expect(deepCopy(storage)).deep.equals(storageSnapshot);

        // Close controller — should flush before closing storage
        await MockTime.resolve(controller.close());

        // Now storage should have the update
        expect(deepCopy(storage)).not.deep.equals(storageSnapshot);
    });

    it("persists buffered data across restart", async () => {
        await using site = bufferingSite();
        let { controller } = await site.addCommissionedPair();
        const peer = await subscribedPeer(controller, "peer1");

        // Toggle onOff
        const ep1 = peer.endpoints.require(1);
        const update = new Promise<boolean>(resolve => ep1.eventsOf(OnOffClient).onOff$Changed.on(resolve));
        await MockTime.resolve(ep1.commandsOf(OnOffClient).toggle());
        await MockTime.resolve(update);
        expect(ep1.stateOf(OnOffClient).onOff).true;

        // Close and recreate controller
        await MockTime.resolve(controller.close());
        controller = await site.addController({ index: 1 });

        // Verify the state survived via storage
        const peer2 = controller.peers.get("peer1")!;
        const ep1b = peer2.endpoints.require(1);
        expect(ep1b.stateOf(OnOffClient).onOff).true;
    });

    async function peerWithBufferedToggle(site: MockSite) {
        const { controller } = await site.addCommissionedPair();
        const peer = await subscribedPeer(controller, "peer1");
        const ep1 = peer.endpoints.require(1);
        const update = new Promise<boolean>(resolve => ep1.eventsOf(OnOffClient).onOff$Changed.on(resolve));
        await MockTime.resolve(ep1.commandsOf(OnOffClient).toggle());
        await MockTime.resolve(update);
        const onOff = controller.env
            .get(StorageManager)
            .createContext("nodes")
            .createContext(peer.id)
            .createContext("endpoints")
            .createContext("1")
            .createContext(OnOff.Cluster.id.toString());
        return { controller, peer, ep1, onOff };
    }

    // Holds the flush when it writes the values of endpoint 1, which it took from the cache before
    async function eraseWhileFlushWrites(controller: ServerNode, peer: ClientNode, erase: () => Promise<void>) {
        const ep1Store = peer.env
            .get(ServerNodeStore)
            .clientStores.storeForNode(peer)
            .storeForEndpointNumber(EndpointNumber(1));
        const persist = ep1Store.persistCache.bind(ep1Store);
        const writing = createPromise<void>();
        const write = createPromise<void>();
        ep1Store.persistCache = async (...args: Parameters<typeof persist>) => {
            writing.resolver();
            await write.promise;
            await persist(...args);
        };

        const flushing = controller.env.get(ClientCacheBuffer).flush();
        await MockTime.resolve(writing.promise);
        const erasing = erase();
        await MockTime.resolve(Time.sleep("erase runs", Seconds(1)), { macrotasks: true });
        write.resolver();
        await MockTime.resolve(Promise.all([flushing, erasing]), { macrotasks: true });
    }

    it("does not restore the values of an endpoint of an erased peer from a flush that writes during the erase", async () => {
        await using site = bufferingSite();
        const { controller, peer, onOff } = await peerWithBufferedToggle(site);

        await eraseWhileFlushWrites(controller, peer, () => peer.erase());

        expect(await onOff.keys()).deep.equals([]);
    });

    it("does not restore the cache of an erased peer from a flush that commits during the erase", async () => {
        let driver: CommittingStorageDriver | undefined;
        await using site = new MockSite({
            createStorageDriver: store => (driver ??= new CommittingStorageDriver(store)),
        });
        const { controller, peer, onOff } = await peerWithBufferedToggle(site);
        const committing = createPromise<void>();
        const commit = createPromise<void>();
        driver!.commitHold = { committing: committing.resolver, commit: commit.promise };

        const flushing = controller.env.get(ClientCacheBuffer).flush();
        await MockTime.resolve(committing.promise);
        const erasing = peer.erase();
        await MockTime.resolve(Time.sleep("erase runs", Seconds(1)), { macrotasks: true });
        commit.resolver();
        await MockTime.resolve(Promise.all([flushing, erasing]), { macrotasks: true });

        expect(await onOff.keys()).not.contains(OnOff.Cluster.attributes.onOff.id.toString());
    });

    it("does not restore the values of an endpoint of an erased peer from an immediate persist that writes during the erase", async () => {
        const hold = new WriteHold(`endpoints.1.${OnOff.Cluster.id}`);
        await using site = new MockSite({ createStorageDriver: store => new HoldingStorageDriver(store, hold) });
        const { controller } = await site.addCommissionedPair();
        const peer = await subscribedPeer(controller, "peer1");
        const ep1 = peer.endpoints.require(1);
        const onOff = controller.env
            .get(StorageManager)
            .createContext("nodes")
            .createContext(peer.id)
            .createContext("endpoints")
            .createContext("1")
            .createContext(OnOff.Cluster.id.toString());

        hold.arm();
        await MockTime.resolve(ep1.commandsOf(OnOffClient).toggle());
        await MockTime.resolve(hold.writing.promise);
        const erasing = peer.erase();
        await MockTime.resolve(Time.sleep("erase runs", Seconds(1)), { macrotasks: true });
        hold.write.resolver();
        await MockTime.resolve(erasing, { macrotasks: true });

        expect(await onOff.keys()).deep.equals([]);
    });

    async function groupOf(controller: ServerNode, peer: ClientNode) {
        return MockTime.resolve(
            controller.peers.forAddress({
                fabricIndex: peer.peerAddress!.fabricIndex,
                nodeId: NodeId.fromGroupId(GroupId(5)),
            }),
        );
    }

    const groupKeysOf = (site: MockSite, controller: ServerNode, group: ClientNode) =>
        Object.keys(site.storageFor(controller.id)).filter(key => key.startsWith(`nodes.${group.id}`));

    it("keeps the caches of a client group in the memory of the group", async () => {
        await using site = bufferingSite();
        const { controller } = await site.addCommissionedPair();
        const peer = await subscribedPeer(controller, "peer1");
        const group = await groupOf(controller, peer);
        const store = controller.env.get(ServerNodeStore).clientStores.storeForNode(group);
        const cache = store.storeForEndpointNumber(EndpointNumber(0)).createStoreForBehavior("6");

        await cache.externalSet(new Map([[0, true]]));
        await controller.env.get(ClientCacheBuffer).flush();

        expect(groupKeysOf(site, controller, group)).deep.equals([]);
        expect(store.buffer).not.equals(controller.env.get(ClientCacheBuffer));
    });

    it("keeps the local state of a client group in the memory of the group after an erase", async () => {
        await using site = bufferingSite();
        const { controller } = await site.addCommissionedPair();
        const peer = await subscribedPeer(controller, "peer1");
        const group = await groupOf(controller, peer);
        const address = group.state.commissioning.peerAddress;

        await MockTime.resolve(group.erase());
        await MockTime.resolve(group.set({ commissioning: { peerAddress: address } }));

        expect(group.state.commissioning.peerAddress).deep.equals(address);
        expect(groupKeysOf(site, controller, group)).deep.equals([]);
    });

    it("persists each report at once when the storage driver writes immediately", async () => {
        await using site = new MockSite();
        await expectUnbuffered(site);
    });

    it("persists each report at once when the configured interval is Instant", async () => {
        await using site = bufferingSite();
        await expectUnbuffered(site, controller => controller.set({ network: { clientCacheFlushInterval: Instant } }));
    });

    it("flushes once the subscription is established", async () => {
        await using site = bufferingSite();
        const { controller } = await site.addCommissionedPair();
        await subscribedPeer(controller, "peer1");

        const onOff = site.storageFor(controller.id)[`nodes.peer1.endpoints.1.${OnOff.Cluster.id}`];
        expect(onOff?.[OnOff.Cluster.attributes.onOff.id]).equals(false);
    });
});
