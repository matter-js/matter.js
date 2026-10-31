/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { CommissioningClient } from "#behavior/system/commissioning/CommissioningClient.js";
import { NetworkClient } from "#behavior/system/network/NetworkClient.js";
import { AccessControlServer } from "#behaviors/access-control";
import { BasicInformationClient, BasicInformationServer } from "#behaviors/basic-information";
import { GeneralCommissioningServer } from "#behaviors/general-commissioning";
import { OperationalCredentialsServer } from "#behaviors/operational-credentials";
import { FabricOperationInProgressError } from "#node/client/Peers.js";
import type { ClientNode } from "#node/ClientNode.js";
import type { ServerNode } from "#node/ServerNode.js";
import {
    Bytes,
    causedBy,
    Crypto,
    Entropy,
    Environment,
    ImplementationError,
    isObject,
    Lifetime,
    MockCrypto,
    Seconds,
    Time,
    UnexpectedDataError,
} from "@matter/general";
import { MockSite, subscribedPeer } from "@matter/node/testing";
import {
    CertificateAuthority,
    ClientInteraction,
    ControllerCommissioner,
    FabricChangedError,
    PeerUnresponsiveError,
    DeviceCommissioner,
    ExchangeManager,
    Fabric,
    FabricManager,
    OperationalCertificateUpdateError,
    PeerAddress,
    PeerSet,
    SessionManager,
    updateOperationalCertificate,
} from "@matter/protocol";
import { FabricIndex, NodeId, Status, StatusResponseError } from "@matter/types";
import { GeneralCommissioning } from "@matter/types/clusters/general-commissioning";
import { OperationalCredentials } from "@matter/types/clusters/operational-credentials";

/** The device's view of the fabric the controller commissioned it into. */
function deviceFabric(device: ServerNode): Fabric {
    const fabrics = device.env.get(FabricManager).fabrics;
    expect(fabrics.length).equals(1);
    return fabrics[0];
}

function snapshot(device: ServerNode) {
    const fabric = deviceFabric(device);
    return {
        fabricIndex: fabric.fabricIndex,
        fabricId: fabric.fabricId,
        nodeId: fabric.nodeId,
        operationalCert: fabric.operationalCert,
        publicKey: fabric.publicKey,
        acl: device.stateOf(AccessControlServer).acl,
    };
}

/** Key pairs come from MockCrypto; without entropy a CSR would repeat the existing key pair. */
async function withEntropy<T>(nodes: ServerNode[], fn: () => Promise<T>) {
    const cryptos = nodes.map(node => node.env.get(Crypto) as MockCrypto);
    for (const crypto of cryptos) {
        crypto.entropic = true;
    }
    try {
        return await fn();
    } finally {
        for (const crypto of cryptos) {
            crypto.entropic = false;
        }
    }
}

async function update(controller: ServerNode, device: ServerNode, peer: ClientNode) {
    await withEntropy([controller, device], () =>
        MockTime.resolve(peer.updateOperationalCertificate(), { macrotasks: true }),
    );
}

async function rejectedUpdate(controller: ServerNode, device: ServerNode, peer: ClientNode, message?: RegExp) {
    await expect(
        withEntropy([controller, device], () =>
            MockTime.resolve(peer.updateOperationalCertificate(), { macrotasks: true }),
        ),
    ).rejectedWith(OperationalCertificateUpdateError, message);

    // Disarmed at once rather than left to expire
    expect(device.env.get(DeviceCommissioner).isFailsafeArmed).false;
}

type Handler = (this: unknown, ...args: unknown[]) => Promise<unknown>;

/**
 * Replace a command handler on the runtime prototype of a device behavior with what {@link patch} builds from the
 * original.  Returns a restore function.
 */
