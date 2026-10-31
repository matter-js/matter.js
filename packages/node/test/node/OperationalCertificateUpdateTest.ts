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
    StorageError,
    Time,
    UnexpectedDataError,
} from "@matter/general";
import { MockSite, subscribedPeer } from "@matter/node/testing";
import {
    CertificateAuthority,
    ClientInteraction,
    Noc,
    ControllerCommissioner,
    FabricChangedError,
    PeerUnresponsiveError,
    ReadResult,
    DeviceCommissioner,
    ExchangeManager,
    Fabric,
    FabricManager,
    OperationalCertificateUpdateBusyError,
    OperationalCertificateUpdateError,
    OperationalCertificateUpdateRefusedError,
    PeerAddress,
    PeerSet,
    SessionManager,
    updateOperationalCertificate,
} from "@matter/protocol";
import { CaseAuthenticatedTag, FabricId, FabricIndex, NodeId, Status, StatusResponseError } from "@matter/types";
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

/** § 11.10.7: ArmFailSafe is command 0x00 of the General Commissioning cluster. */
const ARM_FAIL_SAFE_COMMAND_ID = 0x00;

/** § 11.10.7: CommissioningComplete is command 0x04 of the General Commissioning cluster. */
const COMMISSIONING_COMPLETE_COMMAND_ID = 0x04;

/** How the controller sees one command. */
interface CommandFault {
    /** Whether the command reaches the device. */
    delivered: boolean;

    /** Whether the controller receives the answer. */
    answered: boolean;

    /** Runs once the device processed the command, before the controller continues. */
    afterDelivery?: () => Promise<void>;
}

/**
 * Apply {@link CommandFault} to every request of the controller that carries the given command.  Returns the number
 * of attempts to send it and a restore function.
 */
function interceptCommand(clusterId: number, commandId: number, { delivered, answered, afterDelivery }: CommandFault) {
    const sent = { attempts: 0 };
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

        sent.attempts++;
        if (!delivered) {
            throw new PeerUnresponsiveError(Seconds(30));
        }
        if (answered) {
            // The caller may stop reading after the first response
            try {
                yield* original.apply(this, args);
            } finally {
                await afterDelivery?.();
            }
            return;
        }
        for await (const _chunk of original.apply(this, args));
        await afterDelivery?.();
        throw new PeerUnresponsiveError(Seconds(30));
    };
    const restore = () => {
        ClientInteraction.prototype.invoke = original;
    };
    return { sent, restore };
}

/**
 * Make the controller see no answer to a command although the device processed it.  Returns a restore function.
 */
function loseResponse(clusterId: number, commandId: number, afterDelivery?: () => Promise<void>) {
    return interceptCommand(clusterId, commandId, { delivered: true, answered: false, afterDelivery }).restore;
}

/** Run {@link afterDelivery} once the controller received the answer to a command.  Returns a restore function. */
function afterResponse(clusterId: number, commandId: number, afterDelivery: () => Promise<void>) {
    return interceptCommand(clusterId, commandId, { delivered: true, answered: true, afterDelivery }).restore;
}

/** Make every attempt to send a command fail as unanswered without the device receiving it. */
function dropRequests(clusterId: number, commandId: number) {
    return interceptCommand(clusterId, commandId, { delivered: false, answered: false });
}

function loseUpdateNocResponse(afterDelivery?: () => Promise<void>) {
    return loseResponse(OperationalCredentials.Cluster.id, UPDATE_NOC_COMMAND_ID, afterDelivery);
}

/** Count the CommissioningComplete commands the device handles.  Returns the count and a restore function. */
async function countCommissioningComplete(device: ServerNode) {
    const handled = { count: 0 };
    const restore = await patchDeviceCommand(
        device,
        GeneralCommissioningServer,
        "commissioningComplete",
        original =>
            async function (this: unknown, ...args: unknown[]) {
                handled.count++;
                return original.apply(this, args);
            },
    );
    return { handled, restore };
}

/** End the device's fail-safe as if it expired, so the device rolls back the pending NOC. */
async function expireFailsafe(device: ServerNode) {
    await device.env.get(DeviceCommissioner).failsafeContext.close();
}

/** The NOCs attribute is attribute 0x0000 of the Operational Credentials cluster (§ 11.18.5.1). */
const NOCS_ATTRIBUTE_ID = 0x0000;

/** The Breadcrumb attribute is attribute 0x0000 of the General Commissioning cluster (§ 11.10.6). */
const BREADCRUMB_ATTRIBUTE_ID = 0x0000;

