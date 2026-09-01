/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { ReconcilerBehavior } from "#ReconcilerBehavior.js";
import {
    TaskConflictError,
    TaskNotRevertibleError,
    TaskRollbackPendingError,
    TaskSlotOccupiedError,
} from "#task/errors.js";
import { ADD_NODE_TO_GROUP_TYPE, AddNodeToGroup, AddNodeToGroupParams } from "#task/groups/AddNodeToGroup.js";
import { ROTATE_GROUP_KEY_TYPE, RotateGroupKey, RotateGroupKeyParams } from "#task/groups/RotateGroupKey.js";
import { TaskDefinition } from "#task/Task.js";
import { TaskManagerBehavior } from "#task/TaskManagerBehavior.js";
import { TaskContext } from "#task/types.js";
import { Bytes, Crypto, MockCrypto, Seconds } from "@matter/general";
import { ClientNode, DesiredStateBehavior, itemMapKey, NetworkClient, ServerNode } from "@matter/node";
import { GroupKeyManagementServer } from "@matter/node/behaviors/group-key-management";
import { GroupsServer } from "@matter/node/behaviors/groups";
import { OnOffLightSwitchDevice } from "@matter/node/devices/on-off-light-switch";
import { MockServerNode, MockSite, subscribedPeer } from "@matter/node/testing";
import { FabricManager, SustainedSubscription } from "@matter/protocol";
import { FabricId } from "@matter/types";
import { GroupKeyManagement } from "@matter/types/clusters/group-key-management";
import {
    awaitRun,
    cancelSlot,
    recordFor,
    recordsFor,
    requireRecordFor,
    requireRunIdOfSlot,
    requireStatusOfSlot,
    revertRecordOf,
    revertSlotOf,
    statusOfSlot,
} from "../helpers.js";

const { TrustFirst } = GroupKeyManagement.GroupKeySecurityPolicy;

const GROUP = 0x101;
const GROUP_KEY_SET_ID = 42;
const OP_KEY = new Uint8Array(16).fill(0xab);
const OP_START = 946684800000001n; // just above IPK_DEFAULT_EPOCH_START_TIME (2000-01-01 in unix-µs)
const NEW_KEY = new Uint8Array(16).fill(0xcd);

const ROTATION_ID = "r1";
const ROTATE_PARAMS: RotateGroupKeyParams = {
    groupKeySetId: GROUP_KEY_SET_ID,
    newEpochKey: NEW_KEY,
    rotationId: ROTATION_ID,
};
const ROTATE_SLOT = `${ROTATE_GROUP_KEY_TYPE}:${GROUP_KEY_SET_ID}`;

const ControllerRoot = MockServerNode.RootEndpoint.with(TaskManagerBehavior);
const MEMBER_DEVICE = OnOffLightSwitchDevice.with(GroupsServer);

/** Per-device record of keySetWrite start-time sets, in call order — the proof a rotation did real work. */
const writesA = new Array<bigint[]>();
const writesB = new Array<bigint[]>();

/**
 * Fires after device B commits a keySetWrite, with that write's start-time set. Lets a test flip B offline the
 * instant its distribute write lands — the only window that parks the rotation at activate (before activate's
 * gate re-checks reachability), which external time-pumping cannot hit.
 */
let afterWriteB: ((starts: bigint[]) => void) | undefined;

/**
 * Fires after device A commits a keySetWrite, with that write's start-time set. Symmetric to {@link afterWriteB}:
 * flipping A offline as its distribute write lands parks the rotation inside activate's barrier.
 */
let afterWriteA: ((starts: bigint[]) => void) | undefined;

/**
 * When armed, pauses #drive inside distribute's phase AFTER it commits but BEFORE the driver advances to
 * activate — the exact between-phase gap the cancel-race guard closes. `releaseDistribute` unblocks it.
 */
let armBarrier = false;
let releaseDistribute: (() => void) | undefined;

