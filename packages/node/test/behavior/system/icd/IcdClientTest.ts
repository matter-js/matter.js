/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { CommissioningClient } from "#behavior/system/commissioning/CommissioningClient.js";
import { IcdClient } from "#behavior/system/icd/IcdClient.js";
import { IcdMultiAdminError } from "#behavior/system/icd/IcdMultiAdminError.js";
import { IcdPeerAsleepError } from "#behavior/system/icd/IcdPeerAsleepError.js";
import { NetworkClient } from "#behavior/system/network/NetworkClient.js";
import { IcdManagementClient, IcdManagementServer } from "#behaviors/icd-management";
import { EndpointLifecycle } from "#endpoint/properties/EndpointLifecycle.js";
import { ClientNode } from "#node/ClientNode.js";
import { ServerNode } from "#node/index.js";
import {
    AbortedError,
    Bytes,
    createPromise,
    Crypto,
    Hours,
    ImplementationError,
    InternalError,
    LogLevel,
    MaybePromise,
    MemoryStorageDriver,
    Millis,
    Minutes,
    MockNetwork,
    MockRouter,
    Network,
    Seconds,
    ServerAddressIp,
    StorageError,
    SupportedStorageTypes,
    Time,
} from "@matter/general";
import { captureLog, MockSite, seedPeerCache, settled, subscribedPeer } from "@matter/node/testing";
import {
    ClientSubscribe,
    ClientSubscriptions,
    FabricManager,
    LIT_MIN_IDLE_INTERVAL,
    Peer,
    PeerAddress,
    Subscribe,
    SustainedSubscription,
    CheckInMessage,
    TestFabric,
} from "@matter/protocol";
import { FabricId, NodeId, StatusResponse, SubjectId, VendorId } from "@matter/types";
import { IcdManagement } from "@matter/types/clusters/icd-management";
import { commission, deviceLink, LIT_CONFIG, wakeDevice, wakefulnessOf } from "../../../node/icd-helpers.js";

const RootWithIcd = ServerNode.RootEndpoint.with(IcdManagementServer);

const LitIcdServer = IcdManagementServer.with(
    IcdManagement.Feature.CheckInProtocolSupport,
    IcdManagement.Feature.LongIdleTimeSupport,
    IcdManagement.Feature.UserActiveModeTrigger,
);
const RootWithLitIcd = ServerNode.RootEndpoint.with(LitIcdServer);

