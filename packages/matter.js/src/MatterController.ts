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

import { BasicInformationClient } from "#behaviors/basic-information";
import { ClusterClient } from "#cluster/client/ClusterClient.js";
import { InteractionClientProvider } from "#cluster/client/InteractionClient.js";
import { GeneralCommissioning } from "#clusters";
import type { NodeCommissioningOptions } from "#CommissioningController.js";
import { ControllerStore, ControllerStoreInterface } from "#ControllerStore.js";
import { DeviceInformationData } from "#device/DeviceInformation.js";
import { OtaProviderEndpoint } from "#endpoints/ota-provider";
import {
    Bytes,
    ChannelType,
    ClassExtends,
    ConnectionlessTransportSet,
    Construction,
    Crypto,
    Diagnostic,
    Environment,
    ImplementationError,
    InternalError,
    isDeepEqual,
    isObject,
    Logger,
    MatterError,
    MaybePromise,
    Minutes,
    ServerAddress,
    ServerAddressUdp,
    StorageBackendMemory,
    StorageManager,
    StorageService,
    SupportedStorageTypes,
} from "#general";
import {
    ClientNode,
    CommissioningClient,
    Endpoint,
    NetworkClient,
    NodePhysicalProperties,
    Peers,
    RemoteDescriptor,
    ServerNode,
    ServerNodeStore,
} from "#node";
import {
    CertificateAuthority,
    CommissioningError,
    ControllerCommissioner,
    ControllerCommissioningFlow,
    DiscoveryAndCommissioningOptions,
    DiscoveryData,
    Fabric,
    FabricAuthority,
    FabricManager,
    NodeDiscoveryType,
    PeerAddress,
    PeerAddressStore,
    PeerConnectionOptions,
    PeerDataStore,
    PeerDescriptor,
    PeerSet,
    PhysicalDeviceProperties,
    RetransmissionLimitReachedError,
    ScannerSet,
    SecureSession,
    SessionManager,
} from "#protocol";
import {
    CaseAuthenticatedTag,
    DiscoveryCapabilitiesBitmap,
    EndpointNumber,
    EventNumber,
    FabricId,
    FabricIndex,
    NodeId,
    TypeFromPartialBitSchema,
    VendorId,
} from "#types";
import type { ClientNodeInteraction } from "@matter/node";

export type CommissionedNodeDetails = {
    operationalServerAddress?: ServerAddressUdp;
    discoveryData?: DiscoveryData;
    deviceData?: DeviceInformationData;
};

const DEFAULT_FABRIC_INDEX = FabricIndex(1);

const logger = Logger.get("MatterController");

// Operational peer extended with basic information as required for conversion to CommissionedNodeDetails
type CommissionedPeer = PeerDescriptor & { deviceData?: DeviceInformationData };

// Backward-compatible persistence record for nodes
type StoredOperationalPeer = [NodeId, CommissionedNodeDetails];

export type PairedNodeDetails = {
    nodeId: NodeId;
    operationalAddress?: string;
    advertisedName?: string;
    discoveryData?: RemoteDescriptor;
    deviceData: {
        basicInformation?: Record<string, SupportedStorageTypes>;
        deviceMeta?: PhysicalDeviceProperties;
    };
};

