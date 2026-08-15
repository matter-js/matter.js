/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { Crypto, Minutes, MockCrypto, Seconds, Time, Timestamp } from "@matter/general";
import { commission } from "../icd-helpers.js";
import { MockSite } from "../mock-site.js";
import { subscribedPeer } from "../node-helpers.js";

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

    it("does not auto-start commissioned peers when autoStartCommissionedPeers is false", async () => {
        await using site = new MockSite();
        const controller = await site.addController({ network: { autoStartCommissionedPeers: false } });
        const device = await site.addDevice();
        await commission(controller, device);
        const peer1 = await subscribedPeer(controller, "peer1");
        expect(peer1.lifecycle.isOnline).true;

        // Discover an uncommissioned peer whose discovery record is already expired.  After the owner restarts with
        // auto-start disabled, the expiration cull must still delete it — proving #nodeOnline runs #manageExpiration
        // even though it skips the peer-start loop.
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

        await MockTime.resolve(controller.stop());
        expect(peer1.lifecycle.isOnline).false;

        controllerCrypto.entropic = true;
        let cameOnline = false;
        peer1.lifecycle.online.once(() => {
            cameOnline = true;
        });
        await MockTime.resolve(controller.start(), { macrotasks: true });

        // Drive the event loop long enough that a would-be auto-start reconnection completes.  With auto-start
        // enabled the commissioned peer comes back online within this window; with it disabled it must stay offline.
        await MockTime.resolve(Time.sleep("settle", Minutes(3)), { macrotasks: true });
        expect(cameOnline).false;
        expect(peer1.lifecycle.isOnline).false;

        // Expiration management still runs, so the expired uncommissioned peer is culled.
        expect(controller.peers.get(peer2.id)).undefined;
    });
});
