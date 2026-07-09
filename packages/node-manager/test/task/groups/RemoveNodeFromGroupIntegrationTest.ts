/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { ADD_NODE_TO_GROUP_TYPE, AddNodeToGroupParams } from "#task/groups/AddNodeToGroup.js";
import { membershipKey } from "#task/groups/keys.js";
import { REMOVE_NODE_FROM_GROUP_TYPE } from "#task/groups/RemoveNodeFromGroup.js";
import { TaskManagerBehavior } from "#task/TaskManagerBehavior.js";
import { DesiredStateBehavior, itemMapKey, ServerNode } from "@matter/node";
import { GroupKeyManagementClient, GroupKeyManagementServer } from "@matter/node/behaviors/group-key-management";
import { GroupsServer } from "@matter/node/behaviors/groups";
import { OnOffLightSwitchDevice } from "@matter/node/devices/on-off-light-switch";
import { MockServerNode, MockSite, subscribedPeer } from "@matter/node/testing";
import { EndpointNumber, GroupId } from "@matter/types";
import { GroupKeyManagement } from "@matter/types/clusters/group-key-management";

const { TrustFirst } = GroupKeyManagement.GroupKeySecurityPolicy;

const LOCAL_EP = EndpointNumber(1);
const GROUP_A = 0x101;
const GROUP_B = 0x102;
const SHARED_KEY_SET = 42;

const ControllerRoot = MockServerNode.RootEndpoint.with(TaskManagerBehavior);

function addParams(groupId: number, groupKeySetId: number, endpoint = 1): AddNodeToGroupParams {
    return {
        peerId: "peer1",
        endpoint,
        groupId,
        groupName: `g${groupId}`,
        groupKeySetId,
        groupKeySecurityPolicy: TrustFirst,
        epochKey0: new Uint8Array(16).fill(0xab),
        epochStartTime0: 946684800000001n, // must be > IPK_DEFAULT_EPOCH_START_TIME
    };
}

const addTaskId = (groupId: number, endpoint = 1) => `${ADD_NODE_TO_GROUP_TYPE}:peer1:${groupId}:${endpoint}`;
const removeTaskId = (groupId: number, endpoint = 1) => `${REMOVE_NODE_FROM_GROUP_TYPE}:peer1:${groupId}:${endpoint}`;

function isMember(device: ServerNode, groupId: number, endpoint: EndpointNumber = LOCAL_EP): boolean {
    const { groupTable } = device.stateOf(GroupKeyManagementServer);
    return groupTable.some(e => e.groupId === GroupId(groupId) && e.endpoints.includes(endpoint));
}

function itemState(
    peer: { stateOf(type: unknown): { items: Record<string, { status: { state: string } }> } },
    kind: string,
    key: string,
) {
    return peer.stateOf(DesiredStateBehavior).items[itemMapKey(kind, key)]?.status.state;
}

/** Pump virtual time + macrotasks until the persisted task state is one of `states` (else throw). */
async function awaitState(node: ServerNode, id: string, ...states: string[]): Promise<void> {
    for (let i = 0; i < 2_000; i++) {
        const state = await node.act(a => a.get(TaskManagerBehavior).state.tasks[id]?.state);
        if (state !== undefined && states.includes(state)) {
            return;
        }
        await MockTime.advance(100);
        await MockTime.macrotask;
    }
    throw new Error(`Task ${id} did not reach state ${states.join("|")}`);
}

