/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { Behavior } from "#behavior/Behavior.js";
import { Events as BaseEvents } from "#behavior/Events.js";
import { SoftwareUpdateManager } from "#behavior/system/software-update/SoftwareUpdateManager.js";
import { AdministratorCommissioningClient } from "#behaviors/administrator-commissioning";
import { BasicInformationClient } from "#behaviors/basic-information";
import { OperationalCredentialsClient } from "#behaviors/operational-credentials";
import { OtaSoftwareUpdateProviderServer } from "#behaviors/ota-software-update-provider";
import type { ClientNode } from "#node/ClientNode.js";
import { IdentityConflictError, IdentityService } from "#node/server/IdentityService.js";
import type { ServerNode } from "#node/ServerNode.js";
import {
    causedBy,
    ClassExtends,
    Crypto,
    CRYPTO_PBKDF_ITERATIONS_MIN,
    Diagnostic,
    Duration,
    ImplementationError,
    Logger,
    MatterError,
    Minutes,
    NotImplementedError,
    Observable,
    Seconds,
    ServerAddress,
    Time,
    Timestamp,
} from "@matter/general";
import {
    bool,
    datatype,
    duration,
    fabricIdx,
    field,
    listOf,
    mandatory,
    map16,
    nodeId,
    nonvolatile,
    string,
    systimeMs,
    uint16,
    uint32,
    uint8,
    vendorId,
} from "@matter/model";
import type { ClientInteraction, PeerDescriptor, SupportedTransportsBitmap } from "@matter/protocol";
import {
    CommissioningMode,
    ControllerCommissioner,
    ControllerCommissioningFlow,
    ControllerCommissioningFlowOptions,
    DeviceAttestationValidator,
    DiscoveryData,
    Fabric,
    FabricAuthority,
    FabricManager,
    FabricRemovedError,
    LocatedNodeCommissioningOptions,
    OperationalAddress,
    PaseClient,
    Peer,
    PeerAddress,
    PeerInitiatedCloseError,
    PeerLeftError,
    PeerMessageMissingError,
    PeerSet,
    PeerTimingParameters,
    PeerAddress as ProtocolPeerAddress,
    SessionParameters as ProtocolSessionParameters,
    Subscribe,
} from "@matter/protocol";
import {
    CaseAuthenticatedTag,
    CommissioningFlowType,
    DeviceTypeId,
    DiscoveryCapabilitiesBitmap,
    DiscoveryCapabilitiesSchema,
    FabricIndex,
    ManualPairingCodeCodec,
    NodeId,
    QrPairingCodeCodec,
    Status,
    StatusResponseError,
    TypeFromPartialBitSchema,
    VendorId,
} from "@matter/types";
import { AdministratorCommissioning } from "@matter/types/clusters/administrator-commissioning";
import { OperationalCredentials } from "@matter/types/clusters/operational-credentials";
import { ControllerBehavior } from "../controller/ControllerBehavior.js";
import { NetworkClient } from "../network/NetworkClient.js";
import { RemoteDescriptor } from "./RemoteDescriptor.js";

const logger = Logger.get("CommissioningClient");

/**
 * Client functionality related to commissioning.
 *
 * Updates node state based on commissioning status and commissions new nodes.
 */
export class CommissioningClient extends Behavior {
    declare internal: CommissioningClient.Internal;
    declare readonly state: CommissioningClient.State;
    declare readonly events: CommissioningClient.Events;

    static override readonly early = true;

    static override readonly id = "commissioning";

