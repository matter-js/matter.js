/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { ReconcilerBehavior } from "#ReconcilerBehavior.js";
import { DesiredStateBehavior, itemMapKey, ServerNode } from "@matter/node";
import { GroupKeyManagementServer } from "@matter/node/behaviors/group-key-management";
import { GroupsServer } from "@matter/node/behaviors/groups";
import { OnOffLightSwitchDevice } from "@matter/node/devices/on-off-light-switch";
import { MockServerNode, MockSite, subscribedPeer } from "@matter/node/testing";
import { EndpointNumber, GroupId } from "@matter/types";
import { GroupKeyManagement } from "@matter/types/clusters/group-key-management";

const { TrustFirst } = GroupKeyManagement.GroupKeySecurityPolicy;

const LOCAL_EP = EndpointNumber(1);
const GROUP = GroupId(0x101);

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
const mapping = { groupId: GROUP, groupKeySetId: 42 };
const membership = { localEndpoint: LOCAL_EP, groupId: GROUP, groupName: "kitchen" };

function isMember(device: ServerNode): boolean {
    const { groupTable } = device.stateOf(GroupKeyManagementServer);
    return groupTable.some(e => e.groupId === GROUP && e.endpoints.includes(LOCAL_EP));
}

describe("Group membership reconcile integration (single peer)", () => {
    before(() => {
        MockTime.init();
    });

    it("adds an endpoint to a group after provisioning its key set and map", async () => {
        await using site = new MockSite();
        const { controller, device } = await site.addCommissionedPair({
            controller: { type: MockServerNode.RootEndpoint.with(ReconcilerBehavior) },
            device: { type: MockServerNode.RootEndpoint, device: OnOffLightSwitchDevice.with(GroupsServer) },
        });
        const peer = await subscribedPeer(controller, "peer1");

        await peer.act(agent => {
            const ds = agent.get(DesiredStateBehavior);
            ds.setIntent("groupKey", "42", keySet, "converge");
            ds.setIntent("groupKeyMap", String(GROUP), mapping, "converge");
            ds.setIntent("endpointGroupMembership", String(GROUP), membership, "converge");
        });
        await MockTime.resolve(controller.act(agent => agent.get(ReconcilerBehavior).reconcile(peer)));

        expect(
            peer.stateOf(DesiredStateBehavior).items[itemMapKey("endpointGroupMembership", String(GROUP))]?.status
                .state,
        ).equals("committed");
        expect(isMember(device)).equals(true);
    });

    it("re-adds the endpoint to the group when verify detects a behind-the-back removal", async () => {
        await using site = new MockSite();
        const { controller, device } = await site.addCommissionedPair({
            controller: { type: MockServerNode.RootEndpoint.with(ReconcilerBehavior) },
            device: { type: MockServerNode.RootEndpoint, device: OnOffLightSwitchDevice.with(GroupsServer) },
        });
        const peer = await subscribedPeer(controller, "peer1");

        await peer.act(agent => {
            const ds = agent.get(DesiredStateBehavior);
            ds.setIntent("groupKey", "42", keySet, "converge");
            ds.setIntent("groupKeyMap", String(GROUP), mapping, "converge");
            ds.setIntent("endpointGroupMembership", String(GROUP), membership, "converge");
        });
        await MockTime.resolve(controller.act(agent => agent.get(ReconcilerBehavior).reconcile(peer)));
        expect(isMember(device)).equals(true);

        // Drain ~5 s of virtual time so the subscription-active verify pass (Groups commands are INVOKEs,
        // slow under MRP backoff) finishes while membership is intact, before we mutate below.
        for (let i = 0; i < 50; i++) {
            await MockTime.advance(100);
            await MockTime.macrotask;
        }

        // GroupsServer.removeGroup calls assertRemoteActor, so we can't use a local act. Mutate groupTable
        // directly (same idiom as GroupKeyIntegrationTest dropping a keyset).
        await MockTime.resolve(
            device.act("drop-membership", agent => {
                const gkm = agent.get(GroupKeyManagementServer);
                gkm.state.groupTable = gkm.state.groupTable.filter(
                    e => !(e.groupId === GROUP && e.endpoints.includes(LOCAL_EP)),
                );
            }),
        );
        expect(isMember(device)).equals(false);

        await MockTime.resolve(
            controller.act(agent => agent.get(ReconcilerBehavior).reconcile(peer, { verify: true })),
        );

        expect(isMember(device)).equals(true);
    });

    it("removes the endpoint from the group on a removeIntent", async () => {
        await using site = new MockSite();
        const { controller, device } = await site.addCommissionedPair({
            controller: { type: MockServerNode.RootEndpoint.with(ReconcilerBehavior) },
            device: { type: MockServerNode.RootEndpoint, device: OnOffLightSwitchDevice.with(GroupsServer) },
        });
        const peer = await subscribedPeer(controller, "peer1");

        await peer.act(agent => {
            const ds = agent.get(DesiredStateBehavior);
            ds.setIntent("groupKey", "42", keySet, "converge");
            ds.setIntent("groupKeyMap", String(GROUP), mapping, "converge");
            ds.setIntent("endpointGroupMembership", String(GROUP), membership, "converge");
        });
        await MockTime.resolve(controller.act(agent => agent.get(ReconcilerBehavior).reconcile(peer)));
        expect(isMember(device)).equals(true);

        await peer.act(agent => agent.get(DesiredStateBehavior).removeIntent("endpointGroupMembership", String(GROUP)));
        await MockTime.resolve(controller.act(agent => agent.get(ReconcilerBehavior).reconcile(peer)));

        expect(isMember(device)).equals(false);
    });
});
