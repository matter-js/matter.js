/**
 * @license
 * Copyright 2022-2025 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { Behavior } from "#behavior/Behavior.js";
import { Events as BaseEvents } from "#behavior/Events.js";
import { OperationalCredentialsClient } from "#behaviors/operational-credentials";
import {
    Diagnostic,
    Duration,
    ImplementationError,
    isIpNetworkChannel,
    Logger,
    NotImplementedError,
    Observable,
    ServerAddress,
    Time,
    Timestamp,
} from "#general";
import { DatatypeModel, FieldElement } from "#model";
import type { ClientNode } from "#node/ClientNode.js";
import type { Node } from "#node/Node.js";
import { IdentityService } from "#node/server/IdentityService.js";
import {
    ChannelManager,
    CommissioningMode,
    ControllerCommissioner,
    DiscoveryData,
    Fabric,
    FabricAuthority,
    FabricManager,
    LocatedNodeCommissioningOptions,
    PeerAddress,
    SessionParameters,
    Subscribe,
} from "#protocol";
import {
    CaseAuthenticatedTag,
    DeviceTypeId,
    DiscoveryCapabilitiesBitmap,
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
        if (typeof passcode !== "number" || !Number.isFinite(passcode)) {
            passcode = Number.parseInt(passcode as unknown as string);
            if (!Number.isFinite(passcode)) {
                throw new ImplementationError(`You must provide the numeric passcode to commission a node`);
            }
        }

        // Ensure controller is initialized
        await node.owner?.act(agent => agent.load(ControllerBehavior));

        // Obtain the fabric we will commission into
        const fabricAuthority = opts.fabricAuthority || this.env.get(FabricAuthority);
        let { fabric } = opts;
        if (fabric === undefined) {
            if (this.context.fabric === undefined) {
                fabric = await fabricAuthority.defaultFabric();
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
        if (opts.autoSubscribe || opts.autoSubscribe === undefined) {
            // Nodes we commission are auto-subscribed by default, unless disabled explicitly
            network.state.autoSubscribe = opts.autoSubscribe ?? true;
        }
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

        const formerAddress = PeerAddress(peerAddress).toString();

        const opcreds = this.agent.get(OperationalCredentialsClient);

        await opcreds.removeFabric({ fabricIndex: opcreds.state.currentFabricIndex });

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
    protected async finalizeCommissioning(_address: PeerAddress, _discoveryData?: DiscoveryData) {
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

    #peerAddressChanged(addr?: PeerAddress) {
        const node = this.endpoint as ClientNode;

        if (addr) {
            const channels = node.env.get(ChannelManager);
            if (channels.hasChannel(addr)) {
                const channel = channels.getChannel(addr).channel;
                const operationalAddress = isIpNetworkChannel(channel) ? channel.networkAddress : undefined;
                if (operationalAddress) {
                    if (this.state.addresses === undefined) {
                        this.state.addresses = [];
                    }
                    if (!this.state.addresses.some(a => ServerAddress.isEqual(ServerAddress(a), operationalAddress))) {
                        this.state.addresses.push(ServerAddress.definitionOf(operationalAddress));
                    }
                }
            }

            node.lifecycle.commissioned.emit(this.context);
        } else {
            node.lifecycle.decommissioned.emit(this.context);
        }
    }

    /**
     * Define logical schema.  This enables runtime validation, make fields persistent and makes subfields editable.
     */
    static override readonly schema = new DatatypeModel(
        {
            name: "CommissioningState",
            type: "struct",
        },

        FieldElement({
            name: "peerAddress",
            type: "struct",
            quality: "N",
            children: [
                FieldElement({ name: "fabricIndex", type: "fabric-id" }),
                FieldElement({ name: "nodeId", type: "node-id" }),
            ],
        }),

        FieldElement({
            name: "addresses",
            type: "list",
            quality: "N",
            children: [
                FieldElement({
                    name: "entry",
                    type: "struct",
                    children: [
                        FieldElement({ name: "type", type: "string" }),
                        FieldElement({ name: "ip", type: "string" }),
                        FieldElement({ name: "port", type: "uint16" }),
                        FieldElement({ name: "peripheralAddress", type: "string" }),
                    ],
                }),
            ],
        }),

        FieldElement({ name: "discoveredAt", type: "systime-ms", quality: "N", conformance: "M" }),
        FieldElement({ name: "onlineAt", type: "systime-ms" }),
        FieldElement({ name: "offlineAt", type: "systime-ms" }),
        FieldElement({ name: "ttl", type: "uint32", quality: "N" }),
        FieldElement({ name: "deviceIdentifier", type: "string", quality: "N" }),
        FieldElement({ name: "discriminator", type: "uint16", quality: "N" }),
        FieldElement({ name: "commissioningMode", type: "uint8", quality: "N" }),
        FieldElement({ name: "vendorId", type: "vendor-id", quality: "N" }),
        FieldElement({ name: "productId", type: "uint16", quality: "N" }),
        FieldElement({ name: "deviceType", type: "uint16", quality: "N" }),
        FieldElement({ name: "deviceName", type: "string", quality: "N" }),
        FieldElement({ name: "rotatingIdentifier", type: "string", quality: "N" }),
        FieldElement({ name: "pairingHint", type: "uint32", quality: "N" }),
        FieldElement({ name: "pairingInstructions", type: "string", quality: "N" }),
        FieldElement({
            name: "sessionParameters",
            type: "struct",
            quality: "N",
            children: [
                FieldElement({ name: "idleInterval", type: "duration", constraint: "max 3600000" }),
                FieldElement({ name: "activeInterval", type: "duration", constraint: "max 3600000" }),
                FieldElement({ name: "activeThreshold", type: "duration", constraint: "max 65535" }),
            ],
        }),
        FieldElement({ name: "tcpSupport", type: "uint8", quality: "N" }),
        FieldElement({ name: "longIdleOperatingMode", type: "bool", quality: "N" }),
    );
}