    override initialize(options: { descriptor?: RemoteDescriptor }) {
        const descriptor = options?.descriptor;
        if (descriptor) {
            this.descriptor = descriptor;
        }

        if (this.state.discoveredAt === undefined) {
            this.state.discoveredAt = Time.nowMs;
        }

        // Defends against storage corruption / direct state manipulation; backfill from
        // OperationalCredentialsClient recovers on partsReady.
        const persistedFabricIndexOnPeer = this.state.fabricIndexOnPeer;
        if (persistedFabricIndexOnPeer !== undefined && !FabricIndex.isValid(persistedFabricIndexOnPeer)) {
            logger.warn(
                `Discarding invalid persisted fabricIndexOnPeer ${persistedFabricIndexOnPeer} for ${this.endpoint}`,
            );
            this.state.fabricIndexOnPeer = undefined;
        }

        if (this.state.peerAddress !== undefined) {
            // And ensure we are coupled to the Peer instance
            this.#bindPeer(this.state.peerAddress);
        }

        const node = this.endpoint as ClientNode;
        this.reactTo(node.lifecycle.partsReady, this.#initializeNode);
        this.reactTo(this.events.peerAddress$Changed, this.#peerAddressChanged);
        this.reactTo(this.events.addresses$Changed, this.#operationalAddressesChanged);
        this.reactTo(this.events.caseAuthenticatedTags$Changed, this.#catsChanged);
    }

    override [Symbol.asyncDispose]() {
        const peer = this.endpoint.env.maybeGet(Peer);
        if (peer) {
            this.#unbindPeer(peer.address);
        }
    }

    #findServerOtaProviderEndpoint() {
        const node = this.endpoint.owner as ServerNode;
        for (const endpoint of node.endpoints) {
            if (endpoint.behaviors.has(OtaSoftwareUpdateProviderServer)) {
                return endpoint;
            }
        }
    }

    commission(passcode: number | string): Promise<ClientNode>;
    commission(options: CommissioningClient.CommissioningOptions): Promise<ClientNode>;
    async commission(options: number | string | CommissioningClient.CommissioningOptions) {
        // Commissioning can only happen once
        const node = this.endpoint as ClientNode;
        if (this.state.peerAddress !== undefined) {
            throw new ImplementationError(`${node} is already commissioned`);
        }

        if (typeof options === "number") {
            options = { passcode: options };
        } else if (typeof options === "string") {
            options = { pairingCode: options };
        }
        const opts = CommissioningClient.PasscodeOptions(options) as CommissioningClient.PasscodeOptions;

        // Validate passcode
        let { passcode } = opts;
        if (!Number.isFinite(passcode)) {
            passcode = Number.parseInt(passcode as unknown as string);
            if (!Number.isFinite(passcode)) {
                throw new ImplementationError(`You must provide the numeric passcode to commission a node`);
            }
        }

        // Ensure the controller is initialized
        await node.owner.act(agent => agent.load(ControllerBehavior));
        const controller = node.owner.agentFor(this.context).get(ControllerBehavior);

        // Get the fabric we will commission into
        const fabricAuthority = opts.fabricAuthority ?? this.env.get(FabricAuthority);
        let { fabric } = opts;
        if (fabric === undefined) {
            if (this.context.fabric === undefined) {
                const config = await node.owner?.act(agent => agent.get(ControllerBehavior).fabricAuthorityConfig);
                if (config === undefined) {
                    throw new ImplementationError(
                        `Cannot commission ${node} because no fabric was specified and the controller has no fabric configuration`,
                    );
                }
                fabric = await fabricAuthority.defaultFabric(config);
            } else {
                fabric = node.env.get(FabricManager).for(this.context.fabric);
            }
        }

        if (!fabricAuthority.hasControlOf(fabric)) {
            throw new ImplementationError(
                `Cannot commission ${node} fabric ${fabric.fabricIndex} because we do not control this fabric`,
            );
        }

        const addresses = this.state.addresses;
        if (!addresses?.length) {
            throw new ImplementationError(`Cannot commission ${node} because the node has not been located`);
        }

        const identity = this.env.get(IdentityService);

        // Reservation is deferred to the post-PASE gate below, so fast-fail an explicit node ID that is already
        // taken (a commissioned peer or the controller's own identity) here instead of only after discovery+PASE.
        if (
            opts.nodeId !== undefined &&
            identity.peerAddressInUse({ fabricIndex: fabric.fabricIndex, nodeId: opts.nodeId })
        ) {
            throw new IdentityConflictError(
                `Cannot assign NodeId ${opts.nodeId} on fabric ${fabric.fabricIndex}: the peer address is already in use`,
            );
        }

        const commissioner = node.env.get(ControllerCommissioner);

        // Claim the node ID only once a candidate wins PASE.  Parallel candidates share one supplied node ID, so
        // reserving before PASE would fail every loser with an identity conflict; only the winner reserves here.
        const raceGate = options.continueCommissioningAfterPase;
        let allocatedAddress: PeerAddress | undefined;
        const claimNodeIdAfterPase = async () => {
            if (raceGate !== undefined && !raceGate()) {
                return undefined;
            }
            allocatedAddress = await controller.allocatePeerAddress(fabric.fabricIndex, opts.nodeId);
            return allocatedAddress.nodeId;
        };

        const commissioningOptions: LocatedNodeCommissioningOptions = {
            addresses: addresses.map(ServerAddress),
            fabric,
            nodeId: opts.nodeId,
            passcode,
            discoveryData: this.descriptor,
            commissioningFlowImpl: options.commissioningFlowImpl,
            onAttestationFailure: options.onAttestationFailure,
            abort: options.abort,
            claimNodeIdAfterPase,
            wifiNetwork: options.wifiNetwork,
            threadNetwork: options.threadNetwork,
            regulatoryLocation: options.regulatoryLocation,
            regulatoryCountryCode: options.regulatoryCountryCode,
            timeout: options.timeout,
            caseConnectionTiming: options.caseConnectionTiming ?? defaultCaseConnectionTiming,
        };

        // Check if our server has an OTA Provider (later: and no custom one is provided) and register the location
        const otaProviderEndpoint = this.#findServerOtaProviderEndpoint();
        if (
            otaProviderEndpoint !== undefined &&
            otaProviderEndpoint.stateOf(SoftwareUpdateManager).announceAsDefaultProvider
        ) {
            commissioningOptions.otaUpdateProviderLocation = {
                nodeId: fabric.rootNodeId,
                endpoint: otaProviderEndpoint.number,
            };
        }

        if (options.finalizeCommissioning !== undefined) {
            commissioningOptions.finalizeCommissioning = options.finalizeCommissioning;
        } else if (this.finalizeCommissioning !== CommissioningClient.prototype.finalizeCommissioning) {
            commissioningOptions.finalizeCommissioning = this.finalizeCommissioning.bind(this);
        }

        try {
            const { address, fabricIndexOnPeer } = await commissioner.commission(commissioningOptions);
            this.state.peerAddress = address;
            this.state.commissionedAt = Time.nowMs;
            this.state.fabricIndexOnPeer = fabricIndexOnPeer;

            // Apply changes from the peer
            await this.#update(this.env.get(PeerSet).for(address));
        } catch (e) {
            if (allocatedAddress !== undefined) {
                identity.releasePeerAddress(allocatedAddress);
            }
            throw e;
        }

        if (opts.caseAuthenticatedTags !== undefined) {
            this.state.caseAuthenticatedTags = opts.caseAuthenticatedTags;
        }

        const network = this.agent.get(NetworkClient);
        network.state.defaultSubscription = opts.defaultSubscription;
        // Nodes we commission are auto-subscribed by default, unless disabled explicitly
        network.state.autoSubscribe = opts.autoSubscribe !== false;
        network.state.autoStateInitialize = opts.autoStateInitialize;

        network.internal.isNewlyCommissioned = true;

        await this.context.transaction.commit();

        logger.notice(
            "Commissioned",
            Diagnostic.strong(this.endpoint.id),
            "as",
            Diagnostic.strong(this.endpoint.identity),
        );

        node.lifecycle.commissioned.emit(this.context);

        await node.start();

        return node;
    }

    /**
     * Remove this node from the fabric.
     *
     * After removal the {@link ClientNode} remains intact.  You can use {@link ClientNode#delete} to remove the node
     * permanently.
     *
     * Only legal if this node controls the peer's fabric.
     */
    async decommission() {
        const { peerAddress } = this.state;

        if (peerAddress === undefined) {
            throw new ImplementationError("Cannot decommission node that is not commissioned");
        }

        const formerAddress = ProtocolPeerAddress(peerAddress).toString();

        const opcreds = this.agent.get(OperationalCredentialsClient);

        const fabricIndex = opcreds.state.currentFabricIndex;

        // Removing the fabric we communicate over destroys the session the NocResponse must travel on, so the response
        // is frequently lost.  Treat the command as confirmed if it was delivered (transient peer error) or if a
        // matching leave event arrives.  Arm the listener before sending so a fast leave cannot be missed.
        let leaveSeen = false;
        const leaveEvents = this.endpoint.eventsOf(BasicInformationClient).leave;
        const onLeave = ({ fabricIndex: leftFabricIndex }: { fabricIndex: FabricIndex }) => {
            // Ignore leaves replayed during subscription establishment; they may be stale events from a prior
            // commissioning with the same identifier, matching the guard in Peers#onLeave.
            if (leftFabricIndex === fabricIndex && this.agent.get(NetworkClient).subscriptionActive) {
                leaveSeen = true;
            }
        };
        leaveEvents?.on(onLeave);

        try {
            logger.debug(`Removing node ${formerAddress} by removing fabric ${fabricIndex} on the node`);

            // A non-Ok status is an explicit refusal and must never be overridden by a leave event.
            let nonOkFailure: MatterError | undefined;
            try {
                const result = await opcreds.removeFabric({ fabricIndex });
                if (result.statusCode !== OperationalCredentials.NodeOperationalCertStatus.Ok) {
                    nonOkFailure = new MatterError(
                        `Removing node ${formerAddress} failed with status ${result.statusCode} "${result.debugText}".`,
                    );
                }
            } catch (error) {
                if (
                    leaveSeen ||
                    causedBy(error, PeerMessageMissingError, PeerLeftError, FabricRemovedError, PeerInitiatedCloseError)
                ) {
                    logger.info(
                        `Node ${formerAddress} removal confirmed without response`,
                        `(${leaveSeen ? "leave event" : "session closed"})`,
                    );
                } else {
                    throw error;
                }
            }
            if (nonOkFailure !== undefined) {
                throw nonOkFailure;
            }

            // Removal confirmed.  Must run before commit unbinds Peer via peerAddress$Changed.
            const node = this.endpoint as ClientNode;
            try {
                await node.env.maybeGet(Peer)?.disconnect(new PeerLeftError());
            } catch (error) {
                logger.warn(`Error force-closing sessions for ${formerAddress} after decommission:`, error);
            }

            this.state.peerAddress = undefined;
            this.state.commissionedAt = undefined;
            this.state.fabricIndexOnPeer = undefined;

            await this.context.transaction.commit();

            logger.info(
                "Decommissioned",
                Diagnostic.strong(this.endpoint.id),
                "formerly",
                Diagnostic.strong(formerAddress),
            );
        } finally {
            leaveEvents?.off(onLeave);
        }
    }

    /**
     * Open a Basic Commissioning Window (uses the passcode originally printed on the device).
     *
     * This is an optional feature and not all devices support it; use {@link openEnhancedCommissioningWindow} unless
     * you specifically need the basic commissioning method.
     */
    async openBasicCommissioningWindow(commissioningTimeout: Duration = Seconds(900)) {
        if (!this.endpoint.featuresOf(AdministratorCommissioningClient).basic) {
            throw new ImplementationError(`${this.endpoint} does not support the basic commissioning method`);
        }

        const adminCommissioning = this.agent.get(AdministratorCommissioningClient);
        await this.#revokeStaleCommissioningWindow(adminCommissioning);

        await adminCommissioning.openBasicCommissioningWindow({
            commissioningTimeout: Seconds.of(commissioningTimeout),
        });
    }

    /**
     * Open an Enhanced Commissioning Window using a freshly generated random passcode.
     *
     * Requires the peer's BasicInformation to already be seeded, else the QR pairing code's vendor/product ID
     * fields are absent (the passcode and discriminator, and thus pairing, remain unaffected).
     *
     * @returns the manual and QR pairing codes encoding the generated passcode.
     */
    async openEnhancedCommissioningWindow(
        commissioningTimeout: Duration = Seconds(900),
    ): Promise<{ manualPairingCode: string; qrPairingCode: string }> {
        const adminCommissioning = this.agent.get(AdministratorCommissioningClient);
        await this.#revokeStaleCommissioningWindow(adminCommissioning);

        const crypto = this.env.get(Crypto);
        const discriminator = PaseClient.generateRandomDiscriminator(crypto);
        const passcode = PaseClient.generateRandomPasscode(crypto);
        const salt = crypto.randomBytes(32);
        const iterations = CRYPTO_PBKDF_ITERATIONS_MIN;
        const pakePasscodeVerifier = await PaseClient.generatePakePasscodeVerifier(crypto, passcode, {
            iterations,
            salt,
        });

        await adminCommissioning.openCommissioningWindow({
            commissioningTimeout: Seconds.of(commissioningTimeout),
            pakePasscodeVerifier,
            salt,
            iterations,
            discriminator,
        });

        const { vendorId, productId } = this.agent.get(BasicInformationClient).state;

        // TODO: If the timeout is shorter than 15 minutes, also encode it in the QR code's TLV data.
        const qrPairingCode = QrPairingCodeCodec.encode([
            {
                version: 0,
                vendorId,
                productId,
                flowType: CommissioningFlowType.Standard,
                discriminator,
                passcode,
                discoveryCapabilities: DiscoveryCapabilitiesSchema.encode({ onIpNetwork: true }),
            },
        ]);

        return {
            manualPairingCode: ManualPairingCodeCodec.encode({
                discriminator,
                passcode,
                flowType: CommissioningFlowType.Standard,
            }),
            qrPairingCode,
        };
    }

    /** Tolerates the device reporting that no window is currently open, so a stale window can be revoked blindly. */
    async #revokeStaleCommissioningWindow(adminCommissioning: AdministratorCommissioningClient) {
        try {
            await adminCommissioning.revokeCommissioning();
        } catch (error) {
            if (
                !StatusResponseError.is(error, Status.Failure) ||
                StatusResponseError.of(error)?.clusterCode !== AdministratorCommissioning.StatusCode.WindowNotOpen
            ) {
                throw error;
            }
        }
    }

    /**
     * Override to implement CASE commissioning yourself.
     *
     * If you override, matter.js commissions to the point where commissioning over PASE is complete.  You must then
     * complete commissioning yourself by connecting to the device and invoking the "CommissioningComplete" command.
     */
    protected async finalizeCommissioning(_address: ProtocolPeerAddress, _discoveryData?: DiscoveryData) {
        throw new NotImplementedError();
    }

    get descriptor() {
        return RemoteDescriptor.fromLongForm(this.state);
    }

    set descriptor(descriptor: RemoteDescriptor | undefined) {
        RemoteDescriptor.toLongForm(descriptor, this.state);
    }

    #initializeNode() {
        const endpoint = this.endpoint as ClientNode;
        this.#backfillFabricIndexOnPeer();

        // If the synchronous backfill missed (OpCreds subscription still in-flight), self-heal on the next
        // currentFabricIndex update.  Reactor is idempotent — once state is filled it short-circuits.
        if (this.state.fabricIndexOnPeer === undefined && this.endpoint.behaviors.has(OperationalCredentialsClient)) {
            this.reactTo(
                this.endpoint.eventsOf(OperationalCredentialsClient).currentFabricIndex$Changed,
                this.#backfillFabricIndexOnPeer,
            );
        }

        endpoint.lifecycle.initialized.emit(this.state.peerAddress !== undefined);
    }

    /** Recover `state.fabricIndexOnPeer` from `OperationalCredentialsClient.currentFabricIndex` when missing. */
    #backfillFabricIndexOnPeer() {
        if (this.state.peerAddress === undefined || this.state.fabricIndexOnPeer !== undefined) {
            return;
        }
        const value = this.endpoint.maybeStateOf(OperationalCredentialsClient)?.currentFabricIndex;
        if (value !== undefined && value !== FabricIndex.NO_FABRIC) {
            this.state.fabricIndexOnPeer = value;
        }
    }

