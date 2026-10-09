/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { CommissioningClient } from "#behavior/system/commissioning/CommissioningClient.js";
import { Crypto, Millis, MockCrypto, Seconds } from "@matter/general";
import { MockSite } from "@matter/node/testing";
import { Peer, PeerSet } from "@matter/protocol";

describe("Peer descriptor", () => {
    before(() => {
        MockTime.init();
    });

    async function commissionedPeer(site: MockSite) {
        const controller = await site.addController({});
        const device = await site.addDevice({});

        const controllerCrypto = controller.env.get(Crypto) as MockCrypto;
        const deviceCrypto = device.env.get(Crypto) as MockCrypto;
        controllerCrypto.entropic = deviceCrypto.entropic = true;

        await controller.start();
        const { passcode, discriminator } = device.state.commissioning;
        await MockTime.resolve(controller.peers.commission({ passcode, discriminator, timeout: Seconds(90) }), {
            macrotasks: true,
        });

        controllerCrypto.entropic = deviceCrypto.entropic = false;

        const peers = [...controller.env.get(PeerSet)];
        expect(peers).length.greaterThan(0);
        return { controller, peer: peers[0] as Peer };
    }

    // Characterization: the paths per invoke of the session the peer negotiated bounds what we send, even where the
    // peer's Basic Information cluster reports a higher limit. A missing MAX_PATHS_PER_INVOKE means one path, and the
    // reference implementation likewise reads only the session's value.
    it("bounds paths per invoke by the negotiated session rather than the reported attribute", async () => {
        await using site = new MockSite();
        const { peer } = await commissionedPeer(site);

        expect(peer.basicInformation?.maxPathsPerInvoke).equals(10);

        peer.descriptor.sessionParameters = { ...peer.sessionParameters, maxPathsPerInvoke: 1 };

        expect(peer.sessionParameters.maxPathsPerInvoke).equals(1);
    });

    it("persists negotiated session intervals above the DNS-SD maximum", async () => {
        await using site = new MockSite();
        const { controller, peer } = await commissionedPeer(site);
        const node = controller.peers.get("peer1")!;

        peer.descriptor.sessionParameters = {
            ...peer.sessionParameters,
            idleInterval: Millis(3_602_000),
            activeInterval: Millis(3_603_000),
        };
        await MockTime.macrotask;

        const { sessionParameters } = node.stateOf(CommissioningClient);
        expect(sessionParameters?.idleInterval).equals(3_602_000);
        expect(sessionParameters?.activeInterval).equals(3_603_000);
    });

    it("stores the intervals of a later session and restores them after a restart", async () => {
        await using site = new MockSite();
        const { controller, peer } = await commissionedPeer(site);
        expect(peer.descriptor.discoveryData?.SII).not.undefined;

        peer.descriptor.sessionParameters = {
            ...peer.sessionParameters,
            idleInterval: Millis(2000),
            activeInterval: Millis(400),
            activeThreshold: Millis(5000),
        };
        await MockTime.macrotask;

        const expected = { idleInterval: 2000, activeInterval: 400, activeThreshold: 5000 };
        expect(controller.peers.get("peer1")!.stateOf(CommissioningClient).sessionParameters).deep.include(expected);

        const controllerId = controller.id;
        await site.close();
        const controllerB = await site.addNode(undefined, { id: controllerId, index: 1 });

        expect(controllerB.peers.get("peer1")!.stateOf(CommissioningClient).sessionParameters).deep.include(expected);

        const [restored] = controllerB.env.get(PeerSet);
        expect(restored.sessionParameters).deep.include(expected);
    });

    it("persists a vendor-specific advertised device type", async () => {
        await using site = new MockSite();
        const { controller, peer } = await commissionedPeer(site);
        const node = controller.peers.get("peer1")!;

        peer.descriptor.discoveryData = { ...peer.descriptor.discoveryData, DT: 0xfff10001 };
        await MockTime.macrotask;

        expect(node.stateOf(CommissioningClient).deviceType).equals(0xfff10001);
    });

    describe("reported session parameters", () => {
        it("fill values the peer did not report from other sources", async () => {
            await using site = new MockSite();
            const { peer } = await commissionedPeer(site);
            const { maxPathsPerInvoke, specificationVersion } = peer.basicInformation!;

            peer.descriptor.sessionParameters = { idleInterval: Millis(2000), maxPathsPerInvoke: undefined };

            expect(peer.sessionParameters).deep.include({
                idleInterval: 2000,
                maxPathsPerInvoke,
                specificationVersion,
            });
        });

        it("are the only thing marking TCP unsupported changes", async () => {
            await using site = new MockSite();
            const { peer } = await commissionedPeer(site);
            peer.descriptor.sessionParameters = { idleInterval: Millis(2000) };

            peer.markTcpUnsupported();

            expect(peer.descriptor.sessionParameters).deep.equals({
                idleInterval: 2000,
                supportedTransports: { tcpClient: false, tcpServer: false },
            });
        });

        it("of a known peer are not replaced by a descriptor added later", async () => {
            await using site = new MockSite();
            const { controller, peer } = await commissionedPeer(site);
            const live = peer.descriptor.sessionParameters;
            expect(live).not.undefined;

            controller.env.get(PeerSet).addKnownPeer({
                address: peer.address,
                sessionParameters: { idleInterval: Millis(9999) },
                discoveryData: { SII: Millis(8888) },
            });

            expect(peer.descriptor.sessionParameters).deep.equals(live);
            expect(peer.descriptor.discoveryData?.SII).not.equals(8888);
        });
    });
});