const DslsIcdServer = IcdManagementServer.with(
    IcdManagement.Feature.CheckInProtocolSupport,
    IcdManagement.Feature.LongIdleTimeSupport,
    IcdManagement.Feature.UserActiveModeTrigger,
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

/**
 * Holds the next write of the ICD client's registration once armed, as file storage does while a commit is stored.
 */
class GatedIcdStorage extends MemoryStorageDriver {
    static readonly gate = { armed: false, writing: createPromise<void>(), release: createPromise<void>() };

    /** Fail the next write that stores a pending key; with {@link holdFailure}, only once the gate is released. */
    static failPendingKeyWrite = false;
    static holdFailure = false;

    static arm() {
        this.gate.armed = true;
        this.gate.writing = createPromise<void>();
        this.gate.release = createPromise<void>();
    }

    /** Hold the next write that stores a pending key at the gate, then fail it. */
    static holdFailingPendingKeyWrite() {
        this.failPendingKeyWrite = true;
        this.holdFailure = true;
        this.gate.writing = createPromise<void>();
        this.gate.release = createPromise<void>();
    }

    override set(
        contexts: string[],
        keyOrValues: string | Record<string, SupportedStorageTypes>,
        value?: SupportedStorageTypes,
    ) {
        const { gate } = GatedIcdStorage;
        if (GatedIcdStorage.failPendingKeyWrite && typeof keyOrValues === "object" && "pendingKey" in keyOrValues) {
            GatedIcdStorage.failPendingKeyWrite = false;
            if (GatedIcdStorage.holdFailure) {
                GatedIcdStorage.holdFailure = false;
                gate.writing.resolver();
                return gate.release.promise.then(() => {
                    throw new StorageError("Simulated storage failure");
                });
            }
            throw new StorageError("Simulated storage failure");
        }
        if (
            gate.armed &&
            typeof keyOrValues === "object" &&
            ("lastOffset" in keyOrValues || "registered" in keyOrValues)
        ) {
            gate.armed = false;
            gate.writing.resolver();
            return gate.release.promise.then(() => super.set(contexts, keyOrValues, value));
        }
        return super.set(contexts, keyOrValues, value);
    }
}

/** Register for real Check-Ins under a subject the subscription does not cover. */
async function checkInPair(site: MockSite) {
    const { controller, device } = await site.addCommissionedPair({
        device: { type: RootWithIcd },
    });
    const peer1 = await subscribedPeer(controller, "peer1");
    await peer1.act(agent => agent.get(IcdClient).register({ monitoredSubject: SubjectId(NodeId(0xabcdn)) }));
    return { controller, device, peer1 };
}

function fedPeerOf(controller: ServerNode, peer: ClientNode) {
    const { fabricIndex, nodeId } = peer.stateOf(CommissioningClient).peerAddress!;
    const entry = controller.env.get(FabricManager).for(fabricIndex).icd.peerFor(nodeId);
    if (entry === undefined) {
        throw new InternalError("ICD peer not fed");
    }
    return entry;
}

/**
 * Pull the baseline back by 2³¹ so the next device Check-In requests a key refresh, the state a deployment reaches after
 * 2³¹ Check-Ins.
 */
async function requestRefreshOnNextCheckIn(controller: ServerNode, peer: ClientNode) {
    const entry = fedPeerOf(controller, peer);
    entry.counterStart = (entry.counterStart - 0x80000000) >>> 0;
    await peer.act(agent => {
        agent.get(IcdClient).state.counterStart = entry.counterStart;
    });
}

/**
 * Make the controller's next key differ from its current one.  Mock crypto repeats one byte per index, so without
 * this a refreshed key equals the old one and a client on the wrong key still decrypts.
 */
function mintDistinctKeys(controller: ServerNode) {
    const crypto = controller.env.get(Crypto);
    if (!("index" in crypto) || typeof crypto.index !== "number") {
        throw new InternalError("Controller crypto is not mock crypto");
    }
    crypto.index = crypto.index + 0x40;
}

/** The key the device holds for the controller. */
function deviceKeyOf(device: ServerNode) {
    const fabric = device.env.get(FabricManager).fabrics[0];
    return fabric.icd.registrations[0]?.key;
}

async function until(condition: () => boolean) {
    await MockTime.resolve(
        (async () => {
            while (!condition()) {
                await MockTime.macrotask;
            }
        })(),
        { macrotasks: true },
    );
}

/** Drop the device's traffic while a condition holds, evaluated as each packet is routed. */
function deviceTraffic(device: ServerNode) {
    const network = device.env.get(Network);
    if (!(network instanceof MockNetwork)) {
        throw new InternalError("Device traffic control requires a mock network");
    }
    const control = {
        dropFromDevice: (_packet: MockRouter.Packet) => false,
        dropToDevice: (_packet: MockRouter.Packet) => false,
    };
    network.simulator.router.intercept((packet, route) => {
        if (network.shouldReceive(packet.sourceAddress) && control.dropFromDevice(packet)) {
            return;
        }
        if (network.shouldReceive(packet.destAddress) && control.dropToDevice(packet)) {
            return;
        }
        route(packet);
    });
    return control;
}

/** Whether a packet carries a secured message; Check-Ins are unsecured (session ID 0). */
function isSecured({ payload }: MockRouter.Packet) {
    const bytes = Bytes.of(payload);
    return bytes[1] !== 0 || bytes[2] !== 0;
}

/** Tracks whether a promise has settled. */
function tracked(work: MaybePromise<unknown>) {
    const promise = Promise.resolve(work);
    const state = { settled: false, promise };
    promise.then(
        () => (state.settled = true),
        () => (state.settled = true),
    );
    return state;
}

/** Refuses RegisterClient with FAILURE while {@link refusing} is set, as a device does for a mismatched key. */
class RefusingIcdServer extends IcdManagementServer {
    static refusing = false;

    override registerClient(request: IcdManagement.RegisterClientRequest) {
        if (RefusingIcdServer.refusing) {
            throw new StatusResponse.FailureError("Refusing registration");
        }
        return super.registerClient(request);
    }
}

/** Make the device send a Check-In without waiting for the device to settle, which a dropped exchange prevents. */
async function triggerCheckIn(device: ServerNode) {
    await device.act(agent => agent.get(IcdManagementServer).enterIdleMode());
    await device.act(agent => agent.get(IcdManagementServer).requestActiveMode());
}

/** Hold the peer's ICD state in a transaction of its own until the returned release is called. */
async function holdIcdState(peer: ClientNode) {
    const locked = createPromise<void>();
    const release = createPromise<void>();
    const holder = peer.act("holder", async agent => {
        await agent.context.transaction.lock(agent.get(IcdClient));
        locked.resolver();
        await release.promise;
    });
    await MockTime.resolve(locked.promise, { macrotasks: true });
    return async () => {
        release.resolver();
        await MockTime.resolve(holder, { macrotasks: true });
    };
}

/** Counts the registration commands the device receives. */
class CountingIcdServer extends DslsIcdServer {
    static registrations = 0;
    static unregistrations = 0;

    override registerClient(request: IcdManagement.RegisterClientRequest) {
        CountingIcdServer.registrations++;
        return super.registerClient(request);
    }

    override unregisterClient(request: IcdManagement.UnregisterClientRequest) {
        CountingIcdServer.unregistrations++;
        return super.unregisterClient(request);
    }
}

/**
 * A LIT peer registered under a subject the subscription does not cover, idle (interactions with it park until it
 * wakes) and silenced, so no traffic wakes it until the test restores the link.
 */
async function sleepingLitPeer(site: MockSite) {
    const { controller, device } = await site.addUncommissionedPair({
        device: { type: ServerNode.RootEndpoint.with(CountingIcdServer), icdManagement: LIT_CONFIG },
    });
    await device.act(agent => agent.get(CountingIcdServer).setOperatingMode(IcdManagement.OperatingMode.Lit));
    await commission(controller, device);
    const peer1 = await subscribedPeer(controller, "peer1");
    await settleAutoRegistration(peer1);
    await reRegisterWithSubject(peer1, SubjectId(NodeId(0xabcdn)));
    const link = deviceLink(device);
    link.silence();
    // Past the awake window register() seeded
    await MockTime.advance(Seconds(6));
    await MockTime.macrotask;
    CountingIcdServer.registrations = CountingIcdServer.unregistrations = 0;
    return { controller, device, peer1, link };
}

/** A key refresh of a sleeping LIT peer, parked until the peer wakes. */
async function parkedRefresh(site: MockSite) {
    const pair = await sleepingLitPeer(site);
    const { controller, device, peer1, link } = pair;
    await requestRefreshOnNextCheckIn(controller, peer1);

    // The Check-In that requests the refresh wakes the peer; hold its reaction until the awake window lapsed
    const release = await holdIcdState(peer1);
    link.restore();
    await triggerCheckIn(device);
    await until(() => CheckInMessage.refreshNeededAt(fedPeerOf(controller, peer1).lastOffset));
    link.silence();
    await MockTime.advance(Seconds(6));
    await MockTime.macrotask;
    await release();

    await until(() => peer1.stateOf(IcdClient).pendingKey !== undefined);
    expect(wakefulnessOf(controller, peer1)!.awake.value).false;
    expect(CountingIcdServer.registrations).equals(0);
    return pair;
}

/** Let the peer wake and send a Check-In, and give a parked interaction time to go out. */
async function wakeSleepingPeer(device: ServerNode, link: { restore(): void }) {
    link.restore();
    await triggerCheckIn(device);
    for (let i = 0; i < 20; i++) {
        await MockTime.macrotask;
    }
    await MockTime.advance(Seconds(1));
}

function nextCheckIn(peer: ClientNode) {
    return new Promise<{ counter: number; activeModeThreshold: number }>(resolve =>
        peer.eventsOf(IcdClient).checkedIn.once(resolve),
    );
}

/** Past the deadline of the next report (subscription liveness timeout of about an hour) of a peer that sends nothing. */
const SILENT_PAST_WINDOW = Minutes(70);

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
            expect(state.counterStart).equals(device.stateOf(IcdManagementServer).icdCounter);
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
            await settled(controller, peer1);

            expect(peer1.stateOf(IcdClient).registered).false;
        });

        it("does NOT auto-register a DSLS peer operating in SIT", async () => {
            await using site = new MockSite();
            const { controller } = await site.addCommissionedPair({
                device: { type: RootWithDslsIcd, icdManagement: LIT_CONFIG },
            });
            const peer1 = await subscribedPeer(controller, "peer1");
            await settled(controller, peer1);

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
            await seedPeerCache(
                peer1,
                peer1,
                IcdManagementClient,
                new Map([[IcdManagement.attributes.operatingMode.id, IcdManagement.OperatingMode.Lit]]),
            );
            // Let any auto-registration transaction (deferred, with peer I/O) run to completion. On stale-cache
            // behavior the wrong registration lands well within this window (empirically by the 6th step).
            for (let i = 0; i < 15; i++) {
                await MockTime.advance(Millis(200));
                await settled(controller, peer1);
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
            await settled(controller, peer1);
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
            await settled(controller, peer1);
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
            const originalKey = peer1.stateOf(IcdClient).key!;
            mintDistinctKeys(controller);

            const fabricIndex = peer1.stateOf(CommissioningClient).peerAddress!.fabricIndex;
            const fabric = controller.env.get(FabricManager).for(fabricIndex);
            const peerNodeId = peer1.stateOf(CommissioningClient).peerAddress!.nodeId;
            await requestRefreshOnNextCheckIn(controller, peer1);

            // The wakefulness must survive a re-key in place: a parked subscription holds this instance.
            const wakefulnessBefore = fabric.icd.wakefulnessFor(peerNodeId);

            const refreshed = new Promise<void>(resolve =>
                peer1.eventsOf(IcdClient).keyRefreshed.once(() => resolve()),
            );

            await wakeDevice(device);
            await MockTime.resolve(refreshed, { macrotasks: true });

            const state = peer1.stateOf(IcdClient);
            expect(Bytes.areEqual(state.key!, originalKey)).false;
            expect(state.lastOffset).equals(0);
            expect(state.counterStart).not.equals(originalCounterStart);

            // The device accepted the re-key in place: still exactly one registration for this controller.
            expect(device.stateOf(IcdManagementServer).registeredClients).length(1);

            // A parked subscription keeps the wakefulness it observes across a re-key.
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

        it("reports the refreshed starting counter once it is committed", async () => {
            await using site = new MockSite();
            const { controller, device } = await site.addCommissionedPair({
                device: { type: RootWithIcd },
            });

            const peer1 = await subscribedPeer(controller, "peer1");
            await peer1.act(agent => agent.get(IcdClient).register({ monitoredSubject: SubjectId(NodeId(0xabcdn)) }));
            const originalCounterStart = peer1.stateOf(IcdClient).counterStart!;
            mintDistinctKeys(controller);

            await requestRefreshOnNextCheckIn(controller, peer1);
            const pulledBack = peer1.stateOf(IcdClient).counterStart;

            const events = new Array<string>();
            peer1.eventsOf(IcdClient).keyRefreshed.on(() => {
                events.push("keyRefreshed");
            });
            const changed = new Promise<{ value?: number; previous?: number; committed?: number }>(resolve =>
                peer1.eventsOf(IcdClient).counterStart$Changed.on((value, previous) => {
                    events.push("counterStart");
                    resolve({ value, previous, committed: peer1.stateOf(IcdClient).counterStart });
                }),
            );

            await wakeDevice(device);
            const { value, previous, committed } = await MockTime.resolve(changed, { macrotasks: true });
            await settled(controller, peer1);

            expect(previous).equals(pulledBack);
            expect(value).not.equals(pulledBack);
            expect(value).not.equals(originalCounterStart);
            expect(committed).equals(value);
            expect(events).deep.equals(["keyRefreshed", "counterStart"]);
        });

        it("offers no key and keeps the receive path on the committed state when storing the offered key fails", async () => {
            await using site = new MockSite({ createStorageDriver: store => new GatedIcdStorage(store) });
            const { controller, device, peer1 } = await checkInPair(site);
            mintDistinctKeys(controller);
            await requestRefreshOnNextCheckIn(controller, peer1);
            const storedKey = peer1.stateOf(IcdClient).key!;

            using log = captureLog(LogLevel.WARN);
            GatedIcdStorage.failPendingKeyWrite = true;
            await triggerCheckIn(device);
            await until(() => log.messages.some(message => message.includes("will retry on next check-in")));

            // The store fails in commit phase two, so the offered key stays committed in memory
            const { pendingKey } = peer1.stateOf(IcdClient);
            expect(pendingKey).not.undefined;
            expect(Bytes.areEqual(fedPeerOf(controller, peer1).pendingKey!, pendingKey!)).true;
            expect(Bytes.areEqual(fedPeerOf(controller, peer1).key, storedKey)).true;
            expect(Bytes.areEqual(deviceKeyOf(device)!, storedKey)).true;
        });

        it("rejects a replay of a Check-In accepted while storing the offered key failed", async () => {
            await using site = new MockSite({ createStorageDriver: store => new GatedIcdStorage(store) });
            const { controller, device, peer1 } = await checkInPair(site);
            mintDistinctKeys(controller);
            await requestRefreshOnNextCheckIn(controller, peer1);
            const oldKey = peer1.stateOf(IcdClient).key!;
            const { fabricIndex } = peer1.stateOf(CommissioningClient).peerAddress!;
            const fabricIcd = controller.env.get(FabricManager).for(fabricIndex).icd;
            let checkIns = 0;
            peer1.eventsOf(IcdClient).checkedIn.on(() => {
                checkIns++;
            });

            using log = captureLog(LogLevel.WARN);
            GatedIcdStorage.holdFailingPendingKeyWrite();
            await triggerCheckIn(device);
            await MockTime.resolve(GatedIcdStorage.gate.writing.promise, { macrotasks: true });

            // Accepted while the refresh holds the state with its failing commit
            const entry = fedPeerOf(controller, peer1);
            const counter = (entry.counterStart + entry.lastOffset + 1) >>> 0;
            const checkIn = await CheckInMessage.encodeIcd(controller.env.get(Crypto), oldKey, counter, 5000);
            await fabricIcd.processCheckIn(checkIn);
            expect(checkIns).equals(1);

            GatedIcdStorage.gate.release.resolver();
            await until(() => log.messages.some(message => message.includes("will retry on next check-in")));
            await fabricIcd.processCheckIn(checkIn);
            for (let i = 0; i < 10; i++) {
                await MockTime.macrotask;
            }

            expect(checkIns).equals(2);
        });

        it("refreshes the key while the Check-In that requested it still commits", async () => {
            await using site = new MockSite({ createStorageDriver: store => new GatedIcdStorage(store) });
            const { controller, device, peer1 } = await checkInPair(site);
            mintDistinctKeys(controller);
            await requestRefreshOnNextCheckIn(controller, peer1);
            const oldKey = deviceKeyOf(device)!;

            using log = captureLog(LogLevel.WARN);
            GatedIcdStorage.arm();
            await wakeDevice(device);
            await MockTime.resolve(GatedIcdStorage.gate.writing.promise, { macrotasks: true });
            for (let i = 0; i < 10; i++) {
                await MockTime.macrotask;
            }
            // The refresh waits for the Check-In reaction's commit before it offers a key
            expect(Bytes.areEqual(deviceKeyOf(device)!, oldKey)).true;
            expect(peer1.stateOf(IcdClient).pendingKey).undefined;
            GatedIcdStorage.gate.release.resolver();

            await until(() => !Bytes.areEqual(deviceKeyOf(device)!, oldKey));
            await until(() => Bytes.areEqual(peer1.stateOf(IcdClient).key!, deviceKeyOf(device)!));
            expect(peer1.stateOf(IcdClient).pendingKey).undefined;
            expect(log.messages.filter(message => message.includes("key refresh"))).deep.equals([]);

            const checkedIn = nextCheckIn(peer1);
            await wakeDevice(device);
            await MockTime.resolve(checkedIn, { macrotasks: true });
        });

        it("stores the confirmed key when another transaction holds the ICD state at the response", async () => {
            await using site = new MockSite();
            const { controller, device, peer1 } = await checkInPair(site);
            mintDistinctKeys(controller);
            await requestRefreshOnNextCheckIn(controller, peer1);
            const oldKey = deviceKeyOf(device)!;

            using log = captureLog(LogLevel.WARN);
            await triggerCheckIn(device);
            await until(() => !Bytes.areEqual(deviceKeyOf(device)!, oldKey));

            const release = await holdIcdState(peer1);
            for (let i = 0; i < 10; i++) {
                await MockTime.macrotask;
            }
            expect(Bytes.areEqual(peer1.stateOf(IcdClient).key!, oldKey)).true;
            expect(peer1.stateOf(IcdClient).pendingKey).not.undefined;
            await release();

            await until(() => Bytes.areEqual(peer1.stateOf(IcdClient).key!, deviceKeyOf(device)!));
            expect(peer1.stateOf(IcdClient).pendingKey).undefined;
            expect(log.messages.filter(message => message.includes("key refresh"))).deep.equals([]);
        });
    });

    describe("key refresh outcome", () => {
        it("takes the new key from the first Check-In when the response was lost", async () => {
            await using site = new MockSite();
            const { controller, device, peer1 } = await checkInPair(site);
            mintDistinctKeys(controller);
            await requestRefreshOnNextCheckIn(controller, peer1);
            const oldKey = deviceKeyOf(device)!;
            const traffic = deviceTraffic(device);
            traffic.dropFromDevice = () => !Bytes.areEqual(deviceKeyOf(device)!, oldKey);

            using log = captureLog(LogLevel.WARN);
            const checkIn = nextCheckIn(peer1);
            await triggerCheckIn(device);
            const lastOldCounter = (await MockTime.resolve(checkIn, { macrotasks: true })).counter;
            await until(() => log.messages.some(message => message.includes("ICD key refresh")));

            const { key, pendingKey } = peer1.stateOf(IcdClient);
            expect(Bytes.areEqual(key!, oldKey)).true;
            expect(Bytes.areEqual(pendingKey!, deviceKeyOf(device)!)).true;

            traffic.dropFromDevice = () => false;
            const refreshed = new Promise<void>(resolve =>
                peer1.eventsOf(IcdClient).keyRefreshed.once(() => resolve()),
            );
            const checkedIn = nextCheckIn(peer1);
            await triggerCheckIn(device);
            const { counter } = await MockTime.resolve(checkedIn, { macrotasks: true });
            await MockTime.resolve(refreshed, { macrotasks: true });
            await until(() => peer1.stateOf(IcdClient).pendingKey === undefined);

            const state = peer1.stateOf(IcdClient);
            expect(Bytes.areEqual(state.key!, deviceKeyOf(device)!)).true;
            expect(state.pendingKey).undefined;
            expect(state.counterStart).equals(lastOldCounter);
            expect(state.lastOffset).equals(counter - lastOldCounter);
        });

        it("offers the same pending key again after the request was lost", async () => {
            await using site = new MockSite();
            const { controller, device, peer1 } = await checkInPair(site);
            mintDistinctKeys(controller);
            await requestRefreshOnNextCheckIn(controller, peer1);
            const oldKey = deviceKeyOf(device)!;
            const traffic = deviceTraffic(device);
            traffic.dropToDevice = () => peer1.stateOf(IcdClient).pendingKey !== undefined;

            using log = captureLog(LogLevel.WARN);
            await triggerCheckIn(device);
            await until(() => log.messages.some(message => message.includes("ICD key refresh")));
            const pendingKey = peer1.stateOf(IcdClient).pendingKey!;
            expect(Bytes.areEqual(deviceKeyOf(device)!, oldKey)).true;

            // A further refresh would mint another key from here
            mintDistinctKeys(controller);
            traffic.dropToDevice = () => false;
            const refreshed = new Promise<void>(resolve =>
                peer1.eventsOf(IcdClient).keyRefreshed.once(() => resolve()),
            );
            await triggerCheckIn(device);
            await MockTime.resolve(refreshed, { macrotasks: true });
            await until(() => peer1.stateOf(IcdClient).pendingKey === undefined);

            expect(Bytes.areEqual(deviceKeyOf(device)!, pendingKey)).true;
            expect(Bytes.areEqual(peer1.stateOf(IcdClient).key!, pendingKey)).true;
            expect(peer1.stateOf(IcdClient).pendingKey).undefined;
        });

        it("keeps the pending key when the device refuses the refresh, and offers it again", async () => {
            await using site = new MockSite();
            const { controller, device } = await site.addCommissionedPair({
                device: { type: ServerNode.RootEndpoint.with(RefusingIcdServer) },
            });
            const peer1 = await subscribedPeer(controller, "peer1");
            await peer1.act(agent => agent.get(IcdClient).register({ monitoredSubject: SubjectId(NodeId(0xabcdn)) }));
            mintDistinctKeys(controller);
            await requestRefreshOnNextCheckIn(controller, peer1);
            const oldKey = deviceKeyOf(device)!;

            using log = captureLog(LogLevel.WARN);
            RefusingIcdServer.refusing = true;
            try {
                await triggerCheckIn(device);
                await until(() => log.messages.some(message => message.includes("ICD key refresh")));
            } finally {
                RefusingIcdServer.refusing = false;
            }

            const { key, pendingKey } = peer1.stateOf(IcdClient);
            expect(Bytes.areEqual(deviceKeyOf(device)!, oldKey)).true;
            expect(Bytes.areEqual(key!, oldKey)).true;
            expect(pendingKey).not.undefined;
            expect(Bytes.areEqual(fedPeerOf(controller, peer1).pendingKey!, pendingKey!)).true;

            mintDistinctKeys(controller);
            const refreshed = new Promise<void>(resolve =>
                peer1.eventsOf(IcdClient).keyRefreshed.once(() => resolve()),
            );
            await triggerCheckIn(device);
            await MockTime.resolve(refreshed, { macrotasks: true });
            await until(() => peer1.stateOf(IcdClient).pendingKey === undefined);

            expect(Bytes.areEqual(deviceKeyOf(device)!, pendingKey!)).true;
            expect(Bytes.areEqual(peer1.stateOf(IcdClient).key!, pendingKey!)).true;
        });

        it("decrypts Check-Ins under the pending key after a controller restart", async () => {
            await using site = new MockSite();
            const { controller, device, peer1 } = await checkInPair(site);
            mintDistinctKeys(controller);
            await requestRefreshOnNextCheckIn(controller, peer1);
            const oldKey = deviceKeyOf(device)!;
            const traffic = deviceTraffic(device);
            traffic.dropFromDevice = () => !Bytes.areEqual(deviceKeyOf(device)!, oldKey);

            using log = captureLog(LogLevel.WARN);
            await triggerCheckIn(device);
            await until(() => log.messages.some(message => message.includes("ICD key refresh")));
            expect(peer1.stateOf(IcdClient).pendingKey).not.undefined;

            const controllerId = controller.id;
            await controller.close();
            traffic.dropFromDevice = () => false;
            const controllerB = await site.addNode(undefined, { id: controllerId, index: 1 });
            const peer1b = controllerB.peers.get("peer1")!;
            expect(Bytes.areEqual(fedPeerOf(controllerB, peer1b).pendingKey!, deviceKeyOf(device)!)).true;
            await subscribedPeer(controllerB, "peer1");

            const checkedIn = nextCheckIn(peer1b);
            // The device's Check-In back-off skips one wake after its unanswered Check-Ins
            await triggerCheckIn(device);
            await triggerCheckIn(device);
            await MockTime.resolve(checkedIn, { macrotasks: true });
            await until(() => peer1b.stateOf(IcdClient).pendingKey === undefined);

            expect(Bytes.areEqual(peer1b.stateOf(IcdClient).key!, deviceKeyOf(device)!)).true;
            expect(peer1b.stateOf(IcdClient).pendingKey).undefined;
        });
    });

    describe("ICD state held by another transaction", () => {
        it("registers once the state is free", async () => {
            await using site = new MockSite();
            const { controller, device } = await site.addCommissionedPair({
                device: { type: RootWithIcd },
            });
            const peer1 = await subscribedPeer(controller, "peer1");

            const release = await holdIcdState(peer1);
            const registering = tracked(peer1.act(agent => agent.get(IcdClient).register()));
            await until(() => device.stateOf(IcdManagementServer).registeredClients.length === 1);
            for (let i = 0; i < 10; i++) {
                await MockTime.macrotask;
            }
            expect(registering.settled).false;
            expect(peer1.stateOf(IcdClient).registered).false;
            await release();
            await MockTime.resolve(registering.promise, { macrotasks: true });

            expect(peer1.stateOf(IcdClient).registered).true;
            expect(Bytes.areEqual(peer1.stateOf(IcdClient).key!, deviceKeyOf(device)!)).true;
        });

        it("waits for the state in forget()", async () => {
            await using site = new MockSite();
            const { controller, device } = await site.addCommissionedPair({
                device: { type: RootWithIcd },
            });
            const peer1 = await subscribedPeer(controller, "peer1");
            await peer1.act(agent => agent.get(IcdClient).register());

            const release = await holdIcdState(peer1);
            const ending = tracked(peer1.act(agent => agent.get(IcdClient).forget()));
            for (let i = 0; i < 10; i++) {
                await MockTime.macrotask;
            }
            expect(ending.settled).false;
            expect(peer1.stateOf(IcdClient).registered).true;
            expect(device.stateOf(IcdManagementServer).registeredClients).length(1);
            await release();
            await MockTime.resolve(ending.promise, { macrotasks: true });

            expect(peer1.stateOf(IcdClient).registered).false;
            expect(peer1.stateOf(IcdClient).key).undefined;
            expect(device.stateOf(IcdManagementServer).registeredClients).length(1);
        });

        it("clears the registration once when a decommission waits behind unregister() for the state", async () => {
            await using site = new MockSite();
            const { controller, device } = await site.addCommissionedPair({
                device: { type: RootWithIcd },
            });
            const peer1 = await subscribedPeer(controller, "peer1");
            await peer1.act(agent => agent.get(IcdClient).register());
            const { fabricIndex, nodeId } = peer1.stateOf(CommissioningClient).peerAddress!;
            const fabricIcd = controller.env.get(FabricManager).for(fabricIndex).icd;
            let unregistered = 0;
            peer1.eventsOf(IcdClient).unregistered.on(() => {
                unregistered++;
            });

            const release = await holdIcdState(peer1);
            const ending = tracked(peer1.act(agent => agent.get(IcdClient).unregister()));
            await MockTime.macrotask;
            expect(ending.settled).false;
            expect(peer1.stateOf(IcdClient).key).not.undefined;
            const decommissioning = tracked(peer1.act(agent => agent.get(CommissioningClient).decommission()));
            await MockTime.macrotask;
            await release();
            await MockTime.resolve(Promise.allSettled([ending.promise, decommissioning.promise]), {
                macrotasks: true,
            });
            await until(() => !peer1.stateOf(IcdClient).registered);
            await settled(controller, device);

            expect(unregistered).equals(1);
            expect(peer1.stateOf(IcdClient).key).undefined;
            expect(fabricIcd.peerFor(nodeId)).undefined;
        });

        it("measures from the response's starting counter when a Check-In confirmed the key first", async () => {
            await using site = new MockSite();
            const { controller, device, peer1 } = await checkInPair(site);
            mintDistinctKeys(controller);
            await requestRefreshOnNextCheckIn(controller, peer1);
            const oldKey = deviceKeyOf(device)!;
            const events = new Array<string>();
            peer1.eventsOf(IcdClient).keyRefreshed.on(() => {
                events.push("keyRefreshed");
            });
            peer1.eventsOf(IcdClient).counterStart$Changed.on(value => {
                events.push(`counterStart ${value}`);
            });

            const oldCheckIn = nextCheckIn(peer1);
            await triggerCheckIn(device);
            const lastOldCounter = (await MockTime.resolve(oldCheckIn, { macrotasks: true })).counter;
            await until(() => !Bytes.areEqual(deviceKeyOf(device)!, oldKey));
            const release = await holdIcdState(peer1);
            // As if earlier Check-Ins under the old key were lost: the baseline a Check-In confirms from lies lower
            fedPeerOf(controller, peer1).lastOffset -= 5;

            const newCheckIn = nextCheckIn(peer1);
            await triggerCheckIn(device);
            await until(() => fedPeerOf(controller, peer1).pendingKey === undefined);
            expect(fedPeerOf(controller, peer1).counterStart).equals(lastOldCounter - 5);
            await release();
            const { counter } = await MockTime.resolve(newCheckIn, { macrotasks: true });
            await until(() => peer1.stateOf(IcdClient).pendingKey === undefined);
            await settled(controller, peer1);

            const state = peer1.stateOf(IcdClient);
            expect(Bytes.areEqual(state.key!, deviceKeyOf(device)!)).true;
            expect(state.counterStart).equals(lastOldCounter);
            expect(state.lastOffset).equals(counter - lastOldCounter);
            expect(events).deep.equals(["keyRefreshed", `counterStart ${lastOldCounter}`]);
        });

        it("rejects a replay after a restart between a Check-In that confirmed the key and the lost response", async () => {
            await using site = new MockSite();
            const { controller, device } = await site.addCommissionedPair({
                device: { type: ServerNode.RootEndpoint.with(CountingIcdServer), icdManagement: LIT_CONFIG },
            });
            const peer1 = await subscribedPeer(controller, "peer1");
            await peer1.act(agent => agent.get(IcdClient).register({ monitoredSubject: SubjectId(NodeId(0xabcdn)) }));
            mintDistinctKeys(controller);
            await requestRefreshOnNextCheckIn(controller, peer1);
            const oldKey = deviceKeyOf(device)!;
            CountingIcdServer.registrations = 0;
            // Every secured reply after the device handled the RegisterClient is lost, so the response never arrives
            const traffic = deviceTraffic(device);
            traffic.dropFromDevice = packet => isSecured(packet) && CountingIcdServer.registrations > 0;
            const events = new Array<string>();
            peer1.eventsOf(IcdClient).keyRefreshed.on(() => {
                events.push("keyRefreshed");
            });
            peer1.eventsOf(IcdClient).counterStart$Changed.on(value => {
                events.push(`counterStart ${value}`);
            });

            using log = captureLog(LogLevel.WARN);
            const oldCheckIn = nextCheckIn(peer1);
            await triggerCheckIn(device);
            const lastOldCounter = (await MockTime.resolve(oldCheckIn, { macrotasks: true })).counter;
            await until(() => !Bytes.areEqual(deviceKeyOf(device)!, oldKey));
            const newKey = deviceKeyOf(device)!;

            const newCheckIn = nextCheckIn(peer1);
            await triggerCheckIn(device);
            const { counter, activeModeThreshold } = await MockTime.resolve(newCheckIn, { macrotasks: true });
            for (let i = 0; i < 10; i++) {
                await MockTime.macrotask;
            }
            const stored = { ...peer1.stateOf(IcdClient) };
            const eventsBeforeRestart = [...events];
            expect(log.messages.filter(message => message.includes("key refresh"))).deep.equals([]);

            // A crash while the refresh still waits for its response: storage keeps what was written up to now
            const storage = site.storageFor(controller);
            const atCrash = structuredClone(storage);
            await MockTime.resolve(controller.close());
            for (const key of Object.keys(storage)) {
                delete storage[key];
            }
            Object.assign(storage, atCrash);
            const controllerB = await site.addNode(undefined, { id: controller.id, index: 1 });
            const peer1b = controllerB.peers.get("peer1")!;
            let checkIns = 0;
            peer1b.eventsOf(IcdClient).checkedIn.on(() => {
                checkIns++;
            });
            const fabricIcd = controllerB.env
                .get(FabricManager)
                .for(peer1b.stateOf(CommissioningClient).peerAddress!.fabricIndex).icd;
            const replay = await CheckInMessage.encodeIcd(
                controllerB.env.get(Crypto),
                newKey,
                counter,
                activeModeThreshold,
            );
            await fabricIcd.processCheckIn(replay);
            for (let i = 0; i < 10; i++) {
                await MockTime.macrotask;
            }

            expect(checkIns).equals(0);
            // The Check-In stored the key it confirmed at once
            expect(Bytes.areEqual(stored.key!, newKey)).true;
            expect(stored).deep.include({ counterStart: lastOldCounter, pendingKey: undefined });
            expect(eventsBeforeRestart).deep.equals(["keyRefreshed", `counterStart ${lastOldCounter}`]);
        });

        it("rejects a replay after a restart when shutdown abandoned a teardown that accepted the Check-In", async () => {
            await using site = new MockSite();
            const { controller, peer1 } = await sleepingLitPeer(site);
            const { fabricIndex } = peer1.stateOf(CommissioningClient).peerAddress!;
            const fabricIcd = controller.env.get(FabricManager).for(fabricIndex).icd;
            const { key } = peer1.stateOf(IcdClient);
            const entry = fedPeerOf(controller, peer1);
            const counter = (entry.counterStart + entry.lastOffset + 1) >>> 0;
            const checkIn = await CheckInMessage.encodeIcd(controller.env.get(Crypto), key!, counter, 5000);

            // unregister() waits for the sleeping peer; its Check-In is accepted while the state is held
            const release = await holdIcdState(peer1);
            const ending = tracked(peer1.act(agent => agent.get(IcdClient).unregister()));
            await MockTime.macrotask;
            await fabricIcd.processCheckIn(checkIn);
            // Shutdown abandons the teardown before its clear
            peer1.lifecycle.change(EndpointLifecycle.Change.Destroying);
            await release();
            await MockTime.resolve(
                ending.promise.then(undefined, () => {}),
                { macrotasks: true },
            );
            expect(peer1.stateOf(IcdClient).registered).true;

            await MockTime.resolve(controller.close());
            const controllerB = await site.addNode(undefined, { id: controller.id, index: 1 });
            const peer1b = controllerB.peers.get("peer1")!;
            let checkIns = 0;
            peer1b.eventsOf(IcdClient).checkedIn.on(() => {
                checkIns++;
            });
            await controllerB.env.get(FabricManager).for(fabricIndex).icd.processCheckIn(checkIn);
            for (let i = 0; i < 10; i++) {
                await MockTime.macrotask;
            }

            expect(checkIns).equals(0);
        });

        it("starts no refresh after a checkedIn listener began forget()", async () => {
            await using site = new MockSite();
            const { controller, device, peer1 } = await checkInPair(site);
            await requestRefreshOnNextCheckIn(controller, peer1);

            using log = captureLog(LogLevel.WARN);
            let forgetting: ReturnType<typeof tracked> | undefined;
            peer1.eventsOf(IcdClient).checkedIn.once(() => {
                forgetting = tracked(peer1.act(agent => agent.get(IcdClient).forget()));
            });
            await triggerCheckIn(device);
            await until(() => forgetting !== undefined);
            await MockTime.resolve(forgetting!.promise, { macrotasks: true });
            await settled(controller);

            expect(peer1.stateOf(IcdClient).registered).false;
            expect(
                log.messages.filter(message => message.includes("IcdClient") || message.includes(".icd.")),
            ).deep.equals([]);
        });

        it("keeps the registration when a registered listener throws, and unregisters it later", async () => {
            await using site = new MockSite();
            const { controller, device } = await site.addCommissionedPair({ device: { type: RootWithIcd } });
            const peer1 = await subscribedPeer(controller, "peer1");
            let storedInListener: boolean | undefined;
            let nextListenerCalled = false;
            peer1.eventsOf(IcdClient).registered.once(() => {
                storedInListener = peer1.stateOf(IcdClient).key !== undefined;
                throw new InternalError("listener failure");
            });
            peer1.eventsOf(IcdClient).registered.once(() => {
                nextListenerCalled = true;
            });

            using log = captureLog(LogLevel.WARN);
            await peer1.act(agent => agent.get(IcdClient).register());

            expect(storedInListener).true;
            expect(nextListenerCalled).true;
            expect(peer1.stateOf(IcdClient).registered).true;
            expect(log.messages.some(message => message.includes("ICD client registered listener"))).true;
            await peer1.act(agent => agent.get(IcdClient).unregister());
            expect(peer1.stateOf(IcdClient).registered).false;
            expect(device.stateOf(IcdManagementServer).registeredClients).length(0);
        });

        it("keeps the clear when an unregistered listener throws, and registers again later", async () => {
            await using site = new MockSite();
            const { controller } = await site.addCommissionedPair({ device: { type: RootWithIcd } });
            const peer1 = await subscribedPeer(controller, "peer1");
            await peer1.act(agent => agent.get(IcdClient).register());
            let clearedInListener: boolean | undefined;
            let nextListenerCalled = false;
            peer1.eventsOf(IcdClient).unregistered.once(() => {
                clearedInListener = peer1.stateOf(IcdClient).key === undefined;
                throw new InternalError("listener failure");
            });
            peer1.eventsOf(IcdClient).unregistered.once(() => {
                nextListenerCalled = true;
            });

            using log = captureLog(LogLevel.WARN);
            await peer1.act(agent => agent.get(IcdClient).unregister());

            expect(clearedInListener).true;
            expect(nextListenerCalled).true;
            expect(peer1.stateOf(IcdClient).registered).false;
            expect(log.messages.some(message => message.includes("ICD client unregistered listener"))).true;
            await peer1.act(agent => agent.get(IcdClient).register());
            expect(peer1.stateOf(IcdClient).registered).true;
        });

        it("ends a retry when a Check-In under the pending key confirms it while the retry waits for the state", async () => {
            await using site = new MockSite({ createStorageDriver: store => new GatedIcdStorage(store) });
            const { controller, device, peer1 } = await checkInPair(site);
            mintDistinctKeys(controller);
            await requestRefreshOnNextCheckIn(controller, peer1);
            const oldKey = deviceKeyOf(device)!;
            const traffic = deviceTraffic(device);
            traffic.dropFromDevice = packet => isSecured(packet) && !Bytes.areEqual(deviceKeyOf(device)!, oldKey);
            let refreshes = 0;
            peer1.eventsOf(IcdClient).keyRefreshed.on(() => {
                refreshes++;
            });

            // The device takes the new key, the response is lost, and the refresh gives up with the key pending
            using log = captureLog(LogLevel.WARN);
            await triggerCheckIn(device);
            await until(() => log.messages.some(message => message.includes("key refresh")));
            const newKey = deviceKeyOf(device)!;
            expect(Bytes.areEqual(peer1.stateOf(IcdClient).pendingKey!, newKey)).true;

            // A late Check-In under the old key starts a retry, which waits behind that Check-In's commit
            const entry = fedPeerOf(controller, peer1);
            const lastOldCounter = (entry.counterStart + entry.lastOffset) >>> 0;
            const crypto = controller.env.get(Crypto);
            GatedIcdStorage.arm();
            const { fabricIndex } = peer1.stateOf(CommissioningClient).peerAddress!;
            const fabricIcd = controller.env.get(FabricManager).for(fabricIndex).icd;
            await fabricIcd.processCheckIn(
                await CheckInMessage.encodeIcd(crypto, oldKey, (lastOldCounter + 1) >>> 0, 5000),
            );
            await MockTime.resolve(GatedIcdStorage.gate.writing.promise, { macrotasks: true });

            // Meanwhile a Check-In under the new key confirms it
            await fabricIcd.processCheckIn(
                await CheckInMessage.encodeIcd(crypto, newKey, (lastOldCounter + 2) >>> 0, 5000),
            );
            expect(fedPeerOf(controller, peer1).pendingKey).undefined;
            GatedIcdStorage.gate.release.resolver();
            await until(() => peer1.stateOf(IcdClient).pendingKey === undefined);
            await settled(controller);

            expect(Bytes.areEqual(peer1.stateOf(IcdClient).key!, newKey)).true;
            expect(fedPeerOf(controller, peer1).pendingKey).undefined;
            expect(refreshes).equals(1);
        });

        it("unregister() abandons a key refresh that waits for its response", async () => {
            await using site = new MockSite();
            const { controller, device, peer1 } = await checkInPair(site);
            mintDistinctKeys(controller);
            await requestRefreshOnNextCheckIn(controller, peer1);
            const oldKey = deviceKeyOf(device)!;
            const traffic = deviceTraffic(device);
            traffic.dropFromDevice = () => !Bytes.areEqual(deviceKeyOf(device)!, oldKey);

            using log = captureLog(LogLevel.DEBUG);
            await triggerCheckIn(device);
            await until(() => !Bytes.areEqual(deviceKeyOf(device)!, oldKey));
            const ending = tracked(peer1.act(agent => agent.get(IcdClient).unregister()));
            await until(() =>
                log.messages.some(message => message.includes("ICD key refresh") && message.includes("abandoned")),
            );
            traffic.dropFromDevice = () => false;
            await MockTime.resolve(ending.promise, { macrotasks: true });

            const state = peer1.stateOf(IcdClient);
            expect(state.registered).false;
            expect(state.pendingKey).undefined;
            expect(state.key).undefined;
            expect(device.stateOf(IcdManagementServer).registeredClients).length(0);
            expect(log.messages.filter(message => message.includes("failed; will retry"))).deep.equals([]);
        });
    });

    describe("registration operations", () => {
        it("joins a registration in flight with the same options and refuses other options", async () => {
            await using site = new MockSite();
            const { controller, device } = await site.addCommissionedPair({ device: { type: RootWithIcd } });
            const peer1 = await subscribedPeer(controller, "peer1");

            const first = tracked(peer1.act(agent => agent.get(IcdClient).register()));
            const joined = tracked(
                peer1.act(agent =>
                    agent.get(IcdClient).register({
                        allowMultiAdmin: false,
                        clientType: IcdManagement.ClientType.Permanent,
                        ignoredVendors: [...IcdMultiAdminError.TRUSTED_ECOSYSTEM_VENDORS].reverse(),
                    }),
                ),
            );
            await expect(
                MockTime.resolve(
                    peer1.act(agent => agent.get(IcdClient).register({ monitoredSubject: SubjectId(NodeId(0xabcdn)) })),
                ),
            ).rejectedWith(ImplementationError, /other options/);
            await MockTime.resolve(Promise.all([first.promise, joined.promise]), { macrotasks: true });

            expect(peer1.stateOf(IcdClient).registered).true;
            expect(device.stateOf(IcdManagementServer).registeredClients).length(1);
        });

        it("unregister() during a registration abandons it and removes it from the device", async () => {
            await using site = new MockSite();
            const { controller, device } = await site.addCommissionedPair({ device: { type: RootWithIcd } });
            const peer1 = await subscribedPeer(controller, "peer1");

            const registering = tracked(peer1.act(agent => agent.get(IcdClient).register()));
            await until(() => device.stateOf(IcdManagementServer).registeredClients.length === 1);
            await MockTime.resolve(
                peer1.act(agent => agent.get(IcdClient).unregister()),
                { macrotasks: true },
            );
            await expect(registering.promise).rejectedWith(AbortedError);

            expect(peer1.stateOf(IcdClient).registered).false;
            expect(device.stateOf(IcdManagementServer).registeredClients).length(0);
        });

        it("forget() during a registration abandons it", async () => {
            await using site = new MockSite();
            const { controller } = await site.addCommissionedPair({ device: { type: RootWithIcd } });
            const peer1 = await subscribedPeer(controller, "peer1");

            let unregistered = 0;
            peer1.eventsOf(IcdClient).unregistered.on(() => {
                unregistered++;
            });

            const registering = tracked(peer1.act(agent => agent.get(IcdClient).register()));
            await MockTime.resolve(peer1.act(agent => agent.get(IcdClient).forget()));
            await expect(registering.promise).rejectedWith(AbortedError);

            expect(peer1.stateOf(IcdClient).registered).false;
            expect(unregistered).equals(0);
        });

        it("refuses register() while a key refresh runs", async () => {
            await using site = new MockSite();
            const { peer1 } = await parkedRefresh(site);

            await expect(MockTime.resolve(peer1.act(agent => agent.get(IcdClient).register()))).rejectedWith(
                ImplementationError,
                /while refreshing/,
            );
        });

        it("refuses register() and does not auto-register while unregister() waits for a sleeping peer", async () => {
            await using site = new MockSite();
            const { device, peer1, link } = await sleepingLitPeer(site);

            const ending = tracked(peer1.act(agent => agent.get(IcdClient).unregister()));
            // After the teardown a returning subscription legitimately registers the LIT peer again
            const registrationsDuringTeardown = ending.promise.then(() => CountingIcdServer.registrations);
            await MockTime.macrotask;
            await expect(MockTime.resolve(peer1.act(agent => agent.get(IcdClient).register()))).rejectedWith(
                ImplementationError,
                /while unregistering/,
            );

            // A returning subscription would auto-register a LIT peer
            await peer1.eventsOf(NetworkClient).subscriptionStatusChanged.emit(true);
            await MockTime.macrotask;
            expect(ending.settled).false;

            await wakeSleepingPeer(device, link);
            await MockTime.resolve(ending.promise, { macrotasks: true });

            expect(await registrationsDuringTeardown).equals(0);
            expect(CountingIcdServer.unregistrations).equals(1);
        });

        it("keeps the registration when unregister() gives up on a peer that does not wake", async () => {
            await using site = new MockSite();
            const { device, peer1 } = await sleepingLitPeer(site);

            const ending = tracked(peer1.act(agent => agent.get(IcdClient).unregister()));
            await MockTime.advance(Hours(2));
            await expect(MockTime.resolve(ending.promise)).rejectedWith(IcdPeerAsleepError);

            expect(peer1.stateOf(IcdClient).registered).true;
            expect(device.stateOf(IcdManagementServer).registeredClients).length(1);
            await expect(MockTime.resolve(peer1.act(agent => agent.get(IcdClient).register()))).rejectedWith(
                ImplementationError,
                /already registered/,
            );
        });

        it("forget() abandons a key refresh parked on a sleeping peer", async () => {
            await using site = new MockSite();
            const { device, peer1, link } = await parkedRefresh(site);

            await MockTime.resolve(peer1.act(agent => agent.get(IcdClient).forget()));
            expect(peer1.stateOf(IcdClient).registered).false;
            expect(peer1.stateOf(IcdClient).pendingKey).undefined;

            await wakeSleepingPeer(device, link);
            expect(CountingIcdServer.registrations).equals(0);
        });

        it("unregister() abandons a key refresh parked on a sleeping peer and unregisters once it wakes", async () => {
            await using site = new MockSite();
            const { device, peer1, link } = await parkedRefresh(site);

            const ending = tracked(peer1.act(agent => agent.get(IcdClient).unregister()));
            await MockTime.macrotask;
            expect(ending.settled).false;

            await wakeSleepingPeer(device, link);
            await MockTime.resolve(ending.promise, { macrotasks: true });

            expect(CountingIcdServer.registrations).equals(0);
            expect(CountingIcdServer.unregistrations).equals(1);
            expect(device.stateOf(IcdManagementServer).registeredClients).length(0);
        });

        it("closes without waiting for a key refresh parked on a sleeping peer", async () => {
            await using site = new MockSite();
            const { controller, device, link } = await parkedRefresh(site);

            const before = Time.nowMs;
            await MockTime.resolve(controller.close());
            expect(Time.nowMs - before).lessThan(Seconds(60));

            await wakeSleepingPeer(device, link);
            expect(CountingIcdServer.registrations).equals(0);
        });

        it("keeps the stored registration when closing abandons an unregister() parked on a sleeping peer", async () => {
            await using site = new MockSite();
            const { controller, peer1 } = await sleepingLitPeer(site);
            const { key } = peer1.stateOf(IcdClient);

            const ending = tracked(peer1.act(agent => agent.get(IcdClient).unregister()));
            await MockTime.macrotask;
            await MockTime.resolve(controller.close());
            await MockTime.resolve(ending.promise.then(undefined, () => {}));

            const controllerB = await site.addNode(undefined, { id: controller.id, index: 1, online: false });
            const restored = controllerB.peers.get("peer1")!.stateOf(IcdClient);
            expect(restored.registered).true;
            expect(Bytes.areEqual(restored.key!, key!)).true;
        });

        it("logs an error when the stored registration cannot be refreshed", async () => {
            await using site = new MockSite();
            const { controller, device, peer1 } = await checkInPair(site);
            await requestRefreshOnNextCheckIn(controller, peer1);
            await peer1.act(agent => {
                agent.get(IcdClient).state.clientType = undefined;
            });

            using log = captureLog(LogLevel.ERROR);
            await triggerCheckIn(device);
            await until(() => log.messages.some(message => message.includes("ICD key refresh")));

            expect(log.messages.some(message => message.includes("failed unexpectedly"))).true;
        });

        it("stores nothing for a registration that closing abandoned after the device answered", async () => {
            await using site = new MockSite();
            const { controller, device } = await site.addCommissionedPair({ device: { type: RootWithIcd } });
            const peer1 = await subscribedPeer(controller, "peer1");

            const release = await holdIcdState(peer1);
            const registering = tracked(peer1.act(agent => agent.get(IcdClient).register()));
            await until(() => device.stateOf(IcdManagementServer).registeredClients.length === 1);
            const closing = controller.close();
            await MockTime.macrotask;
            await release();
            await MockTime.resolve(closing);
            await expect(registering.promise).rejected;

            const controllerB = await site.addNode(undefined, { id: controller.id, index: 1, online: false });
            const restored = controllerB.peers.get("peer1")!.stateOf(IcdClient);
            expect(restored.registered).false;
            expect(restored.key).undefined;
        });

        it("forget() ends an unregister() parked on a sleeping peer", async () => {
            await using site = new MockSite();
            const { device, peer1, link } = await sleepingLitPeer(site);

            const unregistering = tracked(peer1.act(agent => agent.get(IcdClient).unregister()));
            await MockTime.macrotask;
            await MockTime.resolve(peer1.act(agent => agent.get(IcdClient).forget()));
            await expect(unregistering.promise).rejectedWith(AbortedError);
            expect(peer1.stateOf(IcdClient).registered).false;

            await wakeSleepingPeer(device, link);
            expect(CountingIcdServer.unregistrations).equals(0);
        });

        it("ignores a Check-In whose reaction runs after forget() cleared the registration", async () => {
            await using site = new MockSite();
            const { controller, device, peer1 } = await checkInPair(site);
            let checkIns = 0;
            peer1.eventsOf(IcdClient).checkedIn.on(() => {
                checkIns++;
            });

            const { fabricIndex, nodeId } = peer1.stateOf(CommissioningClient).peerAddress!;
            const fabricIcd = controller.env.get(FabricManager).for(fabricIndex).icd;
            const lastOffset = fabricIcd.peerFor(nodeId)!.lastOffset;

            const release = await holdIcdState(peer1);
            const forgetting = tracked(peer1.act(agent => agent.get(IcdClient).forget()));
            await triggerCheckIn(device);
            // The Check-In reaction is queued behind forget()
            await until(() => fabricIcd.peerFor(nodeId)!.lastOffset !== lastOffset);
            await release();
            await MockTime.resolve(forgetting.promise, { macrotasks: true });
            for (let i = 0; i < 10; i++) {
                await MockTime.macrotask;
            }

            expect(checkIns).equals(0);
            expect(peer1.stateOf(IcdClient).lastCheckInReceivedAt).undefined;
        });

        it("clears the registration when closing abandons an unregister() whose request went out", async () => {
            await using site = new MockSite();
            const { controller, device } = await site.addCommissionedPair({ device: { type: RootWithIcd } });
            const peer1 = await subscribedPeer(controller, "peer1");
            await peer1.act(agent => agent.get(IcdClient).register());
            const traffic = deviceTraffic(device);
            traffic.dropFromDevice = () => true;

            const ending = tracked(peer1.act(agent => agent.get(IcdClient).unregister()));
            await until(() => device.stateOf(IcdManagementServer).registeredClients.length === 0);
            await MockTime.resolve(controller.close());
            await MockTime.resolve(ending.promise.then(undefined, () => {}));

            const controllerB = await site.addNode(undefined, { id: controller.id, index: 1, online: false });
            const restored = controllerB.peers.get("peer1")!.stateOf(IcdClient);
            expect(restored.registered).false;
            expect(restored.key).undefined;
        });

        it("rejects forget() that shutdown abandons before it cleared, and keeps the registration", async () => {
            await using site = new MockSite();
            const { controller } = await site.addCommissionedPair({ device: { type: RootWithIcd } });
            const peer1 = await subscribedPeer(controller, "peer1");
            await peer1.act(agent => agent.get(IcdClient).register());

            const release = await holdIcdState(peer1);
            const forgetting = tracked(peer1.act(agent => agent.get(IcdClient).forget()));
            await MockTime.macrotask;
            // The first step of closing the peer, while its state is still open
            peer1.lifecycle.change(EndpointLifecycle.Change.Destroying);
            await release();

            await expect(MockTime.resolve(forgetting.promise)).rejectedWith(AbortedError);
            expect(peer1.stateOf(IcdClient).registered).true;
        });

        it("ends with no registration when a decommission lands while the registration commits", async () => {
            await using site = new MockSite({ createStorageDriver: store => new GatedIcdStorage(store) });
            const { controller, device } = await site.addCommissionedPair({ device: { type: RootWithIcd } });
            const peer1 = await subscribedPeer(controller, "peer1");
            const { fabricIndex, nodeId } = peer1.stateOf(CommissioningClient).peerAddress!;
            const fabricIcd = controller.env.get(FabricManager).for(fabricIndex).icd;

            GatedIcdStorage.arm();
            const registering = tracked(peer1.act(agent => agent.get(IcdClient).register()));
            await MockTime.resolve(GatedIcdStorage.gate.writing.promise, { macrotasks: true });
            const decommissioning = tracked(peer1.act(agent => agent.get(CommissioningClient).decommission()));
            await until(() => device.stateOf(IcdManagementServer).registeredClients.length === 0);
            GatedIcdStorage.gate.release.resolver();
            await MockTime.resolve(Promise.allSettled([registering.promise, decommissioning.promise]), {
                macrotasks: true,
            });
            await until(() => !peer1.stateOf(IcdClient).registered);
            await settled(controller);

            expect(peer1.stateOf(IcdClient).key).undefined;
            expect(fabricIcd.peerFor(nodeId)).undefined;
            await expect(registering.promise).not.rejectedWith(InternalError);
        });

        it("announces the clear once when a decommission waits behind an unregister() commit", async () => {
            await using site = new MockSite({ createStorageDriver: store => new GatedIcdStorage(store) });
            const { controller } = await site.addCommissionedPair({ device: { type: RootWithIcd } });
            const peer1 = await subscribedPeer(controller, "peer1");
            await peer1.act(agent => agent.get(IcdClient).register());
            const { fabricIndex, nodeId } = peer1.stateOf(CommissioningClient).peerAddress!;
            const fabricIcd = controller.env.get(FabricManager).for(fabricIndex).icd;
            let unregistered = 0;
            peer1.eventsOf(IcdClient).unregistered.on(() => {
                unregistered++;
            });

            GatedIcdStorage.arm();
            const ending = tracked(peer1.act(agent => agent.get(IcdClient).unregister()));
            await MockTime.resolve(GatedIcdStorage.gate.writing.promise, { macrotasks: true });
            const decommissioning = tracked(peer1.act(agent => agent.get(CommissioningClient).decommission()));
            // Its reaction now waits for the ICD state the unregister commit holds
            await until(() => decommissioning.settled);
            for (let i = 0; i < 10; i++) {
                await MockTime.macrotask;
            }
            GatedIcdStorage.gate.release.resolver();
            await until(() => !peer1.stateOf(IcdClient).registered);
            for (let i = 0; i < 10; i++) {
                await MockTime.macrotask;
            }

            // The UnregisterClient cannot reach a peer that left the fabric; only the local clear counts here
            await MockTime.resolve(ending.promise.then(undefined, () => {}));
            expect(unregistered).equals(1);
            expect(fabricIcd.peerFor(nodeId)).undefined;
            expect(peer1.stateOf(IcdClient).available).false;
        });

        it("announces registered, then unregistered, when a decommission waits behind the register commit", async () => {
            await using site = new MockSite({ createStorageDriver: store => new GatedIcdStorage(store) });
            const { controller } = await site.addCommissionedPair({ device: { type: RootWithIcd } });
            const peer1 = await subscribedPeer(controller, "peer1");
            const events = new Array<string>();
            peer1.eventsOf(IcdClient).registered.on(() => {
                events.push("registered");
            });
            peer1.eventsOf(IcdClient).unregistered.on(() => {
                events.push("unregistered");
            });

            GatedIcdStorage.arm();
            const registering = tracked(peer1.act(agent => agent.get(IcdClient).register()));
            await MockTime.resolve(GatedIcdStorage.gate.writing.promise, { macrotasks: true });
            const decommissioning = tracked(peer1.act(agent => agent.get(CommissioningClient).decommission()));
            // Its reaction now waits for the ICD state the register commit holds
            await until(() => decommissioning.settled);
            for (let i = 0; i < 10; i++) {
                await MockTime.macrotask;
            }
            GatedIcdStorage.gate.release.resolver();
            await MockTime.resolve(Promise.allSettled([registering.promise, decommissioning.promise]), {
                macrotasks: true,
            });
            await until(() => !peer1.stateOf(IcdClient).registered);

            await registering.promise;
            expect(events).deep.equals(["registered", "unregistered"]);
            expect(peer1.stateOf(IcdClient).registered).false;
        });

        it("forget() after unregister() cleared locally leaves its UnregisterClient running", async () => {
            await using site = new MockSite();
            const { controller, device } = await site.addCommissionedPair({ device: { type: RootWithIcd } });
            const peer1 = await subscribedPeer(controller, "peer1");
            await peer1.act(agent => agent.get(IcdClient).register());
            const traffic = deviceTraffic(device);
            traffic.dropFromDevice = () => true;

            const ending = tracked(peer1.act(agent => agent.get(IcdClient).unregister()));
            await until(() => peer1.stateOf(IcdClient).key === undefined);
            await MockTime.resolve(peer1.act(agent => agent.get(IcdClient).forget()));
            traffic.dropFromDevice = () => false;
            await MockTime.resolve(ending.promise, { macrotasks: true });

            expect(device.stateOf(IcdManagementServer).registeredClients).length(0);
        });

        it("refuses unregister() while forget() runs", async () => {
            await using site = new MockSite();
            const { controller } = await site.addCommissionedPair({ device: { type: RootWithIcd } });
            const peer1 = await subscribedPeer(controller, "peer1");
            await peer1.act(agent => agent.get(IcdClient).register());

            const release = await holdIcdState(peer1);
            const forgetting = tracked(peer1.act(agent => agent.get(IcdClient).forget()));
            await MockTime.macrotask;
            await expect(MockTime.resolve(peer1.act(agent => agent.get(IcdClient).unregister()))).rejectedWith(
                ImplementationError,
                /while forgetting/,
            );
            await release();
            await MockTime.resolve(forgetting.promise);
            expect(peer1.stateOf(IcdClient).registered).false;
        });

        it("clears the time of the last Check-In with the registration", async () => {
            for (const action of ["unregister", "forget"] as const) {
                await using site = new MockSite();
                const { device, peer1 } = await checkInPair(site);
                const checkedIn = nextCheckIn(peer1);
                await wakeDevice(device);
                await MockTime.resolve(checkedIn, { macrotasks: true });
                expect(peer1.stateOf(IcdClient).lastCheckInReceivedAt).not.undefined;

                await MockTime.resolve(
                    peer1.act(agent => agent.get(IcdClient)[action]()),
                    { macrotasks: true },
                );

                expect(peer1.stateOf(IcdClient).lastCheckInReceivedAt).undefined;
            }
        });

        it("joins a second unregister() of a sleeping peer and sends one UnregisterClient", async () => {
            await using site = new MockSite();
            const { device, peer1, link } = await sleepingLitPeer(site);

            const first = tracked(peer1.act(agent => agent.get(IcdClient).unregister()));
            const second = tracked(peer1.act(agent => agent.get(IcdClient).unregister()));
            await MockTime.macrotask;
            expect(first.settled || second.settled).false;

            await wakeSleepingPeer(device, link);
            await MockTime.resolve(Promise.all([first.promise, second.promise]), { macrotasks: true });

            // A LIT peer registers again automatically once the teardown is done
            expect(CountingIcdServer.unregistrations).equals(1);
        });

        it("stores the offset of an old-key Check-In that arrives while a refresh waits", async () => {
            await using site = new MockSite();
            const { controller, device, peer1 } = await checkInPair(site);
            mintDistinctKeys(controller);
            await requestRefreshOnNextCheckIn(controller, peer1);
            const traffic = deviceTraffic(device);
            traffic.dropToDevice = () => peer1.stateOf(IcdClient).pendingKey !== undefined;

            using log = captureLog(LogLevel.WARN);
            await triggerCheckIn(device);
            await until(() => peer1.stateOf(IcdClient).pendingKey !== undefined);
            const before = peer1.stateOf(IcdClient).lastOffset!;

            await triggerCheckIn(device);
            await until(() => fedPeerOf(controller, peer1).lastOffset !== before);
            await until(() => peer1.stateOf(IcdClient).lastOffset !== before);

            // Stored by the Check-In reaction, not by the refresh giving up
            expect(log.messages.filter(message => message.includes("key refresh"))).deep.equals([]);
            expect(peer1.stateOf(IcdClient).lastOffset).equals(fedPeerOf(controller, peer1).lastOffset);
            expect(peer1.stateOf(IcdClient).pendingKey).not.undefined;
        });

        it("registers without the pending key of a refresh that a forget() ended", async () => {
            await using site = new MockSite();
            const { controller, device, peer1 } = await checkInPair(site);
            mintDistinctKeys(controller);
            await requestRefreshOnNextCheckIn(controller, peer1);
            const traffic = deviceTraffic(device);
            traffic.dropToDevice = () => peer1.stateOf(IcdClient).pendingKey !== undefined;

            using log = captureLog(LogLevel.WARN);
            await triggerCheckIn(device);
            await until(() => log.messages.some(message => message.includes("ICD key refresh")));
            expect(peer1.stateOf(IcdClient).pendingKey).not.undefined;
            traffic.dropToDevice = () => false;

            await peer1.act(agent => agent.get(IcdClient).forget());
            expect(peer1.stateOf(IcdClient).pendingKey).undefined;
            await subscribedPeer(controller, "peer1");
            await peer1.act(agent => agent.get(IcdClient).register({ monitoredSubject: SubjectId(NodeId(0xabcdn)) }));

            expect(peer1.stateOf(IcdClient).pendingKey).undefined;
            expect(fedPeerOf(controller, peer1).pendingKey).undefined;
            expect(Bytes.areEqual(peer1.stateOf(IcdClient).key!, deviceKeyOf(device)!)).true;
        });

        it("starts no second refresh for a Check-In handled while a refresh runs", async () => {
            await using site = new MockSite();
            const { controller, device } = await site.addCommissionedPair({
                device: { type: ServerNode.RootEndpoint.with(CountingIcdServer), icdManagement: LIT_CONFIG },
            });
            const peer1 = await subscribedPeer(controller, "peer1");
            await peer1.act(agent => agent.get(IcdClient).register({ monitoredSubject: SubjectId(NodeId(0xabcdn)) }));
            mintDistinctKeys(controller);
            await requestRefreshOnNextCheckIn(controller, peer1);
            CountingIcdServer.registrations = 0;
            let refreshes = 0;
            peer1.eventsOf(IcdClient).keyRefreshed.on(() => {
                refreshes++;
            });

            using log = captureLog(LogLevel.WARN);
            const release = await holdIcdState(peer1);
            await triggerCheckIn(device);
            await until(() => CheckInMessage.refreshNeededAt(fedPeerOf(controller, peer1).lastOffset));
            const first = fedPeerOf(controller, peer1).lastOffset;
            await triggerCheckIn(device);
            await until(() => fedPeerOf(controller, peer1).lastOffset !== first);
            await release();
            await until(() => refreshes === 1);
            await settled(controller, peer1);

            expect(refreshes).equals(1);
            expect(CountingIcdServer.registrations).equals(1);
            expect(
                log.messages.filter(message => message.includes("IcdClient") || message.includes(".icd.")),
            ).deep.equals([]);
        });

        it("starts no second refresh for an old-key Check-In while the refresh waits for its response", async () => {
            await using site = new MockSite();
            const { controller, device } = await site.addCommissionedPair({
                device: { type: ServerNode.RootEndpoint.with(CountingIcdServer), icdManagement: LIT_CONFIG },
            });
            const peer1 = await subscribedPeer(controller, "peer1");
            await peer1.act(agent => agent.get(IcdClient).register({ monitoredSubject: SubjectId(NodeId(0xabcdn)) }));
            mintDistinctKeys(controller);
            await requestRefreshOnNextCheckIn(controller, peer1);
            const oldKey = deviceKeyOf(device)!;
            CountingIcdServer.registrations = 0;
            const traffic = deviceTraffic(device);
            traffic.dropFromDevice = packet => isSecured(packet) && CountingIcdServer.registrations > 0;

            await triggerCheckIn(device);
            await until(() => CountingIcdServer.registrations === 1);
            const entry = fedPeerOf(controller, peer1);
            const counter = (entry.counterStart + entry.lastOffset + 1) >>> 0;
            const { fabricIndex } = peer1.stateOf(CommissioningClient).peerAddress!;
            await controller.env
                .get(FabricManager)
                .for(fabricIndex)
                .icd.processCheckIn(await CheckInMessage.encodeIcd(controller.env.get(Crypto), oldKey, counter, 5000));
            for (let i = 0; i < 10; i++) {
                await MockTime.macrotask;
            }

            expect(CountingIcdServer.registrations).equals(1);
        });

        it("ends a key refresh quietly when the peer is decommissioned", async () => {
            await using site = new MockSite();
            const { controller, device, peer1 } = await checkInPair(site);
            await requestRefreshOnNextCheckIn(controller, peer1);

            using log = captureLog(LogLevel.WARN);
            const release = await holdIcdState(peer1);
            await triggerCheckIn(device);
            await until(() => CheckInMessage.refreshNeededAt(fedPeerOf(controller, peer1).lastOffset));
            const decommissioning = tracked(peer1.act(agent => agent.get(CommissioningClient).decommission()));
            await release();
            await MockTime.resolve(decommissioning.promise, { macrotasks: true });
            await until(() => !peer1.stateOf(IcdClient).registered);
            await settled(controller);

            expect(peer1.stateOf(IcdClient).key).undefined;
            expect(peer1.stateOf(IcdClient).pendingKey).undefined;
            expect(log.messages.filter(message => message.includes("IcdClient"))).deep.equals([]);
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

        it("clears the stored registration when the peer cannot be reached", async () => {
            await using site = new MockSite();
            const { controller, device } = await site.addCommissionedPair({
                device: { type: RootWithIcd },
            });
            const peer1 = await subscribedPeer(controller, "peer1");
            await peer1.act(agent => agent.get(IcdClient).register());
            const traffic = deviceTraffic(device);
            traffic.dropToDevice = () => true;

            await expect(
                MockTime.resolve(
                    peer1.act(agent => agent.get(IcdClient).unregister()),
                    { macrotasks: true },
                ),
            ).rejected;

            const state = peer1.stateOf(IcdClient);
            expect(state.registered).false;
            expect(state.key).undefined;
            expect(state.counterStart).undefined;
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

    describe("forget", () => {
        it("clears local registration and drops the fabric feed WITHOUT a peer UnregisterClient", async () => {
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

            await peer1.act(agent => agent.get(IcdClient).forget());
            await MockTime.resolve(unregistered, { macrotasks: true });

            const state = peer1.stateOf(IcdClient);
            expect(state.registered).false;
            expect(state.key).undefined;
            expect(state.counterStart).undefined;
            expect(state.lastOffset).undefined;
            expect(state.available).false;

            // Local teardown only: the fabric feed is gone, but the peer's registration was left untouched (contrast
            // unregister, which round-trips to the peer). This is the escape hatch when the peer is unreachable.
            expect(fabric.icd.hasPeers).false;
            expect(device.stateOf(IcdManagementServer).registeredClients).length(1);
        });

        it("is a no-op when not registered", async () => {
            await using site = new MockSite();
            const { controller } = await site.addCommissionedPair({
                device: { type: RootWithIcd },
            });

            const peer1 = controller.peers.get("peer1")!;
            await peer1.act(agent => agent.get(IcdClient).forget());
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
        it("seeds available true on register and expires it once the peer goes silent", async () => {
            await using site = new MockSite();
            const { controller, device, peer1 } = await litOperatingPair(site);

            await reRegisterWithSubject(peer1, SubjectId(NodeId(0xabcdn)));
            expect(peer1.stateOf(IcdClient).available).true;

            const changed = new Promise<void>(resolve =>
                peer1.eventsOf(IcdClient).available$Changed.once(() => resolve()),
            );

            deviceLink(device).silence();
            await MockTime.advance(SILENT_PAST_WINDOW);
            await MockTime.resolve(changed, { macrotasks: true });

            expect(peer1.stateOf(IcdClient).available).false;
            expect(wakefulnessOf(controller, peer1)!.available.value).false;
        });

        it("restores available true on a check-in after expiry", async () => {
            await using site = new MockSite();
            const { controller, device, peer1 } = await litOperatingPair(site);

            await reRegisterWithSubject(peer1, SubjectId(NodeId(0xabcdn)));

            const link = deviceLink(device);
            link.silence();
            await MockTime.advance(SILENT_PAST_WINDOW);
            await MockTime.macrotask;
            expect(peer1.stateOf(IcdClient).available).false;

            link.restore();
            await wakeDevice(device);
            await settled(controller, peer1);

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
            await settled(controller, peer1);
            expect(peer1.stateOf(IcdClient).available).true;
        });

        it("has no nextExpectedCheckin while subscribed", async () => {
            await using site = new MockSite();
            const { controller, peer1 } = await litOperatingPair(site);
            // Let the subscription recreated for the registration establish
            for (let i = 0; i < 10; i++) {
                await MockTime.advance(Millis(200));
                await settled(controller, peer1);
            }

            expect(await peer1.act(agent => agent.get(IcdClient).nextExpectedCheckin)).undefined;
        });

        it("exposes nextExpectedCheckin on the wall clock once no subscription is held", async () => {
            await using site = new MockSite();
            const { controller, peer1 } = await litOperatingPair(site);

            await peer1.set({ network: { autoSubscribe: false } });
            await settled(controller, peer1);
            MockTime.stepWallClock(Hours(1));

            const nextExpectedCheckin = await peer1.act(agent => agent.get(IcdClient).nextExpectedCheckin);
            expect(nextExpectedCheckin).not.undefined;
            expect(nextExpectedCheckin! >= Time.nowMs + Seconds(LIT_CONFIG.idleModeDuration)).true;
            expect(nextExpectedCheckin! <= Time.nowMs + Seconds(LIT_CONFIG.idleModeDuration + 30)).true;
        });

        it("has no nextExpectedCheckin for an unregistered peer", async () => {
            await using site = new MockSite();
            const { controller } = await site.addCommissionedPair({
                device: { type: RootWithIcd },
            });

            const peer1 = controller.peers.get("peer1")!;
            expect(await peer1.act(agent => agent.get(IcdClient).nextExpectedCheckin)).undefined;
        });

        it("has no nextExpectedCheckin for a SIT/non-LIT registered peer", async () => {
            await using site = new MockSite();
            const { controller } = await site.addCommissionedPair({
                device: { type: RootWithIcd },
            });

            const peer1 = await subscribedPeer(controller, "peer1");
            await peer1.act(agent => agent.get(IcdClient).register());

            expect(await peer1.act(agent => agent.get(IcdClient).nextExpectedCheckin)).undefined;
        });

        it("emits checkInMissed when a registered LIT peer goes silent", async () => {
            await using site = new MockSite();
            const { device, peer1 } = await litOperatingPair(site);

            await reRegisterWithSubject(peer1, SubjectId(NodeId(0xabcdn)));

            let missed = 0;
            const firstMiss = new Promise<void>(resolve =>
                peer1.eventsOf(IcdClient).checkInMissed.on(() => {
                    missed++;
                    resolve();
                }),
            );

            deviceLink(device).silence();
            await MockTime.advance(SILENT_PAST_WINDOW);
            await MockTime.resolve(firstMiss, { macrotasks: true });

            expect(missed).equals(1);
            expect(peer1.stateOf(IcdClient).available).false;
        });

        it("does not emit checkInMissed when the registration is dropped", async () => {
            await using site = new MockSite();
            const { peer1 } = await litOperatingPair(site);

            await reRegisterWithSubject(peer1, SubjectId(NodeId(0xabcdn)));

            let missed = 0;
            peer1.eventsOf(IcdClient).checkInMissed.on(() => {
                missed++;
            });

            await peer1.act(agent => agent.get(IcdClient).unregister());
            // One task turn: registration is mandatory for a LIT peer, so auto-registration re-registers after this
            await MockTime.macrotask;

            expect(peer1.stateOf(IcdClient).registered).false;
            expect(missed).equals(0);
        });

        it("does not emit checkInMissed on a runtime SIT→LIT operating-mode flip", async () => {
            await using site = new MockSite();
            const { controller, device } = await site.addCommissionedPair({
                device: { type: RootWithDslsIcd, icdManagement: LIT_CONFIG },
            });
            const peer1 = await subscribedPeer(controller, "peer1");

            await peer1.act(agent => agent.get(IcdClient).register({ monitoredSubject: SubjectId(NodeId(0xabcdn)) }));

            let missed = 0;
            peer1.eventsOf(IcdClient).checkInMissed.on(() => {
                missed++;
            });

            const modeChanged = new Promise<void>(resolve =>
                peer1.eventsOf(IcdManagementClient).operatingMode$Changed.once(() => resolve()),
            );
            await device.act(agent => agent.get(DslsIcdServer).setOperatingMode(IcdManagement.OperatingMode.Lit));
            await MockTime.resolve(modeChanged, { macrotasks: true });

            expect(wakefulnessOf(controller, peer1)!.requiresAwait).true;
            expect(missed).equals(0);
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
            await settled(controller, peer1);
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

            const link = deviceLink(device);
            link.silence();
            await MockTime.advance(SILENT_PAST_WINDOW);
            await MockTime.macrotask;
            expect(await peer1.act(agent => agent.get(IcdClient).awake)).equals(false);

            link.restore();
            await wakeDevice(device); // device Check-In re-arms awake
            await settled(peer1);
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

            const { fabricIndex, nodeId } = peer1.stateOf(CommissioningClient).peerAddress!;
            const fabric = controller.env.get(FabricManager).for(fabricIndex);
            expect(fabric.icd.hasPeers).true;
            const wakefulness = fabric.icd.wakefulnessFor(nodeId);

            const unregistered = new Promise<void>(resolve =>
                peer1.eventsOf(IcdClient).unregistered.once(() => resolve()),
            );

            await peer1.act(agent => agent.get(CommissioningClient).decommission());
            await MockTime.resolve(unregistered, { macrotasks: true });

            expect(peer1.stateOf(IcdClient).registered).false;
            expect(fabric.icd.hasPeers).false;

            // A later peer with the same node ID does not inherit the departed peer's wakefulness
            fabric.icd.addPeer(
                { peerNodeId: nodeId, key: Bytes.of(new Uint8Array(16)), counterStart: 0, lastOffset: 0 },
                () => {},
            );
            expect(fabric.icd.wakefulnessFor(nodeId)).not.equal(wakefulness);
        });
    });

    describe("peer removal", () => {
        it("drops the wakefulness of a peer decommissioned after it was unregistered", async () => {
            await using site = new MockSite();
            const { controller } = await site.addCommissionedPair({
                device: { type: RootWithIcd },
            });
            const peer1 = await subscribedPeer(controller, "peer1");
            await peer1.act(agent => agent.get(IcdClient).register());
            const { fabricIndex, nodeId } = peer1.stateOf(CommissioningClient).peerAddress!;
            const fabric = controller.env.get(FabricManager).for(fabricIndex);
            const wakefulness = fabric.icd.wakefulnessFor(nodeId);

            await peer1.act(agent => agent.get(IcdClient).unregister());
            await peer1.act(agent => agent.get(CommissioningClient).decommission());
            await settled(controller);

            fabric.icd.addPeer(
                { peerNodeId: nodeId, key: Bytes.of(new Uint8Array(16)), counterStart: 0, lastOffset: 0 },
                () => {},
            );
            expect(fabric.icd.wakefulnessFor(nodeId)).not.equal(wakefulness);
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
            await settled(controller, peer1);

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
                await settled(controller, peer1);
            }

            expect(peer1.stateOf(IcdClient).registered).true;
            expect(wakefulnessOf(controller, peer1)?.requiresAwait).true;
            // Recreated: a new underlying subscription id, still active (the register seeded the awake window, so the
            // recreate landed in-window rather than parking).
            expect(subscription.subscriptionId).not.equal(idBeforeFlip);
            expect(subscription.active.value).true;
        });
    });

    describe("inbound activity", () => {
        it("resubscribes when a LIT peer reports on a subscription the controller already timed out", async () => {
            await using site = new MockSite();
            const { controller, peer1 } = await litOperatingPair(site);
            const subscription = peer1.behaviors.internalsOf(NetworkClient).activeSubscription;
            const peerAddress = peer1.state.commissioning.peerAddress;
            if (!(subscription instanceof SustainedSubscription) || peerAddress === undefined) {
                throw new ImplementationError("expected a sustained subscription to a commissioned peer");
            }

            // Let the report of the auto-registration complete and the awake window lapse.
            for (let second = 0; second < 30; second++) {
                await MockTime.advance(Seconds(1));
                await settled(controller, peer1);
            }
            const timedOutId = subscription.subscriptionId;
            const checkInBefore = peer1.stateOf(IcdClient).lastCheckInReceivedAt;
            expect(wakefulnessOf(controller, peer1)?.awake.value).false;

            // The controller times its subscription out while the device keeps it.
            controller.env.get(ClientSubscriptions).getPeer(PeerAddress(peerAddress), timedOutId)?.timedOut();
            await settled(controller, peer1);
            expect(subscription.active.value).false;

            // The device's next report carries the timed-out subscription ID.
            for (let second = 0; second < 3660 && !subscription.active.value; second++) {
                await MockTime.advance(Seconds(1));
                await settled(controller, peer1);
            }

            expect(subscription.active.value).true;
            expect(subscription.subscriptionId).not.equal(timedOutId);
            expect(peer1.stateOf(IcdClient).lastCheckInReceivedAt).equal(checkInBefore);
        });
    });

    describe("peer timings", () => {
        it("takes the peer's ActiveModeDuration from its ICD Management attributes", async () => {
            await using site = new MockSite();
            const { controller, device } = await site.addUncommissionedPair({
                device: { type: RootWithDslsIcd, icdManagement: { ...LIT_CONFIG, activeModeDuration: 60_000 } },
            });
            await device.act(agent => agent.get(DslsIcdServer).setOperatingMode(IcdManagement.OperatingMode.Lit));
            await commission(controller, device);
            const peer1 = await subscribedPeer(controller, "peer1");
            await settleAutoRegistration(peer1);
            const wakefulness = wakefulnessOf(controller, peer1);
            if (wakefulness === undefined) {
                throw new ImplementationError("LIT peer not fed");
            }

            // Silent from here on: only the ActiveModeDuration of a Check-In keeps the peer awake
            deviceLink(device).silence();
            wakefulness.noteCheckIn();
            await MockTime.advance(Seconds(30));

            expect(wakefulness.awake.value).true;
        });
    });

    describe("MRP idle interval", () => {
        it("floors the idle interval for a LIT peer only when no source gives an SII", async () => {
            await using site = new MockSite();
            const { peer1 } = await litOperatingPair(site);

            const protopeer = peer1.env.get(Peer);
            expect(protopeer.physicalProperties?.isLongIdleTimeOperating).true;

            // A LIT ICD advertises no SII, and a SII it reports in a session is honored as-is
            const reported = protopeer.descriptor.reportedSessionParameters;
            expect(protopeer.descriptor.discoveryData?.SII).undefined;
            expect(reported?.idleInterval).lessThan(LIT_MIN_IDLE_INTERVAL);
            expect(protopeer.sessionParameters.idleInterval).equals(reported?.idleInterval);

            // Without any SII the controller floors to LIT_MIN_IDLE_INTERVAL instead of the 500ms default
            protopeer.descriptor.reportedSessionParameters = { ...reported, idleInterval: undefined };
            expect(protopeer.sessionParameters.idleInterval).equals(LIT_MIN_IDLE_INTERVAL);

            // An advertised SII is honored as-is
            protopeer.descriptor.discoveryData = { ...protopeer.descriptor.discoveryData, SII: Millis(300) };
            expect(protopeer.sessionParameters.idleInterval).equals(300);
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
