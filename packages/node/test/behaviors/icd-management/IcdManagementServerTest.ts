/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { IcdManagementClient, IcdManagementServer } from "#behaviors/icd-management";
import { ServerNode } from "#node/index.js";
import { Bytes } from "@matter/general";
import { FabricManager } from "@matter/protocol";
import { NodeId } from "@matter/types";
import { IcdManagement } from "@matter/types/clusters/icd-management";
import { MockServerNode } from "../../node/mock-server-node.js";
import { MockSite } from "../../node/mock-site.js";

const RootWithIcd = ServerNode.RootEndpoint.with(IcdManagementServer);

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
});