    #operationalAddressesChanged(newAddresses: ServerAddress[] | undefined, oldAddresses: ServerAddress[] | undefined) {
        // Log when addresses change
        if (newAddresses === undefined) {
            logger.info("Operational address for", Diagnostic.strong(PeerAddress(this.state.peerAddress)), "cleared");
            return;
        }

        const newAddressesStr = newAddresses
            ?.filter(a => ServerAddress.isIp(a))
            .map(a => ServerAddress.urlFor(a))
            .join(", ");
        if (oldAddresses === undefined) {
            logger.info(
                "Operational address for",
                Diagnostic.strong(PeerAddress(this.state.peerAddress)),
                "set to",
                Diagnostic.weak(newAddressesStr),
            );
            return;
        }

        const oldAddressesStr = oldAddresses
            .filter(a => ServerAddress.isIp(a))
            .map(a => ServerAddress.urlFor(a))
            .join(", ");
        if (oldAddressesStr !== newAddressesStr) {
            logger.info(
                "Operational address changed for",
                Diagnostic.strong(PeerAddress(this.state.peerAddress)),
                "from",
                Diagnostic.weak(oldAddressesStr),
                "to",
                Diagnostic.weak(newAddressesStr),
            );
        }
    }

    #peerAddressChanged(addr?: ProtocolPeerAddress, oldAddr?: ProtocolPeerAddress) {
        const node = this.endpoint as ClientNode;
        if (addr) {
            this.#bindPeer(addr);
            node.lifecycle.commissioned.emit(this.context);
        } else if (oldAddr) {
            this.#unbindPeer(oldAddr, true);
            node.lifecycle.decommissioned.emit(this.context);
        }
    }

    #catsChanged(cats?: CaseAuthenticatedTag[]) {
        if (!this.state.peerAddress) {
            return;
        }

        const node = this.endpoint as ClientNode;
        if (!node.env.has(PeerSet)) {
            return;
        }

        const peer = node.env.get(PeerSet).for(this.state.peerAddress);
        if (!peer) {
            return;
        }

        peer.descriptor.caseAuthenticatedTags = cats;
    }

    /**
     * Couple my {@link ClientNode} with the equivalent {@link Peer}.
     */
    #bindPeer(addr: PeerAddress) {
        const node = this.endpoint as ClientNode;
        let peer = node.env.maybeGet(Peer);
        if (peer) {
            if (PeerAddress.is(peer.address, addr) && node.env.get(PeerSet).has(peer)) {
                // Already bound and present in PeerSet
                return;
            }

            // Peer address changed or peer was removed from PeerSet; rebind
            this.#unbindPeer(peer.address);
        }

        const peers = node.env.get(PeerSet);
        peer = peers.addKnownPeer({
            address: addr,
            operationalAddress: OperationalAddress.from(this.state.addresses?.find(a => ServerAddress.isIp(a))),
            discoveryData: RemoteDescriptor.fromLongForm(this.state),
            caseAuthenticatedTags: this.state.caseAuthenticatedTags,
        });

        peer.interaction = node.interaction as ClientInteraction;
        peer.protocol = node.protocol;

        this.internal.peerObserver = peer.updated.use(this.callback(this.#update));

        this.env.set(Peer, peer);
    }

    /**
     * Apply changes from the {@link Peer}.
     *
     * This persists information discovered via MDNS and the connection process.
     */
    async #update(peer: Peer) {
        const { transaction } = this.context;
        await transaction.addResources(this);
        await transaction.begin();

        if (peer.sessionParameters) {
            this.state.sessionParameters = peer.sessionParameters;
        }

        const {
            descriptor: { discoveryData, operationalAddress, caseAuthenticatedTags },
        } = peer;

        RemoteDescriptor.toLongForm(discoveryData, this.state);
        if (operationalAddress) {
            // TODO - modify lower tiers to pass along full set of operational addresses
            this.state.addresses = [operationalAddress];
        }
        this.state.caseAuthenticatedTags = caseAuthenticatedTags;
    }

    /**
     * Uncouple my {@link ClientNode} from a {@link Peer}.
     */
    #unbindPeer(addr: PeerAddress, remove = false) {
        const node = this.endpoint as ClientNode;
        const peer = node.env.maybeGet(Peer);
        if (!peer || !PeerAddress.is(peer.address, addr)) {
            return;
        }
        node.env.delete(Peer, peer);

        this.internal.peerObserver?.[Symbol.dispose]();
        this.internal.peerObserver = undefined;

        if (peer.interaction === node.interaction) {
            peer.interaction = undefined;
        }
        if (peer.protocol === node.protocol) {
            peer.protocol = undefined;
        }

        if (remove) {
            node.env.get(PeerSet).peers.delete(peer);
        }
    }
}

