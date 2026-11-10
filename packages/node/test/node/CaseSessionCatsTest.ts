/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { Crypto, ImplementationError, MockCrypto, Seconds } from "@matter/general";
import { MockSite } from "@matter/node/testing";
import { FabricAuthority, FabricManager, NodeSession, Peer, PeerSet, SessionManager } from "@matter/protocol";
import { CaseAuthenticatedTag, NodeId } from "@matter/types";

function isMockCrypto(crypto: Crypto): crypto is MockCrypto {
    return "entropic" in crypto;
}

function mockCryptoOf(node: { env: { get(type: typeof Crypto): Crypto } }) {
    const crypto = node.env.get(Crypto);
    if (!isMockCrypto(crypto)) {
        throw new ImplementationError("Test node does not use MockCrypto");
    }
    return crypto;
}

describe("CASE session CATs", () => {
    before(() => {
        MockTime.init();
    });

    const CONTROLLER_CAT = CaseAuthenticatedTag(0x00010001);
    const DEVICE_CAT = CaseAuthenticatedTag(0x00020001);
    const STALE_CAT = CaseAuthenticatedTag(0x00030001);

    /**
     * The controller's NOC carries {@link CONTROLLER_CAT} and the same CAT is configured for the device node, as the
     * legacy controller API does.  The device's NOC carries `deviceCats`.
     */
    async function commissionedPair(site: MockSite, deviceCats: CaseAuthenticatedTag[] | undefined) {
        const controller = await site.addController({ controller: { caseAuthenticatedTags: [CONTROLLER_CAT] } });
        const device = await site.addDevice();

        const controllerCrypto = mockCryptoOf(controller);
        const deviceCrypto = mockCryptoOf(device);
        controllerCrypto.entropic = deviceCrypto.entropic = true;

        await controller.start();

        // The commissioner requests the device NOC without CATs; the controller's own NOC passes its CATs
        const { ca } = controller.env.get(FabricAuthority);
        const issueNoc = ca.issueNoc.bind(ca);
        ca.issueNoc = request =>
            issueNoc({ ...request, caseAuthenticatedTags: request.caseAuthenticatedTags ?? deviceCats });

        const controllerSessions = new Array<NodeSession>();
        const deviceSessions = new Array<NodeSession>();
        controller.env.get(SessionManager).sessions.added.on(s => void controllerSessions.push(s));
        device.env.get(SessionManager).sessions.added.on(s => void deviceSessions.push(s));

        const { passcode, discriminator } = device.state.commissioning;
        await MockTime.resolve(
            controller.peers.commission({
                passcode,
                discriminator,
                timeout: Seconds(90),
                caseAuthenticatedTags: [CONTROLLER_CAT],
            }),
            { macrotasks: true },
        );

        const peer = [...controller.env.get(PeerSet)][0];
        expect(peer.descriptor.caseAuthenticatedTags).deep.equals([CONTROLLER_CAT]);

        return { controller, device, peer, controllerSessions, deviceSessions };
    }

    async function reconnect(
        peer: Awaited<ReturnType<typeof commissionedPair>>["peer"],
        ...sessionLists: NodeSession[][]
    ) {
        for (const session of [...peer.sessions]) {
            await MockTime.resolve(session.initiateClose(), { macrotasks: true });
        }
        for (const list of sessionLists) {
            list.length = 0;
        }
        await MockTime.resolve(peer.connect(), { macrotasks: true });
    }

    function caseSessions(sessions: NodeSession[]) {
        return sessions.filter(s => !s.isPase);
    }

    function catSubjectsOf(session: NodeSession) {
        const subject = session.subjectFor();
        return "catSubjects" in subject ? subject.catSubjects : undefined;
    }

    for (const deviceCats of [undefined, [DEVICE_CAT]]) {
        describe(deviceCats ? "with CATs in the device NOC" : "without CATs in the device NOC", () => {
            const expectedCats = deviceCats ?? [];

            it("uses the peer's CATs on a session we initiate with full CASE", async () => {
                await using site = new MockSite();
                const { controller, peer, controllerSessions, deviceSessions } = await commissionedPair(
                    site,
                    deviceCats,
                );

                await controller.env.get(SessionManager).deleteResumptionRecord(peer.address);
                await reconnect(peer, controllerSessions, deviceSessions);

                const [initiated] = caseSessions(controllerSessions);
                expect(initiated.isInitiator).equals(true);
                expect(initiated.caseAuthenticatedTags).deep.equals(expectedCats);
                expect(catSubjectsOf(initiated)).deep.equals(expectedCats.map(NodeId.fromCaseAuthenticatedTag));
                expect(
                    controller.env.get(SessionManager).findResumptionRecordByAddress(peer.address)
                        ?.caseAuthenticatedTags,
                ).deep.equals(deviceCats);

                const [responded] = caseSessions(deviceSessions);
                expect(responded.caseAuthenticatedTags).deep.equals([CONTROLLER_CAT]);
                expect(catSubjectsOf(responded)).deep.equals([NodeId.fromCaseAuthenticatedTag(CONTROLLER_CAT)]);
            });

            it("uses the peer's CATs on a session we initiate with resumption", async () => {
                await using site = new MockSite();
                const { controller, peer, controllerSessions, deviceSessions } = await commissionedPair(
                    site,
                    deviceCats,
                );

                const sessions = controller.env.get(SessionManager);
                await sessions.deleteResumptionRecord(peer.address);
                await reconnect(peer, controllerSessions, deviceSessions);
                const sharedSecret = sessions.findResumptionRecordByAddress(peer.address)?.sharedSecret;
                await reconnect(peer, controllerSessions, deviceSessions);

                // Resumption keeps the shared secret, full CASE derives a new one
                expect(sessions.findResumptionRecordByAddress(peer.address)?.sharedSecret).deep.equals(sharedSecret);

                const [initiated] = caseSessions(controllerSessions);
                expect(initiated.isInitiator).equals(true);
                expect(initiated.caseAuthenticatedTags).deep.equals(expectedCats);
                expect(catSubjectsOf(initiated)).deep.equals(expectedCats.map(NodeId.fromCaseAuthenticatedTag));

                const [responded] = caseSessions(deviceSessions);
                expect(responded.caseAuthenticatedTags).deep.equals([CONTROLLER_CAT]);
            });

            it("replaces the CATs of a rejected resumption with the peer's CATs in full CASE", async () => {
                await using site = new MockSite();
                const { controller, device, peer, controllerSessions, deviceSessions } = await commissionedPair(
                    site,
                    deviceCats,
                );
                const controllerSessionManager = controller.env.get(SessionManager);
                const deviceSessionManager = device.env.get(SessionManager);

                const record = controllerSessionManager.findResumptionRecordByAddress(peer.address);
                if (record === undefined) {
                    expect.fail("controller has no resumption record after commissioning");
                }
                await controllerSessionManager.saveResumptionRecord({ ...record, caseAuthenticatedTags: [STALE_CAT] });

                // Without its record the device rejects the resumption and answers with full CASE
                const deviceRecord = deviceSessionManager.findResumptionRecordById(record.resumptionId);
                if (deviceRecord === undefined) {
                    expect.fail("device has no resumption record after commissioning");
                }
                await deviceSessionManager.deleteResumptionRecord(
                    deviceRecord.fabric.addressOf(deviceRecord.peerNodeId),
                );

                await reconnect(peer, controllerSessions, deviceSessions);

                const [initiated] = caseSessions(controllerSessions);
                expect(initiated.caseAuthenticatedTags).deep.equals(expectedCats);
                expect(
                    controllerSessionManager.findResumptionRecordByAddress(peer.address)?.caseAuthenticatedTags,
                ).deep.equals(deviceCats);
            });

            it("resumes with the peer's CATs from a record that the CaseClient of this node wrote", async () => {
                await using site = new MockSite();
                const { controller, device, peer, controllerSessions } = await commissionedPair(site, deviceCats);
                const controllerSessionManager = controller.env.get(SessionManager);
                const sharedSecret = controllerSessionManager.findResumptionRecordByAddress(peer.address)?.sharedSecret;

                // The device initiates toward the controller, so the controller's CaseServer reads the record that
                // its CaseClient wrote when it initiated the commissioning CASE
                const deviceFabric = [...device.env.get(FabricManager)][0];
                const controllerFabric = [...controller.env.get(FabricManager)][0];
                const controllerPeer = await MockTime.resolve(
                    device.peers.forAddress(deviceFabric.addressOf(controllerFabric.nodeId)),
                    { macrotasks: true },
                );

                // Close the session from commissioning on both sides, otherwise the device reuses it
                const devicePeer = controllerPeer.env.get(Peer);
                for (const session of [...peer.sessions, ...devicePeer.sessions]) {
                    await MockTime.resolve(session.initiateClose(), { macrotasks: true });
                }
                controllerSessions.length = 0;
                await MockTime.resolve(devicePeer.connect(), { macrotasks: true });

                // Resumption keeps the shared secret, full CASE derives a new one
                expect(controllerSessionManager.findResumptionRecordByAddress(peer.address)?.sharedSecret).deep.equals(
                    sharedSecret,
                );
                const [responded] = caseSessions(controllerSessions);
                expect(responded.isInitiator).equals(false);
                expect(responded.caseAuthenticatedTags).deep.equals(expectedCats);
            });
        });
    }
});
