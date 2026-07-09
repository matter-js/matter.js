/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { TaskFailedError } from "#task/errors.js";
import { ADD_NODE_TO_GROUP_TYPE, AddNodeToGroupParams } from "#task/groups/AddNodeToGroup.js";
import { Task } from "#task/Task.js";
import { TaskManagerBehavior } from "#task/TaskManagerBehavior.js";
import { TaskContext, TaskPhase } from "#task/types.js";
import { DesiredStateBehavior, itemMapKey, NetworkClient, ServerNode } from "@matter/node";
import { GroupKeyManagementClient, GroupKeyManagementServer } from "@matter/node/behaviors/group-key-management";
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

const TASK_ID = `${ADD_NODE_TO_GROUP_TYPE}:peer1:${0x101}:1`;

const FAILING_TYPE = "failingProvision";
const FAILING_ID = `${FAILING_TYPE}:peer1:${0x101}`;

/**
 * Provisions the three AddNodeToGroup intents, then fails hard. Used to drive auto-rollback: the manager
 * spawns `revert:<id>` to undo the recorded changeSet.
 */
class FailingProvision extends Task<AddNodeToGroupParams> {
    readonly type = FAILING_TYPE;

    static override idFor(params: AddNodeToGroupParams): string {
        return `${FAILING_TYPE}:${params.peerId}:${params.groupId}`;
    }

