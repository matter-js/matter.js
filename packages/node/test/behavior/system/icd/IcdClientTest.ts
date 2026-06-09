/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { CommissioningClient } from "#behavior/system/commissioning/CommissioningClient.js";
import { IcdClient } from "#behavior/system/icd/IcdClient.js";
import { IcdMultiAdminError } from "#behavior/system/icd/IcdMultiAdminError.js";
import { IcdManagementClient, IcdManagementServer } from "#behaviors/icd-management";
import { ClientNode } from "#node/ClientNode.js";
import { ServerNode } from "#node/index.js";
import { Crypto, ImplementationError, MockCrypto, Seconds } from "@matter/general";
import {
    ClientSubscribe,
    FabricManager,
    IcdSustainedSubscription,
    Subscribe,
    SustainedSubscription,
    TestFabric,
} from "@matter/protocol";
import { FabricId, NodeId, SubjectId, VendorId } from "@matter/types";
import { IcdManagement } from "@matter/types/clusters/icd-management";
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

const LIT_CONFIG = {
    operatingMode: IcdManagement.OperatingMode.Sit,
    activeModeThreshold: 5000,
    idleModeDuration: 3600,
    activeModeDuration: 1000,
    maximumCheckInBackoff: 3600,
};

/** Force one device idle→active wake and let the Check-In send pass run to completion. */
async function wakeDevice(device: ServerNode) {
    await device.act(agent => agent.get(IcdManagementServer).enterIdleMode());
    await device.act(agent => agent.get(IcdManagementServer).requestActiveMode());
    await MockTime.resolve(Promise.resolve(), { macrotasks: true });
}

async function commission(controller: ServerNode, device: ServerNode) {
    const controllerCrypto = controller.env.get(Crypto) as MockCrypto;
    const deviceCrypto = device.env.get(Crypto) as MockCrypto;
    controllerCrypto.entropic = deviceCrypto.entropic = true;

    if (!controller.lifecycle.isOnline) {
        await controller.start();
    }

    const { passcode, discriminator } = device.state.commissioning;
    await MockTime.resolve(controller.peers.commission({ passcode, discriminator, timeout: Seconds(90) }), {
        macrotasks: true,
    });

    controllerCrypto.entropic = deviceCrypto.entropic = false;
}

/** Commission a DSLS device that is operating in LIT mode before the controller subscribes. */
async function litOperatingPair(site: MockSite) {
    const { controller, device } = await site.addUncommissionedPair({
        device: { type: RootWithDslsIcd, icdManagement: LIT_CONFIG },
    });
    await device.act(agent => agent.get(DslsIcdServer).setOperatingMode(IcdManagement.OperatingMode.Lit));
    await commission(controller, device);
    const peer1 = await subscribedPeer(controller, "peer1");
    return { controller, device, peer1 };
}

function wakefulnessOf(controller: ServerNode, peer: ClientNode) {
    const peerAddress = peer.stateOf(CommissioningClient).peerAddress!;
    const fabric = controller.env.get(FabricManager).for(peerAddress.fabricIndex);
    return fabric.icd.wakefulnessFor(peerAddress.nodeId);
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

            const peer1 = controller.peers.get("peer1")!;
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

            const peer1 = controller.peers.get("peer1")!;

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

            const peer1 = controller.peers.get("peer1")!;
            expect(peer1.maybeStateOf(IcdClient)).not.undefined;

            await peer1.act(agent => agent.get(IcdClient).register());
            expect(peer1.stateOf(IcdClient).registered).true;
            expect(device.stateOf(IcdManagementServer).registeredClients).length(1);
        });

        it("throws when already registered", async () => {
            await using site = new MockSite();
            const { controller } = await site.addCommissionedPair({
                device: { type: RootWithIcd },
            });

            const peer1 = controller.peers.get("peer1")!;
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

    describe("check-in receipt", () => {
        it("receives a real device Check-In, emits checkedIn, and advances counter state", async () => {
            await using site = new MockSite();
            const { controller, device } = await site.addCommissionedPair({
                device: { type: RootWithIcd },
            });

            const peer1 = controller.peers.get("peer1")!;
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
    });

    describe("key refresh", () => {
        it("refreshes the key when a Check-In counter crosses the refresh threshold", async () => {
            await using site = new MockSite();
            const { controller, device } = await site.addCommissionedPair({
                device: { type: RootWithIcd },
            });

            const peer1 = controller.peers.get("peer1")!;
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

            const peer1 = controller.peers.get("peer1")!;
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
            const requiresCheckIn = await peer1.act(agent => agent.get(IcdClient).peerRequiresCheckIn);
            expect(supportsLit).false;
            expect(requiresCheckIn).false;
        });

        it("reports peerSupportsLit true for a LIT peer", async () => {
            await using site = new MockSite();
            const { controller } = await site.addCommissionedPair({
                device: { type: RootWithLitIcd, icdManagement: LIT_CONFIG },
            });

            const peer1 = controller.peers.get("peer1")!;
            const supportsLit = await peer1.act(agent => agent.get(IcdClient).peerSupportsLit);
            const requiresCheckIn = await peer1.act(agent => agent.get(IcdClient).peerRequiresCheckIn);
            expect(supportsLit).true;
            expect(requiresCheckIn).true;
        });
    });

    describe("init restore", () => {
        it("re-arms the Check-In receive path after a controller restart", async () => {
            await using site = new MockSite();
            const { controller } = await site.addCommissionedPair({
                device: { type: RootWithIcd },
            });

            const peer1 = controller.peers.get("peer1")!;
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
    });

    describe("availability", () => {
        it("seeds available true on register and expires it after the idle window with no check-in", async () => {
            await using site = new MockSite();
            const { controller, peer1 } = await litOperatingPair(site);

            await peer1.act(agent => agent.get(IcdClient).register({ monitoredSubject: SubjectId(NodeId(0xabcdn)) }));
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

            await peer1.act(agent => agent.get(IcdClient).register({ monitoredSubject: SubjectId(NodeId(0xabcdn)) }));

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

            const peer1 = controller.peers.get("peer1")!;
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

            await peer1.act(agent => agent.get(IcdClient).register({ monitoredSubject: SubjectId(NodeId(0xabcdn)) }));

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
    });

    describe("awake getter", () => {
        it("defaults true unregistered, mirrors the wakefulness once registered", async () => {
            await using site = new MockSite();
            const { device, peer1 } = await litOperatingPair(site);

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

            const peer1 = controller.peers.get("peer1")!;
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

        it("routes a registered LIT peer to an IcdSustainedSubscription", async () => {
            await using site = new MockSite();
            const { controller, peer1 } = await litOperatingPair(site);

            await peer1.act(agent => agent.get(IcdClient).register());
            expect(wakefulnessOf(controller, peer1)).not.undefined;

            const subscription = await peer1.interaction.subscribe(sustainRequest);
            IcdSustainedSubscription.assert(subscription);
            subscription.close();
            await MockTime.resolve(subscription.done!, { macrotasks: true });
        });

        it("routes a non-ICD peer to a SustainedSubscription", async () => {
            await using site = new MockSite();
            const { controller } = await site.addCommissionedPair();
            const peer1 = await subscribedPeer(controller, "peer1");

            const subscription = await MockTime.resolve(peer1.interaction.subscribe(sustainRequest), {
                macrotasks: true,
            });
            SustainedSubscription.assert(subscription);
            expect(subscription instanceof IcdSustainedSubscription).false;
            subscription.close();
            await MockTime.resolve(subscription.done!, { macrotasks: true });
        });
    });
});
