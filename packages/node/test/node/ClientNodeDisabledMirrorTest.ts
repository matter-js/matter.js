/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { NetworkClient } from "#behavior/system/network/NetworkClient.js";
import type { ClientNode } from "#node/ClientNode.js";
import type { ServerNode } from "#node/ServerNode.js";
import { Crypto, ImplementationError, LogDestination, Logger, LogLevel, MockCrypto } from "@matter/general";
import { MockSite, subscribedPeer } from "@matter/node/testing";

const PEER = "peer1";

function networkStorageOf(site: MockSite, controller: ServerNode) {
    return site.storageFor(controller)[`nodes.${PEER}.endpoints.0.network`];
}

function settingsOf(site: MockSite, controller: ServerNode) {
    return site.storageFor(controller)[`nodes.${PEER}.settings`];
}

/**
 * Wait until the calls queued on the node mutex so far, such as a passed write, completed.
 */
async function settle(peer: ClientNode) {
    await MockTime.resolve(
        peer.lifecycle.mutex.hold("settle", async () => {}),
        { macrotasks: true },
    );
}

/**
 * Restart a controller against the storage it left behind, without bringing it online.
 */
async function reboot(site: MockSite, controller: ServerNode) {
    const { id } = controller;
    await MockTime.resolve(controller.close(), { macrotasks: true });
    const rebooted = await site.addNode(undefined, {
        id,
        device: undefined,
        commissioning: { enabled: false },
        online: false,
    });
    (rebooted.env.get(Crypto) as MockCrypto).entropic = true;
    return rebooted;
}

function captureNotices() {
    const notices = new Array<string>();
    const destination = LogDestination({
        name: "disabled-mirror-test",
        level: LogLevel.NOTICE,
        write: (text, message) => {
            if (message.level === LogLevel.NOTICE && text.includes("isDisabled")) {
                notices.push(text);
            }
        },
    });
    Logger.destinations[destination.name] = destination;
    return {
        notices,
        [Symbol.dispose]() {
            delete Logger.destinations[destination.name];
        },
    };
}