describe("RemoveNodeFromGroup task integration (single peer)", () => {
    before(() => {
        MockTime.init();
    });

    it("round-trips: add provisions the three items, remove drops them all", async () => {
        await using site = new MockSite();
        const { controller, device } = await site.addCommissionedPair({
            controller: { type: ControllerRoot },
            device: { type: MockServerNode.RootEndpoint, device: OnOffLightSwitchDevice.with(GroupsServer) },
        });
        const peer = await subscribedPeer(controller, "peer1");

        await controller.act(a => a.get(TaskManagerBehavior).run("addNodeToGroup", addParams(GROUP_A, SHARED_KEY_SET)));
        await awaitState(controller, addTaskId(GROUP_A), "completed");
        expect(isMember(device, GROUP_A)).equals(true);

        await controller.act(a =>
            a.get(TaskManagerBehavior).run("removeNodeFromGroup", { peerId: "peer1", endpoint: 1, groupId: GROUP_A }),
        );
        await awaitState(controller, removeTaskId(GROUP_A), "completed");

        expect(itemState(peer, "endpointGroupMembership", membershipKey(GROUP_A, 1))).equals(undefined);
        expect(itemState(peer, "groupKeyMap", String(GROUP_A))).equals(undefined);
        expect(itemState(peer, "groupKey", String(SHARED_KEY_SET))).equals(undefined);
        expect(isMember(device, GROUP_A)).equals(false);
    });

    it("keeps a shared key set while another group still maps it", async () => {
        await using site = new MockSite();
        const { controller, device } = await site.addCommissionedPair({
            controller: { type: ControllerRoot },
            device: { type: MockServerNode.RootEndpoint, device: OnOffLightSwitchDevice.with(GroupsServer) },
        });
        const peer = await subscribedPeer(controller, "peer1");

        await controller.act(a => a.get(TaskManagerBehavior).run("addNodeToGroup", addParams(GROUP_A, SHARED_KEY_SET)));
        await awaitState(controller, addTaskId(GROUP_A), "completed");
        await controller.act(a => a.get(TaskManagerBehavior).run("addNodeToGroup", addParams(GROUP_B, SHARED_KEY_SET)));
        await awaitState(controller, addTaskId(GROUP_B), "completed");

        await controller.act(a =>
            a.get(TaskManagerBehavior).run("removeNodeFromGroup", { peerId: "peer1", endpoint: 1, groupId: GROUP_A }),
        );
        await awaitState(controller, removeTaskId(GROUP_A), "completed");

        expect(itemState(peer, "endpointGroupMembership", membershipKey(GROUP_A, 1))).equals(undefined);
        expect(itemState(peer, "groupKeyMap", String(GROUP_A))).equals(undefined);
        expect(isMember(device, GROUP_A)).equals(false);

        // Group B still maps key set 42, so the shared key-set intent and B's membership survive.
        expect(itemState(peer, "groupKey", String(SHARED_KEY_SET))).equals("committed");
        expect(itemState(peer, "groupKeyMap", String(GROUP_B))).equals("committed");
        expect(itemState(peer, "endpointGroupMembership", membershipKey(GROUP_B, 1))).equals("committed");
        expect(isMember(device, GROUP_B)).equals(true);
    });

    it("rejects an add that would exceed the device group capacity", async () => {
        await using site = new MockSite();
        const { controller, device } = await site.addCommissionedPair({
            controller: { type: ControllerRoot },
            device: {
                type: MockServerNode.RootEndpoint,
                device: OnOffLightSwitchDevice.with(GroupsServer),
                groupKeyManagement: { maxGroupsPerFabric: 4 }, // spec minimum, saturates in four provisions
            },
        });
        const peer = await subscribedPeer(controller, "peer1");

        // Read the limit from the peer's cached state, not a constant: a broken cache read must fail loudly.
        const limit = peer.stateOf(GroupKeyManagementClient).maxGroupsPerFabric;
        expect(limit).equals(4);
        for (let i = 0; i < limit; i++) {
            const groupId = 0x201 + i;
            await controller.act(a => a.get(TaskManagerBehavior).run("addNodeToGroup", addParams(groupId, 50 + i)));
            await awaitState(controller, addTaskId(groupId), "completed");
        }

        const overGroup = 0x201 + limit;
        await controller.act(a => a.get(TaskManagerBehavior).run("addNodeToGroup", addParams(overGroup, 50 + limit)));
        await awaitState(controller, addTaskId(overGroup), "failed");

        const error = await controller.act(a => a.get(TaskManagerBehavior).state.tasks[addTaskId(overGroup)]?.error);
        expect(error).contains("capacity");

        // Admission rejects before any node mutation: no new group, no leftover intent.
        expect(isMember(device, overGroup)).equals(false);
        expect(itemState(peer, "groupKeyMap", String(overGroup))).equals(undefined);
        expect(itemState(peer, "endpointGroupMembership", membershipKey(overGroup, 1))).equals(undefined);
    });
});
