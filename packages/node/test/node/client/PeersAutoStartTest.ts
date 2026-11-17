/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { NetworkClient } from "#behavior/system/network/NetworkClient.js";
import type { ServerNode } from "#node/ServerNode.js";
import { createPromise, Crypto, Minutes, MockCrypto, Seconds, Time, Timestamp } from "@matter/general";
import { MockSite, subscribedPeer } from "@matter/node/testing";
import { commission } from "../icd-helpers.js";

describe("Peers auto-start on owner online", () => {
    before(() => MockTime.init());

    it("auto-starts commissioned peers when the owner goes online (default)", async () => {
        await using site = new MockSite();
        const { controller } = await site.addCommissionedPair();
        const peer1 = await subscribedPeer(controller, "peer1");
        expect(peer1.lifecycle.isOnline).true;

        await MockTime.resolve(controller.stop());
        expect(peer1.lifecycle.isOnline).false;

        (controller.env.get(Crypto) as MockCrypto).entropic = true;
        const online = new Promise<void>(resolve => peer1.lifecycle.online.once(() => resolve()));
        await controller.start();
        await MockTime.resolve(online, { macrotasks: true });

        expect(peer1.lifecycle.isOnline).true;
    });

    it("lets a stop of the owner follow its start that auto-starts peers", async () => {
        await using site = new MockSite();
        const { controller } = await site.addCommissionedPair();
        const peer1 = await subscribedPeer(controller, "peer1");
        await MockTime.resolve(controller.stop());

        // Request the stop while the owner holds its mutex to start its peers
        let stopping: Promise<void> | undefined;
        const applyIntent = peer1.applyIntent.bind(peer1);
        peer1.applyIntent = () => {
            stopping ??= controller.stop();
            return applyIntent();
        };

        (controller.env.get(Crypto) as MockCrypto).entropic = true;
        try {
            await MockTime.resolve(controller.start(), { macrotasks: true });
            await MockTime.resolve(stopping, { macrotasks: true });
        } finally {
            Reflect.deleteProperty(peer1, "applyIntent");
        }

        expect(stopping).not.undefined;
        expect(controller.lifecycle.isOnline).false;
        expect(peer1.lifecycle.isOnline).false;
    });

    // Characterization: the peer has an online intent of its own, which its disabled flag or its close blocks
    for (const kind of ["disabled", "closing"] as const) {
        it(`does not auto-start a ${kind} peer`, async () => {
            await using site = new MockSite();
            const { controller } = await site.addCommissionedPair();
            const peer1 = await subscribedPeer(controller, "peer1");
            await MockTime.resolve(controller.stop());

            let closing: Promise<void> | undefined;
            const { promise: released, resolver: release } = createPromise<void>();
            if (kind === "disabled") {
                await MockTime.resolve(peer1.disable());
            } else {
                const { promise: entered, resolver: enter } = createPromise<void>();
                const blocking = peer1.lifecycle.mutex.hold("blocking", async () => {
                    enter();
                    await released;
                });
                await entered;
                closing = Promise.all([blocking, peer1.close()]).then(() => {});
            }
            let cameOnline = false;
            peer1.lifecycle.online.once(() => {
                cameOnline = true;
            });

            (controller.env.get(Crypto) as MockCrypto).entropic = true;
            await MockTime.resolve(controller.start(), { macrotasks: true });
            release();
            await MockTime.resolve(closing, { macrotasks: true });

            expect(cameOnline).equals(false);
        });
    }

    /**
     * Restart a controller against the storage it left behind, so its peers have no intent of their own.
     */
    async function reboot(site: MockSite, controller: ServerNode, autoStartCommissionedPeers = true) {
        const { id } = controller;
        await MockTime.resolve(controller.close(), { macrotasks: true });
        const rebooted = await site.addNode(undefined, {
            id,
            device: undefined,
            commissioning: { enabled: false },
            network: { autoStartCommissionedPeers },
            online: false,
        });
        (rebooted.env.get(Crypto) as MockCrypto).entropic = true;
        return rebooted;
    }

    it("does not auto-start commissioned peers when autoStartCommissionedPeers is false", async () => {
        await using site = new MockSite();
        const controller = await site.addController({ network: { autoStartCommissionedPeers: false } });
        const device = await site.addDevice();
        await commission(controller, device);
        expect((await subscribedPeer(controller, "peer1")).lifecycle.isOnline).true;

        // Discover an uncommissioned peer whose discovery record is already expired.  After the owner restarts with
        // auto-start disabled, the expiration cull must still delete it — proving #nodeOnline runs #manageExpiration
        // even though it starts no peer.
        const device2 = await site.addDevice({ index: 3 });
        const controllerCrypto = controller.env.get(Crypto) as MockCrypto;
        const deviceCrypto = device2.env.get(Crypto) as MockCrypto;
        controllerCrypto.entropic = deviceCrypto.entropic = true;
        const { discriminator } = device2.state.commissioning;
        const discovered = await MockTime.resolve(
            controller.peers.discover({ longDiscriminator: discriminator, timeout: Seconds(90) }),
            { macrotasks: true },
        );
        deviceCrypto.entropic = false;
        const peer2 = discovered[0];
        expect(peer2.state.commissioning.peerAddress).undefined;
        await peer2.set({ commissioning: { discoveredAt: Timestamp(Time.nowMs - Minutes(20)) } });

        const rebooted = await reboot(site, controller, false);
        const peer1 = rebooted.peers.get("peer1")!;
        let cameOnline = false;
        peer1.lifecycle.online.once(() => {
            cameOnline = true;
        });
        await MockTime.resolve(rebooted.start(), { macrotasks: true });

        // Drive the event loop long enough that a would-be auto-start reconnection completes.  With auto-start
        // enabled the commissioned peer comes back online within this window; with it disabled it must stay offline.
        await MockTime.resolve(Time.sleep("settle", Minutes(3)), { macrotasks: true });
        expect(cameOnline).false;
        expect(peer1.lifecycle.isOnline).false;

        // Expiration management still runs, so the expired uncommissioned peer is culled.
        expect(rebooted.peers.get(peer2.id)).undefined;
    });

    it("auto-starts a commissioned peer without an intent of its own after a restart from storage", async () => {
        await using site = new MockSite();
        const { controller } = await site.addCommissionedPair();
        await subscribedPeer(controller, "peer1");

        const rebooted = await reboot(site, controller);
        await MockTime.resolve(rebooted.start(), { macrotasks: true });

        expect((await subscribedPeer(rebooted, "peer1")).lifecycle.isOnline).true;
    });

    it("gives a disabled peer without an intent of its own no online intent", async () => {
        await using site = new MockSite();
        const { controller } = await site.addCommissionedPair();
        await MockTime.resolve((await subscribedPeer(controller, "peer1")).disable());

        const rebooted = await reboot(site, controller);
        await MockTime.resolve(rebooted.start(), { macrotasks: true });

        const peer1 = rebooted.peers.get("peer1")!;
        expect(peer1.isDisabled).true;
        expect(peer1.lifecycle.intent.target).equals("offline");
        expect(peer1.behaviors.internalsOf(NetworkClient).runtime).undefined;
    });
});
