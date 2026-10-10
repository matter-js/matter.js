/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { Crypto, Millis, MockCrypto, Seconds } from "@matter/general";
import { MockSite } from "@matter/node/testing";
import { NodeSession, PeerSet, SessionManager } from "@matter/protocol";

describe("Reported session parameters", () => {
    before(() => {
        MockTime.init();
    });

    const controllerIntervals = { idleInterval: Millis(2345), activeInterval: Millis(234) };
    const deviceIntervals = { idleInterval: Millis(1234), activeInterval: Millis(321) };

    async function commissionedPair(site: MockSite) {
        const controller = await site.addController({ sessions: { intervals: controllerIntervals } });
        const device = await site.addDevice({ sessions: { intervals: deviceIntervals } });

        const controllerCrypto = controller.env.get(Crypto) as MockCrypto;
        const deviceCrypto = device.env.get(Crypto) as MockCrypto;
        controllerCrypto.entropic = deviceCrypto.entropic = true;

        await controller.start();

        const controllerSessions = new Array<NodeSession>();
        const deviceSessions = new Array<NodeSession>();
        controller.env.get(SessionManager).sessions.added.on(s => void controllerSessions.push(s));
        device.env.get(SessionManager).sessions.added.on(s => void deviceSessions.push(s));

        const { passcode, discriminator } = device.state.commissioning;
        await MockTime.resolve(controller.peers.commission({ passcode, discriminator, timeout: Seconds(90) }), {
            macrotasks: true,
        });

        return { controller, device, controllerSessions, deviceSessions };
    }

    function reportedIdle(sessions: NodeSession[], isPase: boolean) {
        return sessions.filter(s => s.isPase === isPase).map(s => s.reportedParameters?.idleInterval);
    }

    it("holds what the peer sent in PASE and CASE establishment", async () => {
        await using site = new MockSite();
        const { controllerSessions, deviceSessions } = await commissionedPair(site);

        expect(reportedIdle(controllerSessions, true)).deep.equals([1234]);
        expect(reportedIdle(deviceSessions, true)).deep.equals([2345]);
        expect(reportedIdle(controllerSessions, false)).deep.equals([1234]);
        expect(reportedIdle(deviceSessions, false)).deep.equals([2345]);
    });

    it("holds what the peer sent in a resumed CASE session", async () => {
        await using site = new MockSite();
        const { controller, controllerSessions, deviceSessions } = await commissionedPair(site);

        const peer = [...controller.env.get(PeerSet)][0];
        const address = peer.address;
        expect(controller.env.get(SessionManager).findResumptionRecordByAddress(address)).not.undefined;

        for (const session of [...peer.sessions]) {
            await MockTime.resolve(session.initiateClose(), {
                macrotasks: true,
            });
        }
        controllerSessions.length = 0;
        deviceSessions.length = 0;

        await MockTime.resolve(peer.connect(), { macrotasks: true });

        expect(reportedIdle(controllerSessions, false)).deep.equals([1234]);
        expect(reportedIdle(deviceSessions, false)).deep.equals([2345]);
    });
});