async function* withoutAttribute(chunk: ReadResult.Chunk, clusterId: number, attributeId: number) {
    for await (const report of chunk) {
        if (
            report.kind === "attr-value" &&
            report.path.clusterId === clusterId &&
            report.path.attributeId === attributeId
        ) {
            continue;
        }
        yield report;
    }
}

/**
 * Drop values of one attribute from the reads of the controller while {@link active} holds, as if the peer reported
 * none.  Returns a restore function.
 */
function dropAttributeReports(clusterId: number, attributeId: number, active = () => true) {
    const original = ClientInteraction.prototype.read;
    ClientInteraction.prototype.read = async function* (
        this: ClientInteraction,
        ...args: Parameters<typeof original>
    ): ReturnType<typeof original> {
        for await (const chunk of original.apply(this, args)) {
            yield active() ? withoutAttribute(chunk, clusterId, attributeId) : chunk;
        }
    };
    return () => {
        ClientInteraction.prototype.read = original;
    };
}

async function* withNocs(chunk: ReadResult.Chunk, forge: (entries: unknown[]) => unknown[]) {
    for await (const report of chunk) {
        if (
            report.kind === "attr-value" &&
            report.path.clusterId === OperationalCredentials.Cluster.id &&
            report.path.attributeId === NOCS_ATTRIBUTE_ID &&
            Array.isArray(report.value)
        ) {
            yield { ...report, value: forge(report.value) };
            continue;
        }
        yield report;
    }
}

/**
 * Have the first read of the controller report the NOCs value {@link forge} builds, as a malicious node could.
 * Returns a restore function.
 */
function reportNocsOnce(forge: (entries: unknown[]) => unknown[]) {
    const original = ClientInteraction.prototype.read;
    let forged = false;
    ClientInteraction.prototype.read = async function* (
        this: ClientInteraction,
        ...args: Parameters<typeof original>
    ): ReturnType<typeof original> {
        const first = !forged;
        forged = true;
        for await (const chunk of original.apply(this, args)) {
            yield first ? withNocs(chunk, forge) : chunk;
        }
    };
    return () => {
        ClientInteraction.prototype.read = original;
    };
}

/** Replace the NOC of every reported entry with {@link forgedNoc}. */
function forgedNocs(forgedNoc: Bytes) {
    return (entries: unknown[]) =>
        entries.map(entry => (isObject(entry) ? { ...entry, noc: forgedNoc, icac: null } : entry));
}

/**
 * Run an update while the node reports the NOCs value {@link forge} builds; expects a refusal before any fail-safe was
 * armed and before the controller's CA issued a NOC.
 */
