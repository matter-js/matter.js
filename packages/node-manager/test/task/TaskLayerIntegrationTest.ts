/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { GroupKey, GroupKeyMap, GroupMembership } from "#reconcile/kinds.js";
import {
    TaskFailedError,
    TaskFindingCode,
    TaskNoLongerTrackedError,
    TaskNotFoundError,
    TaskSlotOccupiedError,
} from "#task/errors.js";
import { AddNodeToGroup, AddNodeToGroupParams } from "#task/groups/AddNodeToGroup.js";
import { addressLabel, addressOf } from "#task/peer.js";
import { TaskDefinition } from "#task/Task.js";
import { TaskManagerBehavior } from "#task/TaskManagerBehavior.js";
import { RunId, TaskStatus } from "#task/types.js";
import { Crypto, InternalError, MockCrypto, Seconds } from "@matter/general";
import { ClientNode, NetworkClient, ServerNode } from "@matter/node";
import { GroupKeyManagementServer } from "@matter/node/behaviors/group-key-management";
import { GroupsServer } from "@matter/node/behaviors/groups";
import { OnOffLightSwitchDevice } from "@matter/node/devices/on-off-light-switch";
import { MockServerNode, MockSite, subscribedPeer } from "@matter/node/testing";
import { PeerAddress, SustainedSubscription } from "@matter/protocol";
import { EndpointNumber, FabricId, GroupId } from "@matter/types";
import { GroupKeyManagement } from "@matter/types/clusters/group-key-management";
import { isTerminalState, recordFor } from "./helpers.js";

const { TrustFirst } = GroupKeyManagement.GroupKeySecurityPolicy;

const LOCAL_EP = EndpointNumber(1);
const GROUP = GroupId(0x101);
const GROUP_KEY_SET_ID = 42;
const OP_KEY = new Uint8Array(16).fill(0xab);
const OP_START = 946684800000001n;

const ControllerRoot = MockServerNode.RootEndpoint.with(TaskManagerBehavior);
const MEMBER_DEVICE = OnOffLightSwitchDevice.with(GroupsServer);

/** A commissioned node's address: the identity a task names it by. */
function addressOfNode(node: ClientNode): PeerAddress {
    const address = addressOf(node);
    if (address === undefined) {
        throw new InternalError(`${node.id} has no address`);
    }
    return address;
}

function isMember(device: ServerNode): boolean {
    const { groupTable } = device.stateOf(GroupKeyManagementServer);
    return groupTable.some(e => e.groupId === GROUP && e.endpoints.includes(LOCAL_EP));
}

function holdsKeySet(device: ServerNode): boolean {
    return device.stateOf(GroupKeyManagementServer).groupKeySets.some(s => s.groupKeySetId === GROUP_KEY_SET_ID);
}

function subscriptionOf(peer: ClientNode): SustainedSubscription {
    return peer.behaviors.internalsOf(NetworkClient).activeSubscription as SustainedSubscription;
}

/** Pump virtual time and macrotasks until the persisted run reaches one of `states`. */
async function awaitState(controller: ServerNode, slotKey: string, ...states: string[]): Promise<void> {
    for (let i = 0; i < 2_000; i++) {
        const state = await controller.act(a => recordFor(a.get(TaskManagerBehavior).state.runs, slotKey)?.state);
        if (state !== undefined && states.includes(state)) {
            return;
        }
        await MockTime.advance(10);
        await MockTime.macrotask;
    }
    throw new InternalError(`Run ${slotKey} never reached ${states.join("|")}`);
}

function addParamsFor(peer: PeerAddress): AddNodeToGroupParams {
    return {
        peer,
        endpoint: LOCAL_EP,
        groupId: GROUP,
        groupName: "kitchen",
        groupKeySetId: GROUP_KEY_SET_ID,
        groupKeySecurityPolicy: TrustFirst,
        epochKey0: OP_KEY,
        epochStartTime0: OP_START,
    };
}