async function patchDeviceCommand<B extends typeof OperationalCredentialsServer | typeof GeneralCommissioningServer>(
    device: ServerNode,
    behavior: B,
    command: keyof InstanceType<B> & string,
    patch: (original: Handler) => Handler,
) {
    const proto = await device.act(agent => Object.getPrototypeOf(agent.get(behavior)));
    const original = proto[command];
    proto[command] = patch(original);
    return () => {
        proto[command] = original;
    };
}

async function nodeLabelReachesController(device: ServerNode, peer: ClientNode, nodeLabel: string) {
    await device.setStateOf(BasicInformationServer, { nodeLabel });
    for (let i = 0; i < 30 && peer.stateOf(BasicInformationClient).nodeLabel !== nodeLabel; i++) {
        await MockTime.resolve(MockTime.sleep("wait for report", Seconds(1)));
    }
    expect(peer.stateOf(BasicInformationClient).nodeLabel).equals(nodeLabel);
}

/** Have the device answer ArmFailSafe with expiry 0 with an error, so a disarm fails.  Returns a restore function. */
function refuseDisarm(device: ServerNode) {
    return patchDeviceCommand(
        device,
        GeneralCommissioningServer,
        "armFailSafe",
        original =>
            async function (this: unknown, ...args: unknown[]) {
                const [request] = args;
                if (isObject(request) && request.expiryLengthSeconds === 0) {
                    return {
                        errorCode: GeneralCommissioning.CommissioningError.ValueOutsideRange,
                        debugText: "test refusal",
                    };
                }
                return original.apply(this, args);
            },
    );
}

/** § 11.18.6: UpdateNOC is command 0x07 of the Operational Credentials cluster. */
const UPDATE_NOC_COMMAND_ID = 0x07;

/** § 11.10.7: CommissioningComplete is command 0x04 of the General Commissioning cluster. */
const COMMISSIONING_COMPLETE_COMMAND_ID = 0x04;

/**
 * Make the controller see no answer to a command although the device processed it: the real invoke runs to its end,
 * then the call fails as if the response had been lost.  Returns a restore function.
 */
function loseResponse(clusterId: number, commandId: number, afterDelivery?: () => Promise<void>) {
    const original = ClientInteraction.prototype.invoke;
    ClientInteraction.prototype.invoke = async function* (
        this: ClientInteraction,
        ...args: Parameters<typeof original>
    ): ReturnType<typeof original> {
        const [request] = args;
        const matches = request.invokeRequests.some(
            ({ commandPath }) => commandPath.clusterId === clusterId && commandPath.commandId === commandId,
        );
        if (!matches) {
            yield* original.apply(this, args);
            return;
        }
        for await (const _chunk of original.apply(this, args));
        await afterDelivery?.();
        throw new PeerUnresponsiveError(Seconds(30));
    };
    return () => {
        ClientInteraction.prototype.invoke = original;
    };
}

function loseUpdateNocResponse(afterDelivery?: () => Promise<void>) {
    return loseResponse(OperationalCredentials.Cluster.id, UPDATE_NOC_COMMAND_ID, afterDelivery);
}

/** Number of open interaction lifetimes under the environment of {@link node}. */
function interactionLifetimesOf(node: ServerNode) {
    const probe = node.env.join("probe");
    const root = probe.owner;
    probe[Symbol.dispose]();
    return root === undefined ? 0 : interactionLifetimes(root);
}

function interactionLifetimes(lifetime: Lifetime): number {
    let count = lifetime.name === "interactions" ? 1 : 0;
    for (const span of lifetime.spans) {
        count += interactionLifetimes(span);
    }
    return count;
}

