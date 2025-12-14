/**
 * @license
 * Copyright 2022-2025 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { OperationalCredentials } from "#clusters";
import {
    ClassExtends,
    Crypto,
    Duration,
    Environment,
    ImplementationError,
    Logger,
    Minutes,
    UnexpectedDataError,
} from "#general";
import {
    ControllerCommissioningFlow,
    DiscoveryAndCommissioningOptions,
    InteractionClient,
    NetworkClient,
    ServerNode,
} from "#node";
import {
    ActiveSessionInformation,
    Ble,
    CertificateAuthority,
    CommissionableDevice,
    CommissionableDeviceIdentifiers,
    ControllerDiscovery,
    DiscoveryData,
    Fabric,
    FabricGroups,
    NodeDiscoveryType,
    NodeSession,
    PeerSet,
    SecureSession,
    Session,
    SessionManager,
} from "#protocol";
import {
    CaseAuthenticatedTag,
    DiscoveryCapabilitiesBitmap,
    FabricId,
    FabricIndex,
    NodeId,
    TypeFromPartialBitSchema,
    VendorId,
} from "#types";
import { CommissioningControllerNodeOptions, NodeStates, PairedNode } from "./device/PairedNode.js";
import { MatterController, PairedNodeDetails } from "./MatterController.js";

const logger = new Logger("CommissioningController");

// TODO how to enhance "getting devices" as API? Or is getDevices() enough?
// TODO decline using setRoot*Cluster
// TODO Decline cluster access after announced/paired

export type ControllerEnvironmentOptions = {
    /**
     * Environment to register the node with on start()
     */
    readonly environment: Environment;

    /**
     * Unique id to register to node.
     */
    readonly id: string;
};

/**
 * Constructor options for the CommissioningController class
 */
export type CommissioningControllerOptions = CommissioningControllerNodeOptions & {
    /**
     * Local port number to use for the UDP interface. By default, a random port number will be generated
     * (strongly recommended!).
     */
    readonly localPort?: number;

    /** Listening address for IPv4. By default, the interface will listen on all IPv4 addresses. */
    readonly listeningAddressIpv4?: string;

    /** Listening address for IPv6. By default, the interface will listen on all IPv6 addresses. */
    readonly listeningAddressIpv6?: string;

    /**
     * If set to false, the controller will not connect to any device on startup. You need to use connectNode() or
     * connect() to connect to the relevant nodes in this case. Else all nodes are connected on startup.
     * */
    readonly autoConnect?: boolean;

    /** Admin Vendor ID used for all commissioning operations. Cannot be changed afterward. Default: 0xFFF1 */
    readonly adminVendorId?: VendorId;

    /**
     * Controller own Fabric ID used to initialize the Controller the first time and to generate the Root certificate.
     * Cannot be changed afterward.
     * Default: 1
     */
    readonly adminFabricId?: FabricId;

    /**
     * Fabric Index used to initialize the Controller the first time. Cannot be changed afterward.
     * Default: 1
     */
    readonly adminFabricIndex?: FabricIndex;

    /**
     * CASE Authenticated Tags used to initialize the Controller the first time. Cannot be changed afterward.
     * Maximum 3 tags are supported.
     */
    readonly caseAuthenticatedTags?: CaseAuthenticatedTag[];

    /**
     * The Fabric Label to set for the commissioned devices. The #label is used for users to identify the admin.
     * The maximum length are 32 characters!
     * The value will automatically be checked on connection to a node and updated if necessary.
     */
    readonly adminFabricLabel: string;

    /**
     * When used with the new API Environment set the environment here and the CommissioningServer will self-register
     * on the environment when you call start().
     */
    readonly environment: ControllerEnvironmentOptions;

    /**
     * The NodeId of the root node to use for the controller. This is only needed if a special NodeId needs to be used
     * but certificates should be self-generated. By default, a random operational ID is generated.
     */
    readonly rootNodeId?: NodeId;

    /**
     * If provided this Certificate Authority instance is used to fetch or get all relevant certificates for the
     * Controller. If not provided a new Certificate Authority instance is created and certificates will be self-generated.
     */
    readonly rootCertificateAuthority?: CertificateAuthority;

    /**
     * If provided this Fabric instance is used for this controller. The instance need to be in sync with the provided
     * or stored certificate authority. If provided then rootFabricId, rootFabricIndex and rootFabricLabel are ignored.
     */
    readonly rootFabric?: Fabric;
};

