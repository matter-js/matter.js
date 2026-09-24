/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { managedFabricOf } from "#ManagedFabric.js";
import { ReconcilerBehavior } from "#ReconcilerBehavior.js";
import { TaskForeignFabricError, TaskNoManagedFabricError } from "#task/errors.js";
import { AddNodeToGroup, AddNodeToGroupParams } from "#task/groups/AddNodeToGroup.js";
import { addressOf } from "#task/peer.js";
import { TaskManagerBehavior } from "#task/TaskManagerBehavior.js";
import { ImplementationError, InternalError } from "@matter/general";
import { Crypto, Millis, MockCrypto, Seconds } from "@matter/general";
import { ClientNode, DesiredStateBehavior, NetworkClient, ServerNode } from "@matter/node";
import { MockServerNode, MockSite, subscribedPeer } from "@matter/node/testing";
import { Fabric, FabricAuthority, FabricManager, PeerAddress, SustainedSubscription } from "@matter/protocol";
import { EndpointNumber, FabricId, FabricIndex, GroupId, NodeId } from "@matter/types";
import { AccessControl } from "@matter/types/clusters/access-control";
import { GroupKeyManagement } from "@matter/types/clusters/group-key-management";
import { isTerminalState } from "./task/helpers.js";

const LOCAL_EP = EndpointNumber(1);
const GROUP = GroupId(0x101);

const ControllerRoot = MockServerNode.RootEndpoint.with(TaskManagerBehavior);

/** A reconciler pointed at an index no fabric holds, which is how an operator's mistake reads. */
const ConfiguredReconciler = ReconcilerBehavior.set({ fabric: FabricIndex(9) });

/** A manager that has settled on no fabric, which a controller holding none or several leaves behind. */
class UnmanagedTaskManager extends TaskManagerBehavior {
    static override readonly schema = TaskManagerBehavior.schema;

    protected override managedFabric() {
        return undefined;
    }

    protected override unmanagedReason() {
        return "this controller holds no fabric yet";
    }
}

const UnmanagedRoot = MockServerNode.RootEndpoint.with(UnmanagedTaskManager);

function addressOfNode(node: ClientNode): PeerAddress {
    const address = addressOf(node);
    if (address === undefined) {
        throw new InternalError(`${node.id} has no address`);
    }
    return address;
}

function paramsFor(peer: PeerAddress): AddNodeToGroupParams {
    return {
        peer,
        endpoint: LOCAL_EP,
        groupId: GROUP,
        groupKeySetId: 42,
        groupKeySecurityPolicy: GroupKeyManagement.GroupKeySecurityPolicy.TrustFirst,
        epochKey0: new Uint8Array(16).fill(3),
        epochStartTime0: 1_000_000_000_000_000n,
    };
}

/** A second fabric on the same controller, as an application holding two administrative identities has. */
async function addFabric(controller: ServerNode, fabricId: FabricId) {
    const authority = controller.env.get(FabricAuthority);
    const fabric = await authority.createFabric({
        adminFabricId: fabricId,
        adminFabricLabel: `fabric-${fabricId}`,
        adminNodeId: NodeId(BigInt(fabricId) + 1000n),
    });
    return fabric;
}

/** A device commissioned into a fabric of the controller's choosing, so two fabrics each hold a real peer. */
async function commissionInto(site: MockSite, controller: ServerNode, fabric: Fabric) {
    const device = await site.addDevice();
    const controllerCrypto = controller.env.get(Crypto) as MockCrypto;
    const deviceCrypto = device.env.get(Crypto) as MockCrypto;
    controllerCrypto.entropic = deviceCrypto.entropic = true;
    const { passcode, discriminator } = device.state.commissioning;
    await MockTime.resolve(controller.peers.commission({ passcode, discriminator, fabric, timeout: Seconds(90) }), {
        macrotasks: true,
    });
    controllerCrypto.entropic = deviceCrypto.entropic = false;
    return device;
}

/** An ACL grant a reconcile pass can apply on its own. */
const grant = {
    privilege: AccessControl.AccessControlEntryPrivilege.Operate,
    authMode: AccessControl.AccessControlEntryAuthMode.Case,
    subjects: [NodeId(0x1234n)],
    targets: null,
};

