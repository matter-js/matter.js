/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { OnOffClient } from "#behaviors/on-off";
import { ClientCacheBuffer } from "#storage/client/ClientCacheBuffer.js";
import { Crypto, deepCopy, MockCrypto, Seconds } from "@matter/general";
import { MockSite } from "./mock-site.js";
import { subscribedPeer } from "./node-helpers.js";

describe("ClientCacheBuffer", () => {
    before(() => {
        MockTime.init();
    });

    it("buffers writes until flush", async () => {
        await using site = new MockSite();
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
        await using site = new MockSite();
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
        await using site = new MockSite();
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

    it("does not buffer when disabled", async () => {
        await using site = new MockSite();
        const { controller, device } = await site.addUncommissionedPair({
            controller: { network: { clientCacheFlushInterval: undefined } } as any,
        });

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

        // Should not have a buffer
        expect(controller.env.has(ClientCacheBuffer)).false;

        const storage = site.storageFor("controller1");
        const storageSnapshot = deepCopy(storage);

        // Toggle onOff
        const ep1 = peer.endpoints.require(1);
        const update = new Promise<boolean>(resolve => ep1.eventsOf(OnOffClient).onOff$Changed.on(resolve));
        await MockTime.resolve(ep1.commandsOf(OnOffClient).toggle());
        await MockTime.resolve(update);

        // Without buffering, storage should be updated immediately
        expect(deepCopy(storage)).not.deep.equals(storageSnapshot);
    });

    it("flushes on subscription established", async () => {
        await using site = new MockSite();
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
