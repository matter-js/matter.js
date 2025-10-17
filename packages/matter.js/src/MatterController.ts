/**
 * @license
 * Copyright 2022-2025 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Important note: This file is part of the legacy matter-node (internal) API and should not be used anymore directly!
 * Please use the new API classes!
 * @deprecated
 */

import { GeneralCommissioning } from "#clusters";
import { NodeCommissioningOptions } from "#CommissioningController.js";
import { ControllerStoreInterface } from "#ControllerStore.js";
import { CachedClientNodeStore } from "#device/CachedClientNodeStore.js";
import { DeviceInformationData } from "#device/DeviceInformation.js";
import {
    Bytes,
    ChannelType,
    ClassExtends,
    ConnectionlessTransportSet,
    Construction,
    Crypto,
    Environment,
    ImplementationError,
    Logger,
    MatterError,
    Minutes,
    ServerAddress,
    ServerAddressUdp,
    StorageBackendMemory,
    StorageManager,
} from "#general";
import { LegacyControllerStore } from "#LegacyControllerStore.js";
import { InteractionServer, ServerNode } from "#node";
import {
    CertificateAuthority,
    ClusterClient,
    CommissioningError,
    ControllerCommissioner,
    ControllerCommissioningFlow,
    DecodedAttributeReportValue,
    DiscoveryAndCommissioningOptions,
    DiscoveryData,
    Fabric,
    FabricAuthority,
    FabricAuthorityConfigurationProvider,
    FabricManager,
    InteractionClientProvider,
    MessageChannel,
    NodeDiscoveryType,
    OperationalPeer,
    PeerAddress,
    PeerAddressStore,
    PeerConnectionOptions,
    PeerSet,
    RetransmissionLimitReachedError,
    ScannerSet,
    SessionManager,
    SubscriptionClient,
} from "#protocol";
import {
    CaseAuthenticatedTag,
    ClusterId,
    DiscoveryCapabilitiesBitmap,
    EndpointNumber,
    FabricId,
    FabricIndex,
    NodeId,
    TypeFromPartialBitSchema,
    VendorId,
} from "#types";

export type CommissionedNodeDetails = {
    operationalServerAddress?: ServerAddressUdp;
    discoveryData?: DiscoveryData;
    deviceData?: DeviceInformationData;
};

const DEFAULT_FABRIC_INDEX = FabricIndex(1);

const logger = Logger.get("MatterController");

// Operational peer extended with basic information as required for conversion to CommissionedNodeDetails
type CommissionedPeer = OperationalPeer & { deviceData?: DeviceInformationData };

// Backward-compatible persistence record for nodes
type StoredOperationalPeer = [NodeId, CommissionedNodeDetails];

