/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { IcdManagementClient, IcdManagementServer } from "#behaviors/icd-management";
import { OperationalCredentialsClient } from "#behaviors/operational-credentials";
import { ServerNode } from "#node/index.js";
import { Bytes, Millis } from "@matter/general";
import { AccessLevel } from "@matter/model";
import { Advertiser, DeviceAdvertiser, FabricManager, ServiceDescription } from "@matter/protocol";
import { FabricIndex, NodeId } from "@matter/types";
import { IcdManagement } from "@matter/types/clusters/icd-management";
import { MockExchange } from "../../node/mock-exchange.js";
import { MockServerNode } from "../../node/mock-server-node.js";
import { MockSite } from "../../node/mock-site.js";

const RootWithIcd = ServerNode.RootEndpoint.with(IcdManagementServer);

/**
 * Minimal mock advertiser that records ServiceDescriptions passed to advertise().
 * Extends Advertiser so it can be added to DeviceAdvertiser.
 */
class RecordingAdvertiser extends Advertiser {
    readonly calls: Array<{ description: ServiceDescription; event: Advertiser.BroadcastEvent }> = [];

    protected getAdvertisement(_description: ServiceDescription) {
        return undefined;
    }

    override advertise(description: ServiceDescription, event: Advertiser.BroadcastEvent) {
        this.calls.push({ description, event });
        return undefined;
    }
}