    get phases(): TaskPhase[] {
        return [{ name: "provision", run: ctx => this.#provision(ctx) }];
    }

    async #provision(ctx: TaskContext): Promise<void> {
        const p = this.params;
        const peer = ctx.resolvePeer(p.peerId);
        const groupId = GroupId(p.groupId);

        await ctx.setIntent(
            peer,
            "groupKey",
            String(p.groupKeySetId),
            {
                groupKeySetId: p.groupKeySetId,
                groupKeySecurityPolicy: p.groupKeySecurityPolicy,
                epochKey0: p.epochKey0,
                epochStartTime0: p.epochStartTime0,
                epochKey1: null,
                epochStartTime1: null,
                epochKey2: null,
                epochStartTime2: null,
            },
            "converge",
        );
        await ctx.setIntent(
            peer,
            "groupKeyMap",
            String(p.groupId),
            { groupId, groupKeySetId: p.groupKeySetId },
            "converge",
        );
        await ctx.setIntent(
            peer,
            "endpointGroupMembership",
            String(p.groupId),
            { localEndpoint: p.endpoint, groupId, groupName: p.groupName },
            "converge",
        );

        throw new TaskFailedError("forced provisioning failure");
    }
}

const ControllerRoot = MockServerNode.RootEndpoint.with(TaskManagerBehavior);

function isMember(device: ServerNode, endpoint: EndpointNumber = LOCAL_EP): boolean {
    const { groupTable } = device.stateOf(GroupKeyManagementServer);
    return groupTable.some(e => e.groupId === GROUP && e.endpoints.includes(endpoint));
}

function keySetCount(device: ServerNode, id: number): number {
    return device.stateOf(GroupKeyManagementServer).groupKeySets.filter(ks => ks.groupKeySetId === id).length;
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

describe("Rollback task integration (single peer)", () => {
    before(() => {
        MockTime.init();
    });

    it("auto-rollback removes provisioned intents on a hard failure", async () => {
        await using site = new MockSite();
        const { controller, device } = await site.addCommissionedPair({
            controller: { type: ControllerRoot },
            device: { type: MockServerNode.RootEndpoint, device: OnOffLightSwitchDevice.with(GroupsServer) },
        });
        const peer = await subscribedPeer(controller, "peer1");

        await controller.act(agent => agent.get(TaskManagerBehavior).register(FAILING_TYPE, FailingProvision));
        await controller.act(agent => agent.get(TaskManagerBehavior).run(FAILING_TYPE, PARAMS));
        await awaitState(controller, FAILING_ID, "failed");

        const revertId = await controller.act(
            agent => agent.get(TaskManagerBehavior).get(FAILING_ID)?.status.revertTaskId,
        );
        expect(revertId).equals(`revert:${FAILING_ID}`);

        await awaitState(controller, `revert:${FAILING_ID}`, "completed");

        expect(itemState(peer, "groupKey", String(GROUP_KEY_SET_ID))).equals(undefined);
        expect(itemState(peer, "groupKeyMap", String(GROUP))).equals(undefined);
        expect(itemState(peer, "endpointGroupMembership", String(GROUP))).equals(undefined);
        expect(isMember(device)).equals(false);
    });

    it("cancel returns a revert handle that completes and leaves the original truthful", async () => {
        await using site = new MockSite();
        const { controller, device } = await site.addCommissionedPair({
            controller: { type: ControllerRoot },
            device: { type: MockServerNode.RootEndpoint, device: OnOffLightSwitchDevice.with(GroupsServer) },
        });
        const peer = await subscribedPeer(controller, "peer1");

        await controller.act(agent => agent.get(TaskManagerBehavior).run(ADD_NODE_TO_GROUP_TYPE, PARAMS));
        await awaitState(controller, TASK_ID, "completed");
        expect(isMember(device)).equals(true);

        const handle = await MockTime.resolve(
            controller.act(agent => agent.get(TaskManagerBehavior).cancel(TASK_ID)),
            { macrotasks: true },
        );
        expect(handle?.id).equals(`revert:${TASK_ID}`);

        await awaitState(controller, `revert:${TASK_ID}`, "completed");

        expect(itemState(peer, "groupKey", String(GROUP_KEY_SET_ID))).equals(undefined);
        expect(itemState(peer, "groupKeyMap", String(GROUP))).equals(undefined);
        expect(itemState(peer, "endpointGroupMembership", `${GROUP}:${PARAMS.endpoint}`)).equals(undefined);
        expect(isMember(device)).equals(false);

        const status = await controller.act(agent => agent.get(TaskManagerBehavior).get(TASK_ID)?.status);
        expect(status?.state).equals("completed");
    });

    it("create-if-absent provisions membership when the key set already exists on the device", async () => {
        await using site = new MockSite();
        const { controller, device } = await site.addCommissionedPair({
            controller: { type: ControllerRoot },
            device: { type: MockServerNode.RootEndpoint, device: OnOffLightSwitchDevice.with(GroupsServer) },
        });

        const peer = await subscribedPeer(controller, "peer1");

        // Pre-seed key set 42 on the device via the fabric-scoped command so apply hits the create-if-absent skip.
        await MockTime.resolve(
            peer.act(agent =>
                agent.get(GroupKeyManagementClient).keySetWrite({
                    groupKeySet: {
                        groupKeySetId: GROUP_KEY_SET_ID,
                        groupKeySecurityPolicy: TrustFirst,
                        epochKey0: new Uint8Array(16).fill(0xcd),
                        epochStartTime0: 946684800000001n,
                        epochKey1: null,
                        epochStartTime1: null,
                        epochKey2: null,
                        epochStartTime2: null,
                    },
                }),
            ),
            { macrotasks: true },
        );
        expect(keySetCount(device, GROUP_KEY_SET_ID)).equals(1);

        await controller.act(agent => agent.get(TaskManagerBehavior).run(ADD_NODE_TO_GROUP_TYPE, PARAMS));
        await awaitState(controller, TASK_ID, "completed");

        expect(isMember(device)).equals(true);
        // Epoch-key content preservation (write-skip) is covered by the Task 6 unit test; unreadable here.
        expect(keySetCount(device, GROUP_KEY_SET_ID)).equals(1);
    });

    it("resumes a parked revert across a controller restart", async () => {
        await using site = new MockSite();
        const { controller, device } = await site.addCommissionedPair({
            controller: { type: ControllerRoot },
            device: { type: MockServerNode.RootEndpoint, device: OnOffLightSwitchDevice.with(GroupsServer) },
        });

        const peer = await subscribedPeer(controller, "peer1");
        const subscription = peer.behaviors.internalsOf(NetworkClient).activeSubscription as SustainedSubscription;

        // Peer unreachable: failingProvision still sets intents, then the spawned revert parks on the offline peer.
        await MockTime.resolve(subscription.active.emit(false), { macrotasks: true });

        await controller.act(agent => agent.get(TaskManagerBehavior).register(FAILING_TYPE, FailingProvision));
        await controller.act(agent => agent.get(TaskManagerBehavior).run(FAILING_TYPE, PARAMS));
        await awaitState(controller, FAILING_ID, "failed");
        await awaitState(controller, `revert:${FAILING_ID}`, "parked");

        const id = controller.id;
        await MockTime.resolve(controller.close(), { macrotasks: true });

        const controller2 = await site.addNode(ControllerRoot, { id, index: 1 });
        await controller2.act(agent => agent.get(TaskManagerBehavior).register(FAILING_TYPE, FailingProvision));
        const resumed = await controller2.act(
            agent => agent.get(TaskManagerBehavior).state.tasks[`revert:${FAILING_ID}`]?.state,
        );
        expect(["running", "parked"]).contains(resumed);

        const peer2 = await subscribedPeer(controller2, "peer1");
        await awaitState(controller2, `revert:${FAILING_ID}`, "completed");

        expect(itemState(peer2, "groupKey", String(GROUP_KEY_SET_ID))).equals(undefined);
        expect(itemState(peer2, "groupKeyMap", String(GROUP))).equals(undefined);
        expect(itemState(peer2, "endpointGroupMembership", String(GROUP))).equals(undefined);
        expect(isMember(device)).equals(false);
    });

    it("cancelling one endpoint's membership leaves the other endpoint and the shared items intact", async () => {
        await using site = new MockSite();
        const { controller, device } = await site.addCommissionedPair({
            controller: { type: ControllerRoot },
            device: {
                type: MockServerNode.RootEndpoint,
                parts: [
                    { type: OnOffLightSwitchDevice.with(GroupsServer), number: 1 },
                    { type: OnOffLightSwitchDevice.with(GroupsServer), number: 2 },
                ],
            },
        });
        const peer = await subscribedPeer(controller, "peer1");

        const idEp1 = `${ADD_NODE_TO_GROUP_TYPE}:peer1:${0x101}:1`;
        const idEp2 = `${ADD_NODE_TO_GROUP_TYPE}:peer1:${0x101}:2`;

        await controller.act(agent =>
            agent.get(TaskManagerBehavior).run(ADD_NODE_TO_GROUP_TYPE, { ...PARAMS, endpoint: 1 }),
        );
        await awaitState(controller, idEp1, "completed");
        await controller.act(agent =>
            agent.get(TaskManagerBehavior).run(ADD_NODE_TO_GROUP_TYPE, { ...PARAMS, endpoint: 2 }),
        );
        await awaitState(controller, idEp2, "completed");

        await MockTime.resolve(
            controller.act(agent => agent.get(TaskManagerBehavior).cancel(idEp1)),
            {
                macrotasks: true,
            },
        );
        await awaitState(controller, `revert:${idEp1}`, "completed");

        expect(itemState(peer, "endpointGroupMembership", `${GROUP}:1`)).equals(undefined);
        expect(itemState(peer, "endpointGroupMembership", `${GROUP}:2`)).equals("committed");
        expect(itemState(peer, "groupKey", String(GROUP_KEY_SET_ID))).equals("committed");
        expect(itemState(peer, "groupKeyMap", String(GROUP))).equals("committed");
        expect(isMember(device, EndpointNumber(1))).equals(false);
        expect(isMember(device, EndpointNumber(2))).equals(true);
    });
});