/**
 * Default timing overrides applied to the step-18 CASE reconnect unless the caller supplies
 * {@link CommissioningClient.BaseCommissioningOptions.caseConnectionTiming}.
 *
 * Values are tighter than the global peer timing defaults because the device is known to be freshly online:
 * - `delayBeforeNextAddress`: 15 s (vs. 45 s global default)
 * - `maxDelayBetweenInitialContactRetries`: 60 s (vs. 2 min global default)
 * - `delayAfterPeerError`: 2 min (vs. 5 min global default)
 */
const defaultCaseConnectionTiming: Partial<PeerTimingParameters> = {
    delayBeforeNextAddress: Seconds(15),
    maxDelayBetweenInitialContactRetries: Seconds(60),
    delayAfterPeerError: Minutes(2),
};

export namespace CommissioningClient {
    /**
     * Concrete version of {@link ProtocolPeerAddress}.
     */
    export class PeerAddress implements ProtocolPeerAddress {
        @field(fabricIdx, mandatory)
        fabricIndex: FabricIndex;

        @field(nodeId, mandatory)
        nodeId: NodeId;

        constructor(fabricIndex: FabricIndex, nodeId: NodeId) {
            this.fabricIndex = fabricIndex;
            this.nodeId = nodeId;
        }
    }