describe("IcdManagementServer", () => {
    before(() => {
        MockTime.init();
    });

    describe("attribute defaults and CIP feature", () => {
        it("installs with CIP and exposes correct attribute values when configured", async () => {
            await using site = new MockSite();
            const { device } = await site.addCommissionedPair({
                device: {
                    type: RootWithIcd,
                    icdManagement: {
                        idleModeDuration: 3600,
                        activeModeDuration: 1000,
                        activeModeThreshold: 500,
                        clientsSupportedPerFabric: 2,
                        maximumCheckInBackoff: 3600,
                    },
                },
            });

            const state = device.stateOf(IcdManagementServer);
            expect(state.idleModeDuration).equals(3600);
            expect(state.activeModeDuration).equals(1000);
            expect(state.activeModeThreshold).equals(500);
            expect(state.clientsSupportedPerFabric).equals(2);
            expect(state.maximumCheckInBackoff).equals(3600);
            expect(state.registeredClients).deep.equals([]);
            expect(state.icdCounter).greaterThanOrEqual(0);
        });

        it("accepts spec default attribute values without config override", async () => {
            await using site = new MockSite();
            const { device } = await site.addCommissionedPair({
                device: { type: RootWithIcd },
            });

            const state = device.stateOf(IcdManagementServer);
            // Spec defaults: idleModeDuration=1s, activeModeDuration=300ms — constraint satisfied (1000ms >= 300ms).
            expect(state.idleModeDuration).equals(1);
            expect(state.activeModeDuration).equals(300);
            expect(state.maximumCheckInBackoff).equals(1);
        });
    });

    describe("constraint validation", () => {
        // Both tests verify that an ImplementationError thrown from initialize() surfaces as an initialization
        // failure. The distinct invalid configurations ensure each constraint code path is independently exercised.

        it("rejects when idleModeDuration * 1000 < activeModeDuration", async () => {
            // idleModeDuration=1s → 1000ms, activeModeDuration=5000ms: 1000 < 5000 → invalid
            await expect(
                MockServerNode.create(RootWithIcd, {
                    icdManagement: { idleModeDuration: 1, activeModeDuration: 5000 },
                }),
            ).rejectedWith("Behaviors have errors");
        });

        it("rejects when maximumCheckInBackoff < idleModeDuration", async () => {
            // idleModeDuration=3600s, maximumCheckInBackoff=1800s: 1800 < 3600 → invalid
            await expect(
                MockServerNode.create(RootWithIcd, {
                    icdManagement: { idleModeDuration: 3600, activeModeDuration: 300, maximumCheckInBackoff: 1800 },
                }),
            ).rejectedWith("Behaviors have errors");
        });
    });

    describe("ICD counter", () => {
        // MockSite has no restart primitive, so boot-bump and increment linkage is tested against a live device node.

        it("applies boot bump to icdCounter attribute on node online", async () => {
            await using site = new MockSite();
            const { device } = await site.addCommissionedPair({
                device: { type: RootWithIcd },
            });

            // Fresh node seeds from the default 0; the constructor boot bump advances it past 0.
            expect(device.stateOf(IcdManagementServer).icdCounter).greaterThan(0);
        });

        it("persists icdCounter attribute when the internal counter is incremented", async () => {
            await using site = new MockSite();
            const { device } = await site.addCommissionedPair({
                device: { type: RootWithIcd },
            });

            const before = device.stateOf(IcdManagementServer).icdCounter;

            // Increment via device.act so the call runs inside the node's actor context.  The reactTo subscriber
            // (#persistCounter) fires in an independent LocalActorContext; we wait for all pending microtasks and
            // macrotasks to drain before reading the attribute back.
            await device.act(agent => {
                const { icdCounter } = agent.get(IcdManagementServer).internal;
                if (icdCounter === undefined) throw new Error("icdCounter not initialized");
                icdCounter.increment();
            });
            await MockTime.resolve(Promise.resolve());

            const after = device.stateOf(IcdManagementServer).icdCounter;
            expect(after).equals(before + 1);
        });
    });

    describe("RegisterClient command", () => {
        it("registers a client and returns the ICD counter", async () => {
            await using site = new MockSite();
            const { controller, device } = await site.addCommissionedPair({
                device: { type: RootWithIcd },
            });

            const peer1 = controller.peers.get("peer1")!;
            expect(peer1).not.undefined;

            const key = Bytes.fromHex("d0d1d2d3d4d5d6d7d8d9dadbdcdddedf");
            const response = await peer1.commandsOf(IcdManagementClient).registerClient({
                checkInNodeId: peer1.peerAddress!.nodeId,
                monitoredSubject: peer1.peerAddress!.nodeId,
                key,
                clientType: IcdManagement.ClientType.Permanent,
            });

            // Response must carry the current ICD counter value.
            expect(response.icdCounter).greaterThanOrEqual(0);

            // Device-side: the attribute has one entry (no key field — struct doesn't have one).
            const registeredClients = device.stateOf(IcdManagementServer).registeredClients;
            expect(registeredClients).length(1);
            const entry = registeredClients[0];
            expect(entry.checkInNodeId).equals(peer1.peerAddress!.nodeId);
            expect(entry.clientType).equals(IcdManagement.ClientType.Permanent);

            // Device-side: fabric.icd has the entry WITH the key (the attribute struct carries no usable key).
            const fabric = device.env.get(FabricManager).fabrics[0];
            const registrations = fabric.icd.registrations;
            expect(registrations).length(1);
            expect(Bytes.areEqual(registrations[0].key, key)).true;
        });

        it("rejects a second checkInNodeId when fabric slots are exhausted", async () => {
            await using site = new MockSite();
            const { controller } = await site.addCommissionedPair({
                device: {
                    type: RootWithIcd,
                    icdManagement: { clientsSupportedPerFabric: 1 },
                },
            });

            const peer1 = controller.peers.get("peer1")!;
            const cmds = peer1.commandsOf(IcdManagementClient);

            await cmds.registerClient({
                checkInNodeId: peer1.peerAddress!.nodeId,
                monitoredSubject: peer1.peerAddress!.nodeId,
                key: Bytes.fromHex("d0d1d2d3d4d5d6d7d8d9dadbdcdddedf"),
                clientType: IcdManagement.ClientType.Permanent,
            });

            // A different checkInNodeId exceeds the per-fabric slot limit.
            await expect(
                cmds.registerClient({
                    checkInNodeId: NodeId(peer1.peerAddress!.nodeId + 1n),
                    monitoredSubject: peer1.peerAddress!.nodeId,
                    key: Bytes.fromHex("e0e1e2e3e4e5e6e7e8e9eaebecedeeef"),
                    clientType: IcdManagement.ClientType.Permanent,
                }),
            ).rejectedWith(/resource exhausted/i);
        });

        it("updates an existing entry as Administrator without requiring verificationKey", async () => {
            await using site = new MockSite();
            const { controller, device } = await site.addCommissionedPair({
                device: { type: RootWithIcd },
            });

            const peer1 = controller.peers.get("peer1")!;
            const cmds = peer1.commandsOf(IcdManagementClient);

            const firstKey = Bytes.fromHex("d0d1d2d3d4d5d6d7d8d9dadbdcdddedf");
            await cmds.registerClient({
                checkInNodeId: peer1.peerAddress!.nodeId,
                monitoredSubject: peer1.peerAddress!.nodeId,
                key: firstKey,
                clientType: IcdManagement.ClientType.Permanent,
            });

            // Update with a new key and clientType, no verificationKey required (Administrator).
            const secondKey = Bytes.fromHex("a0a1a2a3a4a5a6a7a8a9aaabacadaeaf");
            await cmds.registerClient({
                checkInNodeId: peer1.peerAddress!.nodeId,
                monitoredSubject: peer1.peerAddress!.nodeId,
                key: secondKey,
                clientType: IcdManagement.ClientType.Ephemeral,
            });

            // Still only one entry in the registered clients list.
            const registeredClients = device.stateOf(IcdManagementServer).registeredClients;
            expect(registeredClients).length(1);
            expect(registeredClients[0].clientType).equals(IcdManagement.ClientType.Ephemeral);

            // fabric.icd carries the updated key.
            const fabric = device.env.get(FabricManager).fabrics[0];
            const registrations = fabric.icd.registrations;
            expect(registrations).length(1);
            expect(Bytes.areEqual(registrations[0].key, secondKey)).true;
        });
    });

    describe("UnregisterClient command", () => {
        it("unregisters a client", async () => {
            await using site = new MockSite();
            const { controller, device } = await site.addCommissionedPair({
                device: { type: RootWithIcd },
            });

            const peer1 = controller.peers.get("peer1")!;
            const cmds = peer1.commandsOf(IcdManagementClient);
            const checkInNodeId = peer1.peerAddress!.nodeId;

            await cmds.registerClient({
                checkInNodeId,
                monitoredSubject: checkInNodeId,
                key: Bytes.fromHex("d0d1d2d3d4d5d6d7d8d9dadbdcdddedf"),
                clientType: IcdManagement.ClientType.Permanent,
            });

            await cmds.unregisterClient({ checkInNodeId });

            expect(device.stateOf(IcdManagementServer).registeredClients).deep.equals([]);
            expect(device.env.get(FabricManager).fabrics[0].icd.registrations).deep.equals([]);
            // The persisted ICDToken must also be dropped, else a later Manage re-registration would wrongly reject.
            await device.act(agent => {
                expect(agent.get(IcdManagementServer).internal.icdKeys.size).equals(0);
            });
        });

        it("returns NOT_FOUND for unknown client", async () => {
            await using site = new MockSite();
            const { controller } = await site.addCommissionedPair({
                device: { type: RootWithIcd },
            });

            const peer1 = controller.peers.get("peer1")!;
            const cmds = peer1.commandsOf(IcdManagementClient);

            await expect(
                cmds.unregisterClient({ checkInNodeId: NodeId(peer1.peerAddress!.nodeId + 99n) }),
            ).rejectedWith(/not found/i);
        });
    });

    describe("StayActiveRequest", () => {
        it("promises at least the spec floor", async () => {
            await using site = new MockSite();
            const { controller } = await site.addCommissionedPair({
                device: { type: RootWithIcd },
            });

            const cmds = controller.peers.get("peer1")!.commandsOf(IcdManagementClient);

            const r1 = await cmds.stayActiveRequest({ stayActiveDuration: 5000 });
            expect(r1.promisedActiveDuration).greaterThanOrEqual(5000);

            const r2 = await cmds.stayActiveRequest({ stayActiveDuration: 60000 });
            expect(r2.promisedActiveDuration).greaterThanOrEqual(30000);
        });

        it("small request promises at least min(30000, requested)", async () => {
            await using site = new MockSite();
            const { controller } = await site.addCommissionedPair({
                device: { type: RootWithIcd },
            });

            const r = await controller.peers.get("peer1")!.commandsOf(IcdManagementClient).stayActiveRequest({
                stayActiveDuration: 20,
            });
            expect(r.promisedActiveDuration).greaterThanOrEqual(20);
        });
    });

    describe("Manage-privilege verificationKey", () => {
        // MockExchange with a non-zero fabricIndex (FabricIndex(1)) satisfies the framework's fabric-scoped data
        // constraint. The MockExchange constructor overrides accessLevelsFor on its internal fake Fabric to return
        // exactly [View, <accessLevel>], so #isAdministrator() sees only the specified privilege.

        const fabricIndex = FabricIndex(1);
        const checkInNodeId = NodeId(0x0101n);
        const initialKey = Bytes.fromHex("d0d1d2d3d4d5d6d7d8d9dadbdcdddedf");
        const replacementKey = Bytes.fromHex("a0a1a2a3a4a5a6a7a8a9aaabacadaeaf");
        const wrongKey = Bytes.fromHex("f0f1f2f3f4f5f6f7f8f9fafbfcfdfeff");

        function adminExchange() {
            return new MockExchange({ fabricIndex, nodeId: NodeId(1) }, { accessLevel: AccessLevel.Administer });
        }

        function manageExchange() {
            return new MockExchange({ fabricIndex, nodeId: NodeId(2) }, { accessLevel: AccessLevel.Manage });
        }

        async function withRegisteredNode() {
            const node = await MockServerNode.createOnline(MockServerNode.RootEndpoint.with(IcdManagementServer));

            await node.online({ exchange: adminExchange(), command: true }, agent =>
                agent.get(IcdManagementServer).registerClient({
                    checkInNodeId,
                    monitoredSubject: checkInNodeId,
                    key: initialKey,
                    clientType: IcdManagement.ClientType.Permanent,
                }),
            );

            return node;
        }

        it("registerClient update as Manage with correct verificationKey succeeds and updates the entry", async () => {
            await using node = await withRegisteredNode();

            await node.online({ exchange: manageExchange(), command: true }, agent =>
                agent.get(IcdManagementServer).registerClient({
                    checkInNodeId,
                    monitoredSubject: checkInNodeId,
                    key: replacementKey,
                    verificationKey: initialKey,
                    clientType: IcdManagement.ClientType.Ephemeral,
                }),
            );

            const state = node.stateOf(IcdManagementServer);
            expect(state.registeredClients).length(1);
            expect(state.registeredClients[0].clientType).equals(IcdManagement.ClientType.Ephemeral);

            // The stored ICDToken must rotate to the new key, else a later verificationKey check would use the old one.
            await node.online({ exchange: adminExchange(), command: true }, agent => {
                const stored = [...agent.get(IcdManagementServer).internal.icdKeys.values()].find(
                    e => e.checkInNodeId === checkInNodeId,
                );
                expect(stored).not.undefined;
                expect(Bytes.areEqual(stored!.key, replacementKey)).true;
            });
        });

        it("registerClient update as Manage with wrong verificationKey rejects with Failure", async () => {
            await using node = await withRegisteredNode();

            await expect(
                node.online({ exchange: manageExchange(), command: true }, agent =>
                    agent.get(IcdManagementServer).registerClient({
                        checkInNodeId,
                        monitoredSubject: checkInNodeId,
                        key: replacementKey,
                        verificationKey: wrongKey,
                        clientType: IcdManagement.ClientType.Ephemeral,
                    }),
                ),
            ).rejectedWith(/verificationkey mismatch/i);
        });

        it("registerClient update as Manage with missing verificationKey rejects with Failure", async () => {
            await using node = await withRegisteredNode();

            await expect(
                node.online({ exchange: manageExchange(), command: true }, agent =>
                    agent.get(IcdManagementServer).registerClient({
                        checkInNodeId,
                        monitoredSubject: checkInNodeId,
                        key: replacementKey,
                        clientType: IcdManagement.ClientType.Ephemeral,
                    }),
                ),
            ).rejectedWith(/verificationkey mismatch/i);
        });

        it("unregisterClient as Manage with correct verificationKey succeeds and removes the entry", async () => {
            await using node = await withRegisteredNode();

            await node.online({ exchange: manageExchange(), command: true }, agent =>
                agent.get(IcdManagementServer).unregisterClient({
                    checkInNodeId,
                    verificationKey: initialKey,
                }),
            );

            expect(node.stateOf(IcdManagementServer).registeredClients).deep.equals([]);
        });

        it("unregisterClient as Manage with wrong verificationKey rejects with Failure", async () => {
            await using node = await withRegisteredNode();

            await expect(
                node.online({ exchange: manageExchange(), command: true }, agent =>
                    agent.get(IcdManagementServer).unregisterClient({
                        checkInNodeId,
                        verificationKey: wrongKey,
                    }),
                ),
            ).rejectedWith(/verificationkey mismatch/i);
        });

        it("unregisterClient as Manage with missing verificationKey rejects with Failure", async () => {
            await using node = await withRegisteredNode();

            await expect(
                node.online({ exchange: manageExchange(), command: true }, agent =>
                    agent.get(IcdManagementServer).unregisterClient({
                        checkInNodeId,
                    }),
                ),
            ).rejectedWith(/verificationkey mismatch/i);
        });
    });

    describe("LongIdleTime feature", () => {
        // CIP is mandatory when LITS is enabled (spec conformance "LITS, O" on CIP); both must be passed to .with().
        const litServer = IcdManagementServer.with(
            IcdManagement.Feature.CheckInProtocolSupport,
            IcdManagement.Feature.LongIdleTimeSupport,
        );
        const RootWithLit = ServerNode.RootEndpoint.with(litServer);

        it("exposes the configured operatingMode", async () => {
            // operatingMode is mandatory under LITS with no spec default — the app must configure it.
            await using site = new MockSite();
            const { device } = await site.addCommissionedPair({
                device: {
                    type: RootWithLit,
                    icdManagement: {
                        operatingMode: IcdManagement.OperatingMode.Sit,
                        activeModeThreshold: 5000,
                        idleModeDuration: 3600,
                        activeModeDuration: 1000,
                        maximumCheckInBackoff: 3600,
                    },
                },
            });

            expect(device.stateOf(litServer).operatingMode).equals(IcdManagement.OperatingMode.Sit);
        });

        it("rejects a LIT device that omits the mandatory operatingMode", async () => {
            await expect(
                MockServerNode.create(RootWithLit, {
                    icdManagement: { activeModeThreshold: 5000 },
                }),
            ).rejectedWith("Behaviors have errors");
        });

        it("rejects a LIT device with activeModeThreshold < 5000 ms", async () => {
            // operatingMode supplied so the LIT activeModeThreshold floor is the only violated constraint.
            await expect(
                MockServerNode.create(RootWithLit, {
                    icdManagement: { operatingMode: IcdManagement.OperatingMode.Sit, activeModeThreshold: 1000 },
                }),
            ).rejectedWith("Behaviors have errors");
        });

        it("accepts a LIT device with activeModeThreshold exactly 5000 ms", async () => {
            await using site = new MockSite();
            const { device } = await site.addCommissionedPair({
                device: {
                    type: RootWithLit,
                    icdManagement: {
                        operatingMode: IcdManagement.OperatingMode.Sit,
                        activeModeThreshold: 5000,
                        idleModeDuration: 3600,
                        activeModeDuration: 1000,
                        maximumCheckInBackoff: 3600,
                    },
                },
            });

            expect(device.stateOf(litServer).activeModeThreshold).equals(5000);
        });

        it("does not apply the LIT activeModeThreshold constraint to a plain (non-LITS) server", async () => {
            // The 5s floor is a LIT-only constraint; non-LITS devices may use any activeModeThreshold.
            await using site = new MockSite();
            const { device } = await site.addCommissionedPair({
                device: {
                    type: RootWithIcd,
                    icdManagement: { activeModeThreshold: 1000 },
                },
            });

            expect(device.stateOf(IcdManagementServer).activeModeThreshold).equals(1000);
        });
    });

    describe("fabric lifecycle", () => {
        const key = Bytes.fromHex("d0d1d2d3d4d5d6d7d8d9dadbdcdddedf");

        it("restores registrations into fabric.icd after node stop and restart", async () => {
            // MockSite has no restart primitive, so we use stop/start directly on the device node to
            // re-trigger #online() and verify that the rebuild path repopulates fabric.icd from persisted state.
            await using site = new MockSite();
            const { controller, device } = await site.addCommissionedPair({
                device: { type: RootWithIcd },
            });

            const peer1 = controller.peers.get("peer1")!;
            const checkInNodeId = peer1.peerAddress!.nodeId;

            await peer1.commandsOf(IcdManagementClient).registerClient({
                checkInNodeId,
                monitoredSubject: checkInNodeId,
                key,
                clientType: IcdManagement.ClientType.Permanent,
            });

            // Confirm fabric.icd has the registration from the command handler.
            const fabric = device.env.get(FabricManager).fabrics[0];
            expect(fabric.icd.registrations).length(1);

            // Simulate state loss by clearing fabric.icd, as would happen if the node were fully restarted
            // without reinitializing from persisted storage.
            fabric.icd.clearRegistrations();
            expect(fabric.icd.registrations).length(0);

            // Stop then restart the device node — #online() fires again and replays persisted state.
            await MockTime.resolve(device.stop());
            await MockTime.resolve(device.start());

            const fabricAfter = device.env.get(FabricManager).fabrics[0];
            const registrations = fabricAfter.icd.registrations;
            expect(registrations).length(1);
            expect(registrations[0].checkInNodeId).equals(checkInNodeId);
            expect(Bytes.areEqual(registrations[0].key, key)).true;
        });

        it("drops icdKeys when the fabric is removed", async () => {
            // Tests the #onFabricDeleted handler: after fabric removal the internal key store must be empty.
            // The registeredClients attribute is fabric-scoped and auto-pruned by the framework during the
            // deleting phase (FabricScopedDataHandler), so we only verify the icdKeys cleanup here.
            await using site = new MockSite();
            const { controller, device } = await site.addCommissionedPair({
                device: { type: RootWithIcd },
            });

            const peer1 = controller.peers.get("peer1")!;
            const checkInNodeId = peer1.peerAddress!.nodeId;

            await peer1.commandsOf(IcdManagementClient).registerClient({
                checkInNodeId,
                monitoredSubject: checkInNodeId,
                key,
                clientType: IcdManagement.ClientType.Permanent,
            });

            // Confirm the key is present before removal.
            await device.act(agent => {
                expect(agent.get(IcdManagementServer).internal.icdKeys.size).equals(1);
            });

            // Trigger fabric removal via the controller — this fires the full fabric deletion sequence,
            // including the deleting event (which auto-prunes registeredClients) and deleted event
            // (which triggers our #onFabricDeleted handler to clean icdKeys).
            const fabricIndex = device.env.get(FabricManager).fabrics[0].fabricIndex;
            await MockTime.resolve(peer1.commandsOf(OperationalCredentialsClient).removeFabric({ fabricIndex }), {
                macrotasks: true,
            });

            // icdKeys must be empty after deletion.
            await device.act(agent => {
                expect(agent.get(IcdManagementServer).internal.icdKeys.size).equals(0);
            });
        });

        it("prunes persisted keys for fabrics that no longer exist on online", async () => {
            // A key persisted for a fabric that is gone must be dropped on online so a stale ICDToken is never
            // replayed (defense in depth — normal removal cleans up via #onFabricDeleted while online).
            await using node = await MockServerNode.createOnline(
                MockServerNode.RootEndpoint.with(IcdManagementServer),
                {
                    icdManagement: {
                        icdKeys: [{ fabricIndex: FabricIndex(7), checkInNodeId: NodeId(0x1234n), key }],
                    },
                },
            );

            expect(node.stateOf(IcdManagementServer).icdKeys).deep.equals([]);
        });
    });

    describe("ICD advertisement", () => {
        // CIP + LITS variant used throughout these tests.
        const litServer = IcdManagementServer.with(
            IcdManagement.Feature.CheckInProtocolSupport,
            IcdManagement.Feature.LongIdleTimeSupport,
        );
        const RootWithLit = ServerNode.RootEndpoint.with(litServer);

        const LIT_CONFIG = {
            operatingMode: IcdManagement.OperatingMode.Sit,
            activeModeThreshold: 5000,
            idleModeDuration: 3600,
            activeModeDuration: 1000,
            maximumCheckInBackoff: 3600,
        } as const;

        it("LITS device with no registrations starts in SIT mode", async () => {
            await using site = new MockSite();
            const { device } = await site.addCommissionedPair({
                device: { type: RootWithLit, icdManagement: LIT_CONFIG },
            });

            expect(device.stateOf(litServer).operatingMode).equals(IcdManagement.OperatingMode.Sit);
        });

        it("LITS device provider yields SIT advertisement with idleInterval when no registrations", async () => {
            await using site = new MockSite();
            const { device } = await site.addCommissionedPair({
                device: { type: RootWithLit, icdManagement: LIT_CONFIG },
            });

            // Add a recording advertiser and trigger a re-advertisement to observe the ServiceDescription.
            const recorder = new RecordingAdvertiser();
            const deviceAdvertiser = device.env.get(DeviceAdvertiser);
            deviceAdvertiser.addAdvertiser(recorder);
            const fabric = device.env.get(FabricManager).fabrics[0];
            await deviceAdvertiser.refreshOperationalAdvertisement(fabric);

            const opAds = recorder.calls.filter(c => c.description.kind === "operational");
            expect(opAds.length).greaterThan(0);
            const desc = opAds[0].description as ServiceDescription.Operational;
            expect(desc.icd).equals(IcdManagement.OperatingMode.Sit);
            expect(desc.idleInterval).not.undefined;
            expect(desc.activeInterval).not.undefined;
            expect(desc.activeThreshold).equals(Millis(LIT_CONFIG.activeModeThreshold));
        });

        it("operatingMode transitions to LIT after registerClient and provider omits idleInterval", async () => {
            await using site = new MockSite();
            const { controller, device } = await site.addCommissionedPair({
                device: { type: RootWithLit, icdManagement: LIT_CONFIG },
            });

            // Spy on refreshOperationalAdvertisement to confirm it is called after registration.
            const deviceAdvertiser = device.env.get(DeviceAdvertiser);
            let refreshCount = 0;
            const origRefresh = deviceAdvertiser.refreshOperationalAdvertisement.bind(deviceAdvertiser);
            deviceAdvertiser.refreshOperationalAdvertisement = async fabric => {
                refreshCount++;
                return origRefresh(fabric);
            };

            const peer1 = controller.peers.get("peer1")!;
            const checkInNodeId = peer1.peerAddress!.nodeId;
            await peer1.commandsOf(IcdManagementClient).registerClient({
                checkInNodeId,
                monitoredSubject: checkInNodeId,
                key: Bytes.fromHex("d0d1d2d3d4d5d6d7d8d9dadbdcdddedf"),
                clientType: IcdManagement.ClientType.Permanent,
            });
            await MockTime.resolve(Promise.resolve());

            expect(device.stateOf(litServer).operatingMode).equals(IcdManagement.OperatingMode.Lit);
            expect(refreshCount).greaterThan(0);

            // Verify the provider now yields LIT with no idleInterval.
            const recorder = new RecordingAdvertiser();
            deviceAdvertiser.addAdvertiser(recorder);
            const fabric = device.env.get(FabricManager).fabrics[0];
            await deviceAdvertiser.refreshOperationalAdvertisement(fabric);
            const opAds = recorder.calls.filter(c => c.description.kind === "operational");
            expect(opAds.length).greaterThan(0);
            const desc = opAds[0].description as ServiceDescription.Operational;
            expect(desc.icd).equals(IcdManagement.OperatingMode.Lit);
            expect(desc.idleInterval).to.be.undefined;
            expect(desc.activeThreshold).equals(Millis(LIT_CONFIG.activeModeThreshold));
        });

        it("operatingMode falls back to SIT after unregisterClient removes the last registration", async () => {
            await using site = new MockSite();
            const { controller, device } = await site.addCommissionedPair({
                device: { type: RootWithLit, icdManagement: LIT_CONFIG },
            });

            const peer1 = controller.peers.get("peer1")!;
            const checkInNodeId = peer1.peerAddress!.nodeId;
            const cmds = peer1.commandsOf(IcdManagementClient);

            await cmds.registerClient({
                checkInNodeId,
                monitoredSubject: checkInNodeId,
                key: Bytes.fromHex("d0d1d2d3d4d5d6d7d8d9dadbdcdddedf"),
                clientType: IcdManagement.ClientType.Permanent,
            });
            await MockTime.resolve(Promise.resolve());
            expect(device.stateOf(litServer).operatingMode).equals(IcdManagement.OperatingMode.Lit);

            const deviceAdvertiser = device.env.get(DeviceAdvertiser);
            let refreshAfterUnregister = 0;
            const origRefresh = deviceAdvertiser.refreshOperationalAdvertisement.bind(deviceAdvertiser);
            deviceAdvertiser.refreshOperationalAdvertisement = async fabric => {
                refreshAfterUnregister++;
                return origRefresh(fabric);
            };

            await cmds.unregisterClient({ checkInNodeId });
            await MockTime.resolve(Promise.resolve());

            expect(device.stateOf(litServer).operatingMode).equals(IcdManagement.OperatingMode.Sit);
            expect(refreshAfterUnregister).greaterThan(0);
        });

        it("non-LITS default IcdManagementServer provider yields SIT and mode never changes with registrations", async () => {
            await using site = new MockSite();
            const { controller, device } = await site.addCommissionedPair({
                device: { type: RootWithIcd },
            });

            const recorder = new RecordingAdvertiser();
            const deviceAdvertiser = device.env.get(DeviceAdvertiser);
            deviceAdvertiser.addAdvertiser(recorder);
            const fabric = device.env.get(FabricManager).fabrics[0];
            await deviceAdvertiser.refreshOperationalAdvertisement(fabric);

            const opAdsBefore = recorder.calls.filter(c => c.description.kind === "operational");
            expect(opAdsBefore.length).greaterThan(0);
            const descBefore = opAdsBefore[0].description as ServiceDescription.Operational;
            // CIP-only server is always SIT and must include SII.
            expect(descBefore.icd).equals(IcdManagement.OperatingMode.Sit);
            expect(descBefore.idleInterval).not.undefined;

            recorder.calls.length = 0;

            const peer1 = controller.peers.get("peer1")!;
            const checkInNodeId = peer1.peerAddress!.nodeId;
            await peer1.commandsOf(IcdManagementClient).registerClient({
                checkInNodeId,
                monitoredSubject: checkInNodeId,
                key: Bytes.fromHex("d0d1d2d3d4d5d6d7d8d9dadbdcdddedf"),
                clientType: IcdManagement.ClientType.Permanent,
            });
            await MockTime.resolve(Promise.resolve());

            // Still SIT after registration — non-LITS server never flips to LIT.
            await deviceAdvertiser.refreshOperationalAdvertisement(fabric);
            const opAdsAfter = recorder.calls.filter(c => c.description.kind === "operational");
            expect(opAdsAfter.length).greaterThan(0);
            const descAfter = opAdsAfter[0].description as ServiceDescription.Operational;
            expect(descAfter.icd).equals(IcdManagement.OperatingMode.Sit);
        });
    });

    describe("DynamicSitLitSupport (DSLS) setOperatingMode", () => {
        const dslsServer = IcdManagementServer.with(
            IcdManagement.Feature.CheckInProtocolSupport,
            IcdManagement.Feature.LongIdleTimeSupport,
            IcdManagement.Feature.DynamicSitLitSupport,
        );
        const RootWithDsls = ServerNode.RootEndpoint.with(dslsServer);

        const DSLS_CONFIG = {
            operatingMode: IcdManagement.OperatingMode.Sit,
            activeModeThreshold: 5000,
            idleModeDuration: 3600,
            activeModeDuration: 1000,
            maximumCheckInBackoff: 3600,
        } as const;

        it("setOperatingMode(Lit) with no registrations forces LIT and refreshes advertisement", async () => {
            await using site = new MockSite();
            const { device } = await site.addCommissionedPair({
                device: { type: RootWithDsls, icdManagement: DSLS_CONFIG },
            });

            const deviceAdvertiser = device.env.get(DeviceAdvertiser);
            let refreshCount = 0;
            const origRefresh = deviceAdvertiser.refreshOperationalAdvertisement.bind(deviceAdvertiser);
            deviceAdvertiser.refreshOperationalAdvertisement = async fabric => {
                refreshCount++;
                return origRefresh(fabric);
            };

            await device.act(agent => agent.get(dslsServer).setOperatingMode(IcdManagement.OperatingMode.Lit));
            await MockTime.resolve(Promise.resolve());

            expect(device.stateOf(dslsServer).operatingMode).equals(IcdManagement.OperatingMode.Lit);
            expect(refreshCount).greaterThan(0);

            // Provider should yield LIT with no idleInterval.
            const recorder = new RecordingAdvertiser();
            deviceAdvertiser.addAdvertiser(recorder);
            const fabric = device.env.get(FabricManager).fabrics[0];
            await deviceAdvertiser.refreshOperationalAdvertisement(fabric);
            const opAds = recorder.calls.filter(c => c.description.kind === "operational");
            expect(opAds.length).greaterThan(0);
            const desc = opAds[0].description as ServiceDescription.Operational;
            expect(desc.icd).equals(IcdManagement.OperatingMode.Lit);
            expect(desc.idleInterval).to.be.undefined;
            expect(desc.activeThreshold).equals(Millis(DSLS_CONFIG.activeModeThreshold));
        });

        it("setOperatingMode(Sit) after forced LIT switches back to SIT and refreshes advertisement", async () => {
            await using site = new MockSite();
            const { device } = await site.addCommissionedPair({
                device: { type: RootWithDsls, icdManagement: DSLS_CONFIG },
            });

            // Force to LIT first.
            await device.act(agent => agent.get(dslsServer).setOperatingMode(IcdManagement.OperatingMode.Lit));
            await MockTime.resolve(Promise.resolve());
            expect(device.stateOf(dslsServer).operatingMode).equals(IcdManagement.OperatingMode.Lit);

            const deviceAdvertiser = device.env.get(DeviceAdvertiser);
            let refreshCount = 0;
            const origRefresh = deviceAdvertiser.refreshOperationalAdvertisement.bind(deviceAdvertiser);
            deviceAdvertiser.refreshOperationalAdvertisement = async fabric => {
                refreshCount++;
                return origRefresh(fabric);
            };

            // Switch back to SIT.
            await device.act(agent => agent.get(dslsServer).setOperatingMode(IcdManagement.OperatingMode.Sit));
            await MockTime.resolve(Promise.resolve());

            expect(device.stateOf(dslsServer).operatingMode).equals(IcdManagement.OperatingMode.Sit);
            expect(refreshCount).greaterThan(0);

            // Provider should yield SIT with idleInterval present.
            const recorder = new RecordingAdvertiser();
            deviceAdvertiser.addAdvertiser(recorder);
            const fabric = device.env.get(FabricManager).fabrics[0];
            await deviceAdvertiser.refreshOperationalAdvertisement(fabric);
            const opAds = recorder.calls.filter(c => c.description.kind === "operational");
            expect(opAds.length).greaterThan(0);
            const desc = opAds[0].description as ServiceDescription.Operational;
            expect(desc.icd).equals(IcdManagement.OperatingMode.Sit);
            expect(desc.idleInterval).not.undefined;
        });

        it("non-DSLS LITS device setOperatingMode(Lit) with no registrations throws", async () => {
            const litServer = IcdManagementServer.with(
                IcdManagement.Feature.CheckInProtocolSupport,
                IcdManagement.Feature.LongIdleTimeSupport,
            );
            await using site = new MockSite();
            const { device } = await site.addCommissionedPair({
                device: {
                    type: ServerNode.RootEndpoint.with(litServer),
                    icdManagement: DSLS_CONFIG,
                },
            });

            // device.act() throws synchronously when the actor throws; wrap in a thenable so rejectedWith can catch it.
            await expect(
                Promise.resolve().then(() =>
                    device.act(agent => agent.get(litServer).setOperatingMode(IcdManagement.OperatingMode.Lit)),
                ),
            ).rejectedWith(/DynamicSitLitSupport.*operating mode follows/i);
        });

        it("non-DSLS LITS device setOperatingMode matching registration state succeeds", async () => {
            const litServer = IcdManagementServer.with(
                IcdManagement.Feature.CheckInProtocolSupport,
                IcdManagement.Feature.LongIdleTimeSupport,
            );
            await using site = new MockSite();
            const { device } = await site.addCommissionedPair({
                device: {
                    type: ServerNode.RootEndpoint.with(litServer),
                    icdManagement: DSLS_CONFIG,
                },
            });

            // No registrations → registration-driven mode is SIT; requesting SIT is allowed without DSLS.
            await device.act(agent => agent.get(litServer).setOperatingMode(IcdManagement.OperatingMode.Sit));
            await MockTime.resolve(Promise.resolve());

            expect(device.stateOf(litServer).operatingMode).equals(IcdManagement.OperatingMode.Sit);
        });

        it("rejects a LITS-only server (CIP dropped by single-feature .with)", async () => {
            // `.with(LongIdleTimeSupport)` replaces the feature set, dropping the baked-in CIP; init must fail loudly.
            const litOnly = IcdManagementServer.with(IcdManagement.Feature.LongIdleTimeSupport);
            await expect(
                MockServerNode.create(ServerNode.RootEndpoint.with(litOnly), { icdManagement: DSLS_CONFIG }),
            ).rejectedWith("Behaviors have errors");
        });

        it("CIP-only IcdManagementServer setOperatingMode throws for missing LITS feature", async () => {
            await using site = new MockSite();
            const { device } = await site.addCommissionedPair({
                device: { type: RootWithIcd },
            });

            // device.act() throws synchronously when the actor throws; wrap in a thenable so rejectedWith can catch it.
            await expect(
                Promise.resolve().then(() =>
                    device.act(agent =>
                        agent.get(IcdManagementServer).setOperatingMode(IcdManagement.OperatingMode.Lit),
                    ),
                ),
            ).rejectedWith(/requires the LongIdleTimeSupport feature/i);
        });
    });
});
