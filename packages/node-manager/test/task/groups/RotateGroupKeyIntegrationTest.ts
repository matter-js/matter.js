/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { ReconcilerBehavior } from "#ReconcilerBehavior.js";
import { ADD_NODE_TO_GROUP_TYPE, AddNodeToGroupParams } from "#task/groups/AddNodeToGroup.js";
import { ROTATE_GROUP_KEY_TYPE, RotateGroupKeyParams } from "#task/groups/RotateGroupKey.js";
import { TaskManagerBehavior } from "#task/TaskManagerBehavior.js";
import { Crypto, MockCrypto, Seconds } from "@matter/general";
import { ClientNode, DesiredStateBehavior, itemMapKey, NetworkClient, ServerNode } from "@matter/node";
import { GroupKeyManagementServer } from "@matter/node/behaviors/group-key-management";
import { GroupsServer } from "@matter/node/behaviors/groups";
import { OnOffLightSwitchDevice } from "@matter/node/devices/on-off-light-switch";
import { MockServerNode, MockSite, subscribedPeer } from "@matter/node/testing";
import { FabricManager, SustainedSubscription } from "@matter/protocol";
import { FabricId } from "@matter/types";
import { GroupKeyManagement } from "@matter/types/clusters/group-key-management";

const { TrustFirst } = GroupKeyManagement.GroupKeySecurityPolicy;

const GROUP = 0x101;
const GROUP_KEY_SET_ID = 42;
const OP_KEY = new Uint8Array(16).fill(0xab);
const OP_START = 946684800000001n; // just above IPK_DEFAULT_EPOCH_START_TIME (2000-01-01 in unix-µs)
const NEW_KEY = new Uint8Array(16).fill(0xcd);

const ROTATE_PARAMS: RotateGroupKeyParams = { groupKeySetId: GROUP_KEY_SET_ID, newEpochKey: NEW_KEY };
const ROTATE_ID = `${ROTATE_GROUP_KEY_TYPE}:${GROUP_KEY_SET_ID}`;

const ControllerRoot = MockServerNode.RootEndpoint.with(TaskManagerBehavior);
const MEMBER_DEVICE = OnOffLightSwitchDevice.with(GroupsServer);

/** Per-device record of keySetWrite start-time sets, in call order — the proof a rotation did real work. */
const writesA = new Array<bigint[]>();
const writesB = new Array<bigint[]>();

/** A device root whose GroupKeyManagementServer records every keySetWrite's start-time set into `sink`. */
function recordingRoot(sink: bigint[][]) {
    class RecordingGroupKeyManagementServer extends GroupKeyManagementServer {
        override async keySetWrite(request: GroupKeyManagement.KeySetWriteRequest) {
            sink.push(starts(request.groupKeySet));
            return super.keySetWrite(request);
        }
    }
    return MockServerNode.RootEndpoint.with(RecordingGroupKeyManagementServer);
}

const DeviceRootA = recordingRoot(writesA);
const DeviceRootB = recordingRoot(writesB);

function addParamsFor(peerId: string): AddNodeToGroupParams {
    return {
        peerId,
        endpoint: 1,
        groupId: GROUP,
        groupName: "kitchen",
        groupKeySetId: GROUP_KEY_SET_ID,
        groupKeySecurityPolicy: TrustFirst,
        epochKey0: OP_KEY,
        epochStartTime0: OP_START,
    };
}

const addTaskId = (peerId: string) => `${ADD_NODE_TO_GROUP_TYPE}:${peerId}:${GROUP}:1`;

/** Non-null epochStartTimes of a key-set struct as sorted bigints. */
function starts(g: {
    epochStartTime0?: number | bigint | null;
    epochStartTime1?: number | bigint | null;
    epochStartTime2?: number | bigint | null;
}): bigint[] {
    return [g.epochStartTime0, g.epochStartTime1, g.epochStartTime2]
        .filter((t): t is number | bigint => t !== null && t !== undefined)
        .map(t => BigInt(t))
        .sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
}

/** The device's live start-time set for a key set id, from its persisted attribute state. */
function deviceStarts(device: ServerNode, id: number): bigint[] {
    const entry = device.stateOf(GroupKeyManagementServer).groupKeySets.find(k => k.groupKeySetId === id);
    return entry === undefined ? new Array<bigint>() : starts(entry);
}

/** The controller-side committed intent's start-time set for a peer's key set (unreadable material aside). */
function intentStarts(peer: ClientNode, id: number): bigint[] {
    const item = peer.stateOf(DesiredStateBehavior).items[itemMapKey("groupKey", String(id))];
    return item === undefined ? new Array<bigint>() : starts(item.intent as Parameters<typeof starts>[0]);
}

function intentState(peer: ClientNode, id: number): string | undefined {
    return peer.stateOf(DesiredStateBehavior).items[itemMapKey("groupKey", String(id))]?.status.state;
}