export class MatterController {
    public static async create(options: {
        id: string;
        controllerStore: ControllerStoreInterface;
        sessionClosedCallback?: (peerNodeId: NodeId) => void;
        rootCertificateAuthority?: CertificateAuthority;
        rootFabric?: Fabric;
        adminVendorId?: VendorId;
        adminFabricIndex?: FabricIndex;
        caseAuthenticatedTags?: CaseAuthenticatedTag[];
        rootNodeId?: NodeId;
        adminFabricId?: FabricId;
        adminFabricLabel: string;
        ble?: boolean;
        ipv4?: boolean;
        listeningAddressIpv4?: string;
        listeningAddressIpv6?: string;
        localPort?: number;
        environment: Environment;
    }): Promise<MatterController> {
        const crypto = options.environment.get(Crypto);
        const {
            controllerStore,
            rootFabric,
            rootCertificateAuthority,
            adminFabricIndex = FabricIndex(DEFAULT_FABRIC_INDEX),
            environment,
        } = options;

        if (adminFabricIndex !== FabricIndex(1)) {
            logger.warn(
                "Fabric Indices will be assigned automatically from now on. Specifying a custom Fabric Index is deprecated.",
            );
        }

        // Use provided CA or create a new CA pointing to the legacy storage location
        // Needs migration of data
        const ca = rootCertificateAuthority ?? (await CertificateAuthority.create(crypto, controllerStore.caStorage));
        environment.set(CertificateAuthority, ca);

        let controller: MatterController | undefined = undefined;
        let fabric: Fabric | undefined = undefined;

        // Initializes Fabric from legacy storage location, or validate the provided fabric with the CA
        // Requires data migration later maybe
        const fabricStorage = controllerStore.fabricStorage;
        if (rootFabric !== undefined || (await fabricStorage.has("fabric"))) {
            fabric = rootFabric ?? new Fabric(crypto, await fabricStorage.get<Fabric.Config>("fabric"));
            if (Bytes.areEqual(fabric.rootCert, ca.rootCert)) {
                logger.info("Using existing fabric");
            } else {
                if (rootFabric !== undefined) {
                    throw new MatterError("Fabric CA certificate is not in sync with CA.");
                }
                logger.info("Fabric CA certificate changed ...");
                if (await controllerStore.nodesStorage.has("commissionedNodes")) {
                    throw new MatterError(
                        "Fabric certificate changed, but commissioned nodes are still present. Please clear the storage.",
                    );
                }
                fabric = undefined; // Force re-creation of fabric
            }
        }

        controller = new MatterController({
            ...options,
            controllerStore,
            fabric,
        });

        await controller.construction;
        return controller;
    }

    public static async createAsPaseCommissioner(options: {
        id: string;
        sessionClosedCallback?: (peerNodeId: NodeId) => void;
        certificateAuthorityConfig?: CertificateAuthority.Configuration;
        rootCertificateAuthority?: CertificateAuthority;
        fabricConfig: Fabric.Config;
        adminFabricLabel: string;
        adminFabricId?: FabricId;
        ble?: boolean;
        ipv4?: boolean;
        listeningAddressIpv4?: string;
        listeningAddressIpv6?: string;
        localPort?: number;
        environment: Environment;
    }): Promise<MatterController> {
        const { certificateAuthorityConfig, rootCertificateAuthority, fabricConfig, environment } = options;
        const crypto = environment.get(Crypto);

        if (rootCertificateAuthority === undefined && certificateAuthorityConfig === undefined) {
            throw new ImplementationError("Either rootCertificateAuthority or certificateAuthorityConfig must be set.");
        }
        const ca = rootCertificateAuthority ?? (await CertificateAuthority.create(crypto, certificateAuthorityConfig));
        environment.set(CertificateAuthority, ca);

        // Stored data are temporary anyway and no node will be connected, so just use an in-memory storage
        const storageManager = new StorageManager(new StorageBackendMemory());
        await storageManager.initialize();

        const fabric = new Fabric(crypto, fabricConfig);
        if (!Bytes.areEqual(fabric.rootCert, ca.rootCert)) {
            throw new MatterError("Fabric CA certificate is not in sync with CA.");
        }

        // Check if we have a fabric stored in the storage, if yes initialize this one, else build a new one
        const controller = new MatterController({
            ...options,
            controllerStore: new LegacyControllerStore(storageManager.createContext("Commissioner")),
            fabric,
        });
        await controller.construction;

        // Verify an appropriate network interface is available
        const netInterfaces = environment.get(ConnectionlessTransportSet);
        if (!netInterfaces.hasInterfaceFor(ChannelType.BLE)) {
            if (
                !environment.get(ScannerSet).hasScannerFor(ChannelType.UDP) ||
                !netInterfaces.hasInterfaceFor(ChannelType.UDP, "::")
            ) {
                throw new ImplementationError(
                    "Ble must be initialized to create a Sub Commissioner without an IP network!",
                );
            }
            logger.info("BLE is not enabled. Using only IP network for commissioning.");
        }

        return controller;
    }

