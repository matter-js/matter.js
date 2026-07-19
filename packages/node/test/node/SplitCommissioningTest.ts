/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { ServerNode } from "#node/ServerNode.js";
import { AbortedError, Crypto, Entropy, Environment, MockCrypto, Seconds } from "@matter/general";
import {
    CertificateAuthority,
    DeviceCommissioner,
    DiscoveryData,
    Fabric,
    FabricAuthority,
    FabricManager,
} from "@matter/protocol";
import { NodeId } from "@matter/types";
import { MockServerNode } from "./mock-server-node.js";
import { MockSite } from "./mock-site.js";

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
    });

    it("leaves no phantom peer when the node cannot be reached", async () => {
        await using site = new MockSite();

        const a = await site.addController({ id: "controllerA", index: 1 });
        (a.env.get(Crypto) as MockCrypto).entropic = true;
        await a.start();

        // forAddress() only checks fabric membership, not that the node was ever discovered, so this address is
        // accepted but never answers: commissioningComplete() throws (connection/exchange abort) instead of
        // returning an errorCode.
        const unreachableNodeId = NodeId(0xdeadn);

        await expect(
            MockTime.resolve(a.peers.completeCommissioning(unreachableNodeId), { macrotasks: true }),
        ).rejectedWith(AbortedError);

        expect(a.peers.commissioned).empty;
        expect(a.peers.size).equals(0);
    });

    it("keeps the node commissioned if local persistence fails after CommissioningComplete succeeds", async () => {
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

        // Simulate a local storage failure after the device has already disarmed its failsafe: the device is now
        // genuinely commissioned, so completeCommissioning must not delete the node even though it rejects.
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

        expect(device.env.get(DeviceCommissioner).isFailsafeArmed).equals(false);
        expect(b.peers.get(b.env.get(FabricAuthority).fabrics[0].addressOf(handoff!.nodeId))).not.equals(undefined);
    });
});