/** A controller with one commissioned peer and the group-provisioning task registered. */
async function controllerWithTaskManager(site: MockSite) {
    const { controller } = await site.addCommissionedPair({ controller: { type: ControllerRoot } });
    const peerA = await subscribedPeer(controller, "peer1");
    await controller.act(a => a.get(TaskManagerBehavior).register(AddNodeToGroup));
    return { controller, peerA };
}

function subscriptionOf(peer: ClientNode) {
    return peer.behaviors.internalsOf(NetworkClient).activeSubscription as SustainedSubscription;
}

async function restart(site: MockSite, node: ServerNode, id: string, index: number) {
    await MockTime.resolve(node.close(), { macrotasks: true });
    return await site.addNode(ControllerRoot, { id, index });
}

async function pumpUntil(what: string, done: () => boolean | Promise<boolean>) {
    for (let i = 0; i < 2000; i++) {
        if (await done()) {
            return;
        }
        await MockTime.advance(Millis(10));
        await MockTime.macrotask;
    }
    throw new InternalError(`Condition "${what}" never held`);
}

function reconcilerOf(controller: ServerNode) {
    return controller.act(agent => {
        const reconciler = agent.get(ReconcilerBehavior);
        return {
            index: reconciler.managedFabric?.index,
            globalId: reconciler.managedFabric?.globalId,
            reason: reconciler.unmanagedReason,
            peers: reconciler.managedFabric?.peers().map(peer => peer.id) ?? [],
        };
    });
}

