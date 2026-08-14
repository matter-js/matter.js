/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { OnOffClient } from "#behaviors/on-off";
import { ClientCacheBuffer } from "#storage/client/ClientCacheBuffer.js";
import { Crypto, deepCopy, Duration, MemoryStorageDriver, Minutes, MockCrypto, Seconds } from "@matter/general";
import { MockSite } from "./mock-site.js";
import { subscribedPeer } from "./node-helpers.js";

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

    it("does not buffer when the storage driver writes immediately", async () => {
        await using site = new MockSite();
        await expectUnbuffered(site);
    });

    it("does not buffer when the configured interval is zero", async () => {
        await using site = bufferingSite();
        await expectUnbuffered(site, { controller: { network: { clientCacheFlushInterval: 0 } } as any });
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
