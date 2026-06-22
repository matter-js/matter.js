/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { ReconcilerBehavior } from "#ReconcilerBehavior.js";
import { DesiredStateBehavior, itemMapKey } from "@matter/node";
import { GroupKeyManagementServer } from "@matter/node/behaviors/group-key-management";
import { MockServerNode, MockSite, subscribedPeer } from "@matter/node/testing";
import { GroupId } from "@matter/types";
import { GroupKeyManagement } from "@matter/types/clusters/group-key-management";

const { TrustFirst } = GroupKeyManagement.GroupKeySecurityPolicy;

const keySet = {
    groupKeySetId: 42,
    groupKeySecurityPolicy: TrustFirst,
    epochKey0: new Uint8Array(16).fill(0xab),
    epochStartTime0: 946684800000001n, // must be > IPK_DEFAULT_EPOCH_START_TIME
    epochKey1: null,
    epochStartTime1: null,
    epochKey2: null,
    epochStartTime2: null,
};
const mapping = { groupId: GroupId(0x101), groupKeySetId: 42 };

describe("GroupKey reconcile integration (single peer)", () => {
    before(() => {
        MockTime.init();
    });

    it("provisions a key set and group-key map on a reachable peer", async () => {
        await using site = new MockSite();
        const { controller, device } = await site.addCommissionedPair({
            controller: { type: MockServerNode.RootEndpoint.with(ReconcilerBehavior) },
        });
        const peer = await subscribedPeer(controller, "peer1");

        await peer.act(agent => {
            const ds = agent.get(DesiredStateBehavior);
            ds.setIntent("groupKey", "42", keySet, "converge");
            ds.setIntent("groupKeyMap", String(GroupId(0x101)), mapping, "converge");
        });
        await MockTime.resolve(controller.act(agent => agent.get(ReconcilerBehavior).reconcile(peer)));

        expect(peer.stateOf(DesiredStateBehavior).items[itemMapKey("groupKey", "42")]?.status.state).equals(
            "committed",
        );
        expect(
            peer.stateOf(DesiredStateBehavior).items[itemMapKey("groupKeyMap", String(GroupId(0x101)))]?.status.state,
        ).equals("committed");

        const gkmState = device.stateOf(GroupKeyManagementServer);
        expect(gkmState.groupKeySets.some(ks => ks.groupKeySetId === 42)).equals(true);
        expect(gkmState.groupKeyMap.some(e => e.groupId === GroupId(0x101) && e.groupKeySetId === 42)).equals(true);
    });

    it("re-applies a removed key set and map entry when verify detects the gap", async () => {
        await using site = new MockSite();
        const { controller, device } = await site.addCommissionedPair({
            controller: { type: MockServerNode.RootEndpoint.with(ReconcilerBehavior) },
        });
        const peer = await subscribedPeer(controller, "peer1");

        await peer.act(agent => {
            const ds = agent.get(DesiredStateBehavior);
            ds.setIntent("groupKey", "42", keySet, "converge");
            ds.setIntent("groupKeyMap", String(GroupId(0x101)), mapping, "converge");
        });
        await MockTime.resolve(controller.act(agent => agent.get(ReconcilerBehavior).reconcile(peer)));
        expect(peer.stateOf(DesiredStateBehavior).items[itemMapKey("groupKey", "42")]?.status.state).equals(
            "committed",
        );

        // Drain ~5 s of virtual time so #onReachable's verify (keySetReadAllIndices is an INVOKE, slow under
        // MRP backoff) finishes while the keyset is still present, leaving the guard free below.
        for (let i = 0; i < 50; i++) {
            await MockTime.advance(100);
            await MockTime.macrotask;
        }

        // Remove the keyset behind the engine's back; leave groupKeyMap intact to isolate keyset drift.
        await MockTime.resolve(
            device.act("drop-keyset", agent => {
                const gkm = agent.get(GroupKeyManagementServer);
                gkm.state.groupKeySets = gkm.state.groupKeySets.filter(ks => ks.groupKeySetId !== 42);
            }),
        );

        expect(device.stateOf(GroupKeyManagementServer).groupKeySets.some(ks => ks.groupKeySetId === 42)).equals(false);

        await MockTime.resolve(
            controller.act(agent => agent.get(ReconcilerBehavior).reconcile(peer, { verify: true })),
        );

        const gkmState = device.stateOf(GroupKeyManagementServer);
        expect(gkmState.groupKeySets.some(ks => ks.groupKeySetId === 42)).equals(true);
        expect(gkmState.groupKeyMap.some(e => e.groupId === GroupId(0x101) && e.groupKeySetId === 42)).equals(true);
    });
});
