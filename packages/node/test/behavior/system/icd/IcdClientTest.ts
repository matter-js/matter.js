/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { CommissioningClient } from "#behavior/system/commissioning/CommissioningClient.js";
import { IcdClient } from "#behavior/system/icd/IcdClient.js";
import { IcdMultiAdminError } from "#behavior/system/icd/IcdMultiAdminError.js";
import { NetworkClient } from "#behavior/system/network/NetworkClient.js";
import { IcdManagementClient, IcdManagementServer } from "#behaviors/icd-management";
import { ClientNode } from "#node/ClientNode.js";
import { ServerNode } from "#node/index.js";
import { ImplementationError, Millis, Minutes, Seconds, ServerAddressIp, Time } from "@matter/general";
import {
    ClientSubscribe,
    FabricManager,
    LIT_MIN_IDLE_INTERVAL,
    Peer,
    Subscribe,
    SustainedSubscription,
    TestFabric,
} from "@matter/protocol";
import { FabricId, NodeId, SubjectId, VendorId } from "@matter/types";
import { IcdManagement } from "@matter/types/clusters/icd-management";
import { commission, LIT_CONFIG, wakeDevice, wakefulnessOf } from "../../../node/icd-helpers.js";
import { MockSite } from "../../../node/mock-site.js";
import { subscribedPeer } from "../../../node/node-helpers.js";

const RootWithIcd = ServerNode.RootEndpoint.with(IcdManagementServer);

const LitIcdServer = IcdManagementServer.with(
    IcdManagement.Feature.CheckInProtocolSupport,
    IcdManagement.Feature.LongIdleTimeSupport,
);
const RootWithLitIcd = ServerNode.RootEndpoint.with(LitIcdServer);

const DslsIcdServer = IcdManagementServer.with(
    IcdManagement.Feature.CheckInProtocolSupport,
    IcdManagement.Feature.LongIdleTimeSupport,
    IcdManagement.Feature.DynamicSitLitSupport,
);
const RootWithDslsIcd = ServerNode.RootEndpoint.with(DslsIcdServer);

/** Commission a DSLS device that is operating in LIT mode before the controller subscribes. */
async function litOperatingPair(site: MockSite) {
    const { controller, device } = await site.addUncommissionedPair({
        device: { type: RootWithDslsIcd, icdManagement: LIT_CONFIG },
    });
    await device.act(agent => agent.get(DslsIcdServer).setOperatingMode(IcdManagement.OperatingMode.Lit));
    await commission(controller, device);
    const peer1 = await subscribedPeer(controller, "peer1");
    // A LIT-operating peer auto-registers at commissioning (deferred own transaction with peer I/O); drain until it settles.
    await settleAutoRegistration(peer1);
    return { controller, device, peer1 };
}

/** Await a pending LIT auto-registration to commit. Resolves immediately when already registered. */
async function settleAutoRegistration(peer: ClientNode) {
    if (peer.stateOf(IcdClient).registered) {
        return;
    }
    const registered = new Promise<void>(resolve => peer.eventsOf(IcdClient).registered.once(() => resolve()));
    await MockTime.resolve(registered, { macrotasks: true });
}

/** Drop the auto-registration and re-register under a subject the active subscription does not cover, so the device transmits Check-Ins. */
async function reRegisterWithSubject(peer: ClientNode, monitoredSubject: SubjectId) {
    await peer.act(agent => agent.get(IcdClient).unregister());
    await peer.act(agent => agent.get(IcdClient).register({ monitoredSubject }));
}

/** Replace the peer's mDNS-discovered addresses and emit the change so PeerAddressMonitor reacts. */
async function simulateAddressChange(protopeer: Peer, remove: ServerAddressIp[], add: ServerAddressIp[]) {
    for (const addr of remove) {
        protopeer.service.addresses.delete(addr);
    }
    for (const addr of add) {
        protopeer.service.addresses.add(addr);
    }
    await protopeer.service.changed.emit();
}

