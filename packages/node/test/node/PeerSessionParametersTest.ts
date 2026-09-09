/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { Crypto, MockCrypto, Seconds } from "@matter/general";
import { Peer, PeerSet } from "@matter/protocol";
import { MockSite } from "./mock-site.js";

describe("Peer session parameters", () => {
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
        return peers[0] as Peer;
    }

    // Characterization: the paths per invoke of the session the peer negotiated bounds what we send, even where the
    // peer's Basic Information cluster reports a higher limit. A missing MAX_PATHS_PER_INVOKE means one path, and the
    // reference implementation likewise reads only the session's value.
    it("bounds paths per invoke by the negotiated session rather than the reported attribute", async () => {
        await using site = new MockSite();
        const peer = await commissionedPeer(site);

        expect(peer.basicInformation?.maxPathsPerInvoke).equals(10);

        peer.descriptor.sessionParameters = { ...peer.sessionParameters, maxPathsPerInvoke: 1 };

        expect(peer.sessionParameters.maxPathsPerInvoke).equals(1);
    });
});
