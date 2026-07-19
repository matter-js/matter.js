/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { GeneralCommissioningServer } from "#behaviors/general-commissioning";
import { OnOffLightDevice } from "#devices/on-off-light";
import { ServerNode } from "#node/ServerNode.js";
import { AbortedError, Crypto, Entropy, Environment, ImplementationError, MockCrypto, Seconds } from "@matter/general";
import {
    CertificateAuthority,
    CommissioningError,
    DeviceCommissioner,
    DiscoveryData,
    Fabric,
    FabricAuthority,
    FabricManager,
} from "@matter/protocol";
import { NodeId } from "@matter/types";
import { GeneralCommissioning } from "@matter/types/clusters/general-commissioning";
import { MockServerNode } from "./mock-server-node.js";
import { MockSite } from "./mock-site.js";

/** A device whose CommissioningComplete command always answers with a non-Ok errorCode. */
class NonOkCommissioningCompleteServer extends GeneralCommissioningServer {
    override async commissioningComplete() {
        return {
            errorCode: GeneralCommissioning.CommissioningError.ValueOutsideRange,
            debugText: "mock device rejects CommissioningComplete",
        };
    }
}

const NonOkCommissioningCompleteRoot = MockServerNode.RootEndpoint.with(NonOkCommissioningCompleteServer);

/**
 * Build a controller {@link ServerNode} that shares an existing controller's fabric.
 *
 * The certificate authority is reconstructed from the owner's exported config and the fabric is imported directly, so
 * {@link FabricAuthority.defaultFabric} resolves the same fabric via the shared CA root certificate.
 */
async function addControllerSharingFabric(
    site: MockSite,
    id: string,
    index: number,
    caConfig: CertificateAuthority.Configuration,
    fabricConfig: Fabric.SyncConfig,
): Promise<ServerNode<MockServerNode.RootEndpoint>> {
    const env = new Environment(id);
    const crypto = MockCrypto(index);
    crypto.entropic = true;
    env.set(Entropy, crypto);
    env.set(Crypto, crypto);
    env.set(CertificateAuthority, await CertificateAuthority.create(crypto, caConfig));

    const controller = await site.addController({ id, index, environment: env, online: false });

    controller.env.get(FabricManager).addFabric(await Fabric.create(crypto, fabricConfig));

    await controller.start();

    return controller;
}