export class MatterController {
    public static async create(options: {
        id: string;
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
        enableOtaProvider?: boolean;
    }): Promise<MatterController> {
        const {
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

        let controller: MatterController | undefined = undefined;
        let fabric: Fabric | undefined = rootFabric;

        const baseStorage: StorageManager = await options.environment.get(StorageService).open(options.id);

        const oldStorage = baseStorage.createContext("credentials");
        const newStorage = baseStorage.createContext("certificates");

        const keys = await oldStorage.keys();

        if (keys.length !== 0) {
            for (const key of await oldStorage.keys()) {
                if (key === "fabric") {
                    if (rootFabric !== undefined) {
                        logger.info("Skipping fabric migration because a rootFabric was provided.");
                        continue;
                    }
                    fabric = await Fabric.create(
                        Environment.default.get(Crypto),
                        await oldStorage.get<Fabric.Config>("fabric"),
                    );
                } else {
                    // Migrates Certificate Authority data to new location
                    if (!(await newStorage.has(key))) {
                        newStorage.set(key, await oldStorage.get(key));
                    }
                }
            }
        }

        if (rootCertificateAuthority !== undefined) {
            environment.set(CertificateAuthority, rootCertificateAuthority);
        }

        controller = new MatterController({
            ...options,
            fabric,
        });

        await controller.construction;
        return controller;
    }

    public static async createAsPaseCommissioner(options: {
        id: string;
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
        environment.set(StorageService, new StorageService(environment, () => new StorageBackendMemory()));

        const fabric = await Fabric.create(crypto, fabricConfig);
        if (!Bytes.areEqual(fabric.rootCert, ca.rootCert)) {
            throw new MatterError("Fabric CA certificate is not in sync with CA.");
        }

        // Check if we have a fabric stored in the storage, if yes initialize this one, else build a new one
        const controller = new MatterController({
            ...options,
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
    #clients?: InteractionClientProvider;

    get construction() {
        return this.#construction;
    }

    constructor(options: {
        id: string;
        fabric?: Fabric;
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
        enableOtaProvider?: boolean;
    }) {
        const crypto = options.environment.get(Crypto);
        const {
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
            enableOtaProvider = false,
        } = options;

        this.#construction = Construction(this, async () => {
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
                    persistenceEnabled: false, // Disable because that's a device feature
                },
            });

            if (enableOtaProvider) {
                await this.#enableOtaProvider();
            }

            const fabricManager = await this.#node.env.load(FabricManager);
            const fabricAuthority = await this.#node.env.load(FabricAuthority);
            if (fabric !== undefined) {
                if (!fabricManager.has(fabric.fabricIndex)) {
                    if (fabricAuthority.hasControlOf(fabric)) {
                        logger.info(
                            `Adding provided fabric with index ${fabric.fabricIndex} under the control of the Fabric Authority`,
                        );
                        fabricManager.addFabric(fabric);
                        await fabricManager.persistFabrics();
                    } else {
                        throw new ImplementationError(
                            `Provided fabric with index ${fabric.fabricIndex} is not under the control of the Fabric Authority`,
                        );
                    }
                }
            }
            this.#fabric = await fabricAuthority.defaultFabric({
                adminFabricLabel,
                adminVendorId,
                adminNodeId: rootNodeId,
                adminFabricId,
                caseAuthenticatedTags,
            });
            if (fabric !== undefined) {
                if (
                    !fabricAuthority.fabrics.some(
                        controlledFabric =>
                            controlledFabric.fabricIndex === fabric.fabricIndex && fabricAuthority.hasControlOf(fabric),
                    )
                ) {
                    throw new ImplementationError(
                        `Fabric with index ${fabric.fabricIndex} is already present but not under the control of the Fabric Authority`,
                    );
                } else {
                    logger.info(
                        `Fabric with index ${fabric.fabricIndex} and matching keys is already present, initialized correctly.`,
                    );
                }
            }

            if (this.#fabric !== undefined) {
                await this.#migrateNodeData(this.#node, this.#fabric);
            }

            // TODO
            //await (await options.environment.get(StorageService).open(options.id))
            //    .createContext("credentials")
            //    .clearAll(); // Clear old credentials storage

            this.#peers = this.#node.env.get(PeerSet);
        });
    }

    #enableOtaProvider() {
        if (!this.#node) {
            throw new ImplementationError("Node is not initialized yet");
        }
        if (this.#node.endpoints.has("ota-provider")) {
            return; // Already enabled
        }
        return this.#node.add(new Endpoint(OtaProviderEndpoint, { id: "ota-provider" }));
    }

    get ble() {
        return this.node.state.network.ble ?? false;
    }

    get fabric() {
        this.#construction.assert();
        if (this.#fabric === undefined) {
            throw new InternalError("Fabric is not initialized.");
        }
        return this.#fabric;
    }

    get nodeId() {
        return this.fabric.rootNodeId;
    }

    get caConfig() {
        return this.node.env.get(CertificateAuthority).config;
    }

    get fabricConfig() {
        return this.fabric.config;
    }

    get sessions() {
        return this.node.env.get(SessionManager);
    }

    getFabrics() {
        return [this.fabric];
    }

    collectScanners(
        discoveryCapabilities: TypeFromPartialBitSchema<typeof DiscoveryCapabilitiesBitmap> = { onIpNetwork: true },
    ) {
        this.#construction.assert();
        // Note we always scan via MDNS if available
        return this.node.env
            .get(ScannerSet)
            .filter(
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

        const address = await this.node.env.get(ControllerCommissioner).commissionWithDiscovery(commissioningOptions);

        await this.fabric.persist();

        return address.nodeId;
    }

    async disconnect(nodeId: NodeId) {
        const node = await this.node.peers.forAddress(this.fabric.addressOf(nodeId));
        return await node.disable();
    }

    async connectPaseChannel(options: NodeCommissioningOptions) {
        const { paseSession } = await this.node.env.get(ControllerCommissioner).discoverAndEstablishPase({
            ...options.commissioning,
            fabric: this.fabric,
            discovery: options.discovery,
            passcode: options.passcode,
        });
        logger.warn("PASE channel established", paseSession.via, paseSession.isSecure);
        return paseSession;
    }

    async removeNode(nodeId: NodeId) {
        const peerAddress = this.fabric.addressOf(nodeId);
        const node = await this.node.peers.forAddress(peerAddress);
        const peer = this.node.env.get(PeerSet).for(peerAddress);
        await node.delete();
        await peer.delete();
    }

    /**
     * Method to complete the commissioning process to a node which was initialized with a PASE secure channel.
     * TODO validate
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
            await this.#peers?.get(this.fabric.addressOf(peerNodeId))?.delete();
            throw new CommissioningError(`Commission error on commissioningComplete: ${errorCode}, ${debugText}`);
        }
        await this.fabric.persist();
    }

    isCommissioned() {
        return !!this.getCommissionedNodes().length;
    }

    getCommissionedNodes() {
        return this.node.peers
            .map(
                peer =>
                    (peer.lifecycle.isReady && peer.maybeStateOf(CommissioningClient)?.peerAddress?.nodeId) ||
                    undefined,
            )
            .filter(nodeId => nodeId !== undefined);
    }

    #commissionedNodeDetailsForNode(peer: ClientNode): PairedNodeDetails {
        const { peerAddress, addresses, deviceName } = peer.state.commissioning;
        return {
            nodeId: peerAddress!.nodeId,
            operationalAddress: Array.isArray(addresses) ? ServerAddress.urlFor(addresses[0]) : undefined,
            advertisedName: deviceName,
            discoveryData: RemoteDescriptor.fromLongForm(peer.state.commissioning),
            deviceData: {
                basicInformation: peer.maybeStateOf(BasicInformationClient),
                deviceMeta: NodePhysicalProperties(peer),
            },
        };
    }

    getCommissionedNodesDetails(): PairedNodeDetails[] {
        return this.node.peers
            .filter(peer => peer.lifecycle.isReady && peer.maybeStateOf(CommissioningClient)?.peerAddress !== undefined)
            .map(peer => this.#commissionedNodeDetailsForNode(peer));
    }

    getCommissionedNodeDetails(nodeId: NodeId) {
        const address = this.fabric.addressOf(nodeId);
        const peer = this.node.peers.get(address);
        if (peer === undefined || !peer.lifecycle.isReady) {
            throw new Error(`Node ${nodeId} is not commissioned.`);
        }
        return this.#commissionedNodeDetailsForNode(peer);
    }

    /**
     * Connect to the device by opening a channel and creating a new CASE session if necessary.
     * Returns a InteractionClient on success.
     */
    async connect(peerNodeId: NodeId, options: MatterController.ConnectOptions) {
        const address = this.fabric.addressOf(peerNodeId);
        let node = this.node.peers.get(address);
        if (node === undefined) {
            if (!options.allowUnknownPeer) {
                throw new MatterError(`Node ${peerNodeId} is not commissioned on this controller.`);
            }
            node = await this.node.peers.forAddress(address);
        }
        if (
            options.caseAuthenticatedTags !== undefined &&
            !isDeepEqual(options.caseAuthenticatedTags, node.state.network.caseAuthenticatedTags)
        ) {
            await node.setStateOf(NetworkClient, { caseAuthenticatedTags: options.caseAuthenticatedTags });
        }
        await node.enable();
        return this.#clients!.connect(this.fabric.addressOf(peerNodeId), options);
    }

    createInteractionClient(peerNodeIdOrSession: NodeId | SecureSession, options: PeerConnectionOptions = {}) {
        if (peerNodeIdOrSession instanceof SecureSession) {
            return this.#clients!.interactionClientFor(peerNodeIdOrSession);
        }
        const address = this.fabric.addressOf(peerNodeIdOrSession);
        return this.#clients!.getNodeInteractionClient(address, options);
    }

    async start() {
        await this.node.start();
        this.#clients = new InteractionClientProvider(this.node);
    }

    async close() {
        await this.#node?.close();
        this.#clients = undefined;
    }

    getActiveSessionInformation() {
        return this.node.env.get(SessionManager).getActiveSessionInformation();
    }

    get node() {
        this.#construction.assert();
        return this.#node!;
    }

    async updateFabricLabel(label: string) {
        await this.fabric.setLabel(label);
    }

    async #migrateNodeData(server: ServerNode, fabric: Fabric) {
        const baseStorage = await server.env.get(StorageService).open(server.id);
        const baseNodeStorage = baseStorage.createContext("nodes");

        // Initialize a custom PeerAddressStore to manage commissioned nodes storage in legacy storage format
        // Data migration needed
        const controllerStore = await ControllerStore.create(server.id, server.env);
        if (!(await controllerStore.nodesStorage.has("commissionedNodes"))) {
            // No commissionedNodes key, so simply migrate nothing
            return;
        }

        const peerStore = new CommissionedNodeStore(controllerStore, fabric, server.peers);
        const peers = await peerStore.loadPeers();
        if (peers.length === 0) {
            logger.debug("No former commissioned nodes to migrate.");
            return;
        }
        const migratedPeers = new Set<string>();

        const newClientStores = server.env.get(ServerNodeStore).clientStores;
        for (const { address: peerAddress, discoveryData, deviceData, operationalAddress } of peers) {
            logger.debug(`Migrating data for commissioned node ${peerAddress.toString()}`);
            const clientNode = server.peers.get(peerAddress);
            if (clientNode !== undefined) {
                logger.debug(`Node ${peerAddress.nodeId} seems already migrated, skipping.`);
                if (clientNode.stateOf(NetworkClient).autoSubscribe) {
                    logger.debug(` Disabling auto subscribe on node ${peerAddress.nodeId}`);
                    await clientNode.setStateOf(NetworkClient, { autoSubscribe: false });
                }
                continue;
            }

            const id = newClientStores.allocateId(); // Manually allocate next id to allow data migration before we add the node
            logger.debug(`Allocated client node store id ${id} for node ${peerAddress.toString()}`);
            migratedPeers.add(id);

            logger.debug(
                ` Migrating stored data for node ${peerAddress.toString()}: node-${peerAddress.nodeId.toString()}`,
            );
            const oldDataStore = await controllerStore.clientNodeStore(peerAddress.nodeId.toString());
            const maxEventNumber = await oldDataStore.get<EventNumber>("__maxEventNumber__", EventNumber(0));

            const peerStorage = baseNodeStorage.createContext(id);
            const endpointStorage = peerStorage.createContext("endpoints");
            const oldEndpoints = await oldDataStore.contexts();
            if (oldEndpoints.length === 0) {
                logger.info(`No endpoint data to migrate for node ${peerAddress.toString()}`);
            }
            for (const ep of oldEndpoints) {
                logger.debug(`  Migrating data for endpoint ${ep} of node ${peerAddress.toString()}`);
                const oldEndpointStorage = oldDataStore.createContext(ep);
                const newEndpointStorage = endpointStorage.createContext(ep);
                for (const cluster of await oldEndpointStorage.contexts()) {
                    logger.debug(
                        `    Migrating data for cluster ${cluster} of endpoint ${ep} of node ${peerAddress.toString()}`,
                    );
                    const oldClusterStorage = oldEndpointStorage.createContext(cluster);
                    const newClusterStorage = newEndpointStorage.createContext(cluster);
                    for (const key of await oldClusterStorage.keys()) {
                        const value = await oldClusterStorage.get(key);
                        if (key === "__version__") {
                            await newClusterStorage.set(key, value);
                        } else if (isObject(value) && "value" in value) {
                            // Old storage contained "value" and "attributeName", just store value now
                            await newClusterStorage.set(key, value.value);
                        }
                    }
                }
            }

            const commissioning = RemoteDescriptor.toLongForm({
                ...(discoveryData ? deviceData : {}),
                addresses: operationalAddress ? [operationalAddress] : [],
            });
            logger.debug(
                `Initialize node store for migrated node ${peerAddress.toString()}`,
                Diagnostic.dict({ maxEventNumber, ...commissioning }),
            );
            const node = await server.peers.forAddress(peerAddress, { id });
            await node.set({
                commissioning,
                network: {
                    maxEventNumber,
                    autoSubscribe: false,
                },
            });

            if ((await oldDataStore.contexts()).length) {
                logger.info(`Deleting old storage for node ${peerAddress.nodeId}`);
                //await oldDataStore.clearAll(); // TODO
            }
        }

        //await controllerStore.nodesStorage.delete("commissionedNodes"); // TODO

        server.peers.clusterInstalled(BasicInformationClient).on(peer => {
            if (!migratedPeers.has(peer.id)) {
                logger.info(`Migrating commissioned node ${peer.id} to old format`);
                migratedPeers.add(peer.id);
                peerStore.save().catch(error => logger.warn("Failed to persist legacy commissioned nodes", error));
            }
        });
        server.peers.deleted.on(peer => {
            migratedPeers.delete(peer.id);
            logger.info(`Deleted commissioned node ${peer.id} from old format`);
            peerStore.save().catch(error => logger.warn("Failed to persist legacy commissioned nodes", error));
        });

        logger.info("Commissioned nodes migration completed.");
    }
}