    #construction: Construction<MatterController>;
    #node?: ServerNode;
    #peers?: PeerSet;
    #fabric?: Fabric;

    get construction() {
        return this.#construction;
    }

    constructor(options: {
        id: string;
        controllerStore: ControllerStoreInterface;
        fabric?: Fabric;
        sessionClosedCallback?: (peerNodeId: NodeId) => void;
        ble?: boolean;
        adminFabricId?: FabricId;
        adminFabricLabel: string;
        adminVendorId?: VendorId;
        rootNodeId?: NodeId;
        caseAuthenticatedTags?: CaseAuthenticatedTag[];
        ipv4?: boolean;
        listeningAddressIpv4?: string;
        listeningAddressIpv6?: string;
        localPort?: number;
        environment: Environment;
    }) {
        const crypto = options.environment.get(Crypto);
        const {
            controllerStore,
            sessionClosedCallback,
            ble = false,
            adminFabricLabel,
            adminFabricId = FabricId(crypto.randomBigInt(8)),
            adminVendorId,
            rootNodeId,
            caseAuthenticatedTags,
            ipv4 = true,
            listeningAddressIpv4,
            listeningAddressIpv6,
            localPort,
            environment,
            id,
            fabric,
        } = options;

        // Initialize a Fabric Manager without a connected storage because we only have one fabric, and we manage the
        // storage ourselves.
        // Data migration needed
        const fabricManager = new FabricManager(crypto);
        environment.set(FabricManager, fabricManager);
        if (fabric !== undefined) {
            fabricManager.addFabric(fabric);
        }

        this.#construction = Construction(this, async () => {
            // Initialize Fabric Authority with the provided initial fabric details because we create the Fabric ourselves.
            // Can be removed when we use "commission" via Commissioning behavior
            environment.set(
                FabricAuthorityConfigurationProvider,
                new FabricAuthorityConfigurationProvider({
                    adminFabricLabel,
                    adminVendorId,
                    fabricId: adminFabricId,
                    caseAuthenticatedTags,
                    nodeId: rootNodeId,
                }),
            );

            // Initialize Fabric Authority to retrieve the self-added fabric or create a new one
            // Also tweak the storage as needed because we manage storage ourselves
            // Data migration needed
            // Can be removed when we use "commission" via Commissioning behavior
            const fabricAuth = environment.get(FabricAuthority);
            const fabric = await fabricAuth.defaultFabric();
            fabric.storage = controllerStore.fabricStorage;
            fabric.persistCallback = () => controllerStore.fabricStorage.set("fabric", fabric.config);
            this.#fabric = fabric;

            // Initialize custom PeerAddressStore to manage commissioned nodes storage in legacy storage format
            // Data migration needed
            const nodesStore = new CommissionedNodeStore(controllerStore, fabric);
            environment.set(PeerAddressStore, nodesStore);

            // Now after all Legacy stuff is prepared, initialize the ServerNode
            this.#node = await ServerNode.create({
                environment,
                id,
                network: {
                    ble,
                    ipv4,
                    listeningAddressIpv4,
                    listeningAddressIpv6,
                    port: localPort,
                },
                basicInformation: {
                    vendorId: adminVendorId,
                },
                controller: {
                    adminFabricLabel,
                    adminFabricId,
                    adminNodeId: rootNodeId,
                    caseAuthenticatedTags,
                },
                commissioning: {
                    enabled: false, // The node is never commissionable directly
                },
                subscriptions: {
                    persistenceEnabled: false, // We do not want to reestablish subscriptions on restart
                },
            });

            this.#node.env
                .get(SessionManager)
                .sessions.deleted.on(async session => sessionClosedCallback?.(session.peerNodeId));

            this.#peers = this.#node.env.get(PeerSet);
            nodesStore.peers = this.#peers;

            if (this.#fabric.label !== adminFabricLabel) {
                await fabric.setLabel(adminFabricLabel);
            }
        });
    }

    get ble() {
        this.#construction.assert();
        return this.#node!.state.network.ble ?? false;
    }

    get nodeId() {
        this.#construction.assert();
        return this.#fabric!.rootNodeId;
    }

    get caConfig() {
        this.#construction.assert();
        return this.#node!.env.get(CertificateAuthority).config;
    }

    get fabricConfig() {
        this.#construction.assert();
        return this.#fabric!.config;
    }

    get sessions() {
        this.#construction.assert();
        return this.#node!.env.get(SessionManager).sessions;
    }

    getFabrics() {
        this.#construction.assert();
        return [this.#fabric!];
    }

    collectScanners(
        discoveryCapabilities: TypeFromPartialBitSchema<typeof DiscoveryCapabilitiesBitmap> = { onIpNetwork: true },
    ) {
        this.#construction.assert();
        // Note we always scan via MDNS if available
        return this.#node!.env.get(ScannerSet).filter(
            scanner =>
                scanner.type === ChannelType.UDP || (discoveryCapabilities.ble && scanner.type === ChannelType.BLE),
        );
    }

    /**
     * Commission a device by its identifier and the Passcode. If a known address is provided this is tried first
     * before discovering devices in the network. If multiple addresses or devices are found, they are tried all after
     * each other. It returns the NodeId of the commissioned device.
     * If it throws an PairRetransmissionLimitReachedError that means that no found device responded to the pairing
     * request or the passode did not match to any discovered device/address.
     *
     * Use the connectNodeAfterCommissioning callback to implement an own logic to do the operative device discovery and
     * to complete the commissioning process.
     * Return true when the commissioning process is completed successfully, false on error.
     */
    async commission(
        options: NodeCommissioningOptions,
        customizations?: {
            completeCommissioningCallback?: (peerNodeId: NodeId, discoveryData?: DiscoveryData) => Promise<boolean>;
            commissioningFlowImpl?: ClassExtends<ControllerCommissioningFlow>;
        },
    ): Promise<NodeId> {
        this.#construction.assert();
        const commissioningOptions: DiscoveryAndCommissioningOptions = {
            ...options.commissioning,
            fabric: this.#fabric!,
            discovery: options.discovery,
            passcode: options.passcode,
        };

        const { completeCommissioningCallback, commissioningFlowImpl } = customizations ?? {};

        if (completeCommissioningCallback) {
            commissioningOptions.finalizeCommissioning = async (peerAddress, discoveryData) => {
                const result = await completeCommissioningCallback(peerAddress.nodeId, discoveryData);
                if (!result) {
                    throw new RetransmissionLimitReachedError("Device could not be discovered");
                }
            };
        }
        commissioningOptions.commissioningFlowImpl = commissioningFlowImpl;

        const address = await this.#node!.env.get(ControllerCommissioner).commissionWithDiscovery(commissioningOptions);

        await this.#fabric!.persist();

        return address.nodeId;
    }

    async disconnect(nodeId: NodeId) {
        this.#construction.assert();
        return this.#peers!.disconnect(this.#fabric!.addressOf(nodeId));
    }

    async connectPaseChannel(options: NodeCommissioningOptions) {
        this.#construction.assert();
        const { paseSecureChannel } = await this.#node!.env.get(ControllerCommissioner).discoverAndEstablishPase({
            ...options.commissioning,
            fabric: this.#fabric!,
            discovery: options.discovery,
            passcode: options.passcode,
        });
        logger.warn("PASE channel established", paseSecureChannel.session.name, paseSecureChannel.session.isSecure);
        return paseSecureChannel;
    }

    async removeNode(nodeId: NodeId) {
        this.#construction.assert();
        return this.#peers!.delete(this.#fabric!.addressOf(nodeId));
    }

    /**
     * Method to complete the commissioning process to a node which was initialized with a PASE secure channel.
     */
    async completeCommissioning(peerNodeId: NodeId, discoveryData?: DiscoveryData) {
        this.#construction.assert();
        // Look for the device broadcast over MDNS and do CASE pairing
        const interactionClient = await this.connect(peerNodeId, {
            discoveryOptions: {
                discoveryType: NodeDiscoveryType.TimedDiscovery,
                timeout: Minutes(2),
                discoveryData,
            },
            allowUnknownPeer: true,
        }); // Wait maximum 120s to find the operational device for commissioning process
        const generalCommissioningClusterClient = ClusterClient(
            GeneralCommissioning.Cluster,
            EndpointNumber(0),
            interactionClient,
        );
        const { errorCode, debugText } = await generalCommissioningClusterClient.commissioningComplete(undefined, {
            useExtendedFailSafeMessageResponseTimeout: true,
        });
        if (errorCode !== GeneralCommissioning.CommissioningError.Ok) {
            // We might have added data for an operational address that we need to cleanup
            await this.#peers!.delete(this.#fabric!.addressOf(peerNodeId));
            throw new CommissioningError(`Commission error on commissioningComplete: ${errorCode}, ${debugText}`);
        }
        await this.#fabric!.persist();
    }

    isCommissioned() {
        this.#construction.assert();
        return !!this.#peers!.size;
    }

    getCommissionedNodes() {
        this.#construction.assert();
        return this.#peers!.map(peer => peer.address.nodeId);
    }

    getCommissionedNodesDetails() {
        this.#construction.assert();
        return this.#peers!.map(peer => {
            const { address, operationalAddress, discoveryData, deviceData } = peer as CommissionedPeer;
            return {
                nodeId: address.nodeId,
                operationalAddress: operationalAddress ? ServerAddress.urlFor(operationalAddress) : undefined,
                advertisedName: discoveryData?.DN,
                discoveryData,
                deviceData,
            };
        });
    }

    getCommissionedNodeDetails(nodeId: NodeId) {
        this.#construction.assert();
        const nodeDetails = this.#peers!.get(this.#fabric!.addressOf(nodeId)) as CommissionedPeer;
        if (nodeDetails === undefined) {
            throw new Error(`Node ${nodeId} is not commissioned.`);
        }
        const { address, operationalAddress, discoveryData, deviceData } = nodeDetails;
        return {
            nodeId: address.nodeId,
            operationalAddress: operationalAddress ? ServerAddress.urlFor(operationalAddress) : undefined,
            advertisedName: discoveryData?.DN,
            discoveryData,
            deviceData,
        };
    }

    async enhanceCommissionedNodeDetails(nodeId: NodeId, deviceData: DeviceInformationData) {
        this.#construction.assert();
        const nodeDetails = this.#peers!.get(this.#fabric!.addressOf(nodeId)) as CommissionedPeer;
        if (nodeDetails === undefined) {
            throw new Error(`Node ${nodeId} is not commissioned.`);
        }
        nodeDetails.deviceData = deviceData;
        await (this.#node!.env.get(PeerAddressStore) as CommissionedNodeStore).save();
    }

    /**
     * Connect to the device by opening a channel and creating a new CASE session if necessary.
     * Returns a InteractionClient on success.
     */
    async connect(peerNodeId: NodeId, options: MatterController.ConnectOptions) {
        this.#construction.assert();
        return this.#node!.env.get(InteractionClientProvider).connect(this.#fabric!.addressOf(peerNodeId), options);
    }

    createInteractionClient(peerNodeIdOrChannel: NodeId | MessageChannel, options: PeerConnectionOptions = {}) {
        if (peerNodeIdOrChannel instanceof MessageChannel) {
            return this.#node!.env.get(InteractionClientProvider).getInteractionClientForChannel(peerNodeIdOrChannel);
        }
        return this.#node!.env.get(InteractionClientProvider).getInteractionClient(
            this.#fabric!.addressOf(peerNodeIdOrChannel),
            options,
        );
    }

    async start() {
        this.#construction.assert();
        await this.#node!.start();
        this.#node!.env.get(InteractionServer).clientHandler = this.#node!.env.get(SubscriptionClient);
    }

    async close() {
        await this.#node?.close();
    }

    getActiveSessionInformation() {
        this.#construction.assert();
        return this.#node!.env.get(SessionManager).getActiveSessionInformation();
    }

    async getStoredClusterDataVersions(
        nodeId: NodeId,
        filterEndpointId?: EndpointNumber,
        filterClusterId?: ClusterId,
    ): Promise<{ endpointId: EndpointNumber; clusterId: ClusterId; dataVersion: number }[]> {
        this.#construction.assert();
        const peer = this.#peers!.get(this.#fabric!.addressOf(nodeId));
        if (peer === undefined || peer.dataStore === undefined) {
            return []; // We have no store, also no data
        }
        await peer.dataStore.construction;
        return peer.dataStore.getClusterDataVersions(filterEndpointId, filterClusterId);
    }

    async retrieveStoredAttributes(
        nodeId: NodeId,
        endpointId: EndpointNumber,
        clusterId: ClusterId,
    ): Promise<DecodedAttributeReportValue<any>[]> {
        this.#construction.assert();
        const peer = this.#peers!.get(this.#fabric!.addressOf(nodeId));
        if (peer === undefined || peer.dataStore === undefined) {
            return []; // We have no store, also no data
        }
        await peer.dataStore.construction;
        return peer.dataStore.retrieveAttributes(endpointId, clusterId);
    }

    async updateFabricLabel(label: string) {
        this.#construction.assert();
        await this.#fabric!.setLabel(label);
    }
}

