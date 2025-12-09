/**
 * @license
 * Copyright 2022-2025 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { Behavior } from "#behavior/Behavior.js";
import { Events as BaseEvents } from "#behavior/Events.js";
import { OperationalCredentialsClient } from "#behaviors/operational-credentials";
import { OperationalCredentials } from "#clusters/operational-credentials";
import {
    ClassExtends,
    Diagnostic,
    Duration,
    ImplementationError,
    Logger,
    MatterError,
    NotImplementedError,
    Observable,
    ServerAddress,
    Time,
    Timestamp,
} from "#general";
import {
    bool,
    duration,
    fabricIdx,
    field,
    listOf,
    mandatory,
    nodeId,
    nonvolatile,
    string,
    systimeMs,
    uint16,
    uint32,
    uint8,
    vendorId,
} from "#model";
import type { ClientNode } from "#node/ClientNode.js";
import type { Node } from "#node/Node.js";
import { IdentityService } from "#node/server/IdentityService.js";
import {
    CommissioningMode,
    ControllerCommissioner,
    ControllerCommissioningFlow,
    DiscoveryData,
    Fabric,
    FabricAuthority,
    FabricManager,
    LocatedNodeCommissioningOptions,
    PeerSet,
    PeerAddress as ProtocolPeerAddress,
    SessionIntervals as ProtocolSessionIntervals,
    Subscribe,
} from "#protocol";
import {
    CaseAuthenticatedTag,
    DeviceTypeId,
    DiscoveryCapabilitiesBitmap,
    FabricIndex,
    ManualPairingCodeCodec,
    NodeId,
    TypeFromPartialBitSchema,
    VendorId,
} from "#types";
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
    declare state: CommissioningClient.State;
    declare events: CommissioningClient.Events;

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

        this.reactTo((this.endpoint as Node).lifecycle.partsReady, this.#initializeNode);
        this.reactTo(this.events.peerAddress$Changed, this.#peerAddressChanged);
    }

    commission(passcode: number): Promise<ClientNode>;

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

        // Ensure controller is initialized
        await node.owner?.act(agent => agent.load(ControllerBehavior));

        // Obtain the fabric we will commission into
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

        const commissioner = node.env.get(ControllerCommissioner);

        const identityService = node.env.get(IdentityService);
        const address = identityService.assignNodeAddress(node, fabric.fabricIndex, opts.nodeId);

        const commissioningOptions: LocatedNodeCommissioningOptions = {
            addresses: addresses.map(ServerAddress),
            fabric,
            nodeId: address.nodeId,
            passcode,
            discoveryData: this.descriptor,
            commissioningFlowImpl: options.commissioningFlowImpl,
        };

        if (this.finalizeCommissioning !== CommissioningClient.prototype.finalizeCommissioning) {
            commissioningOptions.finalizeCommissioning = this.finalizeCommissioning.bind(this);
        }

        try {
            await commissioner.commission(commissioningOptions);
            this.state.peerAddress = address;
        } catch (e) {
            identityService.releaseNodeAddress(address);
            throw e;
        }

        await this.context.transaction.commit();

        const network = this.agent.get(NetworkClient);
        network.state.defaultSubscription = opts.defaultSubscription;
        // Nodes we commission are auto-subscribed by default, unless disabled explicitly
        network.state.autoSubscribe = opts.autoSubscribe !== false;
        network.state.caseAuthenticatedTags = opts.caseAuthenticatedTags;

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
        logger.debug(`Removing node ${peerAddress.toString()} by removing fabric ${fabricIndex} on the node`);

        const result = await opcreds.removeFabric({ fabricIndex });

        if (result.statusCode !== OperationalCredentials.NodeOperationalCertStatus.Ok) {
            throw new MatterError(
                `Removing node ${peerAddress.toString()} failed with status ${result.statusCode} "${result.debugText}".`,
            );
        }

        this.state.peerAddress = undefined;

        await this.context.transaction.commit();

        logger.info(
            "Decommissioned",
            Diagnostic.strong(this.endpoint.id),
            "formerly",
            Diagnostic.strong(formerAddress),
        );
    }

    /**
     * Override to implement CASE commissioning yourself.
     *
     * If you override, matter.js commissions to the point where commissioning over PASE is complete.  You must then
     * complete commissioning yourself by connecting to the device and invokeint the "CommissioningComplete" command.
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
        endpoint.lifecycle.initialized.emit(this.state.peerAddress !== undefined);
    }

    #peerAddressChanged(addr?: ProtocolPeerAddress) {
        const node = this.endpoint as ClientNode;

        if (addr) {
            const peer = node.env.get(PeerSet).for(addr);
            if (peer) {
                if (peer.descriptor.operationalAddress) {
                    this.state.addresses = [peer.descriptor.operationalAddress];
                }
                this.descriptor = peer.descriptor.discoveryData;
            }

            node.lifecycle.commissioned.emit(this.context);
        } else {
            node.lifecycle.decommissioned.emit(this.context);
        }
    }
}

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
     * Concrete version of {@link SessionIntervals}.
     */
    export class SessionIntervals implements ProtocolSessionIntervals {
        @field(duration.extend({ constraint: "max 3600000" }), mandatory)
        idleInterval: Duration;

        @field(duration.extend({ constraint: "max 3600000" }), mandatory)
        activeInterval: Duration;

        @field(duration.extend({ constraint: "max 65535" }), mandatory)
        activeThreshold: Duration;

        constructor(intervals: SessionIntervals) {
            this.idleInterval = intervals.idleInterval;
            this.activeInterval = intervals.activeInterval;
            this.activeThreshold = intervals.activeThreshold;
        }
    }

    /**
     * The network address of a node.
     */
    export class NetworkAddress implements ServerAddress.Definition {
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
            this.ip = address.ip;
            this.port = address.port;
            this.peripheralAddress = address.peripheralAddress;
            this.ttl = address.ttl;
            this.discoveredAt = address.discoveredAt;
        }
    }

    export class State {
        /**
         * Fabric index and node ID for paired peers.  If this is undefined the node is uncommissioned.
         */
        @field(PeerAddress, nonvolatile)
        peerAddress?: PeerAddress;

        /**
         * Known network addresses for the device.  If this is undefined the node has not been located on any network
         * interface.
         */
        @field(listOf(NetworkAddress), nonvolatile)
        addresses?: ServerAddress.Definition[];

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
        @field(SessionIntervals, nonvolatile)
        sessionIntervals?: Partial<ProtocolSessionIntervals>;

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
         * Case Authenticated Tags (CATs) to use for operational CASE sessions with this node.
         *
         * CATs provide additional authentication context for Matter operational sessions. They are only used
         * for operational CASE connections after commissioning is complete, not during the initial PASE
         * commissioning process.
         *
         * Note: CATs only make sense when additional ACLs (Access Control Lists) are also configured on
         * the target device to grant specific permissions based on these tags.
         */
        caseAuthenticatedTags?: CaseAuthenticatedTag[];
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
