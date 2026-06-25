/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { ADD_NODE_TO_GROUP_TYPE, AddNodeToGroupParams } from "#task/AddNodeToGroup.js";
import { TaskManagerBehavior } from "#task/TaskManagerBehavior.js";
import { DesiredStateBehavior, itemMapKey, NetworkClient, ServerNode } from "@matter/node";
import { GroupKeyManagementServer } from "@matter/node/behaviors/group-key-management";
import { GroupsServer } from "@matter/node/behaviors/groups";
import { OnOffLightSwitchDevice } from "@matter/node/devices/on-off-light-switch";
import { MockServerNode, MockSite, subscribedPeer } from "@matter/node/testing";
import { SustainedSubscription } from "@matter/protocol";
import { EndpointNumber, GroupId } from "@matter/types";
import { GroupKeyManagement } from "@matter/types/clusters/group-key-management";

const { TrustFirst } = GroupKeyManagement.GroupKeySecurityPolicy;

const LOCAL_EP = EndpointNumber(1);
const GROUP = GroupId(0x101);
const GROUP_KEY_SET_ID = 42;

const PARAMS: AddNodeToGroupParams = {
    peerId: "peer1",
    endpoint: 1,
    groupId: 0x101,
    groupName: "kitchen",
    groupKeySetId: GROUP_KEY_SET_ID,
    groupKeySecurityPolicy: TrustFirst,
    epochKey0: new Uint8Array(16).fill(0xab),
    epochStartTime0: 946684800000001n, // must be > IPK_DEFAULT_EPOCH_START_TIME
};

const TASK_ID = `${ADD_NODE_TO_GROUP_TYPE}:peer1:${0x101}`;

const ControllerRoot = MockServerNode.RootEndpoint.with(TaskManagerBehavior);

function isMember(device: ServerNode): boolean {
    const { groupTable } = device.stateOf(GroupKeyManagementServer);
    return groupTable.some(e => e.groupId === GROUP && e.endpoints.includes(LOCAL_EP));
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

describe("AddNodeToGroup task integration (single peer)", () => {
    before(() => {
        MockTime.init();
    });

    it("provisions key set, map and membership and completes", async () => {
        await using site = new MockSite();
        const { controller, device } = await site.addCommissionedPair({
            controller: { type: ControllerRoot },
            device: { type: MockServerNode.RootEndpoint, device: OnOffLightSwitchDevice.with(GroupsServer) },
        });
        const peer = await subscribedPeer(controller, "peer1");

        await controller.act(agent => agent.get(TaskManagerBehavior).run("addNodeToGroup", PARAMS));
        await awaitState(controller, TASK_ID, "completed");

        expect(itemState(peer, "groupKey", String(GROUP_KEY_SET_ID))).equals("committed");
        expect(itemState(peer, "groupKeyMap", String(GROUP))).equals("committed");
        expect(itemState(peer, "endpointGroupMembership", String(GROUP))).equals("committed");
        expect(isMember(device)).equals(true);
    });

    it("parks while the peer is unreachable, then completes once it is reachable", async () => {
        await using site = new MockSite();
        const { controller, device } = await site.addCommissionedPair({
            controller: { type: ControllerRoot },
            device: { type: MockServerNode.RootEndpoint, device: OnOffLightSwitchDevice.with(GroupsServer) },
        });

        const peer = await subscribedPeer(controller, "peer1");
        const subscription = peer.behaviors.internalsOf(NetworkClient).activeSubscription as SustainedSubscription;

        // Force the sustained subscription inactive (peer unreachable). The gate must park, not fail: an
        // unreachable peer is skipped by #evaluate so the predicate stays unsatisfied and the gate waits.
        await MockTime.resolve(subscription.active.emit(false), { macrotasks: true });

        await controller.act(agent => agent.get(TaskManagerBehavior).run("addNodeToGroup", PARAMS));
        await awaitState(controller, TASK_ID, "parked");
        expect(isMember(device)).equals(false);

        // Restore reachability; the subscriptionStatusChanged wake re-drives the parked gate to completion.
        await MockTime.resolve(subscription.active.emit(true), { macrotasks: true });
        await awaitState(controller, TASK_ID, "completed");
        expect(isMember(device)).equals(true);
    });

    it("cancel reverts the three items and drops membership", async () => {
        await using site = new MockSite();
        const { controller, device } = await site.addCommissionedPair({
            controller: { type: ControllerRoot },
            device: { type: MockServerNode.RootEndpoint, device: OnOffLightSwitchDevice.with(GroupsServer) },
        });
        const peer = await subscribedPeer(controller, "peer1");

        await controller.act(agent => agent.get(TaskManagerBehavior).run("addNodeToGroup", PARAMS));
        await awaitState(controller, TASK_ID, "completed");
        expect(isMember(device)).equals(true);

        await MockTime.resolve(
            controller.act(agent => agent.get(TaskManagerBehavior).cancel(TASK_ID)),
            {
                macrotasks: true,
            },
        );

        expect(itemState(peer, "groupKey", String(GROUP_KEY_SET_ID))).equals(undefined);
        expect(itemState(peer, "groupKeyMap", String(GROUP))).equals(undefined);
        expect(itemState(peer, "endpointGroupMembership", String(GROUP))).equals(undefined);
        expect(isMember(device)).equals(false);
        const status = await controller.act(agent => agent.get(TaskManagerBehavior).get(TASK_ID)?.status);
        expect(status?.state).equals("cancelled");
    });

    it("resumes a parked task across a controller restart", async () => {
        await using site = new MockSite();
        const { controller, device } = await site.addCommissionedPair({
            controller: { type: ControllerRoot },
            device: { type: MockServerNode.RootEndpoint, device: OnOffLightSwitchDevice.with(GroupsServer) },
        });

        // Force the peer unreachable so the task persists in the parked state, then close the controller.
        const peer = await subscribedPeer(controller, "peer1");
        const subscription = peer.behaviors.internalsOf(NetworkClient).activeSubscription as SustainedSubscription;
        await MockTime.resolve(subscription.active.emit(false), { macrotasks: true });

        await controller.act(agent => agent.get(TaskManagerBehavior).run("addNodeToGroup", PARAMS));
        await awaitState(controller, TASK_ID, "parked");
        const id = controller.id;
        await MockTime.resolve(controller.close(), { macrotasks: true });

        // Recreate the controller from the same storage (keyed by id) on the same network host (index 1).
        // The persisted parked task resumes once the node is online and the peer subscription re-establishes.
        const controller2 = await site.addNode(ControllerRoot, { id, index: 1 });
        const resumed = await controller2.act(agent => agent.get(TaskManagerBehavior).state.tasks[TASK_ID]?.state);
        expect(["running", "parked"]).contains(resumed);

        await subscribedPeer(controller2, "peer1");
        await awaitState(controller2, TASK_ID, "completed");
        expect(isMember(device)).equals(true);
    });
});