/** Options needed to commission a new node */
export type NodeCommissioningOptions = CommissioningControllerNodeOptions & {
    commissioning: Omit<DiscoveryAndCommissioningOptions, "fabric" | "discovery" | "passcode">;
    discovery: DiscoveryAndCommissioningOptions["discovery"];
    passcode: number;
};

/** Controller class to commission and connect multiple nodes into one fabric. */
export class CommissioningController {
    #crypto: Crypto;
    #started = false;
    #ipv4Disabled?: boolean;
    readonly #listeningAddressIpv4?: string;
    readonly #listeningAddressIpv6?: string;

    readonly #options: CommissioningControllerOptions;
    #id: string;

    #environment: Environment; // Set when new API was initialized correctly

    #controllerInstance?: MatterController;
    readonly #initializedNodes = new Map<string, PairedNode>();
    readonly #nodeUpdateLabelHandlers = new Map<NodeId, (nodeState: NodeStates) => Promise<void>>();
    readonly #sessionDisconnectedHandler = new Map<NodeId, () => Promise<void>>();

    /**
     * Creates a new CommissioningController instance
     *
     * @param options The options for the CommissioningController
     */
    constructor(options: CommissioningControllerOptions) {
        if (options.environment === undefined) {
            throw new ImplementationError("Initialization not done. Add the controller to the MatterServer first.");
        }

        const { environment, id } = options.environment;
        this.#environment = new Environment(id, environment);
        this.#id = id;

        this.#options = options;
        this.#crypto = this.#environment.get(Crypto);
        this.#crypto.reportUsage();
    }

    /** Returns the controller node instance. Throws an error when called before start() or after close(). */
    get node(): ServerNode {
        return this.#assertControllerIsStarted().node;
    }

    get crypto() {
        return this.#crypto;
    }

    get nodeId() {
        return this.#controllerInstance?.nodeId;
    }