    /**
     * Supported transport flags.
     */
    @datatype(map16)
    export class SupportedTransports implements Partial<SupportedTransportsBitmap> {
        @field(uint16.extend({ constraint: "1" }))
        tcpClient?: boolean;

        @field(uint16.extend({ constraint: "2" }))
        tcpServer?: boolean;
    }

    /**
     * Concrete version of {@link ProtocolSessionParameters}.
     */
    export class SessionParameters implements Partial<ProtocolSessionParameters> {
        @field(1, duration.extend({ constraint: "max 3600000" }))
        idleInterval?: Duration;

        @field(2, duration.extend({ constraint: "max 3600000" }))
        activeInterval?: Duration;

        @field(3, duration.extend({ constraint: "max 65535" }))
        activeThreshold?: Duration;

        @field(4, uint32)
        dataModelRevision?: number;

        @field(5, uint16)
        interactionModelRevision?: number;

        @field(6, uint32)
        specificationVersion?: number;

        @field(7, uint16)
        maxPathsPerInvoke?: number;

        @field(8, SupportedTransports)
        supportedTransports?: SupportedTransports;

        @field(9, uint32)
        maxTcpMessageSize?: number;
    }

    /**
     * The network address of a node.
     */
    export class NetworkAddress {
        @field(string, mandatory)
        type!: "udp" | "tcp" | "ble";

