/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { ADD_NODE_TO_GROUP_TYPE, AddNodeToGroupParams } from "#task/groups/AddNodeToGroup.js";
import { ROTATE_GROUP_KEY_TYPE, RotateGroupKeyParams } from "#task/groups/RotateGroupKey.js";
import { TaskManagerBehavior } from "#task/TaskManagerBehavior.js";
import { Bytes } from "@matter/general";
import { DesiredStateBehavior, itemMapKey, ServerNode } from "@matter/node";
import { GroupKeyManagementServer } from "@matter/node/behaviors/group-key-management";
import { GroupsServer } from "@matter/node/behaviors/groups";
import { OnOffLightSwitchDevice } from "@matter/node/devices/on-off-light-switch";
import { MockServerNode, MockSite, subscribedPeer } from "@matter/node/testing";
import { GroupKeyManagement } from "@matter/types/clusters/group-key-management";

const { TrustFirst } = GroupKeyManagement.GroupKeySecurityPolicy;

const GROUP_KEY_SET_ID = 42;
const OP_KEY = new Uint8Array(16).fill(0xab);
const OP_START = 946684800000001n; // just above IPK_DEFAULT_EPOCH_START_TIME (2000-01-01 in unix-µs)
const NEW_KEY = new Uint8Array(16).fill(0xcd);

const MAX_64BIT_TIME = BigInt("0xffffffffffffffff");

const ADD_PARAMS: AddNodeToGroupParams = {
    peerId: "peer1",
    endpoint: 1,
    groupId: 0x101,
    groupName: "kitchen",
    groupKeySetId: GROUP_KEY_SET_ID,
    groupKeySecurityPolicy: TrustFirst,
    epochKey0: OP_KEY,
    epochStartTime0: OP_START,
};

const ROTATION_ID = "r1";

const ROTATE_PARAMS: RotateGroupKeyParams = {
    groupKeySetId: GROUP_KEY_SET_ID,
    newEpochKey: NEW_KEY,
    rotationId: ROTATION_ID,
};

const ADD_ID = `${ADD_NODE_TO_GROUP_TYPE}:peer1:${0x101}:1`;
const ROTATE_ID = `${ROTATE_GROUP_KEY_TYPE}:${GROUP_KEY_SET_ID}:${ROTATION_ID}`;

/** Snapshot of a keySetWrite, captured before the server mutates the request (MAX-sentinel nulling). */
type WriteSnapshot = GroupKeyManagement.GroupKeySet;

const writes = new Array<WriteSnapshot>();

/** Records every keySetWrite the reconciler drives so phase ordering can be asserted against real device writes. */
class RecordingGroupKeyManagementServer extends GroupKeyManagementServer {
    override async keySetWrite(request: GroupKeyManagement.KeySetWriteRequest) {
        writes.push({ ...request.groupKeySet });
        return super.keySetWrite(request);
    }
}

const ControllerRoot = MockServerNode.RootEndpoint.with(TaskManagerBehavior);
const DeviceRoot = MockServerNode.RootEndpoint.with(RecordingGroupKeyManagementServer);

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

/** Non-null epochStartTimes of a struct as sorted bigints. */
function starts(g: WriteSnapshot): bigint[] {
    return [g.epochStartTime0, g.epochStartTime1, g.epochStartTime2]
        .filter((t): t is number | bigint => t !== null && t !== undefined)
        .map(t => BigInt(t))
        .sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
}

/** The device's live start-time set for a key set id, from its persisted state. */
function deviceStarts(device: ServerNode, id: number): bigint[] {
    const entry = device.stateOf(GroupKeyManagementServer).groupKeySets.find(k => k.groupKeySetId === id);
    return entry === undefined ? new Array<bigint>() : starts(entry);
}