describe("ClientNode deprecated network isDisabled", () => {
    before(() => MockTime.init());

    it("reports a disabled flag an earlier version stored, and a cleared one lets the auto-start start the peer", async () => {
        await using site = new MockSite();
        const { controller } = await site.addCommissionedPair();
        await subscribedPeer(controller, PEER);

        const rebootedOnce = await reboot(site, controller);
        const stored = networkStorageOf(site, rebootedOnce);
        stored.isDisabled = true;
        stored.autoSubscribe = false;
        delete site.storageFor(rebootedOnce)[`nodes.${PEER}.settings`];
        const rebooted = await reboot(site, rebootedOnce);

        const peer = rebooted.peers.get(PEER)!;
        expect(peer.isDisabled).true;
        expect(peer.stateOf(NetworkClient).isDisabled).true;

        await peer.set({ network: { isDisabled: false, autoSubscribe: true } });
        await settle(peer);

        expect(peer.isDisabled).false;
        expect(peer.stateOf(NetworkClient).isDisabled).false;
        expect(peer.lifecycle.isOnline).false;
        expect(rebooted.lifecycle.isOnline).false;
        expect(settingsOf(site, rebooted)?.isDisabled).equals(false);

        await MockTime.resolve(rebooted.start(), { macrotasks: true });
        const started = await subscribedPeer(rebooted, PEER);

        expect(started.lifecycle.isOnline).true;
        expect(started.stateOf(NetworkClient).autoSubscribe).true;
        expect(networkStorageOf(site, rebooted).autoSubscribe).equals(true);
    });

    it("follows disable() and enable() and reports each change", async () => {
        await using site = new MockSite();
        const { controller } = await site.addCommissionedPair();
        const peer = await subscribedPeer(controller, PEER);

        const changes = new Array<boolean>();
        peer.eventsOf(NetworkClient).isDisabled$Changed.on(value => {
            changes.push(value);
        });

        await MockTime.resolve(peer.disable());
        await settle(peer);
        expect(peer.stateOf(NetworkClient).isDisabled).true;

        await MockTime.resolve(peer.enable(), { macrotasks: true });
        await settle(peer);
        expect(peer.stateOf(NetworkClient).isDisabled).false;

        expect(changes).deep.equals([true, false]);
    });

    it("disables the peer like disable() on a write of true", async () => {
        await using site = new MockSite();
        const { controller } = await site.addCommissionedPair();
        const peer = await subscribedPeer(controller, PEER);
        expect(peer.lifecycle.isOnline).true;

        await peer.set({ network: { isDisabled: true } });
        await settle(peer);

        expect(peer.isDisabled).true;
        expect(peer.lifecycle.isOnline).false;
        expect(peer.lifecycle.intent.target).equals("offline");
        expect(settingsOf(site, controller)?.isDisabled).equals(true);
    });

    it("does not persist the field", async () => {
        await using site = new MockSite();
        const { controller } = await site.addCommissionedPair();
        const peer = await subscribedPeer(controller, PEER);

        await MockTime.resolve(peer.disable());
        await settle(peer);
        await peer.set({ network: { isDisabled: false } });
        await settle(peer);

        expect(networkStorageOf(site, controller)).not.has.property("isDisabled");
    });

    it("passes a write once and notices the deprecation once per server node", async () => {
        await using site = new MockSite();
        const { controller } = await site.addCommissionedPair();
        const peer = await subscribedPeer(controller, PEER);
        using capture = captureNotices();

        const changes = new Array<boolean>();
        peer.eventsOf(NetworkClient).isDisabled$Changed.on(value => {
            changes.push(value);
        });
        let disables = 0;
        const disable = peer.disable.bind(peer);
        peer.disable = async () => {
            disables++;
            await disable();
        };

        await peer.set({ network: { isDisabled: true } });
        await settle(peer);
        await peer.set({ network: { isDisabled: false } });
        await settle(peer);

        expect(disables).equals(1);
        expect(changes).deep.equals([true, false]);
        expect(capture.notices.length).equals(1);
    });

    it("keeps a write of false that waits for an erase that initializes the node again", async () => {
        await using site = new MockSite();
        const { controller } = await site.addCommissionedPair();
        const peer = await subscribedPeer(controller, PEER);
        await MockTime.resolve(peer.disable());
        await settle(peer);

        const erasing = peer.erase();
        const clearing = peer.applyDisabledWrite(false);
        await MockTime.resolve(Promise.all([erasing, clearing]), { macrotasks: true });

        expect(peer.isDisabled).false;
        expect(settingsOf(site, controller)?.isDisabled).equals(false);
    });

    it("ends enabled whatever the delay between disable() and enable()", async () => {
        await using site = new MockSite();
        const { controller } = await site.addCommissionedPair();
        const peer = await subscribedPeer(controller, PEER);

        for (let delay = 0; delay < 40; delay++) {
            const disabling = peer.disable();
            for (let i = 0; i < delay; i++) {
                await Promise.resolve();
            }
            const enabling = peer.enable();
            await MockTime.resolve(Promise.all([disabling, enabling]), { macrotasks: true });
            await settle(peer);

            expect(peer.isDisabled, `delay ${delay}`).false;
            expect(peer.stateOf(NetworkClient).isDisabled, `delay ${delay}`).false;
        }
    });

    it("returns the field to the intent if the node refuses the write", async () => {
        await using site = new MockSite();
        const { controller } = await site.addCommissionedPair();
        const peer = await subscribedPeer(controller, PEER);

        peer.applyDisabledWrite = async () => {
            throw new ImplementationError("refused");
        };
        await peer.set({ network: { isDisabled: true } });
        await MockTime.resolve(Promise.resolve(), { macrotasks: true });
        await settle(peer);

        expect(peer.isDisabled).false;
        expect(peer.stateOf(NetworkClient).isDisabled).false;
    });
});