const BarrierRotateGroupKey: TaskDefinition<RotateGroupKeyParams> = {
    ...RotateGroupKey,
    phases(params) {
        return RotateGroupKey.phases(params).map(phase => {
            if (phase.name !== "distribute") {
                return phase;
            }
            return {
                name: phase.name,
                run: async (ctx: TaskContext) => {
                    await phase.run(ctx);
                    if (armBarrier) {
                        await new Promise<void>(resolve => {
                            releaseDistribute = resolve;
                        });
                    }
                },
            };
        });
    },
};

/** A device root whose GroupKeyManagementServer records every keySetWrite's start-time set into `sink`. */
function recordingRoot(sink: bigint[][], afterWrite?: (starts: bigint[]) => void) {
    class RecordingGroupKeyManagementServer extends GroupKeyManagementServer {
        override async keySetWrite(request: GroupKeyManagement.KeySetWriteRequest) {
            const s = starts(request.groupKeySet);
            sink.push(s);
            const result = await super.keySetWrite(request);
            afterWrite?.(s);
            return result;
        }
    }
    return MockServerNode.RootEndpoint.with(RecordingGroupKeyManagementServer);
}

const DeviceRootA = recordingRoot(writesA, s => afterWriteA?.(s));
const DeviceRootB = recordingRoot(writesB, s => afterWriteB?.(s));

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

/** The device's stored operational key material (epochKey0) for a key set id — distinguishes old key from new. */
function deviceKey0(device: ServerNode, id: number) {
    const entry = device.stateOf(GroupKeyManagementServer).groupKeySets.find(k => k.groupKeySetId === id);
    const key = entry?.epochKey0;
    if (key === null || key === undefined) {
        throw new Error(`device holds no epochKey0 for key set ${id}`);
    }
    return key;
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
        const state = await node.act(a => recordFor(a.get(TaskManagerBehavior).state.runs, id)?.state);
        if (state !== undefined && states.includes(state)) {
            // A run turns terminal one step before it retires, so a caller that acts here would find the
            // slot still held.
            const settled =
                !(["completed", "failed", "cancelled"] as string[]).includes(state) ||
                (await node.act(a => !a.get(TaskManagerBehavior).tasks.some(t => t.status.slotKey === id)));
            if (settled) {
                return;
            }
        }
        await MockTime.advance(100);
        await MockTime.macrotask;
    }
    throw new Error(`Task ${id} did not reach state ${states.join("|")}`);
}

/**
 * Pump until the task is parked in a specific phase. A gate parks whenever a peer it watches goes away, so a task
 * can be parked transiently in an earlier phase that still had everything it needed.
 */
async function awaitParkedInPhase(node: ServerNode, id: string, phaseIndex: number): Promise<void> {
    for (let i = 0; i < 2_000; i++) {
        const p = await node.act(a => recordFor(a.get(TaskManagerBehavior).state.runs, id));
        if (p?.state === "parked" && p.phaseIndex === phaseIndex) {
            return;
        }
        await MockTime.advance(100);
        await MockTime.macrotask;
    }
    throw new Error(`Task ${id} did not park in phase ${phaseIndex}`);
}

/** Commission two member devices onto one controller and provision both into the shared key set 42. */
async function twoMemberGroup(site: MockSite, options: { addB?: boolean } = {}) {
    const { addB = true } = options;
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

    for (const peer of addB ? peers : peers.slice(0, 1)) {
        await controller.act(a => a.get(TaskManagerBehavior).run(AddNodeToGroup, addParamsFor(peer.id)));
        await awaitState(controller, addTaskId(peer.id), "completed");
    }

    return { controller, deviceA, deviceB, peerA, peerB };
}

