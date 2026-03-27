/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { OnOffClient } from "#behaviors/on-off";
import { ChannelType, Crypto, MockCrypto, Seconds } from "@matter/general";
import { ExchangeManager, Peer, PeerSet } from "@matter/protocol";
import { MockSite } from "./mock-site.js";
import { subscribedPeer } from "./node-helpers.js";

/**
 * TCP transport variant tests for ClientNode integration.
 *
 * These tests verify:
 * - TCP interface availability when tcp is enabled on nodes
 * - Transport preference wiring from controller config to protocol-level Peer
 * - Commissioning always uses UDP regardless of TCP availability
 * - Default (UDP-only) behavior is preserved when TCP is enabled but not preferred
 *
 * Note: Full end-to-end TCP session tests (invoke/subscribe over TCP) are not included here
 * because mock TCP connections currently don't survive past CASE session establishment.
 * The TCP connection management behavior is tested separately in TcpConnectionTest and
 * TcpSessionBindingTest.
 */
describe("ClientNodeTcp", () => {
    before(() => {
        MockTime.init();
    });

    /**
     * Helper: commission a pair with optional network config.
     * Avoids setting transportPreference to "tcp" on the controller to prevent the
     * auto-subscribe loop from trying TCP connections (which break in mock).
     */
    async function commissionPair(
        site: MockSite,
        controllerNetwork?: Record<string, unknown>,
        deviceNetwork?: Record<string, unknown>,
    ) {
        const controller = await site.addController({
            network: controllerNetwork,
        });
        const device = await site.addDevice({
            network: deviceNetwork,
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

        return { controller, device };
    }

    /**
     * Get the protocol-level Peer from the PeerSet.
     */
    function protocolPeer(controller: { env: { get: (key: any) => any } }): Peer {
        const peerSet = controller.env.get(PeerSet);
        const peers = [...peerSet];
        expect(peers).length.greaterThan(0);
        return peers[0];
    }

    describe("TCP interface availability", () => {
        it("registers TCP interface on controller when tcp is enabled", async () => {
            await using site = new MockSite();
            const { controller } = await commissionPair(site, { tcp: true }, { tcp: true });

            const exchanges = controller.env.get(ExchangeManager);
            expect(exchanges.hasInterfaceFor(ChannelType.TCP)).true;
            expect(exchanges.hasInterfaceFor(ChannelType.UDP)).true;
        });

        it("does not register TCP interface when tcp is disabled", async () => {
            await using site = new MockSite();
            const { controller } = await commissionPair(site);

            const exchanges = controller.env.get(ExchangeManager);
            expect(exchanges.hasInterfaceFor(ChannelType.TCP)).false;
            expect(exchanges.hasInterfaceFor(ChannelType.UDP)).true;
        });

        it("registers TCP interface on device when tcp is enabled", async () => {
            await using site = new MockSite();
            const { device } = await commissionPair(site, undefined, { tcp: true });

            const exchanges = device.env.get(ExchangeManager);
            expect(exchanges.hasInterfaceFor(ChannelType.TCP)).true;
        });

        it("enables TCP on controller only (outgoing)", async () => {
            await using site = new MockSite();
            const { controller, device } = await commissionPair(site, { tcp: { outgoing: true } }, undefined);

            const controllerExchanges = controller.env.get(ExchangeManager);
            expect(controllerExchanges.hasInterfaceFor(ChannelType.TCP)).true;

            const deviceExchanges = device.env.get(ExchangeManager);
            expect(deviceExchanges.hasInterfaceFor(ChannelType.TCP)).false;
        });
    });

    describe("transport preference wiring", () => {
        it("propagates UDP preference (default) — peer has no TCP preference", async () => {
            await using site = new MockSite();
            const { controller } = await commissionPair(site, { tcp: true, transportPreference: "udp" }, { tcp: true });

            const peer = protocolPeer(controller);
            // "udp" preference should leave peer.transportPreference as undefined (the default)
            expect(peer.transportPreference).undefined;
        });

        it("leaves peer preference undefined when no preference is configured", async () => {
            await using site = new MockSite();
            const { controller } = await commissionPair(site);

            const peer = protocolPeer(controller);
            expect(peer.transportPreference).undefined;
        });

        it("allows setting TCP preference directly on protocol peer", async () => {
            await using site = new MockSite();
            const { controller } = await commissionPair(site, { tcp: true }, { tcp: true });

            const peer = protocolPeer(controller);
            expect(peer.transportPreference).undefined;

            // Direct assignment should work (this is how NetworkClient sets it)
            peer.transportPreference = ChannelType.TCP;
            expect(peer.transportPreference).equals(ChannelType.TCP);

            // And can be cleared
            peer.transportPreference = undefined;
            expect(peer.transportPreference).undefined;
        });
    });

    describe("commissioning transport", () => {
        it("commissions over UDP when TCP is enabled on both sides", async () => {
            await using site = new MockSite();
            const { controller } = await commissionPair(site, { tcp: true }, { tcp: true });

            // After commissioning, the operational CASE session should be UDP
            const peer = protocolPeer(controller);
            const session = peer.newestSession();
            expect(session).not.undefined;
            expect(session!.channel.channel.type).equals(ChannelType.UDP);
        });

        it("stores UDP addresses after commissioning with TCP enabled", async () => {
            await using site = new MockSite();
            const { controller } = await commissionPair(site, { tcp: true }, { tcp: true });

            const peer1 = controller.peers.get("peer1")!;
            expect(peer1).not.undefined;

            const addresses = peer1.state.commissioning.addresses;
            expect(addresses).not.undefined;
            const udpAddresses = addresses!.filter(a => a.type === "udp");
            expect(udpAddresses.length).greaterThan(0);
        });
    });

    describe("UDP operational behavior", () => {
        it("invokes over UDP with default (no TCP) config", async () => {
            await using site = new MockSite();
            const { controller } = await commissionPair(site);

            expect(controller.peers.size).equals(1);

            const peer1 = await subscribedPeer(controller, "peer1");
            const ep1 = peer1.parts.get("ep1")!;
            expect(ep1).not.undefined;

            await MockTime.resolve(ep1.commandsOf(OnOffClient).toggle());

            const peer = protocolPeer(controller);
            const session = peer.newestSession();
            expect(session).not.undefined;
            expect(session!.channel.channel.type).equals(ChannelType.UDP);
        });

        it("invokes over UDP when TCP is enabled but not preferred", async () => {
            await using site = new MockSite();
            const { controller } = await commissionPair(site, { tcp: true, transportPreference: "udp" }, { tcp: true });

            expect(controller.peers.size).equals(1);

            const peer1 = await subscribedPeer(controller, "peer1");
            const ep1 = peer1.parts.get("ep1")!;
            expect(ep1).not.undefined;

            await MockTime.resolve(ep1.commandsOf(OnOffClient).toggle());

            const peer = protocolPeer(controller);
            const session = peer.newestSession();
            expect(session).not.undefined;
            expect(session!.channel.channel.type).equals(ChannelType.UDP);
        });

        it("subscribes and receives updates over UDP when TCP is enabled but not preferred", async () => {
            await using site = new MockSite();
            const { controller } = await commissionPair(site, { tcp: true, transportPreference: "udp" }, { tcp: true });

            const peer1 = await subscribedPeer(controller, "peer1");
            const ep1 = peer1.parts.get("ep1")!;
            expect(ep1).not.undefined;

            // Trigger a state change via invoke and verify the subscription delivers it
            const receivedUpdate = new Promise<boolean>(resolve => ep1.eventsOf(OnOffClient).onOff$Changed.on(resolve));

            await MockTime.resolve(ep1.commandsOf(OnOffClient).toggle());
            await MockTime.resolve(receivedUpdate);

            // Session remains UDP
            const peer = protocolPeer(controller);
            const session = peer.newestSession();
            expect(session).not.undefined;
            expect(session!.channel.channel.type).equals(ChannelType.UDP);
        });
    });
});
