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
    Construction,
    Crypto,
    CRYPTO_SYMMETRIC_KEY_LENGTH,
    Environment,
    ImplementationError,
    Logger,
    MatterError,
    Minutes,
    NetInterfaceSet,
    ServerAddress,
    ServerAddressIp,
    StorageBackendMemory,
    StorageManager,
} from "#general";
import { LegacyControllerStore } from "#LegacyControllerStore.js";
import {
    Advertiser,
    CertificateAuthority,
    ChannelManager,
    ClusterClient,
    CommissioningError,
    ControllerCommissioner,
    DecodedAttributeReportValue,
    DEFAULT_ADMIN_VENDOR_ID,
    DEFAULT_FABRIC_ID,
    DeviceAdvertiser,
    DiscoveryAndCommissioningOptions,
    DiscoveryData,
    DiscoveryOptions,
    ExchangeManager,
    Fabric,
    FabricBuilder,
    FabricManager,
    InteractionClientProvider,
    NodeDiscoveryType,
    OperationalPeer,
    PeerAddress,
    PeerAddressStore,
    PeerSet,
    ResumptionRecord,
    RetransmissionLimitReachedError,
    ScannerSet,
    SecureChannelProtocol,
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
import { ClassExtends } from "@matter/general";
import { ControllerCommissioningFlow, MessageChannel } from "@matter/protocol";

export type CommissionedNodeDetails = {
    operationalServerAddress?: ServerAddressIp;
    discoveryData?: DiscoveryData;
    deviceData?: DeviceInformationData;
};

const DEFAULT_FABRIC_INDEX = FabricIndex(1);

const CONTROLLER_CONNECTIONS_PER_FABRIC_AND_NODE = 3;
const CONTROLLER_MAX_PATHS_PER_INVOKE = 10;

const logger = Logger.get("MatterController");

// Operational peer extended with basic information as required for conversion to CommissionedNodeDetails
type CommissionedPeer = OperationalPeer & { deviceData?: DeviceInformationData };

// Backward-compatible persistence record for nodes
type StoredOperationalPeer = [NodeId, CommissionedNodeDetails];

export class MatterController {
    public static async create(options: {
        controllerStore: ControllerStoreInterface;
        scanners: ScannerSet;
        netInterfaces: NetInterfaceSet;
        sessionClosedCallback?: (peerNodeId: NodeId) => void;
        adminVendorId?: VendorId;
        adminFabricId?: FabricId;
        adminFabricIndex?: FabricIndex;
        caseAuthenticatedTags?: CaseAuthenticatedTag[];
        adminFabricLabel: string;
        rootNodeId?: NodeId;
        rootCertificateAuthority?: CertificateAuthority;
        rootFabric?: Fabric;
        crypto?: Crypto;
    }): Promise<MatterController> {
        const {
            controllerStore,
            scanners,
            netInterfaces,
            sessionClosedCallback,
            adminVendorId,
            adminFabricId = FabricId(DEFAULT_FABRIC_ID),
            adminFabricIndex = FabricIndex(DEFAULT_FABRIC_INDEX),
            caseAuthenticatedTags,
            adminFabricLabel,
            rootNodeId,
            rootCertificateAuthority,
            rootFabric,
        } = options;

        const crypto = options.crypto ?? Environment.default.get(Crypto);

        const ca = rootCertificateAuthority ?? (await CertificateAuthority.create(crypto, controllerStore.caStorage));
        const fabricStorage = controllerStore.fabricStorage;

        let controller: MatterController | undefined = undefined;
        // Check if we have a fabric stored in the storage, if yes initialize this one, else build a new one
        if (rootFabric !== undefined || (await fabricStorage.has("fabric"))) {
            const fabric = rootFabric ?? new Fabric(crypto, await fabricStorage.get<Fabric.Config>("fabric"));
            if (Bytes.areEqual(fabric.rootCert, ca.rootCert)) {
                logger.info("Used existing fabric");
                controller = new MatterController({
                    controllerStore,
                    scanners,
                    netInterfaces,
                    certificateManager: ca,
                    fabric,
                    adminFabricLabel,
                    sessionClosedCallback,
                });
                fabric.storage = fabricStorage;
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
            }
        }
        if (controller === undefined) {
            logger.info("Creating new fabric");
            const controllerNodeId = rootNodeId ?? NodeId.randomOperationalNodeId(crypto);
            const ipkValue = crypto.randomBytes(CRYPTO_SYMMETRIC_KEY_LENGTH);
            const fabricBuilder = await FabricBuilder.create(crypto);
            await fabricBuilder.setRootCert(ca.rootCert);
            fabricBuilder
                .setRootNodeId(controllerNodeId)
                .setIdentityProtectionKey(ipkValue)
                .setRootVendorId(adminVendorId ?? DEFAULT_ADMIN_VENDOR_ID)
                .setLabel(adminFabricLabel);
            await fabricBuilder.setOperationalCert(
                await ca.generateNoc(fabricBuilder.publicKey, adminFabricId, controllerNodeId, caseAuthenticatedTags),
            );
            const fabric = await fabricBuilder.build(adminFabricIndex);
            fabric.storage = fabricStorage;

            controller = new MatterController({
                controllerStore,
                scanners,
                netInterfaces,
                certificateManager: ca,
                fabric,
                adminFabricLabel,
                sessionClosedCallback,
            });
        }
        await controller.construction;
        return controller;
    }

    public static async createAsPaseCommissioner(options: {
        certificateAuthorityConfig?: CertificateAuthority.Configuration;
        rootCertificateAuthority?: CertificateAuthority;
        fabricConfig: Fabric.Config;
        scanners: ScannerSet;
        netInterfaces: NetInterfaceSet;
        adminFabricLabel: string;
        sessionClosedCallback?: (peerNodeId: NodeId) => void;
        crypto?: Crypto;
    }): Promise<MatterController> {
        const {
            certificateAuthorityConfig,
            rootCertificateAuthority,
            fabricConfig,
            adminFabricLabel,
            scanners,
            netInterfaces,
            sessionClosedCallback,
        } = options;

        const crypto = options.crypto ?? Environment.default.get(Crypto);

        // Verify an appropriate network interface is available
        if (!netInterfaces.hasInterfaceFor(ChannelType.BLE)) {
            if (!scanners.hasScannerFor(ChannelType.UDP) || !netInterfaces.hasInterfaceFor(ChannelType.UDP, "::")) {
                throw new ImplementationError(
                    "Ble must be initialized to create a Sub Commissioner without an IP network!",
                );
            }
            logger.info("BLE is not enabled. Using only IP network for commissioning.");
        }

        if (rootCertificateAuthority === undefined && certificateAuthorityConfig === undefined) {
            throw new ImplementationError("Either rootCertificateAuthority or certificateAuthorityConfig must be set.");
        }

        const certificateManager =
            rootCertificateAuthority ?? (await CertificateAuthority.create(crypto, certificateAuthorityConfig));

        // Stored data are temporary anyway and no node will be connected, so just use an in-memory storage
        const storageManager = new StorageManager(new StorageBackendMemory());
        await storageManager.initialize();

        const fabric = new Fabric(crypto, fabricConfig);
        // Check if we have a fabric stored in the storage, if yes initialize this one, else build a new one
        const controller = new MatterController({
            controllerStore: new LegacyControllerStore(storageManager.createContext("Commissioner")),
            scanners,
            netInterfaces,
            certificateManager,
            fabric,
            adminFabricLabel,
            sessionClosedCallback,
        });
        await controller.construction;
        return controller;
    }

    readonly sessionManager: SessionManager;
    private readonly netInterfaces = new NetInterfaceSet();
    private readonly channelManager = new ChannelManager(CONTROLLER_CONNECTIONS_PER_FABRIC_AND_NODE);
    private readonly exchangeManager: ExchangeManager;
    private readonly peers: PeerSet;
    private readonly clients: InteractionClientProvider;
    private readonly commissioner: ControllerCommissioner;
    #construction: Construction<MatterController>;

    #store: ControllerStoreInterface;
    readonly nodesStore: CommissionedNodeStore;
    private readonly scanners: ScannerSet;
    private readonly ca: CertificateAuthority;
    private readonly fabric: Fabric;
    private readonly sessionClosedCallback?: (peerNodeId: NodeId) => void;
    #advertiser: DeviceAdvertiser;

    get construction() {
        return this.#construction;
    }

    constructor(options: {
        controllerStore: ControllerStoreInterface;
        scanners: ScannerSet;
        netInterfaces: NetInterfaceSet;
        certificateManager: CertificateAuthority;
        fabric: Fabric;
        adminFabricLabel: string;
        sessionClosedCallback?: (peerNodeId: NodeId) => void;
    }) {
        const {
            controllerStore,
            scanners,
            netInterfaces,
            certificateManager,
            fabric,
            sessionClosedCallback,
            adminFabricLabel,
        } = options;
        this.#store = controllerStore;
        this.scanners = scanners;
        this.netInterfaces = netInterfaces;
        this.ca = certificateManager;
        this.fabric = fabric;
        this.sessionClosedCallback = sessionClosedCallback;

        const fabricManager = new FabricManager(fabric.crypto);
        fabricManager.addFabric(fabric);
        // Overwrite the persist callback and store fabric when needed
        fabric.persistCallback = async () => {
            await this.#store.fabricStorage.set("fabric", this.fabric.config);
        };

        this.sessionManager = new SessionManager({
            fabrics: fabricManager,
            storage: controllerStore.sessionStorage,
            parameters: {
                maxPathsPerInvoke: CONTROLLER_MAX_PATHS_PER_INVOKE,
            },
        });
        this.sessionManager.sessions.deleted.on(async session => {
            this.sessionClosedCallback?.(session.peerNodeId);
        });

        const subscriptionClient = new SubscriptionClient();

        this.exchangeManager = new ExchangeManager({
            crypto: fabric.crypto,
            sessionManager: this.sessionManager,
            channelManager: this.channelManager,
            transportInterfaces: this.netInterfaces,
        });
        this.exchangeManager.addProtocolHandler(new SecureChannelProtocol(this.sessionManager, fabricManager));
        this.exchangeManager.addProtocolHandler(subscriptionClient);

        // Adapts the historical storage format for MatterController to OperationalPeer objects
        this.nodesStore = new CommissionedNodeStore(controllerStore, fabric);

        this.nodesStore.peers = this.peers = new PeerSet({
            sessions: this.sessionManager,
            channels: this.channelManager,
            exchanges: this.exchangeManager,
            subscriptionClient,
            scanners: this.scanners,
            netInterfaces: this.netInterfaces,
            store: this.nodesStore,
        });

        this.clients = new InteractionClientProvider(this.peers);

        this.commissioner = new ControllerCommissioner({
            peers: this.peers,
            clients: this.clients,
            scanners: this.scanners,
            netInterfaces: this.netInterfaces,
            exchanges: this.exchangeManager,
            sessions: this.sessionManager,
            ca: this.ca,
        });

        this.#advertiser = new DeviceAdvertiser({
            fabrics: fabricManager,
            sessions: this.sessionManager,
        });

        this.#construction = Construction(this, async () => {
            await this.peers.construction.ready;
            await this.sessionManager.construction.ready;
            if (this.fabric.label !== adminFabricLabel) {
                await fabric.setLabel(adminFabricLabel);
            }
        });
    }

    get nodeId() {
        return this.fabric.rootNodeId;
    }

    get caConfig() {
        return this.ca.config;
    }

    get fabricConfig() {
        return this.fabric.config;
    }

    get sessions() {
        return this.sessionManager.sessions;
    }

    getFabrics() {
        return [this.fabric];
    }

    hasAdvertiser(advertiser: Advertiser) {
        return this.#advertiser.hasAdvertiser(advertiser);
    }

    addAdvertiser(advertiser: Advertiser) {
        this.#advertiser.addAdvertiser(advertiser);
    }

    async deleteBroadcaster(advertiser: Advertiser) {
        await this.#advertiser.deleteAdvertiser(advertiser);
    }

    public collectScanners(
        discoveryCapabilities: TypeFromPartialBitSchema<typeof DiscoveryCapabilitiesBitmap> = { onIpNetwork: true },
    ) {
        // Note we always scan via MDNS if available
        return this.scanners.filter(
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
        const commissioningOptions: DiscoveryAndCommissioningOptions = {
            ...options.commissioning,
            fabric: this.fabric,
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

        const address = await this.commissioner.commissionWithDiscovery(commissioningOptions);

        await this.fabric.persist();

        return address.nodeId;
    }

    async disconnect(nodeId: NodeId) {
        return this.peers.disconnect(this.fabric.addressOf(nodeId));
    }

    async connectPaseChannel(options: NodeCommissioningOptions) {
        const { paseSecureChannel } = await this.commissioner.discoverAndEstablishPase({
            ...options.commissioning,
            fabric: this.fabric,
            discovery: options.discovery,
            passcode: options.passcode,
        });
        logger.warn("PASE channel established", paseSecureChannel.session.name, paseSecureChannel.session.isSecure);
        return paseSecureChannel;
    }

    async removeNode(nodeId: NodeId) {
        return this.peers.delete(this.fabric.addressOf(nodeId));
    }

    /**
     * Method to complete the commissioning process to a node which was initialized with a PASE secure channel.
     */
    async completeCommissioning(peerNodeId: NodeId, discoveryData?: DiscoveryData) {
        // Look for the device broadcast over MDNS and do CASE pairing
        const interactionClient = await this.connect(
            peerNodeId,
            {
                discoveryType: NodeDiscoveryType.TimedDiscovery,
                timeout: Minutes(2),
                discoveryData,
            },
            true,
        ); // Wait maximum 120s to find the operational device for commissioning process
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
            await this.peers.delete(this.fabric.addressOf(peerNodeId));
            throw new CommissioningError(`Commission error on commissioningComplete: ${errorCode}, ${debugText}`);
        }
        await this.fabric.persist();
    }

    isCommissioned() {
        return this.peers.size > 0;
    }

    getCommissionedNodes() {
        return this.peers.map(peer => peer.address.nodeId);
    }

    getCommissionedNodesDetails() {
        return this.peers.map(peer => {
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
        const nodeDetails = this.peers.get(this.fabric.addressOf(nodeId)) as CommissionedPeer;
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
        const nodeDetails = this.peers.get(this.fabric.addressOf(nodeId)) as CommissionedPeer;
        if (nodeDetails === undefined) {
            throw new Error(`Node ${nodeId} is not commissioned.`);
        }
        nodeDetails.deviceData = deviceData;
        await this.nodesStore.save();
    }

    /**
     * Connect to the device by opening a channel and creating a new CASE session if necessary.
     * Returns a InteractionClient on success.
     */
    async connect(
        peerNodeId: NodeId,
        discoveryOptions: DiscoveryOptions,
        allowUnknownPeer?: boolean,
        caseAuthenticatedTags?: CaseAuthenticatedTag[],
    ) {
        return this.clients.connect(this.fabric.addressOf(peerNodeId), {
            discoveryOptions,
            allowUnknownPeer,
            caseAuthenticatedTags,
        });
    }

    createInteractionClient(peerNodeIdOrChannel: NodeId | MessageChannel, discoveryOptions: DiscoveryOptions) {
        if (peerNodeIdOrChannel instanceof MessageChannel) {
            return this.clients.getInteractionClientForChannel(peerNodeIdOrChannel);
        }
        return this.clients.getInteractionClient(this.fabric.addressOf(peerNodeIdOrChannel), discoveryOptions);
    }

    async getNextAvailableSessionId() {
        return this.sessionManager.getNextAvailableSessionId();
    }

    getResumptionRecord(resumptionId: Bytes) {
        return this.sessionManager.findResumptionRecordById(resumptionId);
    }

    findResumptionRecordByNodeId(nodeId: NodeId) {
        return this.sessionManager.findResumptionRecordByAddress(this.fabric.addressOf(nodeId));
    }

    async saveResumptionRecord(resumptionRecord: ResumptionRecord) {
        return this.sessionManager.saveResumptionRecord(resumptionRecord);
    }

    announce() {
        // Announce the controller itself
        this.#advertiser.enterOperationalMode();
    }

    async close() {
        await this.peers.close();
        await this.exchangeManager.close();
        await this.sessionManager.close();
        await this.channelManager.close();
        await this.netInterfaces.close();
        await this.#advertiser.close();
    }

    getActiveSessionInformation() {
        return this.sessionManager.getActiveSessionInformation();
    }

    async getStoredClusterDataVersions(
        nodeId: NodeId,
        filterEndpointId?: EndpointNumber,
        filterClusterId?: ClusterId,
    ): Promise<{ endpointId: EndpointNumber; clusterId: ClusterId; dataVersion: number }[]> {
        const peer = this.peers.get(this.fabric.addressOf(nodeId));
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
        const peer = this.peers.get(this.fabric.addressOf(nodeId));
        if (peer === undefined || peer.dataStore === undefined) {
            return []; // We have no store, also no data
        }
        await peer.dataStore.construction;
        return peer.dataStore.retrieveAttributes(endpointId, clusterId);
    }

    async updateFabricLabel(label: string) {
        await this.fabric.setLabel(label);
    }
}

class CommissionedNodeStore extends PeerAddressStore {
    declare peers: PeerSet;
    #controllerStore: ControllerStoreInterface;

    constructor(
        controllerStore: ControllerStoreInterface,
        private fabric: Fabric,
    ) {
        super();
        this.#controllerStore = controllerStore;
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
            const address = this.fabric.addressOf(nodeId);
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