export namespace CommissioningClient {
    export class State {
        /**
         * Fabric index and node ID for paired peers.  If this is undefined the node is uncommissioned.
         */
        peerAddress?: PeerAddress;

        /**
         * Known network addresses for the device.  If this is undefined the node has not been located on any network
         * interface.
         */
        addresses?: ServerAddress.Definition[];

        /**
         * Time at which the device was discovered.
         */
        discoveredAt?: Timestamp;

        /**
         * Time at which we discovered the device's current operational addresses.
         */
        onlineAt?: Timestamp;

        /**
         * Time at which we concluded the device's current operational address is unreachable.
         */
        offlineAt?: Timestamp;

        /**
         * The TTL of the discovery record if applicable (in seconds).
         */
        ttl?: Duration;

        /**
         * The canonical global ID of the device.
         */
        deviceIdentifier?: string;

        /**
         * The device's long discriminator.
         */
        discriminator?: number;

        /**
         * The last know commissioning mode of the device.
         */
        commissioningMode?: CommissioningMode;

        /**
         * Vendor.
         */
        vendorId?: VendorId;

        /**
         * Product.
         */
        productId?: number;

        /**
         * Advertised device type.
         */
        deviceType?: DeviceTypeId;

        /**
         * The advertised device name specified by the user.
         */
        deviceName?: string;

        /**
         * An optional manufacturer-specific unique rotating ID for uniquely identifying the device.
         */
        rotatingIdentifier?: string;

        /**
         * A bitmap indicating how to transition the device to commissioning mode from its current state.
         */
        pairingHint?: number;

        /**
         * Textual pairing instructions associated with pairing hint.
         */
        pairingInstructions?: string;

        /**
         * The remote node's session parameters.
         */
        sessionParameters?: Partial<SessionParameters>;

        /**
         * TCP support bitmap.
         */
        tcpSupport?: number;

        /**
         * Indicates whether node is ICD with a slow (15 s+) polling interval.
         */
        longIdleTimeOperatingMode?: boolean;
    }

    export class Events extends BaseEvents {
        peerAddress$Changed = new Observable<[value: PeerAddress | undefined, oldValue: PeerAddress | undefined]>();
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
         * read omits them then the node will only be partially functional once initialized or relevant clusters and
         * endpoints need to be enabled manually.
         */
        defaultSubscription?: Subscribe;

        /**
         * By default, nodes we commission are automatically subscribed to using the {@link defaultSubscription} (or a
         * full wildcard subscription if that is undefined).
         * When set to false, the node will not be automatically subscribed.
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