export namespace MatterController {
    export interface ConnectOptions extends PeerConnectionOptions {
        allowUnknownPeer?: boolean;
    }
}

/**
 * Only used for Node data migration
 */
class CommissionedNodeStore extends PeerAddressStore {
    #peers: Peers;
    #controllerStore: ControllerStoreInterface;
    #fabric: Fabric;

    constructor(controllerStore: ControllerStoreInterface, fabric: Fabric, peers: Peers) {
        super();
        this.#controllerStore = controllerStore;
        this.#fabric = fabric;
        this.#peers = peers;
    }

    createNodeStore(_address: PeerAddress): MaybePromise<PeerDataStore | undefined> {
        throw new ImplementationError("Not implemented");
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
            this.#peers
                .map(peer => {
                    const commissioningState = peer.maybeStateOf(CommissioningClient);
                    const address = commissioningState?.peerAddress;
                    const operationalServerAddress = commissioningState?.addresses?.[0];
                    const discoveryData =
                        commissioningState !== undefined
                            ? RemoteDescriptor.fromLongForm(commissioningState)
                            : undefined;
                    const deviceData = {
                        meta: (peer.interaction as ClientNodeInteraction).physicalProperties,
                        basicInformation: peer.maybeStateOf(BasicInformationClient),
                    };

                    if (address === undefined) {
                        return;
                    }
                    return [
                        address.nodeId,
                        {
                            operationalServerAddress:
                                operationalServerAddress !== undefined && operationalServerAddress.type === "udp"
                                    ? (ServerAddress(operationalServerAddress) as ServerAddressUdp)
                                    : undefined,
                            discoveryData,
                            deviceData,
                        },
                    ] satisfies StoredOperationalPeer;
                })
                .filter(details => details !== undefined),
        );
    }
}
