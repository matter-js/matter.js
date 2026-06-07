/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { CommissioningClient } from "#behavior/system/commissioning/CommissioningClient.js";
import { IcdClient } from "#behavior/system/icd/IcdClient.js";
import { IcdMultiAdminError } from "#behavior/system/icd/IcdMultiAdminError.js";
import { IcdManagementServer } from "#behaviors/icd-management";
import { ServerNode } from "#node/index.js";
import { FabricManager, TestFabric } from "@matter/protocol";
import { FabricId, VendorId } from "@matter/types";
import { MockSite } from "../../../node/mock-site.js";

const RootWithIcd = ServerNode.RootEndpoint.with(IcdManagementServer);

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
    });
});