describe("RotateGroupKey task integration (two members)", () => {
    before(() => MockTime.init());
    beforeEach(() => {
        writesA.length = 0;
        writesB.length = 0;
        afterWriteA = undefined;
        afterWriteB = undefined;
        armBarrier = false;
        releaseDistribute = undefined;
    });

    it("rotates the shared key across both members to a single new key", async () => {
        await using site = new MockSite();
        const { controller, deviceA, deviceB, peerA, peerB } = await twoMemberGroup(site);

        expect(deviceStarts(deviceA, GROUP_KEY_SET_ID)).deep.equals([OP_START]);
        expect(deviceStarts(deviceB, GROUP_KEY_SET_ID)).deep.equals([OP_START]);

        // Record only the rotation, not the provisioning write.
        writesA.length = writesB.length = 0;

        await controller.act(a => a.get(TaskManagerBehavior).run(RotateGroupKey, ROTATE_PARAMS));
        await awaitState(controller, ROTATE_SLOT, "completed");

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

    it("refuses to activate when a member joined the key set after distribute", async () => {
        await using site = new MockSite();
        const { controller, deviceA, deviceB, peerA, peerB } = await twoMemberGroup(site, { addB: false });

        // Park the rotation at distribute so the second member can join the key set mid-rotation.
        await MockTime.resolve(subscriptionOf(peerA).active.emit(false), { macrotasks: true });
        await controller.act(a => a.get(TaskManagerBehavior).run(RotateGroupKey, ROTATE_PARAMS));
        await awaitParkedInPhase(controller, ROTATE_SLOT, 0);

        writesA.length = writesB.length = 0;
        await controller.act(a => a.get(TaskManagerBehavior).run(AddNodeToGroup, addParamsFor(peerB.id)));
        await awaitState(controller, addTaskId(peerB.id), "completed");

        await MockTime.resolve(subscriptionOf(peerA).active.emit(true), { macrotasks: true });
        await awaitState(controller, ROTATE_SLOT, "failed");

        const status = await controller.act(a => statusOfSlot(a.get(TaskManagerBehavior), ROTATE_SLOT));
        expect(status?.error).contains("joined the key set after the distribute phase");

        // A saw distribute only (2 starts, the new key future-dated and dormant); neither member was activated.
        expect(writesA.map(s => s.length)).deep.equals([2]);
        expect(writesB.map(s => s.length)).deep.equals([1]);
        expect(deviceStarts(deviceB, GROUP_KEY_SET_ID)).deep.equals([OP_START]);
        expect(deviceKey0(deviceA, GROUP_KEY_SET_ID)).deep.equals(OP_KEY);
    });

    it("refuses to complete activation when a member joined the key set during the activate phase", async () => {
        await using site = new MockSite();
        const { controller, deviceA, deviceB, peerA, peerB } = await twoMemberGroup(site, { addB: false });

        // Flip A offline as its distribute write lands: activate then writes its intent but parks in the barrier,
        // which is the window in which a member can join after activate's opening check.
        const subscriptionA = subscriptionOf(peerA);
        let flipped = false;
        afterWriteA = s => {
            if (!flipped && s.length === 2) {
                flipped = true;
                subscriptionA.active.emit(false);
            }
        };

        await controller.act(a => a.get(TaskManagerBehavior).run(RotateGroupKey, ROTATE_PARAMS));
        await awaitParkedInPhase(controller, ROTATE_SLOT, 1);

        writesA.length = writesB.length = 0;
        await controller.act(a => a.get(TaskManagerBehavior).run(AddNodeToGroup, addParamsFor(peerB.id)));
        await awaitState(controller, addTaskId(peerB.id), "completed");

        await MockTime.resolve(subscriptionA.active.emit(true), { macrotasks: true });
        await awaitState(controller, ROTATE_SLOT, "failed");

        const status = await controller.act(a => statusOfSlot(a.get(TaskManagerBehavior), ROTATE_SLOT));
        expect(status?.error).contains("during the activate phase");

        // Cleanup never ran, so no member lost the old key: A holds the 3-key activate struct, B only its own
        // provisioning write, and the late member still holds the old key material.
        expect(writesA.some(s => s.length === 1)).equals(false);
        expect(writesB.some(s => s.length === 1)).equals(true); // the join itself
        expect(writesB.some(s => s.length === 3)).equals(false);
        expect(deviceStarts(deviceA, GROUP_KEY_SET_ID).length).equals(3);
        expect(deviceStarts(deviceB, GROUP_KEY_SET_ID)).deep.equals([OP_START]);
        expect(Bytes.areEqual(deviceKey0(deviceB, GROUP_KEY_SET_ID), OP_KEY)).equals(true);

        // The rotation stopped at its point of no return, so it is not rolled back.
        expect(status?.revertRunId).equals(undefined);

        // The remedy the failure prescribes must work: rotating to a DIFFERENT key is refused while the members
        // still carry the dormant one, so only the same key can finish what this rotation started.
        const other = await controller.act(a =>
            a.get(TaskManagerBehavior).run(RotateGroupKey, {
                groupKeySetId: GROUP_KEY_SET_ID,
                newEpochKey: new Uint8Array(16).fill(0xef),
                rotationId: "rOther",
            }),
        );
        await awaitRun(controller, TaskManagerBehavior, other.runId, "failed");
        const otherStatus = await controller.act(a => a.get(TaskManagerBehavior).get(other.runId)?.status);
        expect(otherStatus?.error).contains("single-key steady state");

        // Re-issued with the same new key, distribute covers the whole current member set, so the late member is
        // carried through the rotation with everyone else.
        await controller.act(a =>
            a.get(TaskManagerBehavior).run(RotateGroupKey, { ...ROTATE_PARAMS, rotationId: "r2" }),
        );
        await awaitState(controller, ROTATE_SLOT, "completed");
        for (const device of [deviceA, deviceB]) {
            expect(deviceStarts(device, GROUP_KEY_SET_ID)).deep.equals([OP_START]);
            expect(Bytes.areEqual(deviceKey0(device, GROUP_KEY_SET_ID), NEW_KEY)).equals(true);
        }
    });

    it("parks when a member is offline, holding the barrier, then converges once it returns", async () => {
        await using site = new MockSite();
        const { controller, deviceA, deviceB, peerA, peerB } = await twoMemberGroup(site);

        // Take member B offline before rotating; the distribute gate must park (not fail or advance to cleanup).
        const subscriptionB = subscriptionOf(peerB);
        await MockTime.resolve(subscriptionB.active.emit(false), { macrotasks: true });

        await controller.act(a => a.get(TaskManagerBehavior).run(RotateGroupKey, ROTATE_PARAMS));
        await awaitState(controller, ROTATE_SLOT, "parked");

        // Let any reachable-peer work settle; the barrier still cannot advance past distribute while B is offline.
        for (let i = 0; i < 50; i++) {
            await MockTime.advance(100);
            await MockTime.macrotask;
        }

        // The rotation is stuck at distribute: A's desired state holds the 2-key distribute struct, never the
        // 1-key cleanup struct that drops the old key, so the still-online member keeps its old key.
        expect(await controller.act(a => recordFor(a.get(TaskManagerBehavior).state.runs, ROTATE_SLOT)?.state)).equals(
            "parked",
        );
        expect(intentStarts(peerA, GROUP_KEY_SET_ID).length).equals(2);
        expect(deviceStarts(deviceA, GROUP_KEY_SET_ID)).contains(OP_START);
        expect(deviceStarts(deviceB, GROUP_KEY_SET_ID)).deep.equals([OP_START]);

        // Bring B back; the subscription wake re-drives the gate through the full rotation on both members.
        await MockTime.resolve(subscriptionB.active.emit(true), { macrotasks: true });
        await awaitState(controller, ROTATE_SLOT, "completed");

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
        await controller.act(a => a.get(TaskManagerBehavior).run(RotateGroupKey, ROTATE_PARAMS));
        await awaitState(controller, ROTATE_SLOT, "parked");
        const id = controller.id;
        await MockTime.resolve(controller.close(), { macrotasks: true });

        // Recreate from the same storage on the same network host; the persisted parked task resumes.
        const controller2 = await site.addNode(ControllerRoot, { id, index: 1 });
        const resumed = await controller2.act(
            a => recordFor(a.get(TaskManagerBehavior).state.runs, ROTATE_SLOT)?.state,
        );
        expect(["running", "parked"]).contains(resumed);

        // Fresh subscriptions to both members re-establish; write-if-set-differs makes the re-drive idempotent.
        await subscribedPeer(controller2, peerAId);
        await subscribedPeer(controller2, peerBId);
        await awaitState(controller2, ROTATE_SLOT, "completed");

        expect(deviceStarts(deviceA, GROUP_KEY_SET_ID)).deep.equals([OP_START]);
        expect(deviceStarts(deviceB, GROUP_KEY_SET_ID)).deep.equals([OP_START]);
    });

    it("re-applies the intended key when a member's key set drifts", async () => {
        await using site = new MockSite();
        const { controller, deviceA, peerA } = await twoMemberGroup(site);

        await controller.act(a => a.get(TaskManagerBehavior).run(RotateGroupKey, ROTATE_PARAMS));
        await awaitState(controller, ROTATE_SLOT, "completed");
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

    it("cancel in the distribute phase reverts both members to the old key", async () => {
        await using site = new MockSite();
        const { controller, deviceA, deviceB, peerA, peerB } = await twoMemberGroup(site);

        expect(Bytes.areEqual(deviceKey0(deviceA, GROUP_KEY_SET_ID), OP_KEY)).equals(true);

        // Take B offline so the rotation parks at distribute (phaseIndex 0 < ACTIVATE_INDEX) — the revertible window.
        const subscriptionB = subscriptionOf(peerB);
        await MockTime.resolve(subscriptionB.active.emit(false), { macrotasks: true });

        await controller.act(a => a.get(TaskManagerBehavior).run(RotateGroupKey, ROTATE_PARAMS));
        await awaitState(controller, ROTATE_SLOT, "parked");

        // Distribute has pushed the 2-key struct to the still-online member A; activate has not begun.
        expect(intentStarts(peerA, GROUP_KEY_SET_ID).length).equals(2);
        const phaseIndex = await controller.act(
            a => recordFor(a.get(TaskManagerBehavior).state.runs, ROTATE_SLOT)?.phaseIndex,
        );
        expect(phaseIndex).equals(0);

        // Cancel is accepted in the safe window and returns a revert handle.
        const handle = await MockTime.resolve(
            controller.act(a => cancelSlot(a.get(TaskManagerBehavior), ROTATE_SLOT)),
            {
                macrotasks: true,
            },
        );
        expect(handle?.status.revertOf).equals(
            requireRecordFor(controller.stateOf(TaskManagerBehavior).runs, ROTATE_SLOT).runId,
        );

        // Bring B back so the revert converges on both members.
        await MockTime.resolve(subscriptionB.active.emit(true), { macrotasks: true });
        await awaitState(
            controller,
            (await controller.act(a => revertSlotOf(a.get(TaskManagerBehavior).state.runs, ROTATE_SLOT)))!,
            "completed",
        );

        // Both members restored to the single OLD key (old material); the dormant new key is dropped.
        for (const device of [deviceA, deviceB]) {
            expect(deviceStarts(device, GROUP_KEY_SET_ID)).deep.equals([OP_START]);
            expect(Bytes.areEqual(deviceKey0(device, GROUP_KEY_SET_ID), OP_KEY)).equals(true);
        }
        const state = await controller.act(a => requireStatusOfSlot(a.get(TaskManagerBehavior), ROTATE_SLOT).state);
        expect(state).equals("cancelled");
        expect(intentStarts(peerA, GROUP_KEY_SET_ID)).deep.equals([OP_START]);
    });

    it("cancel raced into the distribute→activate gap reverts to the old key without writing activate", async () => {
        await using site = new MockSite();
        const { controller, deviceA, deviceB, peerA } = await twoMemberGroup(site);

        expect(Bytes.areEqual(deviceKey0(deviceA, GROUP_KEY_SET_ID), OP_KEY)).equals(true);

        // Swap in the barrier variant (both members stay online) so distribute commits and then pauses.
        await controller.act(a => a.get(TaskManagerBehavior).register(BarrierRotateGroupKey));
        armBarrier = true;
        writesA.length = writesB.length = 0;

        await controller.act(a => a.get(TaskManagerBehavior).run(BarrierRotateGroupKey, ROTATE_PARAMS));

        // Pump until distribute has committed on both members and the driver is paused at the barrier.
        for (let i = 0; i < 2_000 && releaseDistribute === undefined; i++) {
            await MockTime.advance(100);
            await MockTime.macrotask;
        }
        expect(releaseDistribute).not.equals(undefined);
        expect(
            await controller.act(a => recordFor(a.get(TaskManagerBehavior).state.runs, ROTATE_SLOT)?.phaseIndex),
        ).equals(0);
        expect(writesA.map(s => s.length)).deep.equals([2]); // distribute wrote 2 slots; activate (3) has not run
        expect(writesB.map(s => s.length)).deep.equals([2]);

        // Request cancel while paused between phases; its flag is set synchronously (blocked on the drive promise).
        const cancelPromise = controller.act(a => cancelSlot(a.get(TaskManagerBehavior), ROTATE_SLOT));
        for (let i = 0; i < 5; i++) {
            await MockTime.macrotask;
        }

        // Release: the driver's between-phase check must catch the cancel and stop BEFORE writing activate.
        releaseDistribute!();
        releaseDistribute = undefined;

        const handle = await MockTime.resolve(cancelPromise, { macrotasks: true });
        expect(handle?.status.revertOf).equals(
            requireRecordFor(controller.stateOf(TaskManagerBehavior).runs, ROTATE_SLOT).runId,
        );
        await awaitState(
            controller,
            (await controller.act(a => revertSlotOf(a.get(TaskManagerBehavior).state.runs, ROTATE_SLOT)))!,
            "completed",
        );

        // Forbidden outcome ruled out: no activate write (never a 3-slot struct), no sentinel; both members back
        // on the OLD key material with the single original start time.
        expect(writesA.some(s => s.length === 3)).equals(false);
        expect(writesB.some(s => s.length === 3)).equals(false);
        for (const device of [deviceA, deviceB]) {
            expect(deviceStarts(device, GROUP_KEY_SET_ID)).deep.equals([OP_START]);
            expect(Bytes.areEqual(deviceKey0(device, GROUP_KEY_SET_ID), OP_KEY)).equals(true);
        }
        const state = await controller.act(a => requireStatusOfSlot(a.get(TaskManagerBehavior), ROTATE_SLOT).state);
        expect(state).equals("cancelled");
        expect(intentStarts(peerA, GROUP_KEY_SET_ID)).deep.equals([OP_START]);
    });

    it("runs a second rotation of the same key set to a different key under a new rotationId", async () => {
        await using site = new MockSite();
        const { controller, deviceA, deviceB } = await twoMemberGroup(site);

        const KEY_A = new Uint8Array(16).fill(0xa1);
        const KEY_B = new Uint8Array(16).fill(0xb2);

        const first = await controller.act(a =>
            a.get(TaskManagerBehavior).run(RotateGroupKey, {
                groupKeySetId: GROUP_KEY_SET_ID,
                newEpochKey: KEY_A,
                rotationId: "r1",
            }),
        );
        await awaitRun(controller, TaskManagerBehavior, first.runId, "completed");
        for (const device of [deviceA, deviceB]) {
            expect(Bytes.areEqual(deviceKey0(device, GROUP_KEY_SET_ID), KEY_A)).equals(true);
        }

        // The recovery path — rotating a bad key to another — is a second run of the same slot, admitted once
        // the first has retired. Each run keeps its own record; waiting on the slot would match the first.
        const second = await controller.act(a =>
            a.get(TaskManagerBehavior).run(RotateGroupKey, {
                groupKeySetId: GROUP_KEY_SET_ID,
                newEpochKey: KEY_B,
                rotationId: "r2",
            }),
        );
        expect(second.runId).not.equals(first.runId);
        await awaitRun(controller, TaskManagerBehavior, second.runId, "completed");
        for (const device of [deviceA, deviceB]) {
            expect(Bytes.areEqual(deviceKey0(device, GROUP_KEY_SET_ID), KEY_B)).equals(true);
        }
    });

    it("rejects a concurrent rotation of a key set that already has a live rotation", async () => {
        await using site = new MockSite();
        const { controller, peerB } = await twoMemberGroup(site);

        // Park r1 non-terminal (member B offline during distribute).
        await MockTime.resolve(subscriptionOf(peerB).active.emit(false), { macrotasks: true });
        await controller.act(a => a.get(TaskManagerBehavior).run(RotateGroupKey, ROTATE_PARAMS));
        await awaitState(controller, ROTATE_SLOT, "parked");

        const OTHER_KEY = new Uint8Array(16).fill(0xef);
        let refusal: unknown;
        try {
            await controller.act(async a =>
                a.get(TaskManagerBehavior).run(RotateGroupKey, {
                    groupKeySetId: GROUP_KEY_SET_ID,
                    newEpochKey: OTHER_KEY,
                    rotationId: "r2",
                }),
            );
        } catch (e) {
            refusal = e;
        }
        expect(refusal).instanceOf(TaskSlotOccupiedError);
        expect((refusal as TaskConflictError).owner).equals(
            await controller.act(a => requireRunIdOfSlot(a.get(TaskManagerBehavior), ROTATE_SLOT)),
        );

        // r1 is untouched, and the refusal means the slot still holds exactly one run.
        const runs = await controller.act(a => recordsFor(a.get(TaskManagerBehavior).state.runs, ROTATE_SLOT));
        expect(runs.length).equals(1);
        expect(runs[0].state).equals("parked");
    });

    it("rejects a new rotation while a revert of the same key set is still live", async () => {
        await using site = new MockSite();
        const { controller, peerB } = await twoMemberGroup(site);

        // Park r1 at distribute (member B offline), then cancel it — this spawns a revert that also parks (B still
        // offline), so a live non-terminal revert now holds the key set.
        await MockTime.resolve(subscriptionOf(peerB).active.emit(false), { macrotasks: true });
        await controller.act(a => a.get(TaskManagerBehavior).run(RotateGroupKey, ROTATE_PARAMS));
        await awaitState(controller, ROTATE_SLOT, "parked");
        await MockTime.resolve(
            controller.act(a => cancelSlot(a.get(TaskManagerBehavior), ROTATE_SLOT)),
            { macrotasks: true },
        );
        await awaitState(
            controller,
            (await controller.act(a => revertSlotOf(a.get(TaskManagerBehavior).state.runs, ROTATE_SLOT)))!,
            "parked",
            "running",
        );

        const OTHER_KEY = new Uint8Array(16).fill(0xef);
        await expect(
            controller.act(async a =>
                a.get(TaskManagerBehavior).run(RotateGroupKey, {
                    groupKeySetId: GROUP_KEY_SET_ID,
                    newEpochKey: OTHER_KEY,
                    rotationId: "r2",
                }),
            ),
        ).rejectedWith(TaskRollbackPendingError);

        // The revert is untouched, and the refusal means no second rotation of the slot was spawned.
        expect(["parked", "running"]).contains(
            await controller.act(a => revertRecordOf(a.get(TaskManagerBehavior).state.runs, ROTATE_SLOT)?.state),
        );
        expect(await controller.act(a => recordsFor(a.get(TaskManagerBehavior).state.runs, ROTATE_SLOT))).length(1);
    });

    it("refuses a re-issue of a live rotationId, and joins the caller that owns it", async () => {
        await using site = new MockSite();
        const { controller, peerB } = await twoMemberGroup(site);

        // Park so the task stays live/non-terminal across both issues.
        await MockTime.resolve(subscriptionOf(peerB).active.emit(false), { macrotasks: true });
        const first = await controller.act(a =>
            a.get(TaskManagerBehavior).run(RotateGroupKey, ROTATE_PARAMS, { externalId: "nightly" }),
        );
        expect(first.status.slotKey).equals(ROTATE_SLOT);
        await awaitState(controller, ROTATE_SLOT, "parked");

        // `act` returns a MaybePromise, so normalize before asserting on the rejection.
        await expect(
            (async () => controller.act(a => a.get(TaskManagerBehavior).run(RotateGroupKey, ROTATE_PARAMS)))(),
        ).rejectedWith(TaskSlotOccupiedError);

        // The owner reaches the parked rotation itself: a replacement task under the same id would answer as
        // freshly running and leave the parked one driving with nothing observing it.
        const before = await controller.act(a => a.get(TaskManagerBehavior).tasks.length);
        const again = await controller.act(a =>
            a.get(TaskManagerBehavior).run(RotateGroupKey, ROTATE_PARAMS, { externalId: "nightly" }),
        );
        expect(again.runId).equals(first.runId);
        expect(again.status.state).equals("parked");
        expect(again.status.phaseIndex).equals(0);
        expect(await controller.act(a => a.get(TaskManagerBehavior).tasks.length)).equals(before);
    });

    it("declines cancel during the activate phase and leaves the rotation in place", async () => {
        await using site = new MockSite();
        const { controller, deviceA, deviceB, peerB } = await twoMemberGroup(site);

        // Flip B offline the instant its distribute write commits: distribute completes (both reachable through it),
        // then activate's opening reachability re-check finds B gone and parks at phaseIndex 1 — the point of no return.
        const subscriptionB = subscriptionOf(peerB);
        let flipped = false;
        afterWriteB = s => {
            if (!flipped && s.length === 2) {
                flipped = true;
                subscriptionB.active.emit(false);
            }
        };

        await controller.act(a => a.get(TaskManagerBehavior).run(RotateGroupKey, ROTATE_PARAMS));
        await awaitParkedInPhase(controller, ROTATE_SLOT, 1); // parked in activate, not distribute

        // Distribute committed the 2-key struct on both members (old key still present); activate never wrote.
        const parkedStartsA = deviceStarts(deviceA, GROUP_KEY_SET_ID);
        const parkedStartsB = deviceStarts(deviceB, GROUP_KEY_SET_ID);
        expect(parkedStartsA.length).equals(2);
        expect(parkedStartsB.length).equals(2);

        // Cancel is declined with zero side effects: no revert spawned, task stays parked, devices untouched.
        await expect(controller.act(a => cancelSlot(a.get(TaskManagerBehavior), ROTATE_SLOT))).rejectedWith(
            TaskNotRevertibleError,
            "forward-only",
        );
        const status = await controller.act(a => statusOfSlot(a.get(TaskManagerBehavior), ROTATE_SLOT));
        expect(status?.state).equals("parked");
        expect(status?.revertRunId).equals(undefined);
        expect(await controller.act(a => revertRecordOf(a.get(TaskManagerBehavior).state.runs, ROTATE_SLOT))).equals(
            undefined,
        );

        // No rollback ran: both members keep their pre-cancel device state (distribute struct, old key present).
        expect(deviceStarts(deviceA, GROUP_KEY_SET_ID)).deep.equals(parkedStartsA);
        expect(deviceStarts(deviceB, GROUP_KEY_SET_ID)).deep.equals(parkedStartsB);
        expect(Bytes.areEqual(deviceKey0(deviceA, GROUP_KEY_SET_ID), OP_KEY)).equals(true);
        expect(Bytes.areEqual(deviceKey0(deviceB, GROUP_KEY_SET_ID), OP_KEY)).equals(true);
    });

    it("declines cancel of a completed rotation and leaves the new key in place", async () => {
        await using site = new MockSite();
        const { controller, deviceA, deviceB } = await twoMemberGroup(site);

        await controller.act(a => a.get(TaskManagerBehavior).run(RotateGroupKey, ROTATE_PARAMS));
        await awaitState(controller, ROTATE_SLOT, "completed");

        // The rotation realized the NEW key on both members (start-set matches the original, material does not).
        for (const device of [deviceA, deviceB]) {
            expect(deviceStarts(device, GROUP_KEY_SET_ID)).deep.equals([OP_START]);
            expect(Bytes.areEqual(deviceKey0(device, GROUP_KEY_SET_ID), NEW_KEY)).equals(true);
        }

        await expect(controller.act(a => cancelSlot(a.get(TaskManagerBehavior), ROTATE_SLOT))).rejectedWith(
            TaskNotRevertibleError,
            "forward-only",
        );

        // Declined with zero side effects: no revert spawned, task stays completed, both devices keep the new key.
        const status = await controller.act(a => statusOfSlot(a.get(TaskManagerBehavior), ROTATE_SLOT));
        expect(status?.state).equals("completed");
        expect(status?.revertRunId).equals(undefined);
        expect(await controller.act(a => revertRecordOf(a.get(TaskManagerBehavior).state.runs, ROTATE_SLOT))).equals(
            undefined,
        );
        for (const device of [deviceA, deviceB]) {
            expect(Bytes.areEqual(deviceKey0(device, GROUP_KEY_SET_ID), NEW_KEY)).equals(true);
        }
    });
});