describe("split commissioning", () => {
    before(() => {
        MockTime.init();
    });

    it("controller B completes a PASE-only commissioning started by controller A", async () => {
        await using site = new MockSite();

        const a = await site.addController({ id: "controllerA", index: 1 });
        const device = await site.addDevice({ index: 2 });

        (a.env.get(Crypto) as MockCrypto).entropic = true;
        (device.env.get(Crypto) as MockCrypto).entropic = true;

        await a.start();

        // A commissions up to operational, then hands off instead of doing CASE:
        const { passcode, discriminator } = device.state.commissioning;
        let handoff: { nodeId: NodeId; discoveryData?: DiscoveryData } | undefined;
        await MockTime.resolve(
            a.peers.commission({
                passcode,
                discriminator,
                timeout: Seconds(90),
                autoSubscribe: false,
                autoStateInitialize: false,
                finalizeCommissioning: async (address, discoveryData) => {
                    handoff = { nodeId: address.nodeId, discoveryData };
                },
            }),
            { macrotasks: true },
        );
        expect(handoff).not.equals(undefined);

        // The device holds an armed failsafe until someone completes commissioning:
        expect(device.env.get(DeviceCommissioner).isFailsafeArmed).equals(true);

        // Build B on the same fabric from A's exported CA + fabric config:
        const b = await addControllerSharingFabric(
            site,
            "controllerB",
            3,
            a.env.get(CertificateAuthority).config,
            a.env.get(FabricAuthority).fabrics[0].config,
        );

        // B finalizes over its own operational session:
        const node = await MockTime.resolve(b.peers.completeCommissioning(handoff!.nodeId, handoff!.discoveryData), {
            macrotasks: true,
        });

        expect(node.lifecycle.isCommissioned).equals(true);
        expect(b.peers.commissioned.map(p => p.peerAddress?.nodeId)).contains(handoff!.nodeId);

        // Device must NOT have reverted: CommissioningComplete disarmed the failsafe:
        expect(device.env.get(DeviceCommissioner).isFailsafeArmed).equals(false);
        expect(device.state.commissioning.commissioned).equals(true);

        // A second completion attempt for the same node (duplicate hand-off, or a caller retrying after some
        // unrelated error) must not touch the peer we just committed. Without the guard, forAddress() below would
        // resolve to the already-commissioned live node, the device would answer CommissioningComplete with a
        // non-Ok NoFailSafe errorCode (its failsafe is disarmed), and the catch block would delete the live peer.
        await expect(
            MockTime.resolve(b.peers.completeCommissioning(handoff!.nodeId, handoff!.discoveryData), {
                macrotasks: true,
            }),
        ).rejectedWith(ImplementationError);

        expect(b.peers.get(b.env.get(FabricAuthority).fabrics[0].addressOf(handoff!.nodeId))).equals(node);
        expect(node.lifecycle.isCommissioned).equals(true);
        expect(b.peers.commissioned.map(p => p.peerAddress?.nodeId)).contains(handoff!.nodeId);
    });

    it("leaves no phantom peer when the node cannot be reached", async () => {
        await using site = new MockSite();

        const a = await site.addController({ id: "controllerA", index: 1 });
        const device = await site.addDevice({ index: 2 });

        (a.env.get(Crypto) as MockCrypto).entropic = true;
        (device.env.get(Crypto) as MockCrypto).entropic = true;

        await a.start();

        // A commissions up to the hand-off so its fabric exists to share with B:
        const { passcode, discriminator } = device.state.commissioning;
        await MockTime.resolve(
            a.peers.commission({
                passcode,
                discriminator,
                timeout: Seconds(90),
                autoSubscribe: false,
                autoStateInitialize: false,
                finalizeCommissioning: async () => {},
            }),
            { macrotasks: true },
        );

        const b = await addControllerSharingFabric(
            site,
            "controllerB",
            3,
            a.env.get(CertificateAuthority).config,
            a.env.get(FabricAuthority).fabrics[0].config,
        );

        // B holds the shared fabric, so forAddress() accepts the address, but this node was never discovered and never
        // answers: completeCommissioning() aborts instead of returning an errorCode, and must leave no phantom peer.
        const unreachableNodeId = NodeId(0xdeadn);

        await expect(
            MockTime.resolve(b.peers.completeCommissioning(unreachableNodeId), { macrotasks: true }),
        ).rejectedWith(AbortedError);

        expect(b.peers.commissioned).empty;
        expect(b.peers.size).equals(0);
    });

    it("throws CommissioningError and removes the peer when CommissioningComplete returns a non-Ok errorCode", async () => {
        await using site = new MockSite();

        const a = await site.addController({ id: "controllerA", index: 1 });
        const device = await site.addNode(NonOkCommissioningCompleteRoot, { device: OnOffLightDevice, index: 2 });

        (a.env.get(Crypto) as MockCrypto).entropic = true;
        (device.env.get(Crypto) as MockCrypto).entropic = true;

        await a.start();

        const { passcode, discriminator } = device.state.commissioning;
        let handoff: { nodeId: NodeId; discoveryData?: DiscoveryData } | undefined;
        await MockTime.resolve(
            a.peers.commission({
                passcode,
                discriminator,
                timeout: Seconds(90),
                autoSubscribe: false,
                autoStateInitialize: false,
                finalizeCommissioning: async (address, discoveryData) => {
                    handoff = { nodeId: address.nodeId, discoveryData };
                },
            }),
            { macrotasks: true },
        );
        expect(handoff).not.equals(undefined);

        const b = await addControllerSharingFabric(
            site,
            "controllerB",
            3,
            a.env.get(CertificateAuthority).config,
            a.env.get(FabricAuthority).fabrics[0].config,
        );

        await expect(
            MockTime.resolve(b.peers.completeCommissioning(handoff!.nodeId, handoff!.discoveryData), {
                macrotasks: true,
            }),
        ).rejectedWith(CommissioningError);

        expect(b.peers.commissioned).empty;
        expect(b.peers.size).equals(0);

        // The device never actually disarmed: it answered with an error instead of running completeCommission().
        expect(device.env.get(DeviceCommissioner).isFailsafeArmed).equals(true);
        expect(device.state.commissioning.commissioned).equals(false);
    });

    it("aborts and leaves no node if the fabric cannot be persisted", async () => {
        await using site = new MockSite();

        const a = await site.addController({ id: "controllerA", index: 1 });
        const device = await site.addDevice({ index: 2 });

        (a.env.get(Crypto) as MockCrypto).entropic = true;
        (device.env.get(Crypto) as MockCrypto).entropic = true;

        await a.start();

        const { passcode, discriminator } = device.state.commissioning;
        let handoff: { nodeId: NodeId; discoveryData?: DiscoveryData } | undefined;
        await MockTime.resolve(
            a.peers.commission({
                passcode,
                discriminator,
                timeout: Seconds(90),
                autoSubscribe: false,
                autoStateInitialize: false,
                finalizeCommissioning: async (address, discoveryData) => {
                    handoff = { nodeId: address.nodeId, discoveryData };
                },
            }),
            { macrotasks: true },
        );

        const b = await addControllerSharingFabric(
            site,
            "controllerB",
            3,
            a.env.get(CertificateAuthority).config,
            a.env.get(FabricAuthority).fabrics[0].config,
        );

        // A node is only valid alongside its fabric: persisting the fabric happens before any node is written and
        // before the device is contacted, so a persist failure aborts cleanly leaving no node and an armed failsafe.
        const originalPersist = Fabric.prototype.persist;
        Fabric.prototype.persist = function () {
            throw new Error("simulated persistence failure");
        };
        try {
            await expect(
                MockTime.resolve(b.peers.completeCommissioning(handoff!.nodeId, handoff!.discoveryData), {
                    macrotasks: true,
                }),
            ).rejectedWith("simulated persistence failure");
        } finally {
            Fabric.prototype.persist = originalPersist;
        }

        expect(b.peers.commissioned).empty;
        expect(b.peers.size).equals(0);

        // The device was never contacted, so its failsafe is still armed and it is not committed.
        expect(device.env.get(DeviceCommissioner).isFailsafeArmed).equals(true);
        expect(device.state.commissioning.commissioned).equals(false);
    });

    it("rejects with ImplementationError when the controller does not hold the shared fabric", async () => {
        await using site = new MockSite();

        // A controller that never imported the shared fabric cannot complete a split commissioning.
        const controller = await site.addController({ id: "controllerNoFabric", index: 1 });
        await controller.start();

        await expect(controller.peers.completeCommissioning(NodeId(0xdeadn))).rejectedWith(ImplementationError);

        // Rejected before touching any device: no peer created.
        expect(controller.peers.size).equals(0);
    });
});
