/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { CommissioningClient } from "#behavior/system/commissioning/CommissioningClient.js";
import {
    Bytes,
    ChannelType,
    Crypto,
    DnsRecordClass,
    DnsRecordType,
    Millis,
    MockCrypto,
    Seconds,
} from "@matter/general";
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

        peer.descriptor.reportedSessionParameters = { ...peer.sessionParameters, maxPathsPerInvoke: 1 };

        expect(peer.sessionParameters.maxPathsPerInvoke).equals(1);
    });

    it("persists negotiated session intervals above the DNS-SD maximum", async () => {
        await using site = new MockSite();
        const { controller, peer } = await commissionedPeer(site);
        const node = controller.peers.get("peer1")!;

        peer.descriptor.reportedSessionParameters = {
            ...peer.sessionParameters,
            idleInterval: Millis(3_602_000),
            activeInterval: Millis(3_603_000),
        };
        await MockTime.macrotask;

        const { reportedSessionParameters } = node.stateOf(CommissioningClient);
        expect(reportedSessionParameters?.idleInterval).equals(3_602_000);
        expect(reportedSessionParameters?.activeInterval).equals(3_603_000);
    });

    it("stores the intervals of a later session and restores them after a restart", async () => {
        await using site = new MockSite();
        const { controller, peer } = await commissionedPeer(site);
        peer.descriptor.discoveryData = { ...peer.descriptor.discoveryData, SII: Millis(500), SAI: Millis(300) };

        peer.descriptor.reportedSessionParameters = {
            ...peer.sessionParameters,
            idleInterval: Millis(2000),
            activeInterval: Millis(400),
            activeThreshold: Millis(5000),
        };
        await MockTime.macrotask;

        const expected = { idleInterval: 2000, activeInterval: 400, activeThreshold: 5000 };
        expect(controller.peers.get("peer1")!.stateOf(CommissioningClient).reportedSessionParameters).deep.include(
            expected,
        );

        const controllerId = controller.id;
        await site.close();
        const controllerB = await site.addNode(undefined, { id: controllerId, index: 1 });

        expect(controllerB.peers.get("peer1")!.stateOf(CommissioningClient).reportedSessionParameters).deep.include(
            expected,
        );

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
        const stored = controller.peers.get("peer1")!.stateOf(CommissioningClient).reportedSessionParameters;
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

        peer.descriptor.reportedSessionParameters = {
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

    describe("stored by older versions", () => {
        async function restartWithLegacy(sessionParameters: Record<string, unknown>, advertisedIntervals?: unknown) {
            const site = new MockSite();
            const { controller } = await commissionedPeer(site);
            const controllerId = controller.id;
            await site.close();

            const stored = site.storageFor(controllerId)["nodes.peer1.endpoints.0.commissioning"];
            delete stored.reportedSessionParameters;
            delete stored.advertisedIntervals;
            if (advertisedIntervals !== undefined) {
                stored.advertisedIntervals = advertisedIntervals;
            }
            stored.sessionParameters = sessionParameters;

            const controllerB = await site.addNode(undefined, { id: controllerId, index: 1 });
            const [restored] = controllerB.env.get(PeerSet);
            return { site, state: controllerB.peers.get("peer1")!.stateOf(CommissioningClient), restored };
        }

        it("moves a set of DNS-SD intervals to the advertised intervals", async () => {
            const { site, state, restored } = await restartWithLegacy({
                idleInterval: 1234,
                activeInterval: 321,
                activeThreshold: 4000,
            });
            await using _site = site;

            expect(state.reportedSessionParameters).undefined;
            expect(state.advertisedIntervals).deep.equals({
                idleInterval: 1234,
                activeInterval: 321,
                activeThreshold: 4000,
            });
            expect(restored.descriptor.discoveryData).deep.include({ SII: 1234, SAI: 321, SAT: 4000 });
            expect(restored.descriptor.reportedSessionParameters).undefined;
        });

        it("keeps a full set as the reported session parameters", async () => {
            const { site, state, restored } = await restartWithLegacy({
                idleInterval: 3_602_000,
                activeInterval: 300,
                activeThreshold: 4000,
                interactionModelRevision: 12,
                specificationVersion: 0x01040200,
                maxPathsPerInvoke: 5,
            });
            await using _site = site;

            expect(state.advertisedIntervals).undefined;
            expect(state.reportedSessionParameters).deep.include({ idleInterval: 3_602_000, maxPathsPerInvoke: 5 });
            expect(restored.sessionParameters).deep.include({ idleInterval: 3_602_000, maxPathsPerInvoke: 5 });
        });

        it("keeps advertised intervals already stored under the new key", async () => {
            const { site, state } = await restartWithLegacy(
                { idleInterval: 1234, activeInterval: 321 },
                { idleInterval: 777 },
            );
            await using _site = site;

            expect(state.advertisedIntervals?.idleInterval).equals(777);
            expect(state.advertisedIntervals?.activeInterval).undefined;
        });

        it("drops DNS-SD intervals beyond what DNS-SD can advertise", async () => {
            const { site, state } = await restartWithLegacy({ idleInterval: 3_602_000, activeInterval: 300 });
            await using _site = site;

            expect(state.advertisedIntervals?.activeInterval).equals(300);
            expect(state.advertisedIntervals?.idleInterval).undefined;
        });
    });

    it("keeps a peer marked TCP-unsupported across a restart until a session reports TCP support", async () => {
        await using site = new MockSite();
        const { controller, peer } = await commissionedPeer(site);
        peer.markTcpUnsupported();
        await MockTime.macrotask;
        expect(controller.peers.get("peer1")!.stateOf(CommissioningClient).tcpUnsupported).true;

        const controllerId = controller.id;
        await site.close();
        const controllerB = await site.addNode(undefined, { id: controllerId, index: 1 });

        const [restored] = controllerB.env.get(PeerSet);
        expect(restored.descriptor.tcpUnsupported).true;
        expect(restored.sessionParameters.supportedTransports).deep.equals({ tcpClient: false, tcpServer: false });
    });

    it("keeps advertised session intervals while the service holds no TXT record", async () => {
        await using site = new MockSite();
        const { peer } = await commissionedPeer(site);
        for (const record of [...peer.service.name.records]) {
            if (record.recordType === DnsRecordType.TXT) {
                peer.service.name.deleteRecord(record);
            }
        }
        expect(peer.service.hasTxtRecord).false;
        peer.descriptor.discoveryData = { ...peer.descriptor.discoveryData, SII: Millis(1234) };

        await MockTime.resolve(peer.service.changed.emit(), { macrotasks: true });

        expect(peer.descriptor.discoveryData?.SII).equals(1234);
    });

    it("drops an advertised session interval the device no longer advertises", async () => {
        await using site = new MockSite();
        const { controller, peer } = await commissionedPeer(site);

        const advertise = (...txt: string[]) =>
            peer.service.name.installRecord({
                name: peer.service.name.qname,
                recordType: DnsRecordType.TXT,
                recordClass: DnsRecordClass.IN,
                flushCache: true,
                ttl: Seconds(120),
                value: txt.map(entry => Bytes.fromString(entry)),
            });

        const dropped = (key: "SII" | "SAI" | "T") =>
            new Promise<void>(resolve => {
                const check = () => {
                    if (peer.descriptor.discoveryData?.[key] === undefined) {
                        peer.service.changed.off(check);
                        resolve();
                    }
                };
                peer.service.changed.on(check);
            });

        advertise("SII=1234", "SAI=321", "T=4");
        await MockTime.advance(Seconds(2));
        await MockTime.macrotask;
        expect(peer.descriptor.discoveryData).deep.include({ SII: 1234, SAI: 321 });
        expect(peer.descriptor.discoveryData?.T?.tcpServer).true;

        const siiDropped = dropped("SII");
        advertise("SAI=321");
        await MockTime.resolve(siiDropped, { macrotasks: true });
        await MockTime.macrotask;

        expect(peer.descriptor.discoveryData?.SAI).equals(321);
        expect(peer.descriptor.discoveryData?.T).undefined;
        expect(controller.peers.get("peer1")!.stateOf(CommissioningClient).advertisedIntervals?.idleInterval).undefined;

        // A TXT record without any keys still states that nothing is advertised
        await MockTime.advance(Seconds(2));
        const saiDropped = dropped("SAI");
        advertise();
        await MockTime.resolve(saiDropped, { macrotasks: true });
    });

    describe("reported session parameters", () => {
        it("hold only what the device sent in its session", async () => {
            await using site = new MockSite();
            const { peer } = await commissionedPeer(site);

            expect(peer.descriptor.reportedSessionParameters).not.undefined;
            expect(peer.descriptor.reportedSessionParameters).not.have.property("maxTcpMessageSize");
        });

        it("are stored as reported, without fallbacks", async () => {
            await using site = new MockSite();
            const { controller, peer } = await commissionedPeer(site);

            peer.descriptor.reportedSessionParameters = { idleInterval: Millis(2000) };
            await MockTime.macrotask;

            const stored = controller.peers.get("peer1")!.stateOf(CommissioningClient).reportedSessionParameters;
            expect(stored?.idleInterval).equals(2000);
            expect(stored?.maxPathsPerInvoke).undefined;
        });

        it("take the spec default for a value the session left out", async () => {
            await using site = new MockSite();
            const { peer } = await commissionedPeer(site);
            const { specificationVersion } = peer.basicInformation!;

            peer.descriptor.reportedSessionParameters = { idleInterval: Millis(2000), maxPathsPerInvoke: undefined };

            expect(peer.sessionParameters).deep.include({
                idleInterval: 2000,
                maxPathsPerInvoke: SessionParameters.fallbacks.maxPathsPerInvoke,
                specificationVersion,
            });
        });

        it("fall back to BasicInformation before any session reported", async () => {
            await using site = new MockSite();
            const { controller } = await commissionedPeer(site);
            await controller.peers
                .get("peer1")!
                .setStateOf(CommissioningClient, { reportedSessionParameters: undefined });

            const controllerId = controller.id;
            await site.close();
            const controllerB = await site.addNode(undefined, { id: controllerId, index: 1 });

            const [restored] = controllerB.env.get(PeerSet);
            expect(restored.descriptor.reportedSessionParameters).undefined;
            expect(restored.sessionParameters.maxPathsPerInvoke).equals(restored.basicInformation?.maxPathsPerInvoke);
            expect(restored.sessionParameters.maxPathsPerInvoke).not.equals(
                SessionParameters.fallbacks.maxPathsPerInvoke,
            );
        });

        it("stay as reported when TCP is marked unsupported", async () => {
            await using site = new MockSite();
            const { peer } = await commissionedPeer(site);
            peer.descriptor.reportedSessionParameters = { idleInterval: Millis(2000) };

            peer.markTcpUnsupported();

            expect(peer.descriptor.reportedSessionParameters).deep.equals({ idleInterval: 2000 });
            expect(peer.descriptor.tcpUnsupported).true;
            expect(peer.sessionParameters.supportedTransports).deep.equals({ tcpClient: false, tcpServer: false });
        });

        it("of a known peer are not replaced by a descriptor added later", async () => {
            await using site = new MockSite();
            const { controller, peer } = await commissionedPeer(site);
            const live = peer.descriptor.reportedSessionParameters;
            expect(live).not.undefined;

            peer.descriptor.discoveryData = { ...peer.descriptor.discoveryData, SII: Millis(777) };

            controller.env.get(PeerSet).addKnownPeer({
                address: peer.address,
                reportedSessionParameters: { idleInterval: Millis(9999) },
                discoveryData: { SII: Millis(8888), PI: "stored" },
            });

            expect(peer.descriptor.reportedSessionParameters).deep.equals(live);
            expect(peer.descriptor.discoveryData).deep.include({ SII: 777, PI: "stored" });
        });
    });
});