interface FanOutParams {
    tag: string;
    peers: PeerAddress[];
    fail?: boolean;
    kindName?: string;
}

/**
 * Provisions one group across several peers in a single run, so one run's change set names more than one
 * device — the shape a built-in task does not have, and the one an undo has to put back in full.
 */
const FanOut: TaskDefinition<FanOutParams> = {
    type: "fanOut",
    slotKeyFor: params => `fanOut:${params.tag}`,

    // Provisioning several peers is still worth doing for the ones that remain.
    survivesWithout: () => true,

    plannedChanges: params =>
        params.peers.map(peer => ({ peer, kind: GroupMembership, key: `${GROUP}:${LOCAL_EP}`, intent: {} })),
    phases(params) {
        return [
            {
                name: "provision",
                async run(ctx) {
                    for (const address of params.peers) {
                        const peer = ctx.resolvePeer(address);
                        if (params.kindName !== undefined) {
                            // Names a kind by string, as a definition rebuilt from storage does.
                            await ctx.setIntent(peer, ctx.kindNamed(params.kindName), "1", {});
                            continue;
                        }
                        await ctx.setIntent(peer, GroupKey, String(GROUP_KEY_SET_ID), {
                            groupKeySetId: GROUP_KEY_SET_ID,
                            groupKeySecurityPolicy: TrustFirst,
                            epochKey0: OP_KEY,
                            epochStartTime0: OP_START,
                            epochKey1: null,
                            epochStartTime1: null,
                            epochKey2: null,
                            epochStartTime2: null,
                        });
                        await ctx.setIntent(peer, GroupKeyMap, String(GROUP), {
                            groupId: GROUP,
                            groupKeySetId: GROUP_KEY_SET_ID,
                        });
                        await ctx.setIntent(peer, GroupMembership, `${GROUP}:${LOCAL_EP}`, {
                            localEndpoint: LOCAL_EP,
                            groupId: GROUP,
                            groupName: "kitchen",
                        });
                    }
                    await ctx.awaitCommitted(
                        params.peers.map(address => ({
                            peer: ctx.resolvePeer(address),
                            kind: GroupMembership,
                            key: `${GROUP}:${LOCAL_EP}`,
                        })),
                    );
                    if (params.fail) {
                        throw new TaskFailedError("the test says so, after both devices were changed");
                    }
                },
            },
        ];
    },
};

/** A controller with two commissioned devices, both subscribed. */
async function twoDevices(site: MockSite) {
    const controller = await site.addNode(ControllerRoot, {
        online: false,
        id: "controller1",
        index: 1,
        controller: { adminFabricId: FabricId(1) },
        commissioning: { enabled: false },
    });
    const deviceA = await site.addNode(MockServerNode.RootEndpoint, { device: MEMBER_DEVICE, index: 2, id: "deviceA" });
    const deviceB = await site.addNode(MockServerNode.RootEndpoint, { device: MEMBER_DEVICE, index: 3, id: "deviceB" });

    const cryptos = [controller, deviceA, deviceB].map(node => node.env.get(Crypto) as MockCrypto);
    // Entropy avoids session-id collisions while several PASE/CASE sessions establish during pairing.
    cryptos.forEach(crypto => (crypto.entropic = true));
    await controller.start();

    const peers = new Array<ClientNode>();
    for (const device of [deviceA, deviceB]) {
        const { passcode, discriminator } = device.state.commissioning;
        peers.push(
            await MockTime.resolve(controller.peers.commission({ passcode, discriminator, timeout: Seconds(90) }), {
                macrotasks: true,
            }),
        );
    }
    cryptos.forEach(crypto => (crypto.entropic = false));

    const [peerA, peerB] = peers;
    await subscribedPeer(controller, peerA.id);
    await subscribedPeer(controller, peerB.id);
    await controller.act(a => a.get(TaskManagerBehavior).register(FanOut));

    return { controller, deviceA, deviceB, peerA, peerB };
}