async function expectForgedNocsRefused(
    controller: ServerNode,
    device: ServerNode,
    peer: ClientNode,
    forge: (entries: unknown[]) => unknown[],
) {
    const ca = controller.env.get(CertificateAuthority);
    const generateNoc = ca.generateNoc;
    let issued = 0;
    ca.generateNoc = (...args) => {
        issued++;
        return generateNoc.apply(ca, args);
    };
    const { sent: arms, restore: restoreArm } = interceptCommand(
        GeneralCommissioning.Cluster.id,
        ARM_FAIL_SAFE_COMMAND_ID,
        {
            delivered: true,
            answered: true,
        },
    );
    const restoreRead = reportNocsOnce(forge);
    try {
        await expect(
            withEntropy([controller, device], () =>
                MockTime.resolve(peer.updateOperationalCertificate(), { macrotasks: true }),
            ),
        ).rejectedWith(OperationalCertificateUpdateRefusedError, /the certificate it reports did not verify/);
    } finally {
        restoreRead();
        restoreArm();
        ca.generateNoc = generateNoc;
    }

    expect(arms.attempts).equals(0);
    expect(issued).equals(0);
    expect(device.env.get(DeviceCommissioner).isFailsafeArmed).false;
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

        const { handled, restore: restoreDevice } = await countCommissioningComplete(device);
        const restoreController = loseResponse(GeneralCommissioning.Cluster.id, COMMISSIONING_COMPLETE_COMMAND_ID);
        try {
            await update(controller, device, peer);
        } finally {
            restoreController();
            restoreDevice();
        }

        expect(handled.count).equals(1);
        expect(device.env.get(DeviceCommissioner).isFailsafeArmed).false;
        expect(Bytes.areEqual(snapshot(device).operationalCert, before.operationalCert)).false;
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
        ).rejectedWith(OperationalCertificateUpdateBusyError, /another administrator holds the fail-safe/);
        expect(Bytes.areEqual(snapshot(device).operationalCert, before.operationalCert)).true;
    });

    it("reports a refused ArmFailSafe as refused, not busy", async () => {
        await using site = new MockSite();
        const { controller, device } = await site.addCommissionedPair();
        const peer = await subscribedPeer(controller, "peer1");
        const before = snapshot(device);

        const restore = await patchDeviceCommand(
            device,
            GeneralCommissioningServer,
            "armFailSafe",
            original =>
                async function (this: unknown, ...args: unknown[]) {
                    const [request] = args;
                    if (isObject(request) && request.expiryLengthSeconds !== 0) {
                        return {
                            errorCode: GeneralCommissioning.CommissioningError.ValueOutsideRange,
                            debugText: "test refusal",
                        };
                    }
                    return original.apply(this, args);
                },
        );
        try {
            const failure = await withEntropy([controller, device], () =>
                MockTime.resolve(peer.updateOperationalCertificate(), { macrotasks: true }),
            ).then(
                () => undefined,
                (error: unknown) => error,
            );
            expect(failure).instanceOf(OperationalCertificateUpdateRefusedError);
            expect(failure).not.instanceOf(OperationalCertificateUpdateBusyError);
        } finally {
            restore();
        }

        expect(device.env.get(DeviceCommissioner).isFailsafeArmed).false;
        expect(Bytes.areEqual(snapshot(device).operationalCert, before.operationalCert)).true;
    });

    it("arms nothing while Breadcrumb is not 0", async () => {
        await using site = new MockSite();
        const { controller, device } = await site.addCommissionedPair();
        const peer = await subscribedPeer(controller, "peer1");
        const before = snapshot(device);
        await device.setStateOf(GeneralCommissioningServer, { breadcrumb: 7 });

        const { sent: arms, restore } = dropRequests(GeneralCommissioning.Cluster.id, ARM_FAIL_SAFE_COMMAND_ID);
        try {
            await expect(
                withEntropy([controller, device], () =>
                    MockTime.resolve(peer.updateOperationalCertificate(), { macrotasks: true }),
                ),
            ).rejectedWith(OperationalCertificateUpdateBusyError, /Breadcrumb is 7, so another operation/);
        } finally {
            restore();
        }

        expect(arms.attempts).equals(0);
        expect(device.env.get(DeviceCommissioner).isFailsafeArmed).false;
        expect(device.stateOf(GeneralCommissioningServer).breadcrumb).equal(7);
        expect(Bytes.areEqual(snapshot(device).operationalCert, before.operationalCert)).true;
    });

    it("arms nothing when Breadcrumb cannot be read", async () => {
        await using site = new MockSite();
        const { controller, device } = await site.addCommissionedPair();
        const peer = await subscribedPeer(controller, "peer1");

        const { sent: arms, restore: restoreArm } = dropRequests(
            GeneralCommissioning.Cluster.id,
            ARM_FAIL_SAFE_COMMAND_ID,
        );
        const original = ClientInteraction.prototype.read;
        ClientInteraction.prototype.read = async function* (
            this: ClientInteraction,
            ...args: Parameters<typeof original>
        ): ReturnType<typeof original> {
            const [request] = args;
            if (request.attributeRequests?.some(({ clusterId }) => clusterId === GeneralCommissioning.Cluster.id)) {
                throw new PeerUnresponsiveError(Seconds(30));
            }
            yield* original.apply(this, args);
        };
        try {
            await expect(
                withEntropy([controller, device], () =>
                    MockTime.resolve(peer.updateOperationalCertificate(), { macrotasks: true }),
                ),
            ).rejectedWith(OperationalCertificateUpdateError, /keeps its previous certificate/);
        } finally {
            ClientInteraction.prototype.read = original;
            restoreArm();
        }

        expect(arms.attempts).equals(0);
        expect(device.env.get(DeviceCommissioner).isFailsafeArmed).false;
    });

    it("arms nothing when the node reports no Breadcrumb value", async () => {
        await using site = new MockSite();
        const { controller, device } = await site.addCommissionedPair();
        const peer = await subscribedPeer(controller, "peer1");

        const restore = dropAttributeReports(GeneralCommissioning.Cluster.id, BREADCRUMB_ATTRIBUTE_ID);
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

    it("completes the update in recovery when the UpdateNOC answer is lost", async () => {
        await using site = new MockSite();
        const { controller, device } = await site.addCommissionedPair();
        const peer = await subscribedPeer(controller, "peer1");
        const before = snapshot(device);

        const restore = loseUpdateNocResponse();
        try {
            await update(controller, device, peer);
        } finally {
            restore();
        }

        expect(device.env.get(DeviceCommissioner).isFailsafeArmed).false;
        const updated = snapshot(device).operationalCert;
        expect(Bytes.areEqual(updated, before.operationalCert)).false;
        await MockTime.advance(Seconds(120));
        expect(Bytes.areEqual(snapshot(device).operationalCert, updated)).true;
        await nodeLabelReachesController(device, peer, "after lost UpdateNOC answer");
    });

    it("rolls back without CommissioningComplete when UpdateNOC never reached the node", async () => {
        await using site = new MockSite();
        const { controller, device } = await site.addCommissionedPair();
        const peer = await subscribedPeer(controller, "peer1");
        const before = snapshot(device);

        const { handled, restore: restoreDevice } = await countCommissioningComplete(device);
        const { sent, restore: restoreController } = dropRequests(
            OperationalCredentials.Cluster.id,
            UPDATE_NOC_COMMAND_ID,
        );
        try {
            await rejectedUpdate(controller, device, peer, /reverted to its previous certificate/);
        } finally {
            restoreController();
            restoreDevice();
        }

        expect(sent.attempts).equals(1);
        expect(handled.count).equals(0);
        expect(Bytes.areEqual(snapshot(device).operationalCert, before.operationalCert)).true;
    });

    it("arms nothing when the current NOC cannot be read", async () => {
        await using site = new MockSite();
        const { controller, device } = await site.addCommissionedPair();
        const peer = await subscribedPeer(controller, "peer1");

        const { sent: arms, restore: restoreArm } = dropRequests(
            GeneralCommissioning.Cluster.id,
            ARM_FAIL_SAFE_COMMAND_ID,
        );
        const restoreRead = dropAttributeReports(OperationalCredentials.Cluster.id, NOCS_ATTRIBUTE_ID);
        try {
            await expect(
                withEntropy([controller, device], () =>
                    MockTime.resolve(peer.updateOperationalCertificate(), { macrotasks: true }),
                ),
            ).rejectedWith(OperationalCertificateUpdateError, /keeps its previous certificate/);
        } finally {
            restoreRead();
            restoreArm();
        }

        expect(arms.attempts).equals(0);
        expect(device.env.get(DeviceCommissioner).isFailsafeArmed).false;
    });

    it("disarms its own fail-safe and reports an unknown outcome when NOCs is missing after UpdateNOC", async () => {
        await using site = new MockSite();
        const { controller, device } = await site.addCommissionedPair();
        const peer = await subscribedPeer(controller, "peer1");
        const before = snapshot(device);

        let dropping = false;
        const { handled, restore: restoreDevice } = await countCommissioningComplete(device);
        const restoreAnswer = loseUpdateNocResponse(async () => {
            dropping = true;
        });
        const restoreRead = dropAttributeReports(OperationalCredentials.Cluster.id, NOCS_ATTRIBUTE_ID, () => dropping);
        try {
            await expect(
                withEntropy([controller, device], () =>
                    MockTime.resolve(peer.updateOperationalCertificate(), { macrotasks: true }),
                ),
            ).rejectedWith(OperationalCertificateUpdateError, /outcome is unknown/);
        } finally {
            restoreRead();
            restoreAnswer();
            restoreDevice();
        }

        expect(handled.count).equals(0);
        expect(device.env.get(DeviceCommissioner).isFailsafeArmed).false;
        expect(Bytes.areEqual(snapshot(device).operationalCert, before.operationalCert)).true;
    });

    it("refuses a reported NOC that another CA signed", async () => {
        await using site = new MockSite();
        const { controller, device } = await site.addCommissionedPair();
        const peer = await subscribedPeer(controller, "peer1");
        const fabric = deviceFabric(device);

        const otherCa = await CertificateAuthority.create(controller.env.get(Crypto));
        const forgedNoc = await otherCa.generateNoc(fabric.publicKey, fabric.fabricId, fabric.nodeId, [
            CaseAuthenticatedTag(0xfffd_0001),
        ]);

        await expectForgedNocsRefused(controller, device, peer, forgedNocs(forgedNoc));
    });

    it("refuses a reported NOC for another node", async () => {
        await using site = new MockSite();
        const { controller, device } = await site.addCommissionedPair();
        const peer = await subscribedPeer(controller, "peer1");
        const fabric = deviceFabric(device);

        const forgedNoc = await controller.env
            .get(CertificateAuthority)
            .generateNoc(fabric.publicKey, fabric.fabricId, NodeId(0x4242));

        await expectForgedNocsRefused(controller, device, peer, forgedNocs(forgedNoc));
    });

    it("refuses a reported NOC for another fabric", async () => {
        await using site = new MockSite();
        const { controller, device } = await site.addCommissionedPair();
        const peer = await subscribedPeer(controller, "peer1");
        const fabric = deviceFabric(device);

        const forgedNoc = await controller.env
            .get(CertificateAuthority)
            .generateNoc(fabric.publicKey, FabricId(fabric.fabricId + 1n), fabric.nodeId);

        await expectForgedNocsRefused(controller, device, peer, forgedNocs(forgedNoc));
    });

    it("refuses when the node reports more than one NOC for its fabric", async () => {
        await using site = new MockSite();
        const { controller, device } = await site.addCommissionedPair();
        const peer = await subscribedPeer(controller, "peer1");

        await expectForgedNocsRefused(controller, device, peer, entries => [...entries, ...entries]);
    });

    it("keeps the CASE Authenticated Tags of the current NOC", async () => {
        await using site = new MockSite();
        const { controller, device } = await site.addUncommissionedPair();
        await controller.start();
        const ca = controller.env.get(CertificateAuthority);
        const tags = [CaseAuthenticatedTag(0x1234_0001)];
        const generateNoc = ca.generateNoc;
        ca.generateNoc = (publicKey, fabricId, nodeId, caseAuthenticatedTags) =>
            generateNoc.call(ca, publicKey, fabricId, nodeId, caseAuthenticatedTags ?? tags);
        try {
            await withEntropy([controller, device], async () => {
                const { passcode, discriminator } = device.state.commissioning;
                await MockTime.resolve(controller.peers.commission({ passcode, discriminator, timeout: Seconds(90) }), {
                    macrotasks: true,
                });
            });
        } finally {
            ca.generateNoc = generateNoc;
        }
        const nocTags = () => Noc.fromTlv(deviceFabric(device).operationalCert).cert.subject.caseAuthenticatedTags;
        expect(nocTags()).deep.equals(tags);
        const peer = await subscribedPeer(controller, "peer1");
        const before = snapshot(device);

        await update(controller, device, peer);

        expect(Bytes.areEqual(snapshot(device).operationalCert, before.operationalCert)).false;
        expect(nocTags()).deep.equals(tags);
    });

    it("keeps the new NOC when CommissioningComplete committed but another operation's commit answered NoFailSafe", async () => {
        await using site = new MockSite();
        const { controller, device } = await site.addCommissionedPair();
        const peer = await subscribedPeer(controller, "peer1");
        const before = snapshot(device);

        const restore = await patchDeviceCommand(
            device,
            GeneralCommissioningServer,
            "commissioningComplete",
            original =>
                async function (this: unknown, ...args: unknown[]) {
                    await original.apply(this, args);
                    return { errorCode: GeneralCommissioning.CommissioningError.NoFailSafe, debugText: "" };
                },
        );
        try {
            await update(controller, device, peer);
        } finally {
            restore();
        }

        expect(device.env.get(DeviceCommissioner).isFailsafeArmed).false;
        expect(Bytes.areEqual(snapshot(device).operationalCert, before.operationalCert)).false;
    });

    it("rolls back when the node answers CommissioningComplete with an error status", async () => {
        await using site = new MockSite();
        const { controller, device } = await site.addCommissionedPair();
        const peer = await subscribedPeer(controller, "peer1");
        const before = snapshot(device);

        let attempts = 0;
        const restore = await patchDeviceCommand(
            device,
            GeneralCommissioningServer,
            "commissioningComplete",
            () => async () => {
                attempts++;
                throw new StatusResponseError("Refused by test", Status.ConstraintError);
            },
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
        expect(failure)
            .property("message")
            .match(/reverted to its previous certificate/);
        expect(causedBy(failure, StatusResponseError)).true;
        expect(device.env.get(DeviceCommissioner).isFailsafeArmed).false;
        expect(attempts).equals(1);
        expect(Bytes.areEqual(snapshot(device).operationalCert, before.operationalCert)).true;
    });

    it("skips the recovery when aborted after UpdateNOC", async () => {
        await using site = new MockSite();
        const { controller, device } = await site.addCommissionedPair();
        const peer = await subscribedPeer(controller, "peer1");

        const abort = new AbortController();
        const restoreController = afterResponse(OperationalCredentials.Cluster.id, UPDATE_NOC_COMMAND_ID, async () =>
            abort.abort(new FabricChangedError("aborted by test")),
        );
        const original = SessionManager.prototype.deleteResumptionRecord;
        let cleanups = 0;
        SessionManager.prototype.deleteResumptionRecord = async function (this: SessionManager, address: PeerAddress) {
            cleanups++;
            return original.call(this, address);
        };
        try {
            await expect(
                withEntropy([controller, device], () =>
                    MockTime.resolve(peer.updateOperationalCertificate({ abort: abort.signal }), { macrotasks: true }),
                ),
            ).rejectedWith(OperationalCertificateUpdateError, /outcome is unknown/);
        } finally {
            SessionManager.prototype.deleteResumptionRecord = original;
            restoreController();
        }

        expect(cleanups).equals(1);
    });

    it("forgets the sessions when aborted after a lost UpdateNOC answer", async () => {
        await using site = new MockSite();
        const { controller, device } = await site.addCommissionedPair();
        const peer = await subscribedPeer(controller, "peer1");

        const abort = new AbortController();
        const restoreController = loseUpdateNocResponse(async () =>
            abort.abort(new FabricChangedError("aborted by test")),
        );
        const original = SessionManager.prototype.deleteResumptionRecord;
        let cleanups = 0;
        SessionManager.prototype.deleteResumptionRecord = async function (this: SessionManager, address: PeerAddress) {
            cleanups++;
            return original.call(this, address);
        };
        try {
            await expect(
                withEntropy([controller, device], () =>
                    MockTime.resolve(peer.updateOperationalCertificate({ abort: abort.signal }), { macrotasks: true }),
                ),
            ).rejectedWith(OperationalCertificateUpdateError, /outcome is unknown/);
        } finally {
            SessionManager.prototype.deleteResumptionRecord = original;
            restoreController();
        }

        expect(cleanups).equals(1);
    });

    it("reports the previous certificate when the fail-safe ended before the update completed", async () => {
        await using site = new MockSite();
        const { controller, device } = await site.addCommissionedPair();
        const peer = await subscribedPeer(controller, "peer1");
        const before = snapshot(device);

        const { handled, restore: restoreDevice } = await countCommissioningComplete(device);
        const restoreController = loseUpdateNocResponse(() => expireFailsafe(device));
        const { sent: arms, restore: restoreArms } = interceptCommand(
            GeneralCommissioning.Cluster.id,
            ARM_FAIL_SAFE_COMMAND_ID,
            { delivered: true, answered: true },
        );
        try {
            await rejectedUpdate(controller, device, peer, /reverted to its previous certificate/);
        } finally {
            restoreArms();
            restoreController();
            restoreDevice();
        }

        // Only the arm at the start: a fail-safe that already ended is not disarmed
        expect(arms.attempts).equals(1);
        expect(handled.count).equals(0);
        expect(Bytes.areEqual(snapshot(device).operationalCert, before.operationalCert)).true;
        await nodeLabelReachesController(device, peer, "after expired fail-safe");
    });

    it("reports an unknown outcome when the disarm after a refused CommissioningComplete fails", async () => {
        await using site = new MockSite();
        const { controller, device } = await site.addCommissionedPair();
        const peer = await subscribedPeer(controller, "peer1");
        const before = snapshot(device);

        const restoreDisarm = await refuseDisarm(device);
        const restoreComplete = await patchDeviceCommand(
            device,
            GeneralCommissioningServer,
            "commissioningComplete",
            () => async () => ({
                errorCode: GeneralCommissioning.CommissioningError.ValueOutsideRange,
                debugText: "test refusal",
            }),
        );
        const startedAt = Time.nowMs;
        try {
            await expect(
                withEntropy([controller, device], () =>
                    MockTime.resolve(peer.updateOperationalCertificate(), { macrotasks: true }),
                ),
            ).rejectedWith(OperationalCertificateUpdateError, /outcome is unknown/);
        } finally {
            restoreComplete();
            restoreDisarm();
        }

        expect(Time.nowMs - startedAt).lessThan(60_000);
        expect(device.env.get(DeviceCommissioner).isFailsafeArmed).true;
        await MockTime.resolve(MockTime.sleep("fail-safe expiry", Seconds(70)), { macrotasks: true });
        expect(device.env.get(DeviceCommissioner).isFailsafeArmed).false;
        expect(Bytes.areEqual(snapshot(device).operationalCert, before.operationalCert)).true;
    });

    it("reports an unknown outcome when the previous NOC is back but Breadcrumb is not 0", async () => {
        await using site = new MockSite();
        const { controller, device } = await site.addCommissionedPair();
        const peer = await subscribedPeer(controller, "peer1");

        const restore = loseUpdateNocResponse(async () => {
            await expireFailsafe(device);
            await device.setStateOf(GeneralCommissioningServer, { breadcrumb: 7 });
        });
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

    it("reports an unknown outcome when the node reports no NOCs value", async () => {
        await using site = new MockSite();
        const { controller, device } = await site.addCommissionedPair();
        const peer = await subscribedPeer(controller, "peer1");

        let dropping = false;
        const restoreAnswer = loseUpdateNocResponse(async () => {
            await expireFailsafe(device);
            dropping = true;
        });
        const restoreRead = dropAttributeReports(OperationalCredentials.Cluster.id, NOCS_ATTRIBUTE_ID, () => dropping);
        try {
            await expect(
                withEntropy([controller, device], () =>
                    MockTime.resolve(peer.updateOperationalCertificate(), { macrotasks: true }),
                ),
            ).rejectedWith(OperationalCertificateUpdateError, /outcome is unknown/);
        } finally {
            restoreRead();
            restoreAnswer();
        }
    });

    it("disarms a fail-safe another operation of the fabric re-armed after UpdateNOC", async () => {
        await using site = new MockSite();
        const { controller, device } = await site.addCommissionedPair();
        const peer = await subscribedPeer(controller, "peer1");
        const before = snapshot(device);

        const { handled, restore: restoreDevice } = await countCommissioningComplete(device);
        const restoreController = afterResponse(OperationalCredentials.Cluster.id, UPDATE_NOC_COMMAND_ID, () =>
            device.setStateOf(GeneralCommissioningServer, { breadcrumb: 7 }),
        );
        try {
            await rejectedUpdate(controller, device, peer, /reverted to its previous certificate/);
        } finally {
            restoreController();
            restoreDevice();
        }

        expect(handled.count).equals(0);
        expect(device.stateOf(GeneralCommissioningServer).breadcrumb).equal(0);
        expect(Bytes.areEqual(snapshot(device).operationalCert, before.operationalCert)).true;
    });

    it("reports an unknown outcome when the node refuses to disarm a foreign fail-safe", async () => {
        await using site = new MockSite();
        const { controller, device } = await site.addCommissionedPair();
        const peer = await subscribedPeer(controller, "peer1");

        const { handled, restore: restoreCount } = await countCommissioningComplete(device);
        const restoreDisarm = await refuseDisarm(device);
        const restoreController = afterResponse(OperationalCredentials.Cluster.id, UPDATE_NOC_COMMAND_ID, () =>
            device.setStateOf(GeneralCommissioningServer, { breadcrumb: 7 }),
        );
        try {
            await expect(
                withEntropy([controller, device], () =>
                    MockTime.resolve(peer.updateOperationalCertificate(), { macrotasks: true }),
                ),
            ).rejectedWith(OperationalCertificateUpdateError, /outcome is unknown/);
        } finally {
            restoreController();
            restoreDisarm();
            restoreCount();
        }

        expect(handled.count).equals(0);
        expect(device.env.get(DeviceCommissioner).isFailsafeArmed).true;
        expect(device.stateOf(GeneralCommissioningServer).breadcrumb).equal(7);
    });

    it("disarms a fail-safe re-armed with Breadcrumb 0 while the new NOC is pending", async () => {
        await using site = new MockSite();
        const { controller, device } = await site.addCommissionedPair();
        const peer = await subscribedPeer(controller, "peer1");
        const before = snapshot(device);

        const { handled, restore: restoreDevice } = await countCommissioningComplete(device);
        const restoreController = afterResponse(OperationalCredentials.Cluster.id, UPDATE_NOC_COMMAND_ID, () =>
            device.setStateOf(GeneralCommissioningServer, { breadcrumb: 0 }),
        );
        try {
            await rejectedUpdate(controller, device, peer, /reverted to its previous certificate/);
        } finally {
            restoreController();
            restoreDevice();
        }

        expect(handled.count).equals(0);
        expect(Bytes.areEqual(snapshot(device).operationalCert, before.operationalCert)).true;
    });

    it("tries CommissioningComplete once more and then reports an unknown outcome", async () => {
        await using site = new MockSite();
        const { controller, device } = await site.addCommissionedPair();
        const peer = await subscribedPeer(controller, "peer1");

        const { sent, restore } = dropRequests(GeneralCommissioning.Cluster.id, COMMISSIONING_COMPLETE_COMMAND_ID);
        try {
            await expect(
                withEntropy([controller, device], () =>
                    MockTime.resolve(peer.updateOperationalCertificate(), { macrotasks: true }),
                ),
            ).rejectedWith(OperationalCertificateUpdateError, /outcome is unknown/);
        } finally {
            restore();
        }

        expect(sent.attempts).equals(2);
        expect(device.env.get(DeviceCommissioner).isFailsafeArmed).true;
    });

    it("reports an unknown outcome when Breadcrumb is not 0 again after the disarm", async () => {
        await using site = new MockSite();
        const { controller, device } = await site.addCommissionedPair();
        const peer = await subscribedPeer(controller, "peer1");

        let completed = false;
        const restoreComplete = loseResponse(
            GeneralCommissioning.Cluster.id,
            COMMISSIONING_COMPLETE_COMMAND_ID,
            async () => {
                completed = true;
            },
        );
        const { restore: restoreArm } = interceptCommand(GeneralCommissioning.Cluster.id, ARM_FAIL_SAFE_COMMAND_ID, {
            delivered: true,
            answered: true,
            afterDelivery: async () => {
                if (completed) {
                    await device.setStateOf(GeneralCommissioningServer, { breadcrumb: 7 });
                }
            },
        });
        try {
            await expect(
                withEntropy([controller, device], () =>
                    MockTime.resolve(peer.updateOperationalCertificate(), { macrotasks: true }),
                ),
            ).rejectedWith(OperationalCertificateUpdateError, /outcome is unknown/);
        } finally {
            restoreArm();
            restoreComplete();
        }
    });

    it("reports an unknown outcome when the disarm of a Breadcrumb 0 fail-safe fails", async () => {
        await using site = new MockSite();
        const { controller, device } = await site.addCommissionedPair();
        const peer = await subscribedPeer(controller, "peer1");

        const { handled, restore: restoreCount } = await countCommissioningComplete(device);
        const restoreDisarm = await refuseDisarm(device);
        const restoreController = afterResponse(OperationalCredentials.Cluster.id, UPDATE_NOC_COMMAND_ID, () =>
            device.setStateOf(GeneralCommissioningServer, { breadcrumb: 0 }),
        );
        try {
            await expect(
                withEntropy([controller, device], () =>
                    MockTime.resolve(peer.updateOperationalCertificate(), { macrotasks: true }),
                ),
            ).rejectedWith(OperationalCertificateUpdateError, /outcome is unknown/);
        } finally {
            restoreController();
            restoreDisarm();
            restoreCount();
        }

        expect(handled.count).equals(0);
        expect(device.env.get(DeviceCommissioner).isFailsafeArmed).true;
    });

    it("disarms a foreign fail-safe in recovery after a lost UpdateNOC answer", async () => {
        await using site = new MockSite();
        const { controller, device } = await site.addCommissionedPair();
        const peer = await subscribedPeer(controller, "peer1");

        const { handled, restore: restoreDevice } = await countCommissioningComplete(device);
        const restore = loseUpdateNocResponse(() => device.setStateOf(GeneralCommissioningServer, { breadcrumb: 7 }));
        try {
            await rejectedUpdate(controller, device, peer, /reverted to its previous certificate/);
        } finally {
            restore();
            restoreDevice();
        }

        expect(handled.count).equals(0);
        expect(device.stateOf(GeneralCommissioningServer).breadcrumb).equal(0);
    });

    it("completes the update in recovery when dropping the resumption record fails after UpdateNOC", async () => {
        await using site = new MockSite();
        const { controller, device } = await site.addCommissionedPair();
        const peer = await subscribedPeer(controller, "peer1");
        const before = snapshot(device);

        const original = SessionManager.prototype.deleteResumptionRecord;
        let failed = false;
        SessionManager.prototype.deleteResumptionRecord = async function (this: SessionManager, address: PeerAddress) {
            if (!failed) {
                failed = true;
                throw new StorageError("test storage failure");
            }
            return original.call(this, address);
        };
        try {
            await update(controller, device, peer);
        } finally {
            SessionManager.prototype.deleteResumptionRecord = original;
        }

        expect(failed).true;
        expect(device.env.get(DeviceCommissioner).isFailsafeArmed).false;
        expect(Bytes.areEqual(snapshot(device).operationalCert, before.operationalCert)).false;
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