describe("OperationalCertificateUpdate", () => {
    before(() => {
        MockTime.init();
    });

    it("installs a NOC for a new key pair and keeps identity, fabric and ACLs", async () => {
        await using site = new MockSite();
        const { controller, device } = await site.addCommissionedPair();
        const peer = await subscribedPeer(controller, "peer1");
        const before = snapshot(device);
        const fabricIndexOnPeer = peer.stateOf(CommissioningClient).fabricIndexOnPeer;
        const subscription = peer.behaviors.internalsOf(NetworkClient).activeSubscription;
        expect(subscription).not.undefined;

        await update(controller, device, peer);

        // The node's own sustained subscription carries on; the update only restarted it on a new session
        expect(peer.behaviors.internalsOf(NetworkClient).activeSubscription).equals(subscription);

        expect(device.env.get(DeviceCommissioner).isFailsafeArmed).false;
        const after = snapshot(device);
        expect(Bytes.areEqual(after.operationalCert, before.operationalCert)).false;
        expect(Bytes.areEqual(after.publicKey, before.publicKey)).false;
        expect(after.fabricIndex).equals(before.fabricIndex);
        expect(after.fabricId).equals(before.fabricId);
        expect(after.nodeId).equals(before.nodeId);
        expect(after.acl).deep.equals(before.acl);
        expect(peer.stateOf(CommissioningClient).fabricIndexOnPeer).equals(fabricIndexOnPeer);

        // CommissioningComplete disarmed the fail-safe, so the update survives its expiry
        await MockTime.advance(Seconds(120));
        expect(Bytes.areEqual(snapshot(device).operationalCert, after.operationalCert)).true;

        await nodeLabelReachesController(device, peer, "after rotation");
    });

    it("replaces the session that carried UpdateNOC with a new CASE session", async () => {
        await using site = new MockSite();
        const { controller, device } = await site.addCommissionedPair();
        const peer = await subscribedPeer(controller, "peer1");
        const protocolPeer = controller.env.get(PeerSet).get(peer.peerAddress!)!;
        const formerSession = protocolPeer.newestSession();
        expect(formerSession).not.undefined;

        await update(controller, device, peer);

        const session = protocolPeer.newestSession();
        expect(session).not.undefined;
        expect(session).not.equal(formerSession);
        expect(formerSession!.isClosing || formerSession!.isPeerLost).true;
    });

    it("rolls back when the device refuses UpdateNOC", async () => {
        await using site = new MockSite();
        const { controller, device } = await site.addCommissionedPair();
        const peer = await subscribedPeer(controller, "peer1");
        const before = snapshot(device);

        const restore = await patchDeviceCommand(device, OperationalCredentialsServer, "updateNoc", () => async () => ({
            statusCode: OperationalCredentials.NodeOperationalCertStatus.InvalidNoc,
        }));
        try {
            await rejectedUpdate(controller, device, peer);
        } finally {
            restore();
        }

        expect(Bytes.areEqual(snapshot(device).operationalCert, before.operationalCert)).true;
        expect(device.env.get(FabricManager).fabrics.length).equals(1);
        await nodeLabelReachesController(device, peer, "after refused update");
    });

    it("reports the previous certificate kept when the device answers UpdateNOC with an error status", async () => {
        await using site = new MockSite();
        const { controller, device } = await site.addCommissionedPair();
        const peer = await subscribedPeer(controller, "peer1");
        const before = snapshot(device);

        const restore = await patchDeviceCommand(device, OperationalCredentialsServer, "updateNoc", () => async () => {
            throw new StatusResponseError("Refused by test", Status.ConstraintError);
        });
        try {
            await expect(
                withEntropy([controller, device], () =>
                    MockTime.resolve(peer.updateOperationalCertificate(), { macrotasks: true }),
                ),
            ).rejectedWith(OperationalCertificateUpdateError, /keeps its previous certificate/);
        } finally {
            restore();
        }

        expect(device.env.get(DeviceCommissioner).isFailsafeArmed).false;
        expect(Bytes.areEqual(snapshot(device).operationalCert, before.operationalCert)).true;
    });

    it("rolls back when the CSR does not verify against the DAC", async () => {
        await using site = new MockSite();
        const { controller, device } = await site.addCommissionedPair();
        const peer = await subscribedPeer(controller, "peer1");
        const before = snapshot(device);

        const proto = await device.act(agent => Object.getPrototypeOf(agent.get(OperationalCredentialsServer)));
        const original = proto.csrRequest;
        proto.csrRequest = async function (
            this: OperationalCredentialsServer,
            request: OperationalCredentials.CsrRequest,
        ) {
            const response = await original.call(this, request);
            return { ...response, attestationSignature: new Uint8Array(64) };
        };
        try {
            await rejectedUpdate(controller, device, peer);
        } finally {
            proto.csrRequest = original;
        }

        expect(Bytes.areEqual(snapshot(device).operationalCert, before.operationalCert)).true;
        await nodeLabelReachesController(device, peer, "after CSR mismatch");
    });

    it("rolls back when CommissioningComplete fails after UpdateNOC", async () => {
        await using site = new MockSite();
        const { controller, device } = await site.addCommissionedPair();
        const peer = await subscribedPeer(controller, "peer1");
        const before = snapshot(device);

        const restore = await patchDeviceCommand(
            device,
            GeneralCommissioningServer,
            "commissioningComplete",
            () => async () => ({
                errorCode: GeneralCommissioning.CommissioningError.ValueOutsideRange,
                debugText: "test refusal",
            }),
        );
        try {
            await rejectedUpdate(controller, device, peer, /reverted to its previous certificate/);
        } finally {
            restore();
        }

        expect(Bytes.areEqual(snapshot(device).operationalCert, before.operationalCert)).true;
        await nodeLabelReachesController(device, peer, "after failed completion");
    });

    it("keeps the new NOC when CommissioningComplete took effect but its answer is lost", async () => {
        await using site = new MockSite();
        const { controller, device } = await site.addCommissionedPair();
        const peer = await subscribedPeer(controller, "peer1");
        const before = snapshot(device);
        const fabricIndexOnPeer = peer.stateOf(CommissioningClient).fabricIndexOnPeer;

        const restore = loseResponse(GeneralCommissioning.Cluster.id, COMMISSIONING_COMPLETE_COMMAND_ID);
        try {
            await update(controller, device, peer);
        } finally {
            restore();
        }

        expect(device.env.get(DeviceCommissioner).isFailsafeArmed).false;
        expect(Bytes.areEqual(snapshot(device).operationalCert, before.operationalCert)).false;
        // The NOCResponse arrived, so its fabric index is known; the result of the lost confirmation carries none
        expect(peer.stateOf(CommissioningClient).fabricIndexOnPeer).equals(fabricIndexOnPeer);
        await nodeLabelReachesController(device, peer, "after lost confirmation");
    });

    it("refuses a fail-safe the ArmFailSafe command cannot carry or the update cannot fit into", async () => {
        await using site = new MockSite();
        const { controller } = await site.addCommissionedPair();
        const peer = await subscribedPeer(controller, "peer1");

        for (const failsafe of [Seconds(29), Seconds(0x10000)]) {
            await expect(
                MockTime.resolve(peer.updateOperationalCertificate({ failsafe }), { macrotasks: true }),
            ).rejectedWith(ImplementationError, /Fail-safe .* is outside/);
        }
    });

    it("refuses while a commissioning window holds the fail-safe", async () => {
        await using site = new MockSite();
        const { controller, device } = await site.addCommissionedPair();
        const peer = await subscribedPeer(controller, "peer1");
        const before = snapshot(device);

        await MockTime.resolve(peer.openEnhancedCommissioningWindow(), { macrotasks: true });

        await expect(
            withEntropy([controller, device], () =>
                MockTime.resolve(peer.updateOperationalCertificate(), { macrotasks: true }),
            ),
        ).rejectedWith(OperationalCertificateUpdateError, /another administrator holds the fail-safe/);
        expect(Bytes.areEqual(snapshot(device).operationalCert, before.operationalCert)).true;
    });

    it("refuses an uncommissioned node", async () => {
        await using site = new MockSite();
        const { controller } = await site.addCommissionedPair();
        const peer = await subscribedPeer(controller, "peer1");
        await peer.setStateOf(CommissioningClient, { peerAddress: undefined });

        await expect(
            MockTime.resolve(peer.act(agent => agent.commissioning.updateOperationalCertificate())),
        ).rejectedWith(ImplementationError, /not commissioned/);
    });

    it("keeps the device's fabric index on the controller", async () => {
        await using site = new MockSite();
        const { controller, device } = await site.addCommissionedPair();
        const peer = await subscribedPeer(controller, "peer1");
        await peer.setStateOf(CommissioningClient, { fabricIndexOnPeer: undefined });

        await update(controller, device, peer);

        expect(peer.stateOf(CommissioningClient).fabricIndexOnPeer).equals(
            FabricIndex(deviceFabric(device).fabricIndex),
        );
    });

    it("sends the ICAC when the fabric uses one", async () => {
        await using site = new MockSite();
        const environment = new Environment("controller1");
        const crypto = MockCrypto(1);
        environment.set(Entropy, crypto);
        environment.set(Crypto, crypto);
        // With entropy the ICAC gets its own key, so a NOC it signs does not verify against the root alone
        crypto.entropic = true;
        environment.set(CertificateAuthority, await CertificateAuthority.create(crypto, true));
        crypto.entropic = false;
        const controller = await site.addController({ index: 1, environment });
        const device = await site.addDevice({ index: 2 });

        await withEntropy([controller, device], async () => {
            await controller.start();
            const { passcode, discriminator } = device.state.commissioning;
            await MockTime.resolve(controller.peers.commission({ passcode, discriminator, timeout: Seconds(90) }), {
                macrotasks: true,
            });
        });
        const peer = await subscribedPeer(controller, "peer1");
        const before = snapshot(device);
        const icac = deviceFabric(device).intermediateCACert;
        expect(icac).not.undefined;

        await update(controller, device, peer);

        expect(Bytes.areEqual(snapshot(device).operationalCert, before.operationalCert)).false;
        expect(Bytes.areEqual(deviceFabric(device).intermediateCACert ?? new Uint8Array(), icac!)).true;
        await nodeLabelReachesController(device, peer, "after rotation with ICAC");
    });

    it("refuses a peer the controller does not know", async () => {
        await using site = new MockSite();
        const { controller } = await site.addCommissionedPair();
        const peer = await subscribedPeer(controller, "peer1");

        await expect(
            controller.env.get(ControllerCommissioner).updateOperationalCertificate({
                address: PeerAddress({ fabricIndex: peer.peerAddress!.fabricIndex, nodeId: NodeId(0x4242) }),
            }),
        ).rejectedWith(ImplementationError, /unknown peer/);
    });

    it("refuses a fabric whose certificate authority the controller does not hold", async () => {
        await using site = new MockSite();
        const { controller } = await site.addCommissionedPair();
        const peer = await subscribedPeer(controller, "peer1");
        const { env } = controller;

        await expect(
            updateOperationalCertificate(
                {
                    peers: env.get(PeerSet),
                    sessions: env.get(SessionManager),
                    exchanges: env.get(ExchangeManager),
                    ca: await CertificateAuthority.create(env.get(Crypto)),
                    environment: env,
                },
                { address: PeerAddress(peer.peerAddress!) },
            ),
        ).rejectedWith(ImplementationError, /not the certificate authority/);
    });

    it("reverts when the UpdateNOC answer is lost", async () => {
        await using site = new MockSite();
        const { controller, device } = await site.addCommissionedPair();
        const peer = await subscribedPeer(controller, "peer1");
        const before = snapshot(device);

        const restore = loseUpdateNocResponse();
        const startedAt = Time.nowMs;
        try {
            await rejectedUpdate(controller, device, peer, /reverted to its previous certificate/);
        } finally {
            restore();
        }

        // The disarm over a fresh session settled it; nothing waited for the fail-safe to expire
        expect(Time.nowMs - startedAt).lessThan(60_000);

        expect(Bytes.areEqual(snapshot(device).operationalCert, before.operationalCert)).true;
        await nodeLabelReachesController(device, peer, "after lost UpdateNOC answer");
    });

    it("reports a pending rollback at once when the disarm fails", async () => {
        await using site = new MockSite();
        const { controller, device } = await site.addCommissionedPair();
        const peer = await subscribedPeer(controller, "peer1");
        const before = snapshot(device);

        const restoreDevice = await refuseDisarm(device);
        const restoreController = loseUpdateNocResponse();
        const startedAt = Time.nowMs;
        try {
            await expect(
                withEntropy([controller, device], () =>
                    MockTime.resolve(peer.updateOperationalCertificate(), { macrotasks: true }),
                ),
            ).rejectedWith(OperationalCertificateUpdateError, /keeps its previous certificate once its fail-safe/);
        } finally {
            restoreController();
            restoreDevice();
        }

        expect(Time.nowMs - startedAt).lessThan(60_000);
        expect(device.env.get(DeviceCommissioner).isFailsafeArmed).true;
        await MockTime.resolve(MockTime.sleep("fail-safe expiry", Seconds(70)), { macrotasks: true });
        expect(device.env.get(DeviceCommissioner).isFailsafeArmed).false;
        expect(Bytes.areEqual(snapshot(device).operationalCert, before.operationalCert)).true;
    });

    it("reports an unknown outcome when another fail-safe replaced the update's", async () => {
        await using site = new MockSite();
        const { controller, device } = await site.addCommissionedPair();
        const peer = await subscribedPeer(controller, "peer1");

        const restoreDevice = await patchDeviceCommand(
            device,
            GeneralCommissioningServer,
            "armFailSafe",
            original =>
                async function (this: unknown, ...args: unknown[]) {
                    const [request] = args;
                    if (isObject(request) && request.expiryLengthSeconds === 0) {
                        return original.call(this, { expiryLengthSeconds: 60, breadcrumb: 7 });
                    }
                    return original.apply(this, args);
                },
        );
        const restoreController = loseUpdateNocResponse();
        try {
            await expect(
                withEntropy([controller, device], () =>
                    MockTime.resolve(peer.updateOperationalCertificate(), { macrotasks: true }),
                ),
            ).rejectedWith(OperationalCertificateUpdateError, /outcome is unknown/);
        } finally {
            restoreController();
            restoreDevice();
        }
    });

    it("reports an unknown outcome when the node cannot be reached after UpdateNOC", async () => {
        await using site = new MockSite();
        const { controller, device } = await site.addCommissionedPair();
        const peer = await subscribedPeer(controller, "peer1");

        const restore = loseUpdateNocResponse(() => device.stop());
        try {
            await expect(
                withEntropy([controller, device], () =>
                    MockTime.resolve(peer.updateOperationalCertificate(), { macrotasks: true }),
                ),
            ).rejectedWith(OperationalCertificateUpdateError, /outcome is unknown/);
        } finally {
            restore();
        }
    });

    it("rolls back when the CSR response is empty", async () => {
        await using site = new MockSite();
        const { controller, device } = await site.addCommissionedPair();
        const peer = await subscribedPeer(controller, "peer1");
        const before = snapshot(device);

        const restore = await patchDeviceCommand(
            device,
            OperationalCredentialsServer,
            "csrRequest",
            () => async () => ({
                nocsrElements: new Uint8Array(),
                attestationSignature: new Uint8Array(64),
            }),
        );
        let failure: unknown;
        try {
            failure = await withEntropy([controller, device], () =>
                MockTime.resolve(peer.updateOperationalCertificate(), { macrotasks: true }).then(
                    () => undefined,
                    (error: unknown) => error,
                ),
            );
        } finally {
            restore();
        }

        expect(failure).instanceOf(OperationalCertificateUpdateError);
        expect(causedBy(failure, UnexpectedDataError)).true;
        expect(device.env.get(DeviceCommissioner).isFailsafeArmed).false;
        expect(Bytes.areEqual(snapshot(device).operationalCert, before.operationalCert)).true;
    });

    it("accepts the fail-safe bounds 30 s and 65535 s", async () => {
        await using site = new MockSite();
        const { controller, device } = await site.addCommissionedPair();
        const peer = await subscribedPeer(controller, "peer1");

        for (const failsafe of [Seconds(30), Seconds(0xffff)]) {
            const before = snapshot(device).operationalCert;
            await withEntropy([controller, device], () =>
                MockTime.resolve(peer.updateOperationalCertificate({ failsafe }), { macrotasks: true }),
            );
            expect(Bytes.areEqual(snapshot(device).operationalCert, before)).false;
        }
    });

    it("fails fast without arming a fail-safe when aborted before connecting", async () => {
        await using site = new MockSite();
        const { controller, device } = await site.addCommissionedPair();
        const peer = await subscribedPeer(controller, "peer1");
        await controller.env.get(PeerSet).get(peer.peerAddress!)!.disconnect(new FabricChangedError("test"));

        const abort = new AbortController();
        abort.abort(new FabricChangedError("aborted by test"));
        await expect(MockTime.resolve(peer.updateOperationalCertificate({ abort: abort.signal }), { macrotasks: true }))
            .rejected;
        expect(device.env.get(DeviceCommissioner).isFailsafeArmed).false;
    });

    it("closing one interaction leaves the subscriptions of another to the same peer open", async () => {
        await using site = new MockSite();
        const { controller, device } = await site.addCommissionedPair();
        const peer = await subscribedPeer(controller, "peer1");
        const subscription = peer.behaviors.internalsOf(NetworkClient).activeSubscription;
        const protocolPeer = controller.env.get(PeerSet).get(peer.peerAddress!)!;

        const other = new ClientInteraction({
            environment: controller.env,
            exchangeProvider: protocolPeer.exchangeProvider,
            address: protocolPeer.address,
        });
        await MockTime.resolve(other.close(), { macrotasks: true });

        expect(peer.behaviors.internalsOf(NetworkClient).activeSubscription).equals(subscription);
        await nodeLabelReachesController(device, peer, "after another interaction closed");
    });

    it("leaves no interaction open", async () => {
        await using site = new MockSite();
        const { controller, device } = await site.addCommissionedPair();
        const peer = await subscribedPeer(controller, "peer1");
        const open = interactionLifetimesOf(controller);

        await update(controller, device, peer);

        expect(interactionLifetimesOf(controller)).equals(open);
    });

    it("refuses a second update or a commission while the certificate update runs", async () => {
        await using site = new MockSite();
        const { controller, device } = await site.addCommissionedPair();
        const peer = await subscribedPeer(controller, "peer1");

        await withEntropy([controller, device], async () => {
            const updating = MockTime.resolve(peer.updateOperationalCertificate(), { macrotasks: true });
            await expect(peer.updateOperationalCertificate()).rejectedWith(
                FabricOperationInProgressError,
                /^Cannot update the operational certificate of .* because a certificate update attempt is already in progress$/,
            );
            await expect(peer.commission({ passcode: 20202021 })).rejectedWith(
                FabricOperationInProgressError,
                /^Cannot commission .* because a certificate update attempt is already in progress$/,
            );
            await updating;
        });
    });

    it("refuses to decommission while the certificate update runs", async () => {
        await using site = new MockSite();
        const { controller, device } = await site.addCommissionedPair();
        const peer = await subscribedPeer(controller, "peer1");

        await withEntropy([controller, device], async () => {
            const updating = MockTime.resolve(peer.updateOperationalCertificate(), { macrotasks: true });
            await expect(peer.decommission()).rejectedWith(
                FabricOperationInProgressError,
                /a certificate update attempt is already in progress/,
            );
            await updating;
        });
    });
});