describe("IcdClient", () => {
    before(() => {
        MockTime.init();
    });

    it("auto-installs on a ClientNode when the peer exposes IcdManagement", async () => {
        await using site = new MockSite();
        const { controller } = await site.addCommissionedPair({
            device: { type: RootWithIcd },
        });

        const peer1 = controller.peers.get("peer1")!;
        expect(peer1).not.undefined;

        expect(peer1.behaviors.has(IcdClient)).true;
    });

    it("defaults to unregistered with no Check-In timestamp", async () => {
        await using site = new MockSite();
        const { controller } = await site.addCommissionedPair({
            device: { type: RootWithIcd },
        });

        const peer1 = controller.peers.get("peer1")!;
        const state = peer1.stateOf(IcdClient);
        expect(state.registered).false;
        expect(state.lastCheckInReceivedAt).undefined;
    });

    it("exposes isRegistered reflecting state.registered", async () => {
        await using site = new MockSite();
        const { controller } = await site.addCommissionedPair({
            device: { type: RootWithIcd },
        });

        const peer1 = controller.peers.get("peer1")!;
        const isRegistered = await peer1.act(agent => agent.get(IcdClient).isRegistered);
        expect(isRegistered).false;
    });

    describe("register", () => {
        it("registers the controller on the peer and records the counter baseline", async () => {
            await using site = new MockSite();
            const { controller, device } = await site.addCommissionedPair({
                device: { type: RootWithIcd },
            });

            const peer1 = await subscribedPeer(controller, "peer1");
            await peer1.act(agent => agent.get(IcdClient).register());

            const state = peer1.stateOf(IcdClient);
            expect(state.registered).true;
            expect(state.counterStart).not.undefined;
            expect(state.lastOffset).equals(0);
            expect(state.key).not.undefined;

            // Device side proves the real registerClient round-trip landed.
            const registeredClients = device.stateOf(IcdManagementServer).registeredClients;
            expect(registeredClients).length(1);

            const fabricIndex = peer1.stateOf(CommissioningClient).peerAddress!.fabricIndex;
            const fabric = controller.env.get(FabricManager).for(fabricIndex);

            // The controller registers under its own operational node id on the fabric.
            expect(registeredClients[0].checkInNodeId).equals(fabric.nodeId);

            // The controller-side fabric feed carries the peer (the Check-In RX path is armed).
            expect(fabric.icd.hasPeers).true;
        });

        it("issues RegisterClient with a 16-byte key and the requested monitored subject", async () => {
            await using site = new MockSite();
            const { controller, device } = await site.addCommissionedPair({
                device: { type: RootWithIcd },
            });

            const peer1 = await subscribedPeer(controller, "peer1");
            const monitoredSubject = SubjectId(NodeId(0xabcdn));
            await peer1.act(agent => agent.get(IcdClient).register({ monitoredSubject }));

            // TC-ICDM-6.1 param checks. The Key is a 16-byte octstr the client generates; the device stores it
            // write-only, so assert the bytes on the client side.
            expect(peer1.stateOf(IcdClient).key!.byteLength).equals(16);

            const registered = device.stateOf(IcdManagementServer).registeredClients;
            expect(registered).length(1);
            expect(registered[0].monitoredSubject).equals(monitoredSubject);
            expect(registered[0].clientType).equals(IcdManagement.ClientType.Permanent);

            const fabricIndex = peer1.stateOf(CommissioningClient).peerAddress!.fabricIndex;
            expect(registered[0].checkInNodeId).equals(controller.env.get(FabricManager).for(fabricIndex).nodeId);
        });

        it("rejects a multi-admin peer and succeeds when allowMultiAdmin is set", async () => {
            await using site = new MockSite();
            const { controller, device } = await site.addCommissionedPair({
                device: { type: RootWithIcd },
            });

            // Add a real second administrator fabric to the device under a different (non-ignored) vendor. The
            // controller reads it back via the fabricFilter:false OperationalCredentials read.
            const fabrics = device.env.get(FabricManager);
            const authority = await TestFabric.Authority({ fabrics });
            await authority.createFabric({
                adminFabricLabel: "second-admin",
                adminVendorId: VendorId(0xfff2),
                adminFabricId: FabricId(2),
            });

            const peer1 = await subscribedPeer(controller, "peer1");

            let caught: unknown;
            try {
                await peer1.act(agent => agent.get(IcdClient).register());
            } catch (e) {
                caught = e;
            }
            expect(caught).instanceof(IcdMultiAdminError);
            expect((caught as IcdMultiAdminError).adminVendorIds.map(Number)).contains(0xfff2);
            expect(peer1.stateOf(IcdClient).registered).false;

            // Explicit opt-in registers despite the co-admin.
            await peer1.act(agent => agent.get(IcdClient).register({ allowMultiAdmin: true }));
            expect(peer1.stateOf(IcdClient).registered).true;
        });

        it("registers against a CIP-capable peer (the only ICD shape this harness can build)", async () => {
            // The CIP gate refuses registration when maybeFeaturesOf(IcdManagementClient).checkInProtocolSupport is
            // not true. A pure non-CIP ICD device cannot be constructed here: IcdManagementServer bakes CIP in and a
            // server with CIP dropped fails init (see IcdManagementServerTest "rejects a LITS-only server"). So the
            // negative path has no buildable fixture; this test pins the positive side — a CIP peer passes the gate.
            await using site = new MockSite();
            const { controller, device } = await site.addCommissionedPair({
                device: { type: RootWithIcd },
            });

            const peer1 = await subscribedPeer(controller, "peer1");
            expect(peer1.maybeStateOf(IcdClient)).not.undefined;

            await peer1.act(agent => agent.get(IcdClient).register());
            expect(peer1.stateOf(IcdClient).registered).true;
            expect(device.stateOf(IcdManagementServer).registeredClients).length(1);
        });

        it("refuses register() without an established subscription", async () => {
            await using site = new MockSite();
            const { controller } = await site.addCommissionedPair({
                device: { type: RootWithIcd },
            });

            // The sustained subscription has not reached its established (active) edge, so registering now would decide
            // on stale peer state.
            const peer1 = controller.peers.get("peer1")!;
            expect(await peer1.act(agent => agent.get(NetworkClient).subscriptionActive)).false;

            await expect(peer1.act(agent => agent.get(IcdClient).register())).to.be.rejectedWith(
                ImplementationError,
                /subscription/i,
            );
            expect(peer1.stateOf(IcdClient).registered).false;
        });

        it("throws when already registered", async () => {
            await using site = new MockSite();
            const { controller } = await site.addCommissionedPair({
                device: { type: RootWithIcd },
            });

            const peer1 = await subscribedPeer(controller, "peer1");
            await peer1.act(agent => agent.get(IcdClient).register());

            let caught: unknown;
            try {
                await peer1.act(agent => agent.get(IcdClient).register());
            } catch (e) {
                caught = e;
            }
            expect(caught).instanceof(ImplementationError);
            expect(peer1.stateOf(IcdClient).registered).true;
        });
    });

    describe("auto-register on LIT", () => {
        it("auto-registers a LIT-operating peer at commissioning without an explicit register()", async () => {
            await using site = new MockSite();
            const { peer1 } = await litOperatingPair(site);
            expect(peer1.stateOf(IcdClient).registered).true;
            expect(peer1.stateOf(IcdClient).key).not.undefined;
        });

        it("does NOT auto-register a LIT-advertising peer below spec 1.4.0", async () => {
            await using site = new MockSite();
            const { controller, device } = await site.addUncommissionedPair({
                device: {
                    type: RootWithDslsIcd,
                    icdManagement: LIT_CONFIG,
                    basicInformation: { specificationVersion: 0x01030000 },
                },
            });
            await device.act(agent => agent.get(DslsIcdServer).setOperatingMode(IcdManagement.OperatingMode.Lit));
            await commission(controller, device);
            const peer1 = await subscribedPeer(controller, "peer1");
            await MockTime.resolve(Promise.resolve(), { macrotasks: true });

            expect(peer1.stateOf(IcdClient).registered).false;
        });

        it("does NOT auto-register a DSLS peer operating in SIT", async () => {
            await using site = new MockSite();
            const { controller } = await site.addCommissionedPair({
                device: { type: RootWithDslsIcd, icdManagement: LIT_CONFIG },
            });
            const peer1 = await subscribedPeer(controller, "peer1");
            await MockTime.resolve(Promise.resolve(), { macrotasks: true });

            expect(peer1.stateOf(IcdClient).registered).false;
        });

        it("does not auto-register when the fresh operating mode is Sit despite a persisted Lit", async () => {
            await using site = new MockSite();
            const { controller, device } = await site.addCommissionedPair({
                device: { type: RootWithDslsIcd, icdManagement: LIT_CONFIG },
            });
            const peer1 = await subscribedPeer(controller, "peer1");
            expect(peer1.stateOf(IcdClient).registered).false;

            // Stale cache: the device operates in SIT but the controller's persisted operatingMode still reads LIT (as
            // after the device flipped LIT->SIT while the controller was down). Deciding on this cached LIT would
            // wrongly register; a fresh read must reveal SIT and suppress registration.
            await peer1.act(agent => {
                agent.get(IcdManagementClient).state.operatingMode = IcdManagement.OperatingMode.Lit;
            });
            // Let any auto-registration transaction (deferred, with peer I/O) run to completion. On stale-cache
            // behavior the wrong registration lands well within this window (empirically by the 6th step).
            for (let i = 0; i < 15; i++) {
                await MockTime.advance(Millis(200));
                await MockTime.resolve(Promise.resolve(), { macrotasks: true });
            }

            expect(peer1.stateOf(IcdClient).registered).false;
            expect(device.stateOf(IcdManagementServer).registeredClients).length(0);
        });

        it("auto-registers on a runtime SIT->LIT flip", async () => {
            await using site = new MockSite();
            const { controller, device } = await site.addCommissionedPair({
                device: { type: RootWithDslsIcd, icdManagement: LIT_CONFIG },
            });
            const peer1 = await subscribedPeer(controller, "peer1");
            await MockTime.resolve(Promise.resolve(), { macrotasks: true });
            expect(peer1.stateOf(IcdClient).registered).false;

            const modeChanged = new Promise<void>(resolve =>
                peer1.eventsOf(IcdManagementClient).operatingMode$Changed.once(() => resolve()),
            );
            await device.act(agent => agent.get(DslsIcdServer).setOperatingMode(IcdManagement.OperatingMode.Lit));
            await MockTime.resolve(modeChanged, { macrotasks: true });
            await settleAutoRegistration(peer1);

            expect(peer1.stateOf(IcdClient).registered).true;
            expect(peer1.stateOf(IcdClient).key).not.undefined;
        });
    });

    describe("check-in receipt", () => {
        it("receives a real device Check-In, emits checkedIn, and advances counter state", async () => {
            await using site = new MockSite();
            const { controller, device } = await site.addCommissionedPair({
                device: { type: RootWithIcd },
            });

            const peer1 = await subscribedPeer(controller, "peer1");
            // addCommissionedPair leaves an active subscription whose subject is the controller's own node id. Register a
            // monitored subject that subscription does not cover so the device's suppression check does not fire and a
            // real Check-In is transmitted to us.
            await peer1.act(agent => agent.get(IcdClient).register({ monitoredSubject: SubjectId(NodeId(0xabcdn)) }));

            const activeModeThreshold = device.stateOf(IcdManagementServer).activeModeThreshold;
            const counterBefore = device.stateOf(IcdManagementServer).icdCounter;

            const checkedIn = new Promise<{ counter: number; activeModeThreshold: number }>(resolve =>
                peer1.eventsOf(IcdClient).checkedIn.once(resolve),
            );

            // No subscription exists, so the device's monitored subject is uncovered and a Check-In is transmitted.
            await wakeDevice(device);
            const received = await MockTime.resolve(checkedIn, { macrotasks: true });

            expect(received.activeModeThreshold).equals(activeModeThreshold);
            // The device transmits the post-increment counter, so the first Check-In lands one past the registration
            // baseline (offset 1) rather than at the baseline (offset 0, which would be rejected as a replay).
            expect(received.counter).equals(counterBefore + 1);

            const state = peer1.stateOf(IcdClient);
            expect(state.lastCheckInReceivedAt).not.undefined;
            expect(state.lastOffset).equals(received.counter - state.counterStart!);
            expect(state.lastOffset).greaterThan(0);
        });

        it("drops a replayed Check-In without emitting checkedIn or advancing offset", async () => {
            await using site = new MockSite();
            const { controller, device } = await site.addCommissionedPair({
                device: { type: RootWithIcd },
            });

            const peer1 = await subscribedPeer(controller, "peer1");
            await peer1.act(agent => agent.get(IcdClient).register({ monitoredSubject: SubjectId(NodeId(0xabcdn)) }));

            // A first Check-In advances the rolling offset.
            const first = new Promise<void>(resolve => peer1.eventsOf(IcdClient).checkedIn.once(() => resolve()));
            await wakeDevice(device);
            await MockTime.resolve(first, { macrotasks: true });

            const offsetAfterFirst = peer1.stateOf(IcdClient).lastOffset;
            const receivedAtAfterFirst = peer1.stateOf(IcdClient).lastCheckInReceivedAt;

            // Raise the runtime replay floor above any near-term counter (well below 2^31 so no key refresh), so the
            // next real Check-In is rejected as a replay/stale counter before it can reach the handler.
            const fabricIndex = peer1.stateOf(CommissioningClient).peerAddress!.fabricIndex;
            const fabric = controller.env.get(FabricManager).for(fabricIndex);
            const peerNodeId = peer1.stateOf(CommissioningClient).peerAddress!.nodeId;
            fabric.icd.peerFor(peerNodeId)!.lastOffset = 0x10000000;

            let checkInsAfterReplay = 0;
            const observer = () => {
                checkInsAfterReplay++;
            };
            peer1.eventsOf(IcdClient).checkedIn.on(observer);

            await wakeDevice(device);
            await MockTime.resolve(Promise.resolve(), { macrotasks: true });
            peer1.eventsOf(IcdClient).checkedIn.off(observer);

            // The replayed Check-In is dropped at the fabric layer: no event, no client-state change.
            expect(checkInsAfterReplay).equals(0);
            expect(peer1.stateOf(IcdClient).lastOffset).equals(offsetAfterFirst);
            expect(peer1.stateOf(IcdClient).lastCheckInReceivedAt).equals(receivedAtAfterFirst);
        });
    });

    describe("key refresh", () => {
        it("refreshes the key when a Check-In counter crosses the refresh threshold", async () => {
            await using site = new MockSite();
            const { controller, device } = await site.addCommissionedPair({
                device: { type: RootWithIcd },
            });

            const peer1 = await subscribedPeer(controller, "peer1");
            await peer1.act(agent => agent.get(IcdClient).register({ monitoredSubject: SubjectId(NodeId(0xabcdn)) }));

            const originalCounterStart = peer1.stateOf(IcdClient).counterStart!;

            // Pull the running peer's rolling baseline back by 2^31 so the next real device Check-In (counter near the
            // original baseline) lands at offset >= KEY_REFRESH_OFFSET and reports refreshNeeded — the state a real
            // deployment reaches organically after 2^31 check-ins. The real RX path then drives #onCheckIn → #refreshKey.
            const fabricIndex = peer1.stateOf(CommissioningClient).peerAddress!.fabricIndex;
            const fabric = controller.env.get(FabricManager).for(fabricIndex);
            const peerNodeId = peer1.stateOf(CommissioningClient).peerAddress!.nodeId;
            const peerEntry = fabric.icd.peerFor(peerNodeId)!;
            peerEntry.counterStart = (originalCounterStart - 0x80000000) >>> 0;

            // The wakefulness must survive a re-key in place: a parked subscription holds this instance.
            const wakefulnessBefore = fabric.icd.wakefulnessFor(peerNodeId);

            const refreshed = new Promise<void>(resolve =>
                peer1.eventsOf(IcdClient).keyRefreshed.once(() => resolve()),
            );

            await wakeDevice(device);
            await MockTime.resolve(refreshed, { macrotasks: true });
            // keyRefreshed emits inside the refresh transaction; let it commit before reading state.
            await MockTime.resolve(Promise.resolve(), { macrotasks: true });

            const state = peer1.stateOf(IcdClient);
            // counterStart advancing proves the re-key registerClient round-trip ran (MockCrypto.randomBytes is
            // deterministic, so the key bytes themselves cannot be asserted to differ).
            expect(state.lastOffset).equals(0);
            expect(state.counterStart).not.equals(originalCounterStart);

            // The device accepted the re-key in place: still exactly one registration for this controller.
            expect(device.stateOf(IcdManagementServer).registeredClients).length(1);

            // Re-key preserved the wakefulness instance (not delete+recreate), so a parked subscription stays valid.
            expect(fabric.icd.wakefulnessFor(peerNodeId)).equals(wakefulnessBefore);

            const checkedInAgain = new Promise<{ counter: number }>(resolve =>
                peer1.eventsOf(IcdClient).checkedIn.once(resolve),
            );
            await wakeDevice(device);
            const again = await MockTime.resolve(checkedInAgain, { macrotasks: true });
            // A Check-In validating against the NEW key lands past the reset baseline.
            expect(again.counter).greaterThan(peer1.stateOf(IcdClient).counterStart!);
            expect(peer1.stateOf(IcdClient).lastOffset).greaterThan(0);
        });
    });

    describe("unregister", () => {
        it("removes the peer registration, clears state, drops the fabric feed, and emits unregistered", async () => {
            await using site = new MockSite();
            const { controller, device } = await site.addCommissionedPair({
                device: { type: RootWithIcd },
            });

            const peer1 = await subscribedPeer(controller, "peer1");
            await peer1.act(agent => agent.get(IcdClient).register());
            expect(device.stateOf(IcdManagementServer).registeredClients).length(1);

            const fabricIndex = peer1.stateOf(CommissioningClient).peerAddress!.fabricIndex;
            const fabric = controller.env.get(FabricManager).for(fabricIndex);
            expect(fabric.icd.hasPeers).true;

            const unregistered = new Promise<void>(resolve =>
                peer1.eventsOf(IcdClient).unregistered.once(() => resolve()),
            );

            await peer1.act(agent => agent.get(IcdClient).unregister());
            await MockTime.resolve(unregistered, { macrotasks: true });

            const state = peer1.stateOf(IcdClient);
            expect(state.registered).false;
            expect(state.key).undefined;
            expect(state.counterStart).undefined;
            expect(state.lastOffset).undefined;

            expect(device.stateOf(IcdManagementServer).registeredClients).length(0);
            expect(fabric.icd.hasPeers).false;
        });

        it("is a no-op when not registered", async () => {
            await using site = new MockSite();
            const { controller } = await site.addCommissionedPair({
                device: { type: RootWithIcd },
            });

            const peer1 = controller.peers.get("peer1")!;
            await peer1.act(agent => agent.get(IcdClient).unregister());
            expect(peer1.stateOf(IcdClient).registered).false;
        });
    });

    describe("stayActive", () => {
        it("requests a stay-active window and returns the promised duration", async () => {
            await using site = new MockSite();
            const { controller } = await site.addCommissionedPair({
                device: { type: RootWithIcd },
            });

            const peer1 = controller.peers.get("peer1")!;
            const promised = await peer1.act(agent => agent.get(IcdClient).stayActive(Seconds(60)));

            expect(promised).greaterThan(0);
        });
    });

    describe("feature getters", () => {
        it("reports peerSupportsLit false for a CIP-only peer", async () => {
            await using site = new MockSite();
            const { controller } = await site.addCommissionedPair({
                device: { type: RootWithIcd },
            });

            const peer1 = controller.peers.get("peer1")!;
            expect(peer1.stateOf(IcdClient)).not.undefined;
            const supportsLit = await peer1.act(agent => agent.get(IcdClient).peerSupportsLit);
            expect(supportsLit).false;
        });

        it("reports peerSupportsLit true for a LIT peer", async () => {
            await using site = new MockSite();
            const { controller } = await site.addCommissionedPair({
                device: { type: RootWithLitIcd, icdManagement: LIT_CONFIG },
            });

            const peer1 = controller.peers.get("peer1")!;
            const supportsLit = await peer1.act(agent => agent.get(IcdClient).peerSupportsLit);
            expect(supportsLit).true;
        });
    });

    describe("init restore", () => {
        it("re-arms the Check-In receive path after a controller restart", async () => {
            await using site = new MockSite();
            const { controller } = await site.addCommissionedPair({
                device: { type: RootWithIcd },
            });

            const peer1 = await subscribedPeer(controller, "peer1");
            await peer1.act(agent => agent.get(IcdClient).register());

            const controllerId = controller.id;
            await site.close();

            const controllerB = await site.addNode(undefined, { id: controllerId, index: 1 });
            const peer1b = controllerB.peers.get("peer1")!;
            expect(peer1b).not.undefined;
            expect(peer1b.stateOf(IcdClient).registered).true;

            const fabricIndex = peer1b.stateOf(CommissioningClient).peerAddress!.fabricIndex;
            const fabric = controllerB.env.get(FabricManager).for(fabricIndex);
            // initialize() re-fed the restored peer so a Check-In arriving after restart still validates.
            expect(fabric.icd.hasPeers).true;
        });

        it("restores the replay floor (lastOffset) after a controller restart", async () => {
            await using site = new MockSite();
            const { controller, device } = await site.addCommissionedPair({
                device: { type: RootWithIcd },
            });

            const peer1 = await subscribedPeer(controller, "peer1");
            await peer1.act(agent => agent.get(IcdClient).register({ monitoredSubject: SubjectId(NodeId(0xabcdn)) }));

            // Receive a Check-In so the persisted rolling offset is non-zero.
            const checkedIn = new Promise<void>(resolve => peer1.eventsOf(IcdClient).checkedIn.once(() => resolve()));
            await wakeDevice(device);
            await MockTime.resolve(checkedIn, { macrotasks: true });
            const persistedOffset = peer1.stateOf(IcdClient).lastOffset!;
            expect(persistedOffset).greaterThan(0);

            const controllerId = controller.id;
            await site.close();

            const controllerB = await site.addNode(undefined, { id: controllerId, index: 1 });
            const peer1b = controllerB.peers.get("peer1")!;
            expect(peer1b.stateOf(IcdClient).lastOffset).equals(persistedOffset);

            // The runtime peer entry is re-seeded with the persisted offset, so a counter at or below it stays rejected
            // as a replay across the restart.
            const fabricIndex = peer1b.stateOf(CommissioningClient).peerAddress!.fabricIndex;
            const fabric = controllerB.env.get(FabricManager).for(fabricIndex);
            const peerNodeId = peer1b.stateOf(CommissioningClient).peerAddress!.nodeId;
            expect(fabric.icd.peerFor(peerNodeId)!.lastOffset).equals(persistedOffset);
        });
    });

    describe("availability", () => {
        it("seeds available true on register and expires it after the idle window with no check-in", async () => {
            await using site = new MockSite();
            const { controller, peer1 } = await litOperatingPair(site);

            await reRegisterWithSubject(peer1, SubjectId(NodeId(0xabcdn)));
            expect(peer1.stateOf(IcdClient).available).true;

            const changed = new Promise<void>(resolve =>
                peer1.eventsOf(IcdClient).available$Changed.once(() => resolve()),
            );

            // idleModeDuration (3600s) + AVAILABILITY_MARGIN (5s) + slack.
            await MockTime.advance(Seconds(3700));
            await MockTime.resolve(changed, { macrotasks: true });

            expect(peer1.stateOf(IcdClient).available).false;
            expect(wakefulnessOf(controller, peer1)!.available.value).false;
        });

        it("restores available true on a check-in after expiry", async () => {
            await using site = new MockSite();
            const { controller, device, peer1 } = await litOperatingPair(site);

            await reRegisterWithSubject(peer1, SubjectId(NodeId(0xabcdn)));

            await MockTime.advance(Seconds(3700));
            await MockTime.resolve(Promise.resolve(), { macrotasks: true });
            expect(peer1.stateOf(IcdClient).available).false;

            await wakeDevice(device);
            await MockTime.resolve(Promise.resolve(), { macrotasks: true });

            expect(peer1.stateOf(IcdClient).available).true;
            expect(wakefulnessOf(controller, peer1)!.available.value).true;
        });

        it("keeps a SIT/non-LIT registered peer available at all times", async () => {
            await using site = new MockSite();
            const { controller } = await site.addCommissionedPair({
                device: { type: RootWithIcd },
            });

            const peer1 = await subscribedPeer(controller, "peer1");
            await peer1.act(agent => agent.get(IcdClient).register());

            expect(peer1.stateOf(IcdClient).available).true;
            expect(wakefulnessOf(controller, peer1)!.requiresAwait).false;

            await MockTime.advance(Seconds(3700));
            await MockTime.resolve(Promise.resolve(), { macrotasks: true });
            expect(peer1.stateOf(IcdClient).available).true;
        });

        it("extends the awake window when stayActive promises a longer duration", async () => {
            await using site = new MockSite();
            const { controller, peer1 } = await litOperatingPair(site);

            await reRegisterWithSubject(peer1, SubjectId(NodeId(0xabcdn)));

            const wakefulness = wakefulnessOf(controller, peer1)!;
            const promised = await peer1.act(agent => agent.get(IcdClient).stayActive(Seconds(120)));
            expect(promised).greaterThan(0);

            // activeModeThreshold is 5s, so absent the StayActive extension awake would already have lapsed by now.
            await MockTime.advance(Seconds(30));
            await MockTime.resolve(Promise.resolve(), { macrotasks: true });
            expect(wakefulness.awake.value).true;
        });

        it("flips requiresAwait when a registered DSLS peer switches SIT→LIT at runtime", async () => {
            await using site = new MockSite();
            const { controller, device } = await site.addCommissionedPair({
                device: { type: RootWithDslsIcd, icdManagement: LIT_CONFIG },
            });
            const peer1 = await subscribedPeer(controller, "peer1");

            await peer1.act(agent => agent.get(IcdClient).register({ monitoredSubject: SubjectId(NodeId(0xabcdn)) }));
            expect(wakefulnessOf(controller, peer1)!.requiresAwait).false;

            const modeChanged = new Promise<void>(resolve =>
                peer1.eventsOf(IcdManagementClient).operatingMode$Changed.once(() => resolve()),
            );
            await device.act(agent => agent.get(DslsIcdServer).setOperatingMode(IcdManagement.OperatingMode.Lit));
            await MockTime.resolve(modeChanged, { macrotasks: true });

            expect(wakefulnessOf(controller, peer1)!.requiresAwait).true;
        });

        it("arms the awake window on a report-driven SIT→LIT flip so the recreate lands in-window", async () => {
            await using site = new MockSite();
            const { controller, device } = await site.addCommissionedPair({
                device: { type: RootWithDslsIcd, icdManagement: LIT_CONFIG },
            });
            const peer1 = await subscribedPeer(controller, "peer1");

            await peer1.act(agent => agent.get(IcdClient).register({ monitoredSubject: SubjectId(NodeId(0xabcdn)) }));
            const wakefulness = wakefulnessOf(controller, peer1)!;
            expect(wakefulness.requiresAwait).false;

            const modeChanged = new Promise<void>(resolve =>
                peer1.eventsOf(IcdManagementClient).operatingMode$Changed.once(() => resolve()),
            );
            await device.act(agent => agent.get(DslsIcdServer).setOperatingMode(IcdManagement.OperatingMode.Lit));
            await MockTime.resolve(modeChanged, { macrotasks: true });

            // The flip arrived on a live report, so the peer is demonstrably awake now: the requiresAwait setter
            // force-slept the window, but the flip re-arms it so the recreate re-subscribes in-window rather than
            // parking a full idle cycle.
            expect(wakefulness.requiresAwait).true;
            expect(wakefulness.awake.value).true;
        });
    });

    describe("awake getter", () => {
        it("defaults true unregistered, mirrors the wakefulness once registered", async () => {
            await using site = new MockSite();
            const { device, peer1 } = await litOperatingPair(site);

            await peer1.act(agent => agent.get(IcdClient).unregister());
            // Not registered -> no fed wakefulness -> defaults awake (nothing to await).
            expect(await peer1.act(agent => agent.get(IcdClient).awake)).equals(true);

            await peer1.act(agent => agent.get(IcdClient).register({ monitoredSubject: SubjectId(NodeId(0xabcdn)) }));
            expect(await peer1.act(agent => agent.get(IcdClient).awake)).equals(true); // seeded on register

            await MockTime.advance(Seconds(3700)); // past idle+margin, no check-in
            await MockTime.resolve(Promise.resolve(), { macrotasks: true });
            expect(await peer1.act(agent => agent.get(IcdClient).awake)).equals(false);

            await wakeDevice(device); // device Check-In re-arms awake
            await MockTime.resolve(Promise.resolve(), { macrotasks: true });
            expect(await peer1.act(agent => agent.get(IcdClient).awake)).equals(true);
        });
    });

    describe("decommission cleanup", () => {
        it("unregisters locally when the node is decommissioned", async () => {
            await using site = new MockSite();
            const { controller } = await site.addCommissionedPair({
                device: { type: RootWithIcd },
            });

            const peer1 = await subscribedPeer(controller, "peer1");
            await peer1.act(agent => agent.get(IcdClient).register());

            const fabricIndex = peer1.stateOf(CommissioningClient).peerAddress!.fabricIndex;
            const fabric = controller.env.get(FabricManager).for(fabricIndex);
            expect(fabric.icd.hasPeers).true;

            const unregistered = new Promise<void>(resolve =>
                peer1.eventsOf(IcdClient).unregistered.once(() => resolve()),
            );

            await peer1.act(agent => agent.get(CommissioningClient).decommission());
            await MockTime.resolve(unregistered, { macrotasks: true });

            expect(peer1.stateOf(IcdClient).registered).false;
            expect(fabric.icd.hasPeers).false;
        });
    });

    describe("sustained subscription routing", () => {
        const sustainRequest: ClientSubscribe = { ...Subscribe({ attributes: [{}] }), sustain: true };

        it("parks a registered await-mode LIT peer's sustained subscription on its wake signal", async () => {
            await using site = new MockSite();
            const { controller, peer1 } = await litOperatingPair(site);

            // The LIT-operating peer auto-registered at commissioning.
            expect(peer1.stateOf(IcdClient).registered).true;
            const wakefulness = wakefulnessOf(controller, peer1);
            expect(wakefulness).not.undefined;
            expect(wakefulness!.requiresAwait).true;

            const subscription = await peer1.interaction.subscribe(sustainRequest);
            SustainedSubscription.assert(subscription);
            subscription.close();
            await MockTime.resolve(subscription.done!, { macrotasks: true });
        });

        it("routes a non-ICD peer to a plain (non-parking) SustainedSubscription", async () => {
            await using site = new MockSite();
            const { controller } = await site.addCommissionedPair();
            const peer1 = await subscribedPeer(controller, "peer1");

            const subscription = await MockTime.resolve(peer1.interaction.subscribe(sustainRequest), {
                macrotasks: true,
            });
            SustainedSubscription.assert(subscription);
            expect(wakefulnessOf(controller, peer1)).undefined;
            subscription.close();
            await MockTime.resolve(subscription.done!, { macrotasks: true });
        });

        it("recreates the running subscription on the first registration-induced SIT→LIT flip", async () => {
            await using site = new MockSite();
            const { controller, device } = await site.addCommissionedPair({
                device: { type: RootWithDslsIcd, icdManagement: LIT_CONFIG },
            });
            const peer1 = await subscribedPeer(controller, "peer1");
            await MockTime.resolve(Promise.resolve(), { macrotasks: true });

            // Established while SIT/unfed: no wakefulness exists, so the underlying subscription runs as plain sustained.
            expect(peer1.stateOf(IcdClient).registered).false;
            expect(wakefulnessOf(controller, peer1)).undefined;
            const subscription = peer1.behaviors.internalsOf(NetworkClient).activeSubscription;
            if (!(subscription instanceof SustainedSubscription)) {
                throw new ImplementationError("expected a sustained subscription");
            }
            const idBeforeFlip = subscription.subscriptionId;

            // Runtime SIT→LIT flip auto-registers (feeds the peer). The running subscription held no wakefulness to
            // observe the flip on, so it recreates via the feed signal for the new mode.
            const modeChanged = new Promise<void>(resolve =>
                peer1.eventsOf(IcdManagementClient).operatingMode$Changed.once(() => resolve()),
            );
            await device.act(agent => agent.get(DslsIcdServer).setOperatingMode(IcdManagement.OperatingMode.Lit));
            await MockTime.resolve(modeChanged, { macrotasks: true });
            await settleAutoRegistration(peer1);
            for (let i = 0; i < 5; i++) {
                await MockTime.advance(Millis(200));
                await MockTime.resolve(Promise.resolve(), { macrotasks: true });
            }

            expect(peer1.stateOf(IcdClient).registered).true;
            expect(wakefulnessOf(controller, peer1)?.requiresAwait).true;
            // Recreated: a new underlying subscription id, still active (the register seeded the awake window, so the
            // recreate landed in-window rather than parking).
            expect(subscription.subscriptionId).not.equal(idBeforeFlip);
            expect(subscription.active.value).true;
        });
    });

    describe("MRP idle interval", () => {
        it("floors the idle interval for a LIT peer only when no SII is advertised", async () => {
            await using site = new MockSite();
            const { peer1 } = await litOperatingPair(site);

            const protopeer = peer1.env.get(Peer);
            expect(protopeer.physicalProperties?.isLongIdleTimeOperating).true;

            // An advertised SII is honored as-is, not floored.
            const dd = protopeer.descriptor.discoveryData;
            expect(dd?.SII).not.undefined;
            expect(protopeer.sessionParameters.idleInterval).lessThan(LIT_MIN_IDLE_INTERVAL);

            // A real LIT ICD omits SII; the controller then floors to LIT_MIN_IDLE_INTERVAL instead of the 500ms default.
            if (dd) {
                delete dd.SII;
            }
            expect(protopeer.sessionParameters.idleInterval).equals(LIT_MIN_IDLE_INTERVAL);
        });

        it("does not floor the idle interval for a non-LIT peer", async () => {
            await using site = new MockSite();
            const { controller } = await site.addCommissionedPair({
                device: { type: RootWithIcd },
            });
            const peer1 = controller.peers.get("peer1")!;

            const protopeer = peer1.env.get(Peer);
            expect(protopeer.physicalProperties?.isLongIdleTimeOperating).not.equals(true);
            expect(protopeer.sessionParameters.idleInterval).equals(Millis(500));
        });
    });

    describe("address monitor", () => {
        it("adopts a new mDNS address for a sleeping LIT ICD without probing", async () => {
            await using site = new MockSite();
            const { controller, peer1 } = await litOperatingPair(site);
            expect(wakefulnessOf(controller, peer1)?.requiresAwait).true;

            const protopeer = peer1.env.get(Peer);
            const currentAddress = protopeer.descriptor.operationalAddress;
            expect(currentAddress).not.undefined;

            let probeCalled = false;
            MockTime.interceptOnce(protopeer.interaction!, "probe", async result => {
                probeCalled = true;
                result.resolve = false;
            });

            // Past the probe cooldown, so only the ICD path (not timing) governs behavior.
            await MockTime.advance(Minutes(3));

            // Old address gone, only a new one announced — a sleeping ICD cannot be probed to confirm it.
            const oldAddresses = [...protopeer.service.addresses];
            await simulateAddressChange(protopeer, oldAddresses, [{ ip: "abcd::99", port: currentAddress!.port }]);

            await MockTime.advance(Seconds(11));
            await MockTime.resolve(Time.sleep("probe window", Seconds(5)));

            // No probe (a failed probe would call handlePeerLoss and take the controller offline), the session
            // stays up, and the live session channel is moved to the newly announced address on trust.
            expect(probeCalled).false;
            expect(protopeer.hasSession).true;
            expect(controller.lifecycle.isOnline).true;
            expect(protopeer.newestSession()?.channel.networkAddress?.ip).equals("abcd::99");
            // The adopted address also propagates to the persisted operational address, so a controller restart
            // before the ICD next wakes reconnects via the new address rather than the stale one.
            expect(protopeer.descriptor.operationalAddress?.ip).equals("abcd::99");
        });

        it("leaves a sleeping LIT ICD untouched while mDNS still lists its address", async () => {
            await using site = new MockSite();
            const { controller, peer1 } = await litOperatingPair(site);
            expect(wakefulnessOf(controller, peer1)?.requiresAwait).true;

            const protopeer = peer1.env.get(Peer);
            const currentAddress = protopeer.descriptor.operationalAddress;
            expect(currentAddress).not.undefined;

            let probeCalled = false;
            MockTime.interceptOnce(protopeer.interaction!, "probe", async result => {
                probeCalled = true;
                result.resolve = false;
            });

            // A new address appears while the current one is still advertised — nothing to relocate. (Re-add the
            // current address alongside the new one so a long idle eviction can't make it look gone.)
            await simulateAddressChange(
                protopeer,
                [],
                [
                    { ip: currentAddress!.ip, port: currentAddress!.port },
                    { ip: "abcd::99", port: currentAddress!.port },
                ],
            );

            await MockTime.advance(Seconds(11));
            await MockTime.resolve(Time.sleep("probe window", Seconds(5)));

            expect(probeCalled).false;
            expect(protopeer.hasSession).true;
            expect(protopeer.newestSession()?.channel.networkAddress?.ip).equals(currentAddress!.ip);
        });
    });
});