describe("the fabric a manager manages", () => {
    before(() => MockTime.init());

    it("adopts the only fabric a controller holds", async () => {
        await using site = new MockSite();
        const { controller } = await site.addCommissionedPair({ controller: { type: ControllerRoot } });
        const peer = await subscribedPeer(controller, "peer1");

        const managed = await reconcilerOf(controller);
        expect(managed.index).equals(addressOfNode(peer).fabricIndex);
        expect(managed.peers).deep.equals([peer.id]);
        expect(managed.reason).equals(undefined);
    });

    it("keeps the fabric it settled on when another appears later", async () => {
        await using site = new MockSite();
        const { controller } = await site.addCommissionedPair({ controller: { type: ControllerRoot } });
        await subscribedPeer(controller, "peer1");

        // The manager settled on the first fabric at startup, so a second one added later does not unseat it:
        // what it manages is what its records and desired state already describe.
        await addFabric(controller, FabricId(2));
        expect((await reconcilerOf(controller)).index).equals(FabricIndex(1));
    });

    it("enumerates only the peers of the fabric it manages", async () => {
        await using site = new MockSite();
        const { controller } = await site.addCommissionedPair({ controller: { type: ControllerRoot } });
        const mine = await subscribedPeer(controller, "peer1");
        const other = await addFabric(controller, FabricId(2));
        await commissionInto(site, controller, other);

        // Both peers are in the container; one of them is this manager's.
        expect([...controller.peers].length).equals(2);
        const managed = await reconcilerOf(controller);
        expect(managed.peers).deep.equals([mine.id]);
    });

    it("resolves an address of its own fabric and no other", async () => {
        await using site = new MockSite();
        const { controller } = await site.addCommissionedPair({ controller: { type: ControllerRoot } });
        const mine = await subscribedPeer(controller, "peer1");
        const other = await addFabric(controller, FabricId(2));
        const foreignPeer = await commissionInto(site, controller, other);
        expect(foreignPeer.lifecycle.isCommissioned).equals(true);

        const address = addressOfNode(mine);
        const fabric = managedFabricOf(
            controller,
            address.fabricIndex,
            controller.env.get(FabricManager).for(address.fabricIndex).globalId,
        );
        const foreign = [...controller.peers].find(peer => peer.peerAddress?.fabricIndex === other.fabricIndex)!;

        // The container resolves both; the scope answers for one. A resolver that skipped this gate would hand a
        // task a peer its records cannot name.
        expect(controller.peers.get(foreign.peerAddress!)).not.equals(undefined);
        expect(fabric.peer(address)?.id).equals(mine.id);
        expect(fabric.peer(foreign.peerAddress!)).equals(undefined);
    });

    it("refuses to reconcile a peer of another fabric", async () => {
        await using site = new MockSite();
        const { controller } = await site.addCommissionedPair({ controller: { type: ControllerRoot } });
        await subscribedPeer(controller, "peer1");
        const other = await addFabric(controller, FabricId(2));
        const foreignDevice = await commissionInto(site, controller, other);
        const foreignPeer = [...controller.peers].find(peer => peer.peerAddress?.fabricIndex === other.fabricIndex);
        expect(foreignPeer).not.equals(undefined);
        expect(foreignDevice.lifecycle.isCommissioned).equals(true);

        let refusal: unknown;
        try {
            await controller.act(a => a.get(ReconcilerBehavior).reconcile(foreignPeer!));
        } catch (e) {
            refusal = e;
        }
        expect(refusal).instanceOf(ImplementationError);
        expect((refusal as Error).message).contains("not on the fabric this manager manages");
    });

    it("acts on no trigger from a peer of another fabric", async () => {
        await using site = new MockSite();
        const { controller } = await site.addCommissionedPair({ controller: { type: ControllerRoot } });
        const mine = await subscribedPeer(controller, "peer1");
        const other = await addFabric(controller, FabricId(2));
        await commissionInto(site, controller, other);
        const foreign = [...controller.peers].find(peer => peer.peerAddress?.fabricIndex === other.fabricIndex)!;
        // Subscribed, or its triggers never fire and this test would pass without the gate doing anything.
        await subscribedPeer(controller, foreign.id);

        // The same intent on both peers, announced the same way, so both emit the trigger a pass starts from.
        for (const peer of [mine, foreign]) {
            await peer.act(agent => agent.get(DesiredStateBehavior).setIntent("acl", "k1", grant, "converge"));
        }
        await MockTime.advance(Millis(50));
        await MockTime.macrotask;

        // A peer gets its own lock the first time work is scheduled for it, and nothing else creates one, so
        // this says which triggers were acted on.
        const locks = controller.behaviors.internalsOf(ReconcilerBehavior).locks;
        expect(locks.has(mine)).equals(true);
        expect(locks.has(foreign)).equals(false);
    });

    it("refuses work for a peer of another fabric", async () => {
        await using site = new MockSite();
        const { controller } = await site.addCommissionedPair({ controller: { type: ControllerRoot } });
        await subscribedPeer(controller, "peer1");
        const other = await addFabric(controller, FabricId(2));

        const foreign = PeerAddress({ fabricIndex: other.fabricIndex, nodeId: NodeId(77n) });
        let refusal: unknown;
        try {
            await controller.act(a => a.get(TaskManagerBehavior).run(AddNodeToGroup, paramsFor(foreign)));
        } catch (e) {
            refusal = e;
        }
        expect(refusal).instanceOf(TaskForeignFabricError);

        // And `assess` reports the same refusal as data rather than throwing it.
        const verdict = await controller.act(a =>
            a.get(TaskManagerBehavior).assess(AddNodeToGroup, paramsFor(foreign)),
        );
        expect(verdict.verdict).equals("blocked");
        expect(verdict.findings[0].code).equals(new TaskForeignFabricError("").code);
    });

    it("manages nothing when a start finds several fabrics and none is named", async () => {
        await using site = new MockSite();
        const { controller } = await site.addCommissionedPair({ controller: { type: ControllerRoot } });
        await subscribedPeer(controller, "peer1");
        await addFabric(controller, FabricId(2));
        // As a controller that gained its second fabric before this build did: two fabrics, nothing adopted.
        await controller.act(a => (a.get(ReconcilerBehavior).state.managedFabricId = null));

        const restarted = await restart(site, controller, controller.id, 1);

        const managed = await reconcilerOf(restarted);
        expect(managed.index).equals(undefined);
        expect(managed.reason).equals("this controller holds 2 fabrics (1, 2) and none is configured");
    });

    it("manages the fabric an operator names, and says so when the name matches nothing", async () => {
        await using site = new MockSite();
        const { controller } = await site.addCommissionedPair({
            controller: { type: MockServerNode.RootEndpoint.with(TaskManagerBehavior, ConfiguredReconciler) },
        });
        await subscribedPeer(controller, "peer1");

        // Index 9 holds no fabric, so nothing is managed and the reason names the index rather than guessing.
        const managed = await reconcilerOf(controller);
        expect(managed.index).equals(undefined);
        expect(managed.reason).equals("no fabric holds the configured index 9");
    });

    it("refuses work while no fabric is managed", async () => {
        // A manager whose controller has not settled on a fabric: nothing it could act on exists yet.
        await using node = await MockServerNode.create(UnmanagedRoot);

        const address = PeerAddress({ fabricIndex: FabricIndex(1), nodeId: NodeId(5n) });
        let refusal: unknown;
        try {
            await node.act(a => a.get(UnmanagedTaskManager).run(AddNodeToGroup, paramsFor(address)));
        } catch (e) {
            refusal = e;
        }
        expect(refusal).instanceOf(TaskNoManagedFabricError);
        expect((refusal as Error).message).contains("holds no fabric");
    });

    it("keeps managing the same fabric across a restart, by identity rather than by index", async () => {
        await using site = new MockSite();
        const { controller } = await site.addCommissionedPair({ controller: { type: ControllerRoot } });
        await subscribedPeer(controller, "peer1");
        const before = await reconcilerOf(controller);

        await MockTime.resolve(controller.close(), { macrotasks: true });
        const restarted = await site.addNode(ControllerRoot, { id: controller.id, index: 1 });
        const after = await reconcilerOf(restarted);

        expect(after.globalId).equals(before.globalId);
        expect(after.index).equals(before.index);
    });

    it("knows which fabric was its own when a restart finds several", async () => {
        await using site = new MockSite();
        const { controller } = await site.addCommissionedPair({ controller: { type: ControllerRoot } });
        await subscribedPeer(controller, "peer1");
        const before = await reconcilerOf(controller);
        await addFabric(controller, FabricId(2));

        await MockTime.resolve(controller.close(), { macrotasks: true });
        const restarted = await site.addNode(ControllerRoot, { id: controller.id, index: 1 });

        // Two fabrics and no configuration: without the identity it stored, the manager could only guess, and
        // its records and desired state describe one of them.
        const after = await reconcilerOf(restarted);
        expect(after.globalId).equals(before.globalId);
    });

    it("ends the runs of a fabric that leaves, and undoes none of them", async () => {
        await using site = new MockSite();
        const { controller, peerA } = await controllerWithTaskManager(site);
        const address = addressOfNode(peerA);

        // Park a run so it is in flight, with its record stored and its priors recorded, when the fabric goes.
        await MockTime.resolve(subscriptionOf(peerA).active.emit(false), { macrotasks: true });
        const handle = await controller.act(a => a.get(TaskManagerBehavior).run(AddNodeToGroup, paramsFor(address)));
        await pumpUntil("the run parks", () => handle.status.state === "parked");
        expect(handle.status.wrote).equals(true);

        const managed = await reconcilerOf(controller);
        await MockTime.resolve(controller.env.get(FabricManager).for(managed.index!).delete(), { macrotasks: true });
        await pumpUntil("the run ends", () => isTerminalState(handle.status.state));

        // Nothing on that fabric can be reached again, to finish or to undo: the run ends without a rollback,
        // keeps no priors a later fabric's devices could be handed, and gives its target back.
        expect(handle.status.state).equals("failed");
        expect(handle.status.error).match(/^the fabric it acts on \(\d+\) left this controller$/);
        expect(handle.status.rollbackRunId).equals(undefined);
        const stored = await controller.act(
            a => a.get(TaskManagerBehavior).state.runs[String(handle.status.runId)].changeSet,
        );
        expect(stored).deep.equals([]);
        expect(await controller.act(a => a.get(TaskManagerBehavior).tasks.length)).equals(0);

        // And nothing new is admitted while the manager holds no fabric.
        let refusal: unknown;
        try {
            await controller.act(a => a.get(TaskManagerBehavior).run(AddNodeToGroup, paramsFor(address)));
        } catch (e) {
            refusal = e;
        }
        expect(refusal).instanceOf(TaskNoManagedFabricError);
    });

    it("resumes no stored run while no fabric is settled", async () => {
        await using site = new MockSite();
        const { controller, peerA } = await controllerWithTaskManager(site);
        const address = addressOfNode(peerA);

        // A run recorded and parked, then a start that cannot tell which fabric it belongs to.
        await MockTime.resolve(subscriptionOf(peerA).active.emit(false), { macrotasks: true });
        const handle = await controller.act(a => a.get(TaskManagerBehavior).run(AddNodeToGroup, paramsFor(address)));
        await pumpUntil("the run parks", () => handle.status.state === "parked");
        const runId = handle.status.runId;
        await addFabric(controller, FabricId(2));
        await controller.act(a => (a.get(ReconcilerBehavior).state.managedFabricId = null));

        const restarted = await restart(site, controller, controller.id, 1);
        await restarted.act(a => a.get(TaskManagerBehavior).register(AddNodeToGroup));
        await MockTime.advance(Seconds(30));
        await MockTime.macrotask;

        // Driving it would state an outcome for work against peers this manager cannot reach. It keeps its
        // target instead, for a start that has a fabric.
        const status = await restarted.act(a => a.get(TaskManagerBehavior).get(runId)?.status);
        expect(status).not.equals(undefined);
        expect(isTerminalState(status!.state)).equals(false);
        expect(status!.rollbackRunId).equals(undefined);
    });

    it("ends the runs of a fabric it does not manage when that fabric leaves", async () => {
        await using site = new MockSite();
        const { controller, peerA } = await controllerWithTaskManager(site);
        const address = addressOfNode(peerA);

        await MockTime.resolve(subscriptionOf(peerA).active.emit(false), { macrotasks: true });
        const handle = await controller.act(a => a.get(TaskManagerBehavior).run(AddNodeToGroup, paramsFor(address)));
        await pumpUntil("the run parks", () => handle.status.state === "parked");
        const runId = handle.status.runId;
        const managedIndex = (await reconcilerOf(controller)).index!;

        // A restart that cannot tell which of two fabrics is its own leaves this one on the controller, unmanaged.
        await addFabric(controller, FabricId(2));
        await controller.act(a => (a.get(ReconcilerBehavior).state.managedFabricId = null));
        const restarted = await restart(site, controller, controller.id, 1);
        await restarted.act(a => a.get(TaskManagerBehavior).register(AddNodeToGroup));
        expect((await reconcilerOf(restarted)).index).equals(undefined);

        await MockTime.resolve(restarted.env.get(FabricManager).for(managedIndex).delete(), { macrotasks: true });
        await pumpUntil("the run ends", async () => {
            const state = await restarted.act(a => a.get(TaskManagerBehavior).get(runId)?.status.state);
            return state === "failed";
        });
    });

    it("takes up the runs it deferred when an operator names the fabric", async () => {
        await using site = new MockSite();
        const { controller, peerA } = await controllerWithTaskManager(site);
        const address = addressOfNode(peerA);

        // A run recorded and parked, then a start that cannot tell which fabric its records belong to.
        await MockTime.resolve(subscriptionOf(peerA).active.emit(false), { macrotasks: true });
        const handle = await controller.act(a => a.get(TaskManagerBehavior).run(AddNodeToGroup, paramsFor(address)));
        await pumpUntil("the run parks", () => handle.status.state === "parked");
        const runId = handle.status.runId;
        const managedIndex = (await reconcilerOf(controller)).index;
        await addFabric(controller, FabricId(2));
        await controller.act(a => (a.get(ReconcilerBehavior).state.managedFabricId = null));

        const restarted = await restart(site, controller, controller.id, 1);
        await restarted.act(a => a.get(TaskManagerBehavior).register(AddNodeToGroup));
        expect((await reconcilerOf(restarted)).index).equals(undefined);

        // Naming the fabric is the documented takeover, and the fabric named is already here — so nothing else
        // would announce that the answer changed. Adopting it releases the resume pass the manager had nothing
        // to run, and the deferred record is driven from here.
        await restarted.act(a => (a.get(ReconcilerBehavior).state.fabric = managedIndex));
        expect((await reconcilerOf(restarted)).index).equals(managedIndex);
        await pumpUntil("the deferred run finishes", async () => {
            const status = await restarted.act(a => a.get(TaskManagerBehavior).get(runId)?.status.state);
            return status === "completed";
        });
    });

    it("stops managing a fabric that leaves the controller", async () => {
        await using site = new MockSite();
        const { controller } = await site.addCommissionedPair({ controller: { type: ControllerRoot } });
        await subscribedPeer(controller, "peer1");
        const managed = await reconcilerOf(controller);

        const fabrics = controller.env.get(FabricManager);
        await MockTime.resolve(fabrics.for(managed.index!).delete(), { macrotasks: true });

        const after = await reconcilerOf(controller);
        expect(after.index).equals(undefined);
        expect(after.reason).not.equals(undefined);
    });
});
