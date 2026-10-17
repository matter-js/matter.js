/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { OnOffClient } from "#behaviors/on-off";
import type { ClientNode } from "#node/ClientNode.js";
import type { ServerNode } from "#node/ServerNode.js";
import { ClientCacheBuffer } from "#storage/client/ClientCacheBuffer.js";
import { ClientNodeStore } from "#storage/client/ClientNodeStore.js";
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
    StorageManager,
    Time,
} from "@matter/general";
import { MockSite, subscribedPeer } from "@matter/node/testing";
import { EndpointNumber } from "@matter/types";
import { OnOff } from "@matter/types/clusters/on-off";

/** Memory storage does not benefit from buffering, so tests that exercise the buffer need a driver that asks for it */
class BufferingStorageDriver extends MemoryStorageDriver {
    override get writeCoalescingInterval(): Duration {
        return Minutes(20);
    }
}

function bufferingSite() {
    return new MockSite({ createStorageDriver: store => new BufferingStorageDriver(store) });
}

async function expectUnbuffered(site: MockSite, options?: MockSite.PairOptions) {
    const { controller, device } = await site.addUncommissionedPair(options);

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

    expect(controller.env.has(ClientCacheBuffer)).false;

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
        const writer = peer.env.get(ClientNodeStore).localWriter;
        const persist = writer.persistInTransaction.bind(writer);
        const writing = createPromise<void>();
        const write = createPromise<void>();
        writer.persistInTransaction = async (...args: Parameters<typeof persist>) => {
            if (args[1] === EndpointNumber(1)) {
                writing.resolver();
                await write.promise;
            }
            await persist(...args);
        };

        const flushing = controller.env.get(ClientCacheBuffer).flush();
        await MockTime.resolve(writing.promise);
        const erasing = erase();
        await MockTime.resolve(Time.sleep("erase runs", Seconds(1)), { macrotasks: true });
        write.resolver();
        await MockTime.resolve(Promise.all([flushing, erasing]), { macrotasks: true });
    }

    it("does not restore the values of an erased endpoint from a flush that writes during the erase", async () => {
        await using site = bufferingSite();
        const { controller, peer, ep1, onOff } = await peerWithBufferedToggle(site);

        await eraseWhileFlushWrites(controller, peer, () => ep1.erase());

        expect(await onOff.keys()).deep.equals([]);
    });

    it("does not buffer when the storage driver writes immediately", async () => {
        await using site = new MockSite();
        await expectUnbuffered(site);
    });

    it("does not buffer when the configured interval is zero", async () => {
        await using site = bufferingSite();
        await expectUnbuffered(site, { controller: { network: { clientCacheFlushInterval: Instant } } as any });
    });

    it("flushes on subscription established", async () => {
        await using site = bufferingSite();
        const { controller } = await site.addCommissionedPair();
        await subscribedPeer(controller, "peer1");

        // Close and recreate — data should survive because subscription-established flush persisted it
        await MockTime.resolve(controller.close());
        const controller2 = await site.addController({ index: 1 });

        const peer = controller2.peers.get("peer1")!;
        expect(peer).not.undefined;

        // Basic state should be present from the subscription flush
        const ep1 = peer.endpoints.require(1);
        expect(ep1.stateOf(OnOffClient).onOff).false;
    });
});
