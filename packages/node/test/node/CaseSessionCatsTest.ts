/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { Crypto, MockCrypto, Seconds } from "@matter/general";
import { MockSite } from "@matter/node/testing";
import { FabricAuthority, NodeSession, PeerSet, SessionManager } from "@matter/protocol";
import { CaseAuthenticatedTag, NodeId } from "@matter/types";

describe("CASE session CATs", () => {
    before(() => {
        MockTime.init();
    });

    const CONTROLLER_CAT = CaseAuthenticatedTag(0x00010001);
    const DEVICE_CAT = CaseAuthenticatedTag(0x00020001);

    /**
     * The controller's NOC carries {@link CONTROLLER_CAT} and the same CAT is configured for the device node, as the
     * legacy controller API does.  The device's NOC carries `deviceCats`.
     */
    async function commissionedPair(site: MockSite, deviceCats: CaseAuthenticatedTag[] | undefined) {
        const controller = await site.addController({ controller: { caseAuthenticatedTags: [CONTROLLER_CAT] } });
        const device = await site.addDevice();

        const controllerCrypto = controller.env.get(Crypto) as MockCrypto;
        const deviceCrypto = device.env.get(Crypto) as MockCrypto;
        controllerCrypto.entropic = deviceCrypto.entropic = true;

        await controller.start();

        // The commissioner requests the device NOC without CATs; the controller's own NOC passes its CATs
        const { ca } = controller.env.get(FabricAuthority);
        const generateNoc = ca.generateNoc.bind(ca);
        ca.generateNoc = (publicKey, fabricId, nodeId, cats) =>
            generateNoc(publicKey, fabricId, nodeId, cats ?? deviceCats);

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
        });
    }
});
