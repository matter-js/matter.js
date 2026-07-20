/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { BasicInformationClient } from "#behaviors/basic-information";
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
 * Reconstruct the CA from the owner's exported config, then import the fabric directly, so
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

        // NOTE — this is a SIMPLIFIED test shape, not the pattern to copy. Real callers trigger the completing
        // controller from inside finalizeCommissioning and await it there (resolve on success, throw on failure), so
        // commission() resolves only once the finalize is done — see the JSDoc on
        // CommissioningClient.CommissioningOptions.finalizeCommissioning. This test instead captures the hand-off and
        // completes in a second phase, purely to keep it simple: two controllers sharing one fabric identity cannot run
        // the nested flow concurrently in a single process.
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
        expect(device.env.get(DeviceCommissioner).isFailsafeArmed).equals(true);

        const b = await addControllerSharingFabric(
            site,
            "controllerB",
            3,
            a.env.get(CertificateAuthority).config,
            a.env.get(FabricAuthority).fabrics[0].config,
        );

        const node = await MockTime.resolve(b.peers.completeCommissioning(handoff!.nodeId, handoff!.discoveryData), {
            macrotasks: true,
        });

        expect(node.lifecycle.isCommissioned).equals(true);
        expect(b.peers.commissioned.map(p => p.peerAddress?.nodeId)).contains(handoff!.nodeId);
        expect(device.env.get(DeviceCommissioner).isFailsafeArmed).equals(false);
        expect(device.state.commissioning.commissioned).equals(true);

        // The finalized peer must have read its structure — a blind commissioned node would hang the `seeded` wait.
        expect(node.lifecycle.isSeeded).equals(true);
        expect(node.stateOf(BasicInformationClient).vendorId).not.equals(undefined);

        // A second completion for an already-committed peer must reject without touching it (see the guard in Peers.completeCommissioning).
        await expect(
            MockTime.resolve(b.peers.completeCommissioning(handoff!.nodeId), { macrotasks: true }),
        ).rejectedWith(ImplementationError);
        expect(b.peers.get(b.env.get(FabricAuthority).fabrics[0].addressOf(handoff!.nodeId))).equals(node);
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
        expect(device.env.get(DeviceCommissioner).isFailsafeArmed).equals(true);
        expect(device.state.commissioning.commissioned).equals(false);
    });

    it("rejects with ImplementationError when the controller does not hold the shared fabric", async () => {
        await using site = new MockSite();

        const controller = await site.addController({ id: "controllerNoFabric", index: 1 });
        await controller.start();

        await expect(controller.peers.completeCommissioning(NodeId(0xdeadn))).rejectedWith(ImplementationError);
        expect(controller.peers.size).equals(0);
    });
});