export namespace MatterController {
    export interface ConnectOptions extends PeerConnectionOptions {
        allowUnknownPeer?: boolean;
        caseAuthenticatedTags?: CaseAuthenticatedTag[];
    }
}

class CommissionedNodeStore extends PeerAddressStore {
    declare peers: PeerSet;
    #controllerStore: ControllerStoreInterface;
    #fabric: Fabric;

    constructor(controllerStore: ControllerStoreInterface, fabric: Fabric) {
        super();
        this.#controllerStore = controllerStore;
        this.#fabric = fabric;
    }

    async createNodeStore(address: PeerAddress, load = true) {
        return new CachedClientNodeStore(await this.#controllerStore.clientNodeStore(address.nodeId.toString()), load);
    }

    async loadPeers() {
        if (!(await this.#controllerStore.nodesStorage.has("commissionedNodes"))) {
            return [];
        }

        const commissionedNodes =
            await this.#controllerStore.nodesStorage.get<StoredOperationalPeer[]>("commissionedNodes");

        const nodes = new Array<CommissionedPeer>();

        for (const [nodeId, { operationalServerAddress, discoveryData, deviceData }] of commissionedNodes) {
            const address = this.#fabric.addressOf(nodeId);
            nodes.push({
                address,
                operationalAddress: operationalServerAddress,
                discoveryData,
                deviceData,
                dataStore: await this.createNodeStore(address),
            } satisfies CommissionedPeer);
        }
        return nodes;
    }

    async updatePeer() {
        return this.save();
    }

    async deletePeer(address: PeerAddress) {
        await (await this.#controllerStore.clientNodeStore(address.nodeId.toString())).clearAll();
        return this.save();
    }

    async save() {
        await this.#controllerStore.nodesStorage.set(
            "commissionedNodes",
            this.peers.map(peer => {
                const {
                    address,
                    operationalAddress: operationalServerAddress,
                    discoveryData,
                    deviceData,
                } = peer as CommissionedPeer;
                return [
                    address.nodeId,
                    { operationalServerAddress, discoveryData, deviceData },
                ] satisfies StoredOperationalPeer;
            }),
        );
    }
}
