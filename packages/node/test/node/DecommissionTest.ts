/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { BasicInformationClient } from "#behaviors/basic-information";
import { OperationalCredentialsClient } from "#behaviors/operational-credentials";
import { Seconds } from "@matter/general";
import { PeerMessageMissingError, PeerSet, PeerUnresponsiveError } from "@matter/protocol";
import { FabricIndex } from "@matter/types";
import { OperationalCredentials } from "@matter/types/clusters/operational-credentials";
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
        const { controller } = await site.addCommissionedPair();

        const peer1 = controller.peers.get("peer1")!;
        const peerAddress = peer1.peerAddress!;
        expect(controller.peers.size).equals(1);

        let stubCalled = false;
        const restore = await patchRemoveFabric(peer1, async function () {
            stubCalled = true;
            // Device tore down the session keyed to our fabric before delivering NocResponse.
            throw new PeerMessageMissingError(Seconds(11));
        });

        try {
            await MockTime.resolve(peer1.decommission());
        } finally {
            restore();
        }

        expect(stubCalled).is.true;
        expect(controller.peers.size).equals(0);
        expect(controller.env.get(PeerSet).has(peerAddress)).is.false;
    });

    it("keeps the node when removeFabric is never acknowledged", async () => {
        await using site = new MockSite();
        const { controller } = await site.addCommissionedPair();

        const peer1 = controller.peers.get("peer1")!;
        const peerAddress = peer1.peerAddress!;

        const restore = await patchRemoveFabric(peer1, async function () {
            // Outbound MRP ack never arrived: the device may never have received the command.
            throw new PeerUnresponsiveError(Seconds(11));
        });

        try {
            await expect(MockTime.resolve(peer1.decommission())).rejectedWith(PeerUnresponsiveError);
        } finally {
            restore();
        }

        expect(controller.peers.size).equals(1);
        expect(controller.env.get(PeerSet).has(peerAddress)).is.true;
    });

    it("removes the node when a matching leave event arrives even if removeFabric rejects", async () => {
        await using site = new MockSite();
        const { controller } = await site.addCommissionedPair();

        const peer1 = controller.peers.get("peer1")!;
        const peerAddress = peer1.peerAddress!;
        const fabricIndex = peer1.stateOf(OperationalCredentialsClient).currentFabricIndex;

        const restore = await patchRemoveFabric(peer1, async function () {
            // Device emits leave as a side effect of removal, then never acks our request.
            this.endpoint.eventsOf(BasicInformationClient).leave.emit({ fabricIndex }, this.context);
            throw new PeerUnresponsiveError(Seconds(11));
        });

        try {
            await MockTime.resolve(peer1.decommission());
        } finally {
            restore();
        }

        expect(controller.peers.size).equals(0);
        expect(controller.env.get(PeerSet).has(peerAddress)).is.false;
    });

    it("does not treat a leave for a different fabric as confirmation", async () => {
        await using site = new MockSite();
        const { controller } = await site.addCommissionedPair();

        const peer1 = controller.peers.get("peer1")!;
        const peerAddress = peer1.peerAddress!;
        const fabricIndex = peer1.stateOf(OperationalCredentialsClient).currentFabricIndex;
        const otherFabricIndex = FabricIndex(fabricIndex + 1);

        const restore = await patchRemoveFabric(peer1, async function () {
            this.endpoint.eventsOf(BasicInformationClient).leave.emit({ fabricIndex: otherFabricIndex }, this.context);
            throw new PeerUnresponsiveError(Seconds(11));
        });

        try {
            await expect(MockTime.resolve(peer1.decommission())).rejectedWith(PeerUnresponsiveError);
        } finally {
            restore();
        }

        expect(controller.peers.size).equals(1);
        expect(controller.env.get(PeerSet).has(peerAddress)).is.true;
    });

    it("keeps the node and throws when removeFabric returns a non-Ok status, even if a leave arrives", async () => {
        await using site = new MockSite();
        const { controller } = await site.addCommissionedPair();

        const peer1 = controller.peers.get("peer1")!;
        const fabricIndex = peer1.stateOf(OperationalCredentialsClient).currentFabricIndex;

        const restore = await patchRemoveFabric(peer1, async function () {
            // A stale/racing leave for our own fabric must NOT rescue an explicit refusal.
            this.endpoint.eventsOf(BasicInformationClient).leave.emit({ fabricIndex }, this.context);
            return {
                statusCode: OperationalCredentials.NodeOperationalCertStatus.InvalidFabricIndex,
                debugText: "no such fabric",
            };
        });

        try {
            await expect(MockTime.resolve(peer1.decommission())).rejectedWith(/failed with status/);
        } finally {
            restore();
        }

        expect(controller.peers.size).equals(1);
    });
});