    /** Returns the configuration data needed to create a PASE commissioner, e.g. in a mobile app. */
    get paseCommissionerConfig() {
        const controller = this.#assertControllerIsStarted(
            "The CommissioningController needs to be started to get the PASE commissioner data.",
        );
        const { caConfig, fabricConfig: fabricData } = controller;
        return {
            caConfig,
            fabricData,
        };
    }

    #assertControllerIsStarted(errorText?: string) {
        if (this.#controllerInstance === undefined) {
            throw new ImplementationError(
                errorText ?? "Controller instance not yet started. Please call start() first.",
            );
        }
        return this.#controllerInstance;
    }

    /** Internal method to initialize a MatterController instance. */
    async #initializeController() {
        if (this.#controllerInstance !== undefined) {
            return this.#controllerInstance;
        }
        const {
            localPort,
            adminFabricId,
            adminVendorId,
            adminFabricIndex,
            caseAuthenticatedTags,
            adminFabricLabel,
            rootNodeId,
            rootCertificateAuthority,
            rootFabric,
        } = this.#options;

        // Initialize the Storage in a compatible way for the legacy API and new style for new API
        // TODO: clean this up when we really implement ControllerNode/ClientNode concepts in new API
        const controller = await MatterController.create({
            id: this.#id,
            adminVendorId,
            adminFabricId,
            adminFabricIndex,
            caseAuthenticatedTags,
            adminFabricLabel,
            rootNodeId,
            rootCertificateAuthority,
            rootFabric,
            ble: !!(this.#environment.maybeGet(Ble) ?? Environment.default.maybeGet(Ble)),
            ipv4: !this.#ipv4Disabled,
            listeningAddressIpv4: this.#listeningAddressIpv4,
            listeningAddressIpv6: this.#listeningAddressIpv6,
            localPort,
            environment: this.#environment,
        });

        if (!controller.ble) {
            logger.warn("BLE is not enabled on this platform");
        }

        // Start all peers, they should normally not connect automatically
        // TODO adjust/remove once we have this in Peers
        for (const peer of controller.node.peers) {
            if (!peer.lifecycle.isCommissioned) {
                continue;
            }
            if (peer.stateOf(NetworkClient).isDisabled) {
                await peer.enable();
            } else {
                await peer.start();
            }
        }

        return controller;
    }

    /**
     * Commissions/Pairs a new device into the controller fabric. The method returns the NodeId of the commissioned
     * node on success.
     */
    async commissionNode(
        nodeOptions: NodeCommissioningOptions,
        commissionOptions?: {
            connectNodeAfterCommissioning?: boolean;
            commissioningFlowImpl?: ClassExtends<ControllerCommissioningFlow>;
        },
    ) {
        const controller = this.#assertControllerIsStarted();

        const { connectNodeAfterCommissioning = true, commissioningFlowImpl } = commissionOptions ?? {};

        const nodeId = await controller.commission(nodeOptions, { commissioningFlowImpl });

        // Ensure we have the peer added to the node because commissioning runs aside for now
        await controller.node.peers.forAddress(controller.fabric.addressOf(nodeId), {
            network: {
                autoSubscribe: false,
                caseAuthenticatedTags: nodeOptions.caseAuthenticatedTags ?? this.#options.caseAuthenticatedTags,
            },
        });

        if (connectNodeAfterCommissioning) {
            const node = await this.#createPairedNode(nodeId, {
                ...nodeOptions,
                autoSubscribe: nodeOptions.autoSubscribe ?? this.#options.autoSubscribe,
                subscribeMinIntervalFloorSeconds:
                    nodeOptions.subscribeMinIntervalFloorSeconds ?? this.#options.subscribeMinIntervalFloorSeconds,
                subscribeMaxIntervalCeilingSeconds:
                    nodeOptions.subscribeMaxIntervalCeilingSeconds ?? this.#options.subscribeMaxIntervalCeilingSeconds,
            });
            await node.events.initialized;
        }

        return nodeId;
    }

    connectPaseChannel(nodeOptions: NodeCommissioningOptions): Promise<NodeSession> {
        const controller = this.#assertControllerIsStarted();

        return controller.connectPaseChannel(nodeOptions);
    }

    /**
     * Completes the commissioning process for a node when the initial commissioning process was done by a PASE
     * commissioner. This method should be called to discover the device operational and complete the commissioning
     * process.
     */
    completeCommissioningForNode(peerNodeId: NodeId, discoveryData?: DiscoveryData) {
        const controller = this.#assertControllerIsStarted();
        return controller.completeCommissioning(peerNodeId, discoveryData);
    }

    /** Check if a given node id is commissioned on this controller. */
    isNodeCommissioned(nodeId: NodeId) {
        const controller = this.#assertControllerIsStarted();
        return controller.getCommissionedNodes().includes(nodeId) ?? false;
    }

    #pairedNodeForNodeId(nodeId: NodeId) {
        const controller = this.#assertControllerIsStarted();
        const peerId = controller.node.peers.get(controller.fabric.addressOf(nodeId))?.id;
        if (peerId === undefined) {
            return undefined;
        }
        return this.#initializedNodes.get(peerId);
    }

    /**
     * Remove a Node id from the controller. This method should only be used if the decommission method on the
     * PairedNode instance returns an error. By default, it tries to decommission the node from the controller but will
     * remove it also in case of an error during decommissioning. Ideally try to decommission the node before and only
     * use this in case of an error as last option.
     * If this method is used the state of the PairedNode instance might be out of sync, so the PairedNode instance
     * should be disconnected first.
     */
    async removeNode(nodeId: NodeId, tryDecommissioning = true) {
        const controller = this.#assertControllerIsStarted();
        const node = this.#pairedNodeForNodeId(nodeId);
        let decommissionSuccess = false;
        if (tryDecommissioning) {
            try {
                if (node === undefined) {
                    throw new ImplementationError(`Node ${nodeId} is not initialized.`);
                }
                await node.decommission();
                decommissionSuccess = true;
            } catch (error) {
                logger.warn(`Decommissioning node ${nodeId} failed with error, remove node anyway: ${error}`);
            }
        }
        if (node !== undefined) {
            node.close(!decommissionSuccess);
        }
        await controller.removeNode(nodeId);
        if (node !== undefined) {
            this.#initializedNodes.delete(node.id);
        }
    }

    /** @deprecated Use PairedNode.disconnect() instead */
    async disconnectNode(nodeId: NodeId, force = false) {
        const node = this.#pairedNodeForNodeId(nodeId);
        if (node === undefined && !force) {
            throw new ImplementationError(`Node ${nodeId} is not connected!`);
        }
        await this.#controllerInstance?.disconnect(nodeId);
        if (force) {
            const peer = this.node.env.get(PeerSet).for(this.fabric.addressOf(nodeId));
            await peer.delete();
        }
    }

    /**
     * Returns the PairedNode instance for a given NodeId. The instance is initialized without auto-connect if not yet
     * created.
     */
    async getNode(nodeId: NodeId, allowUnknownNode = false) {
        const existingNode = this.#pairedNodeForNodeId(nodeId);
        if (existingNode !== undefined) {
            return existingNode;
        }
        return await this.#createPairedNode(nodeId, { autoConnect: false }, allowUnknownNode);
    }

    /**
     * Connect to an already paired Node.
     * After connection the endpoint data of the device is analyzed and an object structure is created.
     * This call is not blocking and returns an initialized PairedNode instance. The connection or reconnection
     * happens in the background. Please monitor the state of the node to see if the connection was successful.
     *
     * @deprecated Use getNode() instead and call PairedNode.connect() or PairedNode.disconnect() as needed.
     */
    connectNode(nodeId: NodeId, connectOptions?: CommissioningControllerNodeOptions, allowUnknownNode = false) {
        return this.#createPairedNode(nodeId, connectOptions, allowUnknownNode);
    }

    async #createPairedNode(
        nodeId: NodeId,
        connectOptions?: CommissioningControllerNodeOptions,
        allowUnknownNode = false,
    ) {
        const controller = this.#assertControllerIsStarted();

        const nodeIsCommissioned = controller.getCommissionedNodes().includes(nodeId);
        if (!nodeIsCommissioned && !allowUnknownNode) {
            throw new ImplementationError(`Node ${nodeId} is not commissioned!`);
        }

        const existingNode = this.#pairedNodeForNodeId(nodeId);
        if (existingNode !== undefined) {
            if (!existingNode.initialized) {
                existingNode.connect(connectOptions);
            }
            return existingNode;
        }

        logger.info(`Connecting to node ${nodeId}...`);
        const peerAddress = controller.fabric.addressOf(nodeId);

        let peerNode = this.node.peers.get(peerAddress);
        if (peerNode === undefined) {
            if (allowUnknownNode) {
                peerNode = await this.node.peers.forAddress(peerAddress, {
                    network: {
                        autoSubscribe: false,
                        caseAuthenticatedTags:
                            connectOptions?.caseAuthenticatedTags ?? this.#options.caseAuthenticatedTags,
                    },
                });
            } else {
                throw new ImplementationError(`Node ${nodeId} is no known peer to the controller`);
            }
        }

        if (peerNode.stateOf(NetworkClient).isDisabled) {
            await peerNode.enable();
        } else {
            await peerNode.start();
        }

        const { caseAuthenticatedTags = this.#options.caseAuthenticatedTags } = connectOptions ?? {};
        const pairedNode = await PairedNode.create(
            nodeId,
            this,
            connectOptions,
            peerNode,
            await this.createInteractionClient(nodeId, NodeDiscoveryType.None, {
                forcedConnection: false,
                caseAuthenticatedTags,
            }), // First, connect without discovery to the last known address
            async (discoveryType?: NodeDiscoveryType) =>
                void (await controller.connect(nodeId, {
                    discoveryOptions: { discoveryType },
                    allowUnknownPeer: false,
                    caseAuthenticatedTags,
                })),
            handler => this.#sessionDisconnectedHandler.set(nodeId, handler),
            controller.sessions,
            this.#crypto,
        );
        this.#initializedNodes.set(peerNode.id, pairedNode);

        return pairedNode;
    }

    /**
     * Connects to all paired nodes.
     * After connection the endpoint data of the device is analyzed and an object structure is created.
     *
     * @deprecated Use getCommissionedNodes() to get the list of nodes and getNode(nodeId) instead and call PairedNode.connect() or PairedNode.disconnect() as needed.
     */
    async connect(connectOptions?: CommissioningControllerNodeOptions) {
        const controller = this.#assertControllerIsStarted();

        if (!controller.isCommissioned()) {
            throw new ImplementationError(
                "Controller instance not yet paired with any device, so nothing to connect to.",
            );
        }

        for (const nodeId of controller.getCommissionedNodes()) {
            await this.#createPairedNode(nodeId, connectOptions);
        }
        return Array.from(this.#initializedNodes.values());
    }

    /** Returns true if t least one node is commissioned/paired with this controller instance. */
    isCommissioned() {
        const controller = this.#assertControllerIsStarted();

        return controller.isCommissioned();
    }

    /**
     * Creates and Return a new InteractionClient to communicate with a node. This is mainly used internally and should
     * not be used directly. See the PairedNode class for the public API.
     */
    async createInteractionClient(
        nodeIdOrSession: NodeId | SecureSession,
        discoveryType?: NodeDiscoveryType,
        options?: {
            discoveryTimeout?: Duration;
            forcedConnection?: boolean;
            caseAuthenticatedTags?: CaseAuthenticatedTag[];
        },
    ): Promise<InteractionClient> {
        const controller = this.#assertControllerIsStarted();
        const {
            forcedConnection,
            caseAuthenticatedTags = this.#options.caseAuthenticatedTags,
            discoveryTimeout,
        } = options ?? {};
        if (nodeIdOrSession instanceof Session || !forcedConnection) {
            return controller.createInteractionClient(nodeIdOrSession, {
                discoveryOptions: { discoveryType, timeout: discoveryTimeout },
                caseAuthenticatedTags,
            });
        }
        return controller.connect(nodeIdOrSession, {
            discoveryOptions: { discoveryType, timeout: discoveryTimeout },
            allowUnknownPeer: forcedConnection,
            caseAuthenticatedTags,
        });
    }

    /**
     * Returns the PairedNode instance for a given node id, if this node is connected.
     * @deprecated Use getNode() instead
     */
    getPairedNode(nodeId: NodeId) {
        return this.#pairedNodeForNodeId(nodeId);
    }

    /** Returns an array with the NodeIds of all commissioned nodes. */
    getCommissionedNodes() {
        const controller = this.#assertControllerIsStarted();

        return controller.getCommissionedNodes() ?? [];
    }

    /** Returns an array with all commissioned NodeIds and their metadata. */
    getCommissionedNodesDetails(): PairedNodeDetails[] {
        const controller = this.#assertControllerIsStarted();

        return controller.getCommissionedNodesDetails() ?? [];
    }

    /**
     * Disconnects all connected nodes and closes the network connections and other resources of the controller.
     * You can use "start()" to restart the controller after closing it.
     */
    async close() {
        for (const node of this.#initializedNodes.values()) {
            node.close();
        }
        await this.#controllerInstance?.close();

        this.#controllerInstance = undefined;
        this.#initializedNodes.clear();
        this.#ipv4Disabled = undefined;
        this.#started = false;
    }

    /** Return the port used by the controller for the UDP interface. */
    getPort(): number | undefined {
        return this.#options.localPort;
    }

    /** @private */
    initialize(ipv4Disabled: boolean) {
        if (this.#started) {
            throw new ImplementationError("Controller instance already started.");
        }
        if (this.#ipv4Disabled !== undefined && this.#ipv4Disabled !== ipv4Disabled) {
            throw new ImplementationError(
                "Changing the IPv4 disabled flag after starting the controller is not supported.",
            );
        }
        this.#ipv4Disabled = ipv4Disabled;
    }

    get env() {
        return this.#environment;
    }

    /**
     * Initialize the controller and initialize and connect to all commissioned nodes if autoConnect is not set to false.
     */
    async start() {
        if (this.#ipv4Disabled === undefined) {
            const env = this.#environment;

            this.#environment = env;
            const runtime = env.runtime;
            runtime.add(this);
        }

        this.#started = true;
        if (this.#controllerInstance === undefined) {
            this.#controllerInstance = await this.#initializeController();
        }

        await this.#controllerInstance.start();

        this.#controllerInstance.node.env.get(SessionManager).sessions.deleted.on(session => {
            if (!session.isSecure) {
                return;
            }
            const { peerNodeId } = session;
            logger.info(`Session for peer node ${peerNodeId} disconnected ...`);
            const handler = this.#sessionDisconnectedHandler.get(peerNodeId);
            if (handler !== undefined) {
                handler().catch(error => logger.warn(`Error while handling session disconnect: ${error}`));
            }
        });

        if (this.#options.autoConnect !== false && this.#controllerInstance.isCommissioned()) {
            await this.connect();
        }
    }

    /**
     * Cancels the discovery process for commissionable devices started with discoverCommissionableDevices().
     */
    cancelCommissionableDeviceDiscovery(
        identifierData: CommissionableDeviceIdentifiers,
        discoveryCapabilities?: TypeFromPartialBitSchema<typeof DiscoveryCapabilitiesBitmap>,
    ) {
        const controller = this.#assertControllerIsStarted();
        controller
            .collectScanners(discoveryCapabilities)
            .forEach(scanner => ControllerDiscovery.cancelCommissionableDeviceDiscovery(scanner, identifierData));
    }

    /**
     * Starts to discover commissionable devices.
     * The promise will be fulfilled after the provided timeout or when the discovery is stopped via
     * cancelCommissionableDeviceDiscovery(). The discoveredCallback will be called for each discovered device.
     */
    async discoverCommissionableDevices(
        identifierData: CommissionableDeviceIdentifiers,
        discoveryCapabilities?: TypeFromPartialBitSchema<typeof DiscoveryCapabilitiesBitmap>,
        discoveredCallback?: (device: CommissionableDevice) => void,
        timeout = Minutes(15),
    ) {
        const controller = this.#assertControllerIsStarted();
        return await ControllerDiscovery.discoverCommissionableDevices(
            controller.collectScanners(discoveryCapabilities),
            timeout,
            identifierData,
            discoveredCallback,
        );
    }

    /**
     * Use this method to reset the Controller storage. The method can only be called if the controller is stopped and
     * will remove all commissioning data and paired nodes from the controller.
     */
    async resetStorage() {
        if (this.#started) {
            throw new ImplementationError(
                "Storage cannot be reset while the controller is operating! Please close the controller first.",
            );
        }
        await this.node.erase(); // TODO check if that's correct
    }

    /** Returns active session information for all connected nodes. */
    getActiveSessionInformation(): ActiveSessionInformation[] {
        return this.#controllerInstance?.getActiveSessionInformation() ?? [];
    }

    /** @private */
    async validateAndUpdateFabricLabel(nodeId: NodeId) {
        const controller = this.#assertControllerIsStarted();
        const node = this.#pairedNodeForNodeId(nodeId);
        if (node === undefined) {
            throw new ImplementationError(`Node ${nodeId} is not connected!`);
        }
        const operationalCredentialsCluster = node.getRootClusterClient(OperationalCredentials.Cluster);
        if (operationalCredentialsCluster === undefined) {
            throw new UnexpectedDataError(`Node ${nodeId}: Operational Credentials Cluster not available!`);
        }
        const fabrics = await operationalCredentialsCluster.getFabricsAttribute(false, true);
        if (fabrics.length !== 1) {
            logger.info(`Invalid fabrics returned from node ${nodeId}.`, fabrics);
            return;
        }
        const label = controller.fabricConfig.label;
        const fabric = fabrics[0];
        if (fabric.label !== label) {
            logger.info(
                `Node ${nodeId}: Fabric label "${fabric.label}" does not match requested admin fabric Label "${label}". Updating...`,
            );
            await operationalCredentialsCluster.updateFabricLabel({
                label,
                fabricIndex: fabric.fabricIndex,
            });
        }
    }

    /**
     * Updates the fabric label for the controller and all connected nodes.
     * The label is used to identify the controller and all connected nodes in the fabric.
     */
    async updateFabricLabel(label: string) {
        const controller = this.#assertControllerIsStarted();
        if (controller.fabricConfig.label === label) {
            return;
        }
        await controller.updateFabricLabel(label);

        for (const node of this.#initializedNodes.values()) {
            if (node.isConnected) {
                // When Node is connected, update the fabric label on the node directly
                try {
                    await this.validateAndUpdateFabricLabel(node.nodeId);
                    return;
                } catch (error) {
                    logger.warn(`Error updating fabric label on node ${node.nodeId}:`, error);
                }
            }
            if (!node.remoteInitializationDone) {
                // Node not online and was also not yet initialized, means update happens
                // automatically when node connects
                logger.info(`Node ${node.nodeId} is offline. Fabric label will be updated on next connection.`);
                return;
            }
            logger.info(
                `Node ${node.nodeId} is reconnecting. Delaying fabric label update to when node is back online.`,
            );

            // If no update handler is registered, register one
            // TODO: Convert this next to a task system for node tasks and also better handle error cases
            if (!this.#nodeUpdateLabelHandlers.has(node.nodeId)) {
                const updateOnReconnect = (nodeState: NodeStates) => {
                    if (nodeState === NodeStates.Connected) {
                        this.validateAndUpdateFabricLabel(node.nodeId)
                            .catch(error => logger.warn(`Error updating fabric label on node ${node.nodeId}:`, error))
                            .finally(() => {
                                node.events.stateChanged.off(updateOnReconnect);
                                this.#nodeUpdateLabelHandlers.delete(node.nodeId);
                            });
                    }
                };
                node.events.stateChanged.on(updateOnReconnect);
            }
        }
    }

    get groups(): FabricGroups {
        const controllerInstance = this.#assertControllerIsStarted();
        return controllerInstance.fabric.groups;
    }

    get fabric(): Fabric {
        const controllerInstance = this.#assertControllerIsStarted();
        return controllerInstance.fabric;
    }
}