describe("task layer against commissioned nodes", () => {
    before(() => MockTime.init());

    it("puts every device a failed run touched back the way it found them", async () => {
        await using site = new MockSite();
        const { controller, deviceA, deviceB, peerA, peerB } = await twoDevices(site);
        const addresses = [addressOfNode(peerA), addressOfNode(peerB)];

        const handle = await controller.act(a =>
            a.get(TaskManagerBehavior).run(FanOut, { tag: "both", peers: addresses, fail: true }),
        );
        await awaitState(controller, "fanOut:both", "failed");

        // The run reached both devices before it failed, and its change set says so by address — the durable
        // proof, which does not depend on catching the devices before the undo runs.
        const record = await controller.act(a => recordFor(a.get(TaskManagerBehavior).state.runs, "fanOut:both"));
        expect(record?.wrote).equals(true);
        expect(record?.rollbackRunId).not.equals(undefined);
        for (const address of addresses) {
            const mine = record!.changeSet.filter(entry => PeerAddress.is(entry.peer, address));
            expect(mine.map(entry => entry.kind).sort()).deep.equals([
                "endpointGroupMembership",
                "groupKey",
                "groupKeyMap",
            ]);
        }

        // `settled()` only resolves as the run is driven, and a driver only runs as virtual time advances, so
        // the wait and the pump go together.
        const rollbackRunId = record!.rollbackRunId!;
        const rollback = await controller.act(a => a.get(TaskManagerBehavior).get(rollbackRunId));
        const undone = rollback!.settled();
        await awaitState(controller, `rollback:${record!.runId}`, "completed", "failed");
        await undone;

        // Both devices are back to holding nothing this run created — not just the one that failed last.
        for (const device of [deviceA, deviceB]) {
            expect(isMember(device)).equals(false);
            expect(holdsKeySet(device)).equals(false);
        }
        expect(isTerminalState(handle.status.state)).equals(true);
    });

    it("says a run reached a device only when it did", async () => {
        await using site = new MockSite();
        const { controller, deviceA, peerA } = await twoDevices(site);

        const seen = new Array<TaskStatus>();
        controller.events.taskManager.runChanged.on(status => {
            seen.push(status);
        });

        const touched = await controller.act(a =>
            a.get(TaskManagerBehavior).run(FanOut, { tag: "one", peers: [addressOfNode(peerA)] }),
        );
        const settled = touched.settled();
        await awaitState(controller, "fanOut:one", "completed");
        await settled;

        expect(touched.status.state).equals("completed");
        expect(touched.status.wrote).equals(true);
        expect(isMember(deviceA)).equals(true);

        // The observer saw the run end, and never the same status twice in a row.
        expect(seen[seen.length - 1].state).equals("completed");
        const repeated = seen
            .map(status => JSON.stringify(status))
            .filter((rendered, i, all) => i > 0 && rendered === all[i - 1]);
        expect(repeated).deep.equals([]);
    });

    it("refuses a run that names an item kind the reconciler does not own, before any device is changed", async () => {
        await using site = new MockSite();
        const { controller, deviceA, peerA } = await twoDevices(site);

        await controller.act(a =>
            a
                .get(TaskManagerBehavior)
                .run(FanOut, { tag: "unowned", peers: [addressOfNode(peerA)], kindName: "not-a-kind" }),
        );
        await awaitState(controller, "fanOut:unowned", "failed");

        const record = await controller.act(a => recordFor(a.get(TaskManagerBehavior).state.runs, "fanOut:unowned"));
        expect(record?.error).contains('no item kind "not-a-kind" is registered');
        // Nothing reached the device, so there is nothing to undo.
        expect(record?.wrote).equals(false);
        expect(isMember(deviceA)).equals(false);
    });

    it("resumes a parked run across a controller restart, against the device it was driving", async () => {
        await using site = new MockSite();
        const { controller, deviceA, peerA, peerB } = await twoDevices(site);
        const peerAId = peerA.id;
        const peerBId = peerB.id;
        const address = addressOfNode(peerA);

        // Park the run by taking its device offline, then close the controller while it is mid-flight.
        await MockTime.resolve(subscriptionOf(peerA).active.emit(false), { macrotasks: true });
        const parked = await controller.act(a =>
            a.get(TaskManagerBehavior).run(FanOut, { tag: "resumed", peers: [address] }),
        );
        await awaitState(controller, "fanOut:resumed", "parked");
        const id = controller.id;
        await MockTime.resolve(controller.close(), { macrotasks: true });

        // A new controller over the same storage: the run is still there, and its type has to be registered
        // again for anything to drive it.
        const controller2 = await site.addNode(ControllerRoot, { id, index: 1 });
        await controller2.act(a => a.get(TaskManagerBehavior).register(FanOut));
        await subscribedPeer(controller2, peerAId);
        await subscribedPeer(controller2, peerBId);
        await awaitState(controller2, "fanOut:resumed", "completed");
        expect(isMember(deviceA)).equals(true);

        // Work started after the restart does not collide with the record that survived it.
        const next = await controller2.act(a =>
            a.get(TaskManagerBehavior).run(FanOut, { tag: "after-restart", peers: [addressOfNode(peerB)] }),
        );
        expect(next.runId).greaterThan(parked.runId);
        await awaitState(controller2, "fanOut:after-restart", "completed");
    });

    it("forgets the oldest finished runs, and says so when asked about one", async () => {
        await using site = new MockSite();
        const { controller, peerA, peerB } = await twoDevices(site);
        await controller.act(a => (a.get(TaskManagerBehavior).state.historyLimit = 2));

        // Four runs over two devices, each finishing before the next starts, so the retirement order is the
        // order they were started in.
        const ids = new Array<RunId>();
        for (const [i, tag] of ["one", "two", "three", "four"].entries()) {
            const handle = await controller.act(a =>
                a.get(TaskManagerBehavior).run(FanOut, { tag, peers: [addressOfNode(i % 2 === 0 ? peerA : peerB)] }),
            );
            await awaitState(controller, `fanOut:${tag}`, "completed");
            ids.push(handle.runId);
        }

        // Storage holds the limit, not merely the history query: the oldest retirements are gone from the
        // record table itself.
        const stored = await controller.act(a => Object.keys(a.get(TaskManagerBehavior).state.runs).length);
        expect(stored).equals(2);
        const history = await controller.act(a =>
            a
                .get(TaskManagerBehavior)
                .history()
                .map(h => h.runId),
        );
        expect(history).deep.equals([ids[3], ids[2]]);

        // A forgotten run is not denied: a verb that would act on it says the record is gone, which is a
        // different thing from an identity that never existed.
        const forgotten = ids[0];
        expect(await controller.act(a => a.get(TaskManagerBehavior).get(forgotten))).equals(undefined);
        let refusal: unknown;
        try {
            await controller.act(a => a.get(TaskManagerBehavior).retryRollback(forgotten));
        } catch (e) {
            refusal = e;
        }
        expect(refusal).instanceOf(TaskNoLongerTrackedError);

        // An identity never issued is refused differently.
        let unknown: unknown;
        try {
            await controller.act(a => a.get(TaskManagerBehavior).retryRollback(RunId(9999)));
        } catch (e) {
            unknown = e;
        }
        expect(unknown).instanceOf(TaskNotFoundError);
    });

    it("ends a run whose work was only for a peer that left the fabric", async () => {
        await using site = new MockSite();
        const { controller, peerA } = await twoDevices(site);
        const address = addressOfNode(peerA);
        const slot = `addNodeToGroup:${addressLabel(address)}:${GROUP}:${LOCAL_EP}`;

        // Park the run so it is still in flight when its only peer goes.
        await MockTime.resolve(subscriptionOf(peerA).active.emit(false), { macrotasks: true });
        await controller.act(a => a.get(TaskManagerBehavior).run(AddNodeToGroup, addParamsFor(address)));
        await awaitState(controller, slot, "parked");

        await MockTime.resolve(peerA.delete(), { macrotasks: true });

        // Provisioning one node is pointless once that node is gone, and the task says so itself.
        await awaitState(controller, slot, "failed");
        const record = await controller.act(a => recordFor(a.get(TaskManagerBehavior).state.runs, slot));
        expect(record?.error).contains("left the fabric");
        // Its target is free again, and nothing it recorded still names the departed peer — an entry naming
        // one could never be replayed, and would pin the record against the history limit forever.
        expect(await controller.act(a => a.get(TaskManagerBehavior).tasks.length)).equals(0);
        expect(record?.changeSet.some(entry => PeerAddress.is(entry.peer, address))).equals(false);
    });

    it("carries on with the peers that remain when the work is not about the one that left", async () => {
        await using site = new MockSite();
        const { controller, deviceB, peerA, peerB } = await twoDevices(site);

        // One run over both devices; A goes while it is parked waiting for A to come back.
        await MockTime.resolve(subscriptionOf(peerA).active.emit(false), { macrotasks: true });
        const handle = await controller.act(a =>
            a
                .get(TaskManagerBehavior)
                .run(FanOut, { tag: "survives", peers: [addressOfNode(peerB), addressOfNode(peerA)] }),
        );
        await awaitState(controller, "fanOut:survives", "parked", "running");

        await MockTime.resolve(peerA.delete(), { macrotasks: true });

        // The work still makes sense for B, so it finishes rather than failing with A.
        await awaitState(controller, "fanOut:survives", "completed");
        expect(handle.status.state).equals("completed");
        expect(isMember(deviceB)).equals(true);
    });

    it("answers what starting a task would do while another run holds its target", async () => {
        await using site = new MockSite();
        const { controller, peerA } = await twoDevices(site);
        const address = addressOfNode(peerA);

        const slot = `addNodeToGroup:${addressLabel(address)}:${GROUP}:${LOCAL_EP}`;

        // Park the run by taking its device offline, so the target is held while the question is asked.
        const subscription = subscriptionOf(peerA);
        await MockTime.resolve(subscription.active.emit(false), { macrotasks: true });
        const first = await controller.act(a =>
            a.get(TaskManagerBehavior).run(AddNodeToGroup, addParamsFor(address), { externalId: "kitchen" }),
        );
        await awaitState(controller, slot, "parked");

        // Asked from the same rules `run` applies. A caller that names the same work joins it; one that does
        // not is refused, because two runs writing one target is what the slot exists to prevent.
        const joining = await controller.act(a =>
            a.get(TaskManagerBehavior).assess(AddNodeToGroup, addParamsFor(address), { externalId: "kitchen" }),
        );
        expect(joining.verdict).equals("joins");
        expect(joining.joins).equals(first.runId);

        const blocked = await controller.act(a =>
            a.get(TaskManagerBehavior).assess(AddNodeToGroup, addParamsFor(address)),
        );
        expect(blocked.verdict).equals("blocked");
        expect(blocked.findings[0].code).equals(TaskFindingCode.SlotOccupied);
        expect(blocked.findings[0].owner).equals(first.runId);

        // And `run` refuses with the very finding `assess` reported, so the two cannot drift apart.
        let refusal: unknown;
        try {
            await controller.act(a => a.get(TaskManagerBehavior).run(AddNodeToGroup, addParamsFor(address)));
        } catch (e) {
            refusal = e;
        }
        expect(refusal).instanceOf(TaskSlotOccupiedError);
        expect((refusal as TaskSlotOccupiedError).code).equals(blocked.findings[0].code);

        await MockTime.resolve(subscription.active.emit(true), { macrotasks: true });
        await awaitState(controller, slot, "completed");
        // Once the target is free the same request is admitted.
        const after = await controller.act(a =>
            a.get(TaskManagerBehavior).assess(AddNodeToGroup, addParamsFor(address)),
        );
        expect(after.verdict).equals("ready");
    });
});