        @field(string)
        ip?: string;

        @field(uint16)
        port?: number;

        @field(string)
        peripheralAddress?: string;

        @field(uint32)
        ttl?: Duration | undefined;

        @field(systimeMs)
        discoveredAt?: Timestamp | undefined;

        constructor(address: NetworkAddress) {
            this.type = address.type;
            if (address.ip !== undefined) {
                this.ip = address.ip;
            }
            if (address.port !== undefined) {
                this.port = address.port;
            }
            if (address.peripheralAddress !== undefined) {
                this.peripheralAddress = address.peripheralAddress;
            }
            if (address.ttl !== undefined) {
                this.ttl = address.ttl;
            }
            if (address.discoveredAt !== undefined) {
                this.discoveredAt = address.discoveredAt;
            }
        }
    }

    export class Internal {
        peerObserver?: Disposable;
    }

    export class State {
        /**
         * Fabric index and node ID for paired peers.  If this is undefined the node is uncommissioned.
         */
        @field(PeerAddress, nonvolatile)
        peerAddress?: PeerAddress;

        /**
         * Case Authenticated Tags (CATs)
         *
         * See {@link PeerDescriptor}
         */
        @field(listOf(uint32), nonvolatile)
        caseAuthenticatedTags?: readonly CaseAuthenticatedTag[];

        /**
         * Known network addresses for the device.  If this is undefined, the node has not been located on any network
         * interface.
         */
        @field(listOf(NetworkAddress), nonvolatile)
        addresses?: ServerAddress[];

        /**
         * Time at which the device was discovered.
         */
        @field(systimeMs, nonvolatile)
        discoveredAt?: Timestamp;

        /**
         * Time at which we discovered the device's current operational addresses.
         */
        @field(systimeMs)
        onlineAt?: Timestamp;

