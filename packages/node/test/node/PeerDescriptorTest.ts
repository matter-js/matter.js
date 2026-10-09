/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { CommissioningClient } from "#behavior/system/commissioning/CommissioningClient.js";
import { ChannelType, Crypto, Millis, MockCrypto, Seconds } from "@matter/general";
import { MockSite } from "@matter/node/testing";
import { Peer, PeerSet, SessionParameters } from "@matter/protocol";

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
        peer.descriptor.discoveryData = { ...peer.descriptor.discoveryData, SII: Millis(500), SAI: Millis(300) };

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

    it("restores the stored session parameters into the peer before its first session after a restart", async () => {
        await using site = new MockSite();
        const { controller } = await commissionedPeer(site);
        const stored = controller.peers.get("peer1")!.stateOf(CommissioningClient).sessionParameters;
        expect(stored?.interactionModelRevision).not.equals(SessionParameters.fallbacks.interactionModelRevision);

        const controllerId = controller.id;
        await site.close();
        const controllerB = await site.addNode(undefined, { id: controllerId, index: 1 });

        const [restored] = controllerB.env.get(PeerSet);
        expect(restored.hasSession).false;
        expect(restored.sessionParameters).deep.include({
            interactionModelRevision: stored?.interactionModelRevision,
            specificationVersion: stored?.specificationVersion,
            maxPathsPerInvoke: stored?.maxPathsPerInvoke,
            supportedTransports: stored?.supportedTransports,
        });
    });

    it("selects TCP for the first connect after a restart from the stored session parameters", async () => {
        await using site = new MockSite();
        const { controller, peer } = await commissionedPeer(site);

        peer.descriptor.sessionParameters = {
            ...peer.sessionParameters,
            supportedTransports: { tcpClient: true, tcpServer: true },
        };
        await MockTime.macrotask;

        const controllerId = controller.id;
        await site.close();
        const controllerB = await site.addNode(undefined, { id: controllerId, index: 1 });

        const [restored] = controllerB.env.get(PeerSet);
        expect(restored.hasSession).false;
        expect(restored.resolveTransports(undefined, ChannelType.TCP)).deep.equals([ChannelType.TCP, ChannelType.UDP]);
    });

    it("moves DNS-SD intervals stored by older versions to the advertised intervals", async () => {
        await using site = new MockSite();
        const { controller } = await commissionedPeer(site);
        const node = controller.peers.get("peer1")!;
        await node.setStateOf(CommissioningClient, { sessionParameters: undefined, advertisedIntervals: undefined });
        await node.setStateOf(CommissioningClient, {
            sessionParameters: {
                idleInterval: Millis(1234),
                activeInterval: Millis(321),
                activeThreshold: Millis(4000),
            },
        });

        const controllerId = controller.id;
        await site.close();
        const controllerB = await site.addNode(undefined, { id: controllerId, index: 1 });

        const state = controllerB.peers.get("peer1")!.stateOf(CommissioningClient);
        expect(state.sessionParameters).undefined;
        expect(state.advertisedIntervals).deep.equals({
            idleInterval: 1234,
            activeInterval: 321,
            activeThreshold: 4000,
        });

        const [restored] = controllerB.env.get(PeerSet);
        expect(restored.descriptor.discoveryData).deep.include({ SII: 1234, SAI: 321, SAT: 4000 });
        expect(restored.descriptor.sessionParameters).undefined;
    });

    describe("reported session parameters", () => {
        it("hold only what the device sent in its session", async () => {
            await using site = new MockSite();
            const { peer } = await commissionedPeer(site);

            expect(peer.descriptor.sessionParameters).not.undefined;
            expect(peer.descriptor.sessionParameters).not.have.property("maxTcpMessageSize");
        });

        it("are stored as reported, without fallbacks", async () => {
            await using site = new MockSite();
            const { controller, peer } = await commissionedPeer(site);

            peer.descriptor.sessionParameters = { idleInterval: Millis(2000) };
            await MockTime.macrotask;

            const stored = controller.peers.get("peer1")!.stateOf(CommissioningClient).sessionParameters;
            expect(stored?.idleInterval).equals(2000);
            expect(stored?.maxPathsPerInvoke).undefined;
        });

        it("take the spec default for a value the session left out", async () => {
            await using site = new MockSite();
            const { peer } = await commissionedPeer(site);
            const { specificationVersion } = peer.basicInformation!;

            peer.descriptor.sessionParameters = { idleInterval: Millis(2000), maxPathsPerInvoke: undefined };

            expect(peer.sessionParameters).deep.include({
                idleInterval: 2000,
                maxPathsPerInvoke: SessionParameters.fallbacks.maxPathsPerInvoke,
                specificationVersion,
            });
        });

        it("fall back to BasicInformation before any session reported", async () => {
            await using site = new MockSite();
            const { controller } = await commissionedPeer(site);
            await controller.peers.get("peer1")!.setStateOf(CommissioningClient, { sessionParameters: undefined });

            const controllerId = controller.id;
            await site.close();
            const controllerB = await site.addNode(undefined, { id: controllerId, index: 1 });

            const [restored] = controllerB.env.get(PeerSet);
            expect(restored.descriptor.sessionParameters).undefined;
            expect(restored.sessionParameters.maxPathsPerInvoke).equals(restored.basicInformation?.maxPathsPerInvoke);
            expect(restored.sessionParameters.maxPathsPerInvoke).not.equals(
                SessionParameters.fallbacks.maxPathsPerInvoke,
            );
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

            peer.descriptor.discoveryData = { ...peer.descriptor.discoveryData, SII: Millis(777) };

            controller.env.get(PeerSet).addKnownPeer({
                address: peer.address,
                sessionParameters: { idleInterval: Millis(9999) },
                discoveryData: { SII: Millis(8888), PI: "stored" },
            });

            expect(peer.descriptor.sessionParameters).deep.equals(live);
            expect(peer.descriptor.discoveryData).deep.include({ SII: 777, PI: "stored" });
        });
    });
});