describe("RotateGroupKey task integration (single member)", () => {
    before(() => MockTime.init());
    beforeEach(() => (writes.length = 0));

    it("rotates through distribute→activate→cleanup to a single new key", async () => {
        await using site = new MockSite();
        const { controller, device } = await site.addCommissionedPair({
            controller: { type: ControllerRoot },
            device: { type: DeviceRoot, device: OnOffLightSwitchDevice.with(GroupsServer) },
        });
        await subscribedPeer(controller, "peer1");

        // Provision the operational key set (the "op") first, then rotate it.
        await controller.act(a => a.get(TaskManagerBehavior).run("addNodeToGroup", ADD_PARAMS));
        await awaitState(controller, ADD_ID, "completed");
        expect(deviceStarts(device, GROUP_KEY_SET_ID)).deep.equals([OP_START]);

        writes.length = 0; // ignore the provisioning write; record only the rotation
        await controller.act(a => a.get(TaskManagerBehavior).run("rotateGroupKey", ROTATE_PARAMS));
        await awaitState(controller, ROTATE_ID, "completed");

        // Three phases, each a distinct start-time set that write-if-set-differs actually wrote.
        expect(writes.length).equals(3);
        const [distribute, activate, cleanup] = writes;
        expect(writes.map(w => starts(w).length)).deep.equals([2, 3, 1]);

        // distribute: {op(past), new(far-future dormant)} — everyone still TX op, all now hold new.
        expect(starts(distribute)[0]).equals(OP_START);
        expect(starts(distribute)[1] > OP_START).equals(true);
        expect(Bytes.areEqual(distribute.epochKey0!, OP_KEY)).equals(true);
        expect(Bytes.areEqual(distribute.epochKey1!, NEW_KEY)).equals(true);
        expect(distribute.epochKey2).equals(null);
        const farFuture = BigInt(distribute.epochStartTime1!);
        expect(farFuture < MAX_64BIT_TIME).equals(true);

        // activate: {op(past) < new(now, past) < sentinel(far-future)} — TX flips to new gap-free.
        const [aOp, aNew, aSentinel] = starts(activate);
        expect(aOp).equals(OP_START);
        expect(aOp < aNew).equals(true);
        expect(aNew < aSentinel).equals(true);
        expect(aSentinel < MAX_64BIT_TIME).equals(true);
        expect(Bytes.areEqual(activate.epochKey0!, OP_KEY)).equals(true);
        expect(Bytes.areEqual(activate.epochKey1!, NEW_KEY)).equals(true);
        // Sentinel is fresh random material, distinct from both op and new, present only in activate slot 2.
        expect(activate.epochKey2).not.equals(null);
        expect(Bytes.areEqual(activate.epochKey2!, OP_KEY)).equals(false);
        expect(Bytes.areEqual(activate.epochKey2!, NEW_KEY)).equals(false);

        // cleanup: {new(firmly-past)} — op AND sentinel dropped; the new material that became TX survives.
        expect(starts(cleanup).length).equals(1);
        expect(Bytes.areEqual(cleanup.epochKey0!, NEW_KEY)).equals(true);
        expect(cleanup.epochKey1).equals(null);
        expect(cleanup.epochKey2).equals(null);
        // The sole surviving key is back-dated to a firmly-past start so it is selectable on any device clock
        // (a "now"-dated sole key would fail TX on a device whose clock lags the controller).
        expect(starts(cleanup)[0]).equals(OP_START);
        expect(aNew > OP_START).equals(true); // and it is genuinely earlier than the now-dated activate start
        // Same material is TX in activate (slot 1) and survives cleanup (slot 0) — no second gap.
        expect(Bytes.areEqual(activate.epochKey1!, cleanup.epochKey0!)).equals(true);

        // Steady state on the device is exactly one key.
        expect(deviceStarts(device, GROUP_KEY_SET_ID).length).equals(1);
    });

    it("refuses to rotate a member whose keyset is not a single-key steady state", async () => {
        await using site = new MockSite();
        const { controller, device } = await site.addCommissionedPair({
            controller: { type: ControllerRoot },
            device: { type: DeviceRoot, device: OnOffLightSwitchDevice.with(GroupsServer) },
        });
        const peer = await subscribedPeer(controller, "peer1");

        await controller.act(a => a.get(TaskManagerBehavior).run("addNodeToGroup", ADD_PARAMS));
        await awaitState(controller, ADD_ID, "completed");

        // Seed a committed multi-epoch intent (slot 1 populated) directly, without emitting itemChanged so no
        // reconcile fires — the object identity below is the proof the rotation never rewrote the intent.
        const multiEpoch: GroupKeyManagement.GroupKeySet = {
            groupKeySetId: GROUP_KEY_SET_ID,
            groupKeySecurityPolicy: TrustFirst,
            epochKey0: OP_KEY,
            epochStartTime0: OP_START,
            epochKey1: new Uint8Array(16).fill(0xef),
            epochStartTime1: OP_START + 1000n,
            epochKey2: null,
            epochStartTime2: null,
        };
        const itemKey = itemMapKey("groupKey", String(GROUP_KEY_SET_ID));
        await peer.act(agent => {
            const ds = agent.get(DesiredStateBehavior);
            const existing = ds.state.items[itemKey];
            ds.state.items = { ...ds.state.items, [itemKey]: { ...existing, intent: multiEpoch } };
        });

        writes.length = 0;
        await controller.act(a => a.get(TaskManagerBehavior).run("rotateGroupKey", ROTATE_PARAMS));
        await awaitState(controller, ROTATE_ID, "failed");

        const status = await controller.act(a => a.get(TaskManagerBehavior).get(ROTATE_ID)?.status);
        expect(status?.error).contains("single-key steady state");

        // Nothing was mutated: no device write, and the seeded intent object is untouched (reference-equal).
        expect(writes.length).equals(0);
        const item = peer.stateOf(DesiredStateBehavior).items[itemKey];
        expect(item?.intent).equals(multiEpoch);
        expect(item?.status.state).equals("committed");
        expect(deviceStarts(device, GROUP_KEY_SET_ID)).deep.equals([OP_START]);
    });

    it("completes trivially when no member holds the key set (no writes)", async () => {
        await using site = new MockSite();
        const { controller } = await site.addCommissionedPair({
            controller: { type: ControllerRoot },
            device: { type: DeviceRoot, device: OnOffLightSwitchDevice.with(GroupsServer) },
        });
        await subscribedPeer(controller, "peer1");

        await controller.act(a =>
            a.get(TaskManagerBehavior).run("rotateGroupKey", { ...ROTATE_PARAMS, groupKeySetId: 99 }),
        );
        await awaitState(controller, `${ROTATE_GROUP_KEY_TYPE}:99:${ROTATION_ID}`, "completed");
        expect(writes.length).equals(0);
    });
});