        /**
         * Time at which we concluded the device's current operational address is unreachable.
         */
        @field(systimeMs)
        offlineAt?: Timestamp;

        /**
         * Time at which the device was commissioned.
         */
        @field(systimeMs, nonvolatile)
        commissionedAt?: Timestamp;

        /**
         * Fabric index the peer assigned to our identity (from the AddNoc response).  Substituted for the
         * {@link FabricIndex.OMIT_FABRIC} sentinel on fabric-scoped struct writes so the local cache mirrors
         * the value the peer will store.
         *
         * Distinct from {@link peerAddress.fabricIndex} which is our local fabric index.
         */
        @field(fabricIdx, nonvolatile)
        fabricIndexOnPeer?: FabricIndex;

        /**
         * The TTL of the discovery record if applicable (in seconds).
         */
        @field(duration, nonvolatile)
        ttl?: Duration;

        /**
         * The canonical global ID of the device.
         */
        @field(string, nonvolatile)
        deviceIdentifier?: string;

        /**
         * The device's long discriminator.
         */
        @field(uint16, nonvolatile)
        discriminator?: number;

        /**
         * The last know commissioning mode of the device.
         */
        @field(uint8, nonvolatile)
        commissioningMode?: CommissioningMode;

        /**
         * Vendor.
         */
        @field(vendorId, nonvolatile)
        vendorId?: VendorId;

        /**
         * Product.
         */
        @field(uint16, nonvolatile)
        productId?: number;

        /**
         * Advertised device type.
         */
        @field(uint16, nonvolatile)
        deviceType?: DeviceTypeId;

        /**
         * The advertised device name specified by the user.
         */
        @field(string, nonvolatile)
        deviceName?: string;

        /**
         * An optional manufacturer-specific unique rotating ID for uniquely identifying the device.
         */
        @field(string, nonvolatile)
        rotatingIdentifier?: string;

        /**
         * A bitmap indicating how to transition the device to commissioning mode from its current state.
         */
        @field(uint32, nonvolatile)
        pairingHint?: number;

        /**
         * Textual pairing instructions associated with pairing hint.
         */
        @field(string, nonvolatile)
        pairingInstructions?: string;

        /**
         * The remote node's session intervals.
         */
        @field(SessionParameters, nonvolatile)
        sessionParameters?: SessionParameters;

        /**
         * TCP support bitmap.
         */
        @field(uint8, nonvolatile)
        tcpSupport?: number;

        /**
         * Indicates whether node is ICD with a slow (15 s+) polling interval.
         */
        @field(bool, nonvolatile)
        longIdleTimeOperatingMode?: boolean;
    }

    export class Events extends BaseEvents {
        peerAddress$Changed = new Observable<
            [value: ProtocolPeerAddress | undefined, oldValue: ProtocolPeerAddress | undefined]
        >();

        addresses$Changed = new Observable<
            [value: ServerAddress[] | undefined, oldValue: ServerAddress[] | undefined]
        >();

        caseAuthenticatedTags$Changed = new Observable<
            [value: CaseAuthenticatedTag[] | undefined, oldValue: CaseAuthenticatedTag[] | undefined]
        >();
    }

    /**
     * Options that control commissioning.
     */
    export interface BaseCommissioningOptions {
        /**
         * The ID to assign the node during commissioning.  By default the node receives the next available ID.
         */
        nodeId?: NodeId;

        /**
         * The fabric the node joins upon commissioning.  Defaults to the default fabric of the assigned
         * {@link FabricAuthority}.
         */
        fabric?: Fabric;

        /**
         * The authority controlling the commissioning fabric.  Defaults to the {@link FabricAuthority} of the local
         * environment.
         */
        fabricAuthority?: FabricAuthority;

        /**
         * Custom commissioning flow implementation to use instead of the default.
         */
        commissioningFlowImpl?: ClassExtends<ControllerCommissioningFlow>;

        /**
         * Abort signal for cancellation.  When fired during PASE establishment, cancels the PASE attempt.
         * In parallel commissioning scenarios this fires once a winner is found, stopping remaining candidates.
         */
        abort?: AbortSignal;

        /**
         * Called immediately after PASE is established, before the main commissioning flow begins.
         *
         * Return `true` to proceed with commissioning (this candidate won the parallel race).
         * Return `false` to abort cleanly — the PASE session is closed and commissioning stops.
         *
         * When omitted, commissioning always proceeds.
         */
        continueCommissioningAfterPase?: () => boolean;

        /**
         * Overall wall-clock budget for PASE establishment.
         * Defaults to 30 seconds.
         */
        timeout?: Duration;

        /**
         * Discovery capabilities to use for discovery. These are included in the QR code normally and defined if BLE
         * is supported for initial commissioning.
         */
        discoveryCapabilities?: TypeFromPartialBitSchema<typeof DiscoveryCapabilitiesBitmap>;

