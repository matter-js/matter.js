/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { OperationalCredentialsClient } from "#behaviors/operational-credentials";
import { Seconds } from "@matter/general";
import { PeerSet, PeerUnresponsiveError } from "@matter/protocol";
import { FabricIndex } from "@matter/types";
import { MockSite } from "./mock-site.js";

/**
 * Replace the exact `removeFabric` the decommission path invokes, on the runtime prototype of the peer's
 * OperationalCredentialsClient facade.  Robust to per-endpoint behavior specialization.  Returns a restore fn.
 *
 * `impl` runs with `this` bound to the behavior facade (has `.endpoint` and `.context`), so it can emit a client-side
 * leave event before resolving/rejecting to mimic the device's teardown.
 */
async function patchRemoveFabric(
    peer: any,
    impl: (this: any, request: { fabricIndex: FabricIndex }) => Promise<unknown>,
) {
    const proto = await peer.act((agent: any) => Object.getPrototypeOf(agent.get(OperationalCredentialsClient)));
    const original = proto.removeFabric;
    proto.removeFabric = impl;
    return () => {
        proto.removeFabric = original;
    };
}

describe("Decommission", () => {
    before(() => {
        MockTime.init();
    });

    it("removes the node when removeFabric is delivered but the response is lost", async () => {
        await using site = new MockSite();
        const { controller, device } = await site.addCommissionedPair();

        const peer1 = controller.peers.get("peer1")!;
        const peerAddress = peer1.peerAddress!;
        expect(controller.peers.size).equals(1);

        let stubCalled = false;
        const restore = await patchRemoveFabric(peer1, async function () {
            stubCalled = true;
            // Device tore down the session keyed to our fabric before delivering NocResponse.
            throw new PeerUnresponsiveError(Seconds(11));
        });

        try {
            await MockTime.resolve(peer1.decommission());
        } finally {
            restore();
        }

        expect(stubCalled).is.true;
        expect(controller.peers.size).equals(0);
        expect(controller.env.get(PeerSet).has(peerAddress)).is.false;
        void device;
    });
});