function subscriptionOf(peer: ClientNode): SustainedSubscription {
    return peer.behaviors.internalsOf(NetworkClient).activeSubscription as SustainedSubscription;
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

/** Commission two member devices onto one controller and provision both into the shared key set 42. */
async function twoMemberGroup(site: MockSite) {
    const controller = await site.addNode(ControllerRoot, {
        online: false,
        id: "controller1",
        index: 1,
        controller: { adminFabricId: FabricId(1) },
        commissioning: { enabled: false },
    });
    const deviceA = await site.addNode(DeviceRootA, { device: MEMBER_DEVICE, index: 2, id: "deviceA" });
    const deviceB = await site.addNode(DeviceRootB, { device: MEMBER_DEVICE, index: 3, id: "deviceB" });

    const controllerCrypto = controller.env.get(Crypto) as MockCrypto;
    const cryptoA = deviceA.env.get(Crypto) as MockCrypto;
    const cryptoB = deviceB.env.get(Crypto) as MockCrypto;

    // Entropy avoids session-id collisions while multiple PASE/CASE sessions establish during pairing.
    controllerCrypto.entropic = cryptoA.entropic = cryptoB.entropic = true;
    if (!controller.lifecycle.isOnline) {
        await controller.start();
    }

    const peers = new Array<ClientNode>();
    for (const device of [deviceA, deviceB]) {
        const { passcode, discriminator } = device.state.commissioning;
        const peer = await MockTime.resolve(
            controller.peers.commission({ passcode, discriminator, timeout: Seconds(90) }),
            { macrotasks: true },
        );
        peers.push(peer);
    }
    controllerCrypto.entropic = cryptoA.entropic = cryptoB.entropic = false;

    const [peerA, peerB] = peers;
    await subscribedPeer(controller, peerA.id);
    await subscribedPeer(controller, peerB.id);

    for (const peer of peers) {
        await controller.act(a => a.get(TaskManagerBehavior).run("addNodeToGroup", addParamsFor(peer.id)));
        await awaitState(controller, addTaskId(peer.id), "completed");
    }

    return { controller, deviceA, deviceB, peerA, peerB };
}

describe("RotateGroupKey task integration (two members)", () => {
    before(() => MockTime.init());
    beforeEach(() => {
        writesA.length = 0;
        writesB.length = 0;
    });

    it("rotates the shared key across both members to a single new key", async () => {
        await using site = new MockSite();
        const { controller, deviceA, deviceB, peerA, peerB } = await twoMemberGroup(site);

        expect(deviceStarts(deviceA, GROUP_KEY_SET_ID)).deep.equals([OP_START]);
        expect(deviceStarts(deviceB, GROUP_KEY_SET_ID)).deep.equals([OP_START]);

        // Record only the rotation, not the provisioning write.
        writesA.length = writesB.length = 0;

        await controller.act(a => a.get(TaskManagerBehavior).run("rotateGroupKey", ROTATE_PARAMS));
        await awaitState(controller, ROTATE_ID, "completed");

        // Cleanup back-dates the sole surviving key to the ORIGINAL op start, so the final device start-set is
        // indistinguishable from the pre-rotation set (material is unreadable). The per-phase writes are the
        // real proof both members were driven through the full rotation: distribute (2 starts) → activate
        // (3) → cleanup (1). A no-op rotation (e.g. an empty member set) records nothing and fails here.
        expect(writesA.map(s => s.length)).deep.equals([2, 3, 1]);
        expect(writesB.map(s => s.length)).deep.equals([2, 3, 1]);
        expect(writesA[2]).deep.equals([OP_START]); // sole surviving key back-dated to the original op start
        expect(writesB[2]).deep.equals([OP_START]);

        for (const [device, peer] of [
            [deviceA, peerA],
            [deviceB, peerB],
        ] as const) {
            expect(deviceStarts(device, GROUP_KEY_SET_ID)).deep.equals([OP_START]);
            expect(intentState(peer, GROUP_KEY_SET_ID)).equals("committed");
            expect(intentStarts(peer, GROUP_KEY_SET_ID)).deep.equals([OP_START]);
        }
    });

    it("parks when a member is offline, holding the barrier, then converges once it returns", async () => {
        await using site = new MockSite();
        const { controller, deviceA, deviceB, peerA, peerB } = await twoMemberGroup(site);

        // Take member B offline before rotating; the distribute gate must park (not fail or advance to cleanup).
        const subscriptionB = subscriptionOf(peerB);
        await MockTime.resolve(subscriptionB.active.emit(false), { macrotasks: true });

        await controller.act(a => a.get(TaskManagerBehavior).run("rotateGroupKey", ROTATE_PARAMS));
        await awaitState(controller, ROTATE_ID, "parked");

        // Let any reachable-peer work settle; the barrier still cannot advance past distribute while B is offline.
        for (let i = 0; i < 50; i++) {
            await MockTime.advance(100);
            await MockTime.macrotask;
        }

        // The rotation is stuck at distribute: A's desired state holds the 2-key distribute struct, never the
        // 1-key cleanup struct that drops the old key, so the still-online member keeps its old key.
        expect(await controller.act(a => a.get(TaskManagerBehavior).state.tasks[ROTATE_ID]?.state)).equals("parked");
        expect(intentStarts(peerA, GROUP_KEY_SET_ID).length).equals(2);
        expect(deviceStarts(deviceA, GROUP_KEY_SET_ID)).contains(OP_START);
        expect(deviceStarts(deviceB, GROUP_KEY_SET_ID)).deep.equals([OP_START]);

        // Bring B back; the subscription wake re-drives the gate through the full rotation on both members.
        await MockTime.resolve(subscriptionB.active.emit(true), { macrotasks: true });
        await awaitState(controller, ROTATE_ID, "completed");

        // Both members were driven through all three phases once B returned (last three writes per device).
        expect(writesA.map(s => s.length).slice(-3)).deep.equals([2, 3, 1]);
        expect(writesB.map(s => s.length).slice(-3)).deep.equals([2, 3, 1]);
        expect(deviceStarts(deviceA, GROUP_KEY_SET_ID)).deep.equals([OP_START]);
        expect(deviceStarts(deviceB, GROUP_KEY_SET_ID)).deep.equals([OP_START]);
    });

    it("resumes a parked rotation across a controller restart", async () => {
        await using site = new MockSite();
        const { controller, deviceA, deviceB, peerA, peerB } = await twoMemberGroup(site);
        const peerAId = peerA.id;
        const peerBId = peerB.id;

        // Park the rotation (member B offline), then close the controller mid-rotation.
        await MockTime.resolve(subscriptionOf(peerB).active.emit(false), { macrotasks: true });
        await controller.act(a => a.get(TaskManagerBehavior).run("rotateGroupKey", ROTATE_PARAMS));
        await awaitState(controller, ROTATE_ID, "parked");
        const id = controller.id;
        await MockTime.resolve(controller.close(), { macrotasks: true });

        // Recreate from the same storage on the same network host; the persisted parked task resumes.
        const controller2 = await site.addNode(ControllerRoot, { id, index: 1 });
        const resumed = await controller2.act(a => a.get(TaskManagerBehavior).state.tasks[ROTATE_ID]?.state);
        expect(["running", "parked"]).contains(resumed);

        // Fresh subscriptions to both members re-establish; write-if-set-differs makes the re-drive idempotent.
        await subscribedPeer(controller2, peerAId);
        await subscribedPeer(controller2, peerBId);
        await awaitState(controller2, ROTATE_ID, "completed");

        expect(deviceStarts(deviceA, GROUP_KEY_SET_ID)).deep.equals([OP_START]);
        expect(deviceStarts(deviceB, GROUP_KEY_SET_ID)).deep.equals([OP_START]);
    });

    it("re-applies the intended key when a member's key set drifts", async () => {
        await using site = new MockSite();
        const { controller, deviceA, peerA } = await twoMemberGroup(site);

        await controller.act(a => a.get(TaskManagerBehavior).run("rotateGroupKey", ROTATE_PARAMS));
        await awaitState(controller, ROTATE_ID, "completed");
        expect(deviceStarts(deviceA, GROUP_KEY_SET_ID)).deep.equals([OP_START]);

        // Drain the post-rotation verify pass before mutating so the drift below is what verify next observes.
        for (let i = 0; i < 50; i++) {
            await MockTime.advance(100);
            await MockTime.macrotask;
        }

        // Behind-the-back drift: change member A's start time in BOTH stores (verify reads keySetRead served
        // from the fabric group manager; the attribute mirrors it for the assertion helper).
        const DRIFT_START = OP_START + 1000n;
        await MockTime.resolve(
            deviceA.act("drift-keyset", agent => {
                const gkm = agent.get(GroupKeyManagementServer);
                gkm.state.groupKeySets = gkm.state.groupKeySets.map(ks =>
                    ks.groupKeySetId === GROUP_KEY_SET_ID ? { ...ks, epochStartTime0: DRIFT_START } : ks,
                );
                const entry = agent.env.get(FabricManager).fabrics[0].groups.keySets.forId(GROUP_KEY_SET_ID);
                if (entry !== undefined) {
                    entry.epochStartTime0 = DRIFT_START;
                }
            }),
        );
        expect(deviceStarts(deviceA, GROUP_KEY_SET_ID)).deep.equals([DRIFT_START]);

        // A verify reconcile detects the set difference and re-writes the intended struct.
        await MockTime.resolve(controller.act(a => a.get(ReconcilerBehavior).reconcile(peerA, { verify: true })));

        expect(deviceStarts(deviceA, GROUP_KEY_SET_ID)).deep.equals([OP_START]);
        expect(intentStarts(peerA, GROUP_KEY_SET_ID)).deep.equals([OP_START]);
    });
});