        /**
         * The initial read/subscription used to populate node data.
         *
         * By default, matter.js reads all attributes on the node.  This allows us to efficiently initialize the complete
         * node structure.
         *
         * If you only require a subset of attributes you can replace this with a more discriminative read.  For
         * example, if you are only interested in interacting with the root endpoint and the On/Off cluster on other
         * endpoints, you could do:
         *
         * ```js
         * {
         *     defaultSubscription: Read(
         *         Read.Attribute({ endpoint: 0 }),
         *         Read.Attribute({ cluster: OnOffCluster })
         *     )
         * }
         * ```
         *
         * Note that certain clusters like Descriptor and Basic Information contain critical operational data. If your
         * read omits them then the node will only be partially functional once initialized.
         */
        defaultSubscription?: Subscribe;

        /**
         * By default, nodes we commission are automatically subscribed to using the {@link defaultSubscription} (or a
         * full wildcard subscription if that is undefined).
         *
         * Matter.js will not subscribe automatically if set to false.
         */
        autoSubscribe?: boolean;

        /**
         * By default a newly-commissioned node performs a one-time read of its structure so its state is available
         * immediately, even when {@link autoSubscribe} is false.  Set to false to skip this read and leave the node
         * uninitialized until a later subscription or read.
         */
        autoStateInitialize?: boolean;

        /**
         * Case Authenticated Tags (CATs)
         */
        caseAuthenticatedTags?: CaseAuthenticatedTag[];

        /**
         * Controls behavior when device attestation produces findings.
         * See {@link ControllerCommissioningFlowOptions.onAttestationFailure} for details.
         */
        onAttestationFailure?: DeviceAttestationValidator.OnAttestationFailure;

        /**
         * WiFi network credentials to configure on the device during commissioning.  Required if the device connects
         * to the network over WiFi and doesn't already have credentials configured.
         */
        wifiNetwork?: ControllerCommissioningFlowOptions["wifiNetwork"];

        /**
         * Thread network credentials to configure on the device during commissioning.  Required if the device connects
         * to the network over Thread and doesn't already have credentials configured.
         */
        threadNetwork?: ControllerCommissioningFlowOptions["threadNetwork"];

        /**
         * The regulatory location (indoor or outdoor) where the device is used.
         * Defaults to `Indoor` if not provided.
         */
        regulatoryLocation?: ControllerCommissioningFlowOptions["regulatoryLocation"];

        /**
         * The two-character country code where the device is deployed (e.g. "DE", "US").
         * Defaults to "XX" (unspecified).
         */
        regulatoryCountryCode?: ControllerCommissioningFlowOptions["regulatoryCountryCode"];

        /**
         * Override the final commissioning step.
         *
         * When provided, matter.js completes commissioning over PASE and then calls this function instead of performing
         * the CASE reconnection and "CommissioningComplete" command internally.  The function must connect to the device
         * operationally and invoke "CommissioningComplete" itself.
         *
         * This is used by {@link PaseCommissioner} so that a lightweight commissioner can perform the PASE phase and
         * then hand off to a full controller to finish commissioning.
         * TODO: Revisit when we decide how to continue with the PaseCommissioner approach at all
         */
        finalizeCommissioning?: (address: ProtocolPeerAddress, discoveryData?: DiscoveryData) => Promise<void>;

        /**
         * Timing overrides for the step-18 CASE reconnect.
         *
         * After commissioning the commissioner establishes the first operational CASE session.  The device is freshly
         * online at that point so tighter timing is appropriate.  Any fields provided here are merged on top of the
         * global peer timing defaults for that single connection only.
         *
         * Defaults to `{ delayBeforeNextAddress: Seconds(15), maxDelayBetweenInitialContactRetries: Seconds(60), delayAfterPeerError: Minutes(2) }`.
         */
        caseConnectionTiming?: Partial<PeerTimingParameters>;
    }

    export interface PasscodeOptions extends BaseCommissioningOptions {
        /**
         * The device's passcode.
         */
        passcode: number;

        /**
         * The device's long discriminator.
         */
        discriminator?: number;
    }

    export interface PairingCodeOptions extends BaseCommissioningOptions {
        /**
         * The device's pairing code.
         */
        pairingCode: string;
    }

    export type CommissioningOptions = PasscodeOptions | PairingCodeOptions;

    export function PasscodeOptions<T extends CommissioningOptions>(options: T) {
        let opts: T & PasscodeOptions;

        if ("pairingCode" in options) {
            const decoded = ManualPairingCodeCodec.decode(options.pairingCode);
            opts = {
                ...options,
                ...decoded,
            };
        } else {
            opts = options as T & PasscodeOptions;
        }

        let { passcode } = opts;
        if (typeof passcode !== "number" || !Number.isFinite(passcode)) {
            passcode = Number.parseInt(passcode as unknown as string);
            if (!Number.isFinite(passcode)) {
                throw new ImplementationError("You must provide a pairing code or passcode to pair a node");
            }
        }

        return opts;
    }
}
