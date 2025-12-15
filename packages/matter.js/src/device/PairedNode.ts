/**
 * @license
 * Copyright 2022-2025 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { AdministratorCommissioning, BasicInformation, Descriptor } from "#clusters";
import {
    AsyncObservable,
    AtLeastOne,
    camelize,
    Construction,
    Crypto,
    Diagnostic,
    Duration,
    Immutable,
    ImplementationError,
    InternalError,
    Logger,
    MatterError,
    Millis,
    Minutes,
    Observable,
    Seconds,
    Time,
    Timer,
} from "#general";
import { AcceptedCommandList, AttributeList, ClusterRevision, FeatureMap } from "#model";
import {
    Behavior,
    Endpoint as ClientEndpoint,
    ClientNode,
    ClientNodeInteraction,
    ClusterBehavior,
    ClusterClient,
    Commands,
    CommissioningClient,
    InteractionClient,
    NetworkClient,
} from "#node";
import {
    ChannelStatusResponseError,
    ClientSubscription,
    ClusterClientObj,
    DecodedAttributeReportValue,
    DecodedEventReportValue,
    NodeDiscoveryType,
    PaseClient,
    Read,
    ReadResult,
    SessionManager,
    Subscribe,
    UnknownNodeError,
} from "#protocol";
import {
    AttributeId,
    Attributes,
    CaseAuthenticatedTag,
    ClusterId,
    ClusterType,
    CommissioningFlowType,
    DiscoveryCapabilitiesSchema,
    EndpointNumber,
    EventId,
    getClusterAttributeById,
    getClusterById,
    getClusterEventById,
    ManualPairingCodeCodec,
    NodeId,
    QrPairingCodeCodec,
    StatusCode,
    StatusResponseError,
} from "#types";
import { DescriptorClient } from "@matter/node/behaviors/descriptor";
import { ClusterServer } from "../cluster/server/ClusterServer.js";
import { AttributeInitialValues, ClusterServerObj, isClusterServer } from "../cluster/server/ClusterServerTypes.js";
import { CommissioningController } from "../CommissioningController.js";
import { Aggregator } from "./Aggregator.js";
import { ComposedDevice } from "./ComposedDevice.js";
import { PairedDevice, RootEndpoint } from "./Device.js";
import { DeviceInformation, DeviceInformationData } from "./DeviceInformation.js";
import {
    DeviceTypeDefinition,
    DeviceTypes,
    getDeviceTypeDefinitionFromModelByCode,
    UnknownDeviceType,
} from "./DeviceTypes.js";
import { Endpoint } from "./Endpoint.js";
import { asClusterClientInternal, isClusterClient } from "./TypeHelpers.js";

const logger = Logger.get("PairedNode");

/** Delay after receiving a changed partList  from a device to update the device structure */
const STRUCTURE_UPDATE_TIMEOUT = Seconds(5);

/** Delay after a disconnect to try to reconnect to the device */
const RECONNECT_DELAY = Seconds(15);

/** Delay after a shutdown event to try to reconnect to the device */
const RECONNECT_DELAY_AFTER_SHUTDOWN = Seconds(30); // Give device time to restart and maybe inform us about

/** Maximum delay after a disconnect to try to reconnect to the device */
const RECONNECT_MAX_DELAY = Minutes(10);

/**
 * Delay after a new session was opened by the device while in discovery state.
 * This usually happens for devices that support persisted subscriptions.
 */
const NEW_SESSION_WHILE_DISCOVERY_RECONNECT_DELAY = Seconds(5);

export enum NodeStates {
    /**
     * Node seems active nd last communications were successful and subscription updates were received and all data is
     * up-to-date.
     */
    Connected = 0,

    /**
     * Node is disconnected. This means that the node was not connected so far or the developer disconnected it by API
     * call or the node is removed. A real disconnection can not be detected because the main Matter protocol uses UDP.
     * Data are stale and interactions will most likely return an error.
     */
    Disconnected = 1,

    /**
     * Node is reconnecting. This means that former communications failed, and we are trying to reach the device on
     * known addresses. Data are stale. It is yet unknown if the reconnection is successful. */
    Reconnecting = 2,

    /**
     * The node seems offline because communication was not possible or is just initialized. The controller is now
     * waiting for a MDNS announcement and tries every 10 minutes to reconnect.
     */
    WaitingForDeviceDiscovery = 3,
}

/** @deprecated */
export enum NodeStateInformation {
    /**
     * Node seems active nd last communications were successful and subscription updates were received and all data is
     * up-to-date.
     */
    Connected = 0,

    /**
     * Node is disconnected. This means that the node was not connected so far or the developer disconnected it by API
     * call or the node is removed. A real disconnection can not be detected because the main Matter protocol uses UDP.
     * Data are stale and interactions will most likely return an error.
     */
    Disconnected = 1,

    /**
     * Node is reconnecting. This means that former communications failed, and we are trying to reach the device on
     * known addresses. Data are stale. It is yet unknown if the reconnection is successful. */
    Reconnecting = 2,

    /**
     * The node seems offline because communication was not possible or is just initialized. The controller is now
     * waiting for a MDNS announcement and tries every 10 minutes to reconnect.
     */
    WaitingForDeviceDiscovery = 3,

    /**
     * Node structure has changed (Endpoints got added or also removed). Data are up-to-date.
     * This State information will only be fired when the subscribeAllAttributesAndEvents option is set to true.
     */
    StructureChanged = 4,

    /**
     * The node was just Decommissioned. This is a final state.
     */
    Decommissioned = 5,
}

/**
 * Callback function type for node reconnection operations.
 */
export type ReconnectionCallback = (
    discoveryType?: NodeDiscoveryType,
    currentOptions?: CommissioningControllerNodeOptions,
) => Promise<void>;

export type CommissioningControllerNodeOptions = {
    /**
     * Unless set to false the node will be automatically connected when initialized. When set to false use
     * connect() to connect to the node at a later timepoint.
     */
    readonly autoConnect?: boolean;

    /**
     * Unless set to false, all events and attributes are subscribed and value changes are reflected in the ClusterClient
     * instances. With this reading attributes values is mostly looked up in the locally cached data.
     * Additionally, more features like reaction on shutdown event or endpoint structure changes (for bridges) are done
     * internally automatically.
     */
    readonly autoSubscribe?: boolean;

    /**
     * Minimum subscription interval when values are changed. Default it is set to 1s.
     * If the device is intermittently connected, the minimum interval is always set to 0s because required by Matter specs.
     */
    readonly subscribeMinIntervalFloorSeconds?: number;

    /**
     * Maximum subscription interval when values are changed. This is also used as a keepalive mechanism to validate
     * that the device is still available. matter.js tries to set meaningful values based on the device type, connection
     * type, and other details. So ideally do not set this parameter unless you know it better.
     */
    readonly subscribeMaxIntervalCeilingSeconds?: number;

    /**
     * Optional additional callback method which is called for each Attribute change reported by the device. Use this
     * if subscribing to all relevant attributes is too much effort.
     * @deprecated Please use the events.attributeChanged observable instead.
     */
    readonly attributeChangedCallback?: (nodeId: NodeId, data: DecodedAttributeReportValue<any>) => void;

    /**
     * Optional additional callback method which is called for each Event reported by the device. Use this if
     * subscribing to all relevant events is too much effort.
     * @deprecated Please use the events.eventTriggered observable instead.
     */
    readonly eventTriggeredCallback?: (nodeId: NodeId, data: DecodedEventReportValue<any>) => void;

    /**
     * Optional callback method which is called when the state of the node changes. This can be used to detect when
     * the node goes offline or comes back online.
     * @deprecated Please use the events.nodeStateChanged observable and the extra events for structureCHanged and
     *  decommissioned instead.
     */
    readonly stateInformationCallback?: (nodeId: NodeId, state: NodeStateInformation) => void;

    /**
     * Optional Case Authenticated Tags (CATs) to be used when establishing CASE sessions with the node.
     * These tags provide additional authentication context for the operational session.
     */
    readonly caseAuthenticatedTags?: CaseAuthenticatedTag[];
};

export class NodeNotConnectedError extends MatterError {}

interface SubscriptionHandlerCallbacks {
    attributeListener: (data: DecodedAttributeReportValue<any>) => void;
    eventListener: (data: DecodedEventReportValue<any>) => void;
    updateTimeoutHandler: () => void;
    subscriptionAlive: () => void;
}

/**
 * Tooling function to check if a list of numbers is the same as another list of numbers.
 * it uses Sets to prevent duplicate entries and ordering to cause issues if they ever happen.
 */
function areNumberListsSame(list1: Immutable<number[]>, list2: Immutable<number[]>) {
    const set1 = new Set(list1);
    const set2 = new Set(list2);
    if (set1.size !== set2.size) return false;
    for (const entry of set1.values()) {
        if (!set2.has(entry)) return false;
    }
    return true;
}

/**
 * Class to represents one node that is paired/commissioned with the matter.js Controller. Instances are returned by
 * the CommissioningController on commissioning or when connecting.
 */
export class PairedNode {
    readonly #clientNode: ClientNode;
    readonly #endpoints = new Map<number, Endpoint>();
    #interactionClient: InteractionClient;
    #reconnectDelayTimer?: Timer;
    #newChannelReconnectDelayTimer = Time.getTimer(
        "New Channel Reconnect Delay",
        NEW_SESSION_WHILE_DISCOVERY_RECONNECT_DELAY,
        () => {
            if (
                this.#connectionState === NodeStates.WaitingForDeviceDiscovery ||
                this.#connectionState === NodeStates.Reconnecting
            ) {
                logger.info(
                    `Node ${this.nodeId}: Still not connected after new session establishment, trying to reconnect ...`,
                );
                // Try the last known address first to speed up reconnection
                this.#setConnectionState(NodeStates.Reconnecting);
                this.#scheduleReconnect(0);
            }
        },
    );
    #reconnectErrorCount = 0;
    readonly #updateEndpointStructureTimer = Time.getTimer("Endpoint structure update", STRUCTURE_UPDATE_TIMEOUT, () =>
        this.#updateEndpointStructure().catch(error =>
            logger.warn(`Node ${this.nodeId}: Error updating endpoint structure`, error),
        ),
    );
    #connectionState: NodeStates = NodeStates.Disconnected;
    #reconnectionInProgress = false;
    #localInitializationDone = false;
    #remoteInitializationInProgress = false;
    #remoteInitializationDone = false;
    #nodeDetails: DeviceInformation;
    #construction: Construction<PairedNode>;
    #clientReconnectInProgress = false;
    #currentSubscriptionHandler?: SubscriptionHandlerCallbacks;
    #currentSubscription?: ClientSubscription;
    readonly #commissioningController: CommissioningController;
    #options: CommissioningControllerNodeOptions;
    readonly #reconnectFunc: ReconnectionCallback;
    #currentSubscriptionIntervalS?: number;
    #crypto: Crypto;
    #deviceInformationUpdateNeeded = false;
    #nodeShutdownDetected = false;

    /**
     * Endpoint structure change information that are checked when updating structure
     * - null means that the endpoint itself changed, so will be regenerated completely any case
     * - array of ClusterIds means that only these clusters changed and will be updated
     */
    #registeredEndpointStructureChanges = new Map<EndpointNumber, ClusterId[] | null>();

    readonly events: PairedNode.Events = {
        initialized: AsyncObservable<[details: DeviceInformationData]>(),
        initializedFromRemote: AsyncObservable<[details: DeviceInformationData]>(),
        deviceInformationChanged: AsyncObservable<[details: DeviceInformationData]>(),
        stateChanged: Observable<[nodeState: NodeStates]>(),
        attributeChanged: Observable<[data: DecodedAttributeReportValue<any>]>(),
        eventTriggered: Observable<[DecodedEventReportValue<any>]>(),
        structureChanged: Observable<[void]>(),
        nodeEndpointAdded: Observable<[EndpointNumber]>(),
        nodeEndpointRemoved: Observable<[EndpointNumber]>(),
        nodeEndpointChanged: Observable<[EndpointNumber]>(),
        decommissioned: Observable<[void]>(),
        connectionAlive: Observable<[void]>(),
    };

    static async create(
        nodeId: NodeId,
        commissioningController: CommissioningController,
        options: CommissioningControllerNodeOptions = {},
        clientNode: ClientNode,
        interactionClient: InteractionClient,
        reconnectFunc: ReconnectionCallback,
        assignDisconnectedHandler: (handler: () => Promise<void>) => void,
        sessions: SessionManager,
        crypto: Crypto,
    ): Promise<PairedNode> {
        const node = new PairedNode(
            nodeId,
            commissioningController,
            options,
            clientNode,
            interactionClient,
            reconnectFunc,
            assignDisconnectedHandler,
            sessions,
            crypto,
        );
        await node.construction;
        return node;
    }

    constructor(
        readonly nodeId: NodeId,
        commissioningController: CommissioningController,
        options: CommissioningControllerNodeOptions = {},
        clientNode: ClientNode,
        interactionClient: InteractionClient,
        reconnectFunc: ReconnectionCallback,
        assignDisconnectedHandler: (handler: () => Promise<void>) => void,
        sessions: SessionManager,
        crypto: Crypto,
    ) {
        assignDisconnectedHandler(async () => {
            logger.info(
                `Node ${this.nodeId}: Session disconnected while Node is ${NodeStates[this.#connectionState]}${
                    this.#connectionState === NodeStates.Connected ? ", trying to reconnect ..." : ""
                }`,
            );
            if (this.#connectionState === NodeStates.Connected) {
                this.#scheduleReconnect();
            }
        });

        this.#commissioningController = commissioningController;
        this.#options = options;
        this.#reconnectFunc = reconnectFunc;
        this.#crypto = crypto;
        this.#clientNode = clientNode;

        this.#interactionClient = interactionClient;
        if (this.#interactionClient.isReconnectable) {
            this.#interactionClient.channelUpdated.on(() => {
                // When we had planned a reconnection because of a disconnect, we can stop the timer now
                if (
                    this.#reconnectDelayTimer?.isRunning &&
                    !this.#clientReconnectInProgress &&
                    !this.#reconnectionInProgress &&
                    this.#connectionState === NodeStates.Reconnecting
                ) {
                    this.#reconnectDelayTimer?.stop();
                    this.#reconnectDelayTimer = undefined;
                    logger.info(`Node ${this.nodeId}: Got a reconnect, lets force a reconnection ...`);
                    this.#scheduleReconnect(RECONNECT_DELAY);
                }
            });
        } else {
            logger.warn(
                `Node ${this.nodeId}: InteractionClient is not reconnectable, no automatic reconnection will happen in case of errors.`,
            );
        }
        this.#nodeDetails = new DeviceInformation(clientNode);
        logger.info(`Node ${this.nodeId}: Created paired node with device data`, this.#nodeDetails.meta);

        sessions.sessions.added.on(session => {
            if (
                session.isInitiator || // If we initiated the session, we do not need to react to it
                session.peerNodeId !== this.nodeId || // no session for this node
                this.connectionState !== NodeStates.WaitingForDeviceDiscovery
            ) {
                return;
            }
            this.#newChannelReconnectDelayTimer.stop().start();
        });

        // For now this means we are connected with a session
        /*this.#clientNode.lifecycle.online.on(() => {
            if (this.#connectionState )
            this.#setConnectionState(NodeStates.Connected)
        });
        this.#clientNode.lifecycle.offline.on(() => this.#setConnectionState(NodeStates.Disconnected));
        */

        this.#clientNode.lifecycle.decommissioned.on(() => this.#setConnectionState(NodeStates.Disconnected));
        this.#clientNode.eventsOf(NetworkClient).subscriptionStatusChanged.on(isActive => {
            if (isActive) {
                this.#setConnectionState(NodeStates.Connected);
            } else if (this.#connectionState === NodeStates.Connected) {
                this.#setConnectionState(NodeStates.Reconnecting);
            }
        });

        this.#construction = Construction(this, async () => {
            // We try to initialize from stored data already
            await this.#initializeFromStoredData();

            if (this.#options.autoConnect !== false) {
                // This kicks of the remote initialization and automatic reconnection handling if it can not be connected
                this.#initialize().catch(error => {
                    logger.info(`Node ${nodeId}: Error during remote initialization`, error);
                    if (this.connectionState !== NodeStates.Disconnected) {
                        this.#setConnectionState(NodeStates.WaitingForDeviceDiscovery);
                        this.#scheduleReconnect();
                    }
                });
            }
        });
    }

    get construction() {
        return this.#construction;
    }

    get isConnected() {
        return this.#connectionState === NodeStates.Connected;
    }

    /** Returns the Node connection state. */
    get connectionState() {
        return this.#connectionState;
    }

    /** Returns the BasicInformation cluster metadata collected from the device. */
    get basicInformation() {
        return this.#nodeDetails.basicInformation;
    }

    /** Returns the general capability metadata collected from the device. */
    get deviceInformation() {
        return this.#nodeDetails.meta;
    }

    /** Is the Node fully initialized with formerly stored subscription data? False when the node was never connected so far. */
    get localInitializationDone() {
        return this.#localInitializationDone;
    }

    /** Is the Node fully initialized with remote subscription or read data? */
    get remoteInitializationDone() {
        return this.#remoteInitializationDone;
    }

    /** Is the Node initialized - locally or remotely? */
    get initialized() {
        return this.#remoteInitializationDone || this.#localInitializationDone;
    }

    get id() {
        return this.#clientNode.id;
    }

    /** If a subscription is established, then this is the interval in seconds, otherwise undefined */
    get currentSubscriptionIntervalSeconds() {
        return this.#currentSubscriptionIntervalS;
    }

    #invalidateSubscriptionHandler() {
        if (this.#currentSubscriptionHandler !== undefined) {
            // Make sure the former handlers do not trigger anymore
            this.#currentSubscriptionHandler.attributeListener = () => {};
            this.#currentSubscriptionHandler.eventListener = () => {};
            this.#currentSubscriptionHandler.updateTimeoutHandler = () => {};
            this.#currentSubscriptionHandler.subscriptionAlive = () => {};
        }
    }

    #setConnectionState(state: NodeStates) {
        if (
            this.#connectionState === state ||
            (this.#connectionState === NodeStates.WaitingForDeviceDiscovery && state === NodeStates.Reconnecting)
        )
            return;
        this.#connectionState = state;
        if (state !== NodeStates.Connected) {
            this.#currentSubscriptionIntervalS = undefined;
        }
        this.#options.stateInformationCallback?.(this.nodeId, state as unknown as NodeStateInformation);
        this.events.stateChanged.emit(state);
        if (state === NodeStates.Disconnected) {
            this.#reconnectDelayTimer?.stop();
            this.#reconnectDelayTimer = undefined;
        }
    }

    /** Make sure to not request a new Interaction client multiple times in parallel. */
    async #handleReconnect(discoveryType?: NodeDiscoveryType): Promise<void> {
        if (this.#clientReconnectInProgress) {
            throw new NodeNotConnectedError("Reconnection already in progress. Node not reachable currently.");
        }

        this.#clientReconnectInProgress = true;
        try {
            await this.#reconnectFunc(discoveryType, this.#options);
        } finally {
            this.#clientReconnectInProgress = false;
        }
    }

    /**
     * Schedule a connection to the device. This method is non-blocking and will return immediately.
     * The connection happens in the background. Please monitor the state events of the node to see if the
     * connection was successful.
     * The provided connection options will be set and used internally if the node reconnects successfully.
     */
    connect(connectOptions?: CommissioningControllerNodeOptions) {
        if (connectOptions !== undefined) {
            this.#options = connectOptions;
        }
        this.triggerReconnect();
    }

    /**
     * Trigger a reconnection to the device. This method is non-blocking and will return immediately.
     * The reconnection happens in the background. Please monitor the state events of the node to see if the
     * reconnection was successful.
     */
    triggerReconnect() {
        if (this.#reconnectionInProgress || this.#remoteInitializationInProgress) {
            logger.info(
                `Node ${this.nodeId}: Ignoring reconnect request because ${this.#remoteInitializationInProgress ? "initialization" : "reconnect"} already in progress.`,
            );
            return;
        }
        this.#scheduleReconnect(0);
    }

    /**
     * Force a reconnection to the device.
     * This method is mainly used internally to reconnect after the active session
     * was closed or the device went offline and was detected as being online again.
     * Please note that this method does not return until the device is reconnected.
     * Please use the triggerReconnect method for a non-blocking reconnection triggering.
     */
    async reconnect(connectOptions?: CommissioningControllerNodeOptions) {
        if (connectOptions !== undefined) {
            this.#options = connectOptions;
        }
        if (this.#reconnectionInProgress || this.#remoteInitializationInProgress) {
            logger.debug(
                `Node ${this.nodeId}: Ignoring reconnect request because ${this.#remoteInitializationInProgress ? "initialization" : "reconnect"} already underway.`,
            );
            return;
        }
        if (this.#reconnectDelayTimer?.isRunning) {
            this.#reconnectDelayTimer.stop();
        }

        this.#reconnectionInProgress = true;
        if (this.#connectionState !== NodeStates.WaitingForDeviceDiscovery) {
            this.#setConnectionState(NodeStates.Reconnecting);

            try {
                // First, try a reconnection to a known address to see if the device is reachable
                await this.#handleReconnect(NodeDiscoveryType.None);
                this.#reconnectionInProgress = false;
                await this.#initialize();
                return;
            } catch (error) {
                if (error instanceof MatterError) {
                    logger.info(
                        `Node ${this.nodeId}: Simple re-establishing session did not worked. Reconnect ... `,
                        error,
                    );
                } else {
                    this.#reconnectionInProgress = false;
                    throw error;
                }
            }
        }

        this.#setConnectionState(NodeStates.WaitingForDeviceDiscovery);

        try {
            await this.#initialize();
        } catch (error) {
            MatterError.accept(error);

            if (error instanceof UnknownNodeError) {
                logger.info(`Node ${this.nodeId}: Node is unknown by controller, we can not connect.`);
                this.#setConnectionState(NodeStates.Disconnected);
            } else if (this.#connectionState === NodeStates.Disconnected) {
                logger.info(`Node ${this.nodeId}: No reconnection desired because requested status is Disconnected.`);
            } else {
                if (error instanceof ChannelStatusResponseError) {
                    logger.info(`Node ${this.nodeId}: Error while establishing new Channel, retrying ...`, error);
                } else if (error instanceof StatusResponseError) {
                    logger.info(`Node ${this.nodeId}: Error while communicating with the device, retrying ...`, error);
                } else {
                    logger.info(`Node ${this.nodeId}: Error waiting for device rediscovery, retrying`, error);
                }
                this.#reconnectErrorCount++;
                this.#scheduleReconnect();
            }
        } finally {
            this.#reconnectionInProgress = false;
        }
    }

    /** Ensure that the node is connected by creating a new InteractionClient if needed. */
    async #ensureConnection(forceConnect = false): Promise<InteractionClient> {
        if (this.#clientNode.lifecycle.isOnline) {
            if (this.#connectionState === NodeStates.Connected && !forceConnect) {
                return this.#interactionClient;
            }
            if (this.#connectionState !== NodeStates.Connected) {
                // Disconnected and having an InteractionClient means we initialized with an Offline one, so we do
                // connection now on usage
                this.#setConnectionState(NodeStates.Reconnecting);
                return this.#interactionClient;
            }
        }

        if (forceConnect) {
            this.#setConnectionState(NodeStates.WaitingForDeviceDiscovery);
        }

        await this.#handleReconnect(
            this.#connectionState === NodeStates.Disconnected || !forceConnect
                ? NodeDiscoveryType.None
                : NodeDiscoveryType.FullDiscovery,
        );
        if (!forceConnect) {
            this.#setConnectionState(NodeStates.Connected);
        }
        return this.#interactionClient;
    }

    async #initializeFromStoredData() {
        const { autoSubscribe } = this.#options;
        if (this.#remoteInitializationDone || this.#localInitializationDone || autoSubscribe === false) return;

        // Minimum sanity check that we have at least data for the Root endpoint and one other endpoint to initialize
        let rootEndpointIncluded = false;
        let otherEndpointIncluded = false;
        for (const ep of this.#clientNode.endpoints) {
            const epClusters = ep.behaviors.active.filter(behavior => ClusterBehavior.is(behavior));
            if (epClusters.length === 0) {
                continue;
            }
            if (ep.number === 0) {
                rootEndpointIncluded = true;
            } else {
                otherEndpointIncluded = true;
            }
            if (rootEndpointIncluded && otherEndpointIncluded) {
                break;
            }
        }

        await this.#initializeEndpointStructure(false);

        // Inform interested parties that the node is initialized
        await this.events.initialized.emit(this.#nodeDetails.details);
        this.#localInitializationDone = true;
    }

    /**
     * Initialize the node after the InteractionClient was created and to subscribe attributes and events if requested.
     */
    async #initialize() {
        if (this.#remoteInitializationInProgress) {
            logger.info(`Node ${this.nodeId}: Remote initialization already in progress ...`);
            return;
        }
        this.#remoteInitializationInProgress = true;
        try {
            // Enforce a new Connection
            await this.#ensureConnection(this.#connectionState !== NodeStates.Disconnected); // This sets state to connected when successful!
            const { autoSubscribe, attributeChangedCallback, eventTriggeredCallback } = this.#options;

            const anyInitializationDone = this.#localInitializationDone || this.#remoteInitializationDone;
            if (autoSubscribe !== false) {
                const maxInterval = await this.subscribeAllAttributesAndEvents({
                    ignoreInitialTriggers: !anyInitializationDone, // Trigger on updates only after initialization
                    attributeChangedCallback: data => {
                        attributeChangedCallback?.(this.nodeId, data);
                        this.events.attributeChanged.emit(data);
                    },
                    eventTriggeredCallback: data => {
                        eventTriggeredCallback?.(this.nodeId, data);
                        this.events.eventTriggered.emit(data);
                    },
                }); // Ignore Triggers from Subscribing during initialization

                await this.#initializeEndpointStructure();

                this.#remoteInitializationInProgress = false; // We are done, rest is bonus and should not block reconnections

                this.#currentSubscriptionIntervalS = maxInterval;
            } else {
                await this.#readAllAttributes();
                await this.#initializeEndpointStructure();
                this.#remoteInitializationInProgress = false; // We are done, rest is bonus and should not block reconnections
            }
            if (!this.#remoteInitializationDone) {
                try {
                    await this.#commissioningController.validateAndUpdateFabricLabel(this.nodeId);
                } catch (error) {
                    logger.info(`Node ${this.nodeId}: Error updating fabric label`, error);
                }
            }
            this.#reconnectErrorCount = 0;
            this.#remoteInitializationDone = true;
            await this.events.initializedFromRemote.emit(this.#nodeDetails.details);
            if (!this.#localInitializationDone) {
                this.#localInitializationDone = true;
                await this.events.initialized.emit(this.#nodeDetails.details);
            }
            this.#setConnectionState(NodeStates.Connected);
        } finally {
            this.#remoteInitializationInProgress = false;
        }
    }

    /**
     * Request the current InteractionClient for custom special interactions with the device. Usually the
     * ClusterClients of the Devices of the node should be used instead. An own InteractionClient is only needed
     * when you want to read or write multiple attributes or events in a single request or send batch invokes.
     */
    getInteractionClient() {
        return this.#ensureConnection();
    }

    /** Method to log the structure of this node with all endpoint and clusters. */
    logStructure() {
        const rootEndpoint = this.#endpoints.get(EndpointNumber(0));
        if (rootEndpoint === undefined) {
            logger.info(`Node ${this.nodeId} has not yet been initialized!`);
            return;
        }
        logger.info(this.#clientNode);
    }

    /**
     * Subscribe to all attributes and events of the device. Unless setting the Controller property autoSubscribe to
     * false this is executed automatically. Alternatively you can manually subscribe by calling this method.
     */
    async subscribeAllAttributesAndEvents(options?: {
        ignoreInitialTriggers?: boolean;
        attributeChangedCallback?: (data: DecodedAttributeReportValue<any>) => void;
        eventTriggeredCallback?: (data: DecodedEventReportValue<any>) => void;
    }) {
        options = options ?? {};
        const { attributeChangedCallback, eventTriggeredCallback } = options;
        let { ignoreInitialTriggers = false } = options;

        const { subscribeMinIntervalFloorSeconds, subscribeMaxIntervalCeilingSeconds } = this.#options;

        this.#invalidateSubscriptionHandler();

        const subscriptionHandler: SubscriptionHandlerCallbacks = {
            attributeListener: data => {
                if (ignoreInitialTriggers) {
                    return;
                }
                const {
                    path: { endpointId, clusterId, attributeId },
                    value,
                } = data;
                const device = this.#endpoints.get(endpointId);
                if (device === undefined) {
                    logger.info(
                        `Node ${this.nodeId} Ignoring received attribute update for unknown endpoint ${endpointId}!`,
                    );
                    return;
                }
                const cluster = device.getClusterClientById(clusterId);
                if (cluster === undefined) {
                    logger.info(
                        `Node ${this.nodeId} Ignoring received attribute update for unknown cluster ${Diagnostic.hex(
                            clusterId,
                        )} on endpoint ${endpointId}!`,
                    );
                    return;
                }
                logger.debug(
                    `Node ${this.nodeId} Trigger attribute update for ${endpointId}.${cluster.name}.${attributeId} to ${Diagnostic.json(
                        value,
                    )}`,
                );

                asClusterClientInternal(cluster)._triggerAttributeUpdate(attributeId, value);
                attributeChangedCallback?.(data);

                this.#checkAttributesForNeededUpdates(endpointId, clusterId, attributeId);
            },
            eventListener: data => {
                if (ignoreInitialTriggers) return;
                const {
                    path: { endpointId, clusterId, eventId },
                    events,
                } = data;
                const device = this.#endpoints.get(endpointId);
                if (device === undefined) {
                    logger.info(`Node ${this.nodeId} Ignoring received event for unknown endpoint ${endpointId}!`);
                    return;
                }
                const cluster = device.getClusterClientById(clusterId);
                if (cluster === undefined) {
                    logger.info(
                        `Node ${this.nodeId} Ignoring received event for unknown cluster ${Diagnostic.hex(
                            clusterId,
                        )} on endpoint ${endpointId}!`,
                    );
                    return;
                }
                logger.debug(
                    `Node ${this.nodeId} Trigger event update for ${endpointId}.${cluster.name}.${eventId} for ${events.length} events`,
                );
                asClusterClientInternal(cluster)._triggerEventUpdate(eventId, events);

                eventTriggeredCallback?.(data);

                this.#checkEventsForNeededStructureUpdate(endpointId, clusterId, eventId);
            },
            updateTimeoutHandler: () => {
                logger.info(`Node ${this.nodeId}: Subscription timed out ... trying to re-establish ...`);
                if (this.#connectionState === NodeStates.Connected || !this.#reconnectDelayTimer?.isRunning) {
                    this.triggerReconnect();
                }
            },
            subscriptionAlive: () => {
                if (
                    this.#reconnectDelayTimer?.isRunning &&
                    this.#connectionState === NodeStates.Reconnecting &&
                    !this.#nodeShutdownDetected
                ) {
                    logger.info(`Node ${this.nodeId}: Got subscription update, so reconnection not needed anymore ...`);
                    this.#reconnectDelayTimer.stop();
                    this.#reconnectDelayTimer = undefined;
                    this.#setConnectionState(NodeStates.Connected);
                }

                if (
                    this.#remoteInitializationDone &&
                    this.#registeredEndpointStructureChanges.size > 0 &&
                    !this.#updateEndpointStructureTimer.isRunning
                ) {
                    logger.info(`Node ${this.nodeId}: Endpoint structure needs to be updated ...`);
                    this.#updateEndpointStructureTimer.stop().start();
                } else if (this.#deviceInformationUpdateNeeded) {
                    const rootEndpoint = this.getRootEndpoint();
                    if (rootEndpoint !== undefined) {
                        this.events.deviceInformationChanged.emit(this.#nodeDetails.details);
                    }
                }
                this.#deviceInformationUpdateNeeded = false;

                if (this.#nodeShutdownDetected) {
                    this.#nodeShutdownDetected = false;
                    this.#scheduleReconnect(RECONNECT_DELAY_AFTER_SHUTDOWN);
                } else {
                    this.events.connectionAlive.emit();
                }
            },
        };
        this.#currentSubscriptionHandler = subscriptionHandler;

        const read = Read({
            fabricFilter: true,
            attributes: [{}],
        });

        const convert = (entry: ReadResult.Report) => {
            switch (entry.kind) {
                case "attr-value": {
                    const {
                        path: { endpointId, clusterId, attributeId },
                        value,
                        version,
                    } = entry;

                    const cluster = getClusterById(clusterId);
                    const attribute = getClusterAttributeById(cluster, attributeId);
                    subscriptionHandler.attributeListener({
                        path: {
                            endpointId,
                            clusterId,
                            attributeId,
                            attributeName: attribute?.name ?? `Unknown (${Diagnostic.hex(attributeId)})`,
                        },
                        value,
                        version,
                    });
                    break;
                }

                case "event-value": {
                    const {
                        path: { endpointId, clusterId, eventId },
                        number,
                        timestamp,
                        priority,
                        value,
                    } = entry;

                    const cluster = getClusterById(clusterId);
                    const event = getClusterEventById(cluster, eventId);
                    subscriptionHandler.eventListener({
                        path: {
                            endpointId,
                            clusterId,
                            eventId,
                            eventName: event?.name ?? `Unknown (${Diagnostic.hex(eventId)})`,
                        },
                        events: [{ eventNumber: number, epochTimestamp: timestamp, priority, data: value }],
                    });
                    break;
                }
            }
        };

        // First, read.  This allows us to retrieve attributes that do not support subscription and gives us
        // physical device information required to optimize subscription parameters
        for await (const chunk of this.#clientNode.interaction.read(read)) {
            for (const entry of chunk) {
                convert(entry);
            }
        }

        const subscribe = Subscribe({
            fabricFilter: true,
            minIntervalFloor:
                subscribeMinIntervalFloorSeconds !== undefined ? Seconds(subscribeMinIntervalFloorSeconds) : undefined,
            maxIntervalCeiling:
                subscribeMaxIntervalCeilingSeconds !== undefined
                    ? Seconds(subscribeMaxIntervalCeilingSeconds)
                    : undefined,
            keepSubscriptions: false,
            attributes: [{}],
            events: [{ isUrgent: true }],
            eventFilters: [{ eventMin: this.#clientNode.stateOf(NetworkClient).maxEventNumber + 1n }],
        });

        // Now subscribe for subsequent updates
        const subscription = await (this.#clientNode.interaction as ClientNodeInteraction).subscribe({
            ...subscribe,
            updated: async reports => {
                for await (const chunk of reports) {
                    for (const entry of chunk) {
                        convert(entry);
                    }
                }
                subscriptionHandler.subscriptionAlive();
            },
            closed: () => {
                if (this.#connectionState === NodeStates.Connected) {
                    subscriptionHandler.updateTimeoutHandler();
                }
                this.#clientNode.behaviors.internalsOf(NetworkClient).activeSubscription = this.#currentSubscription =
                    undefined;
            },
        });
        this.#clientNode.behaviors.internalsOf(NetworkClient).activeSubscription = this.#currentSubscription =
            subscription;

        // After initial data are processed we want to send out callbacks, so we set ignoreInitialTriggers to false
        ignoreInitialTriggers = false;

        return Seconds(subscription.maxInterval);
    }

    /** Read all attributes of the devices and return them. If a stored state exists this is used to minimize needed traffic. */
    async #readAllAttributes() {
        const read = Read({
            fabricFilter: true,
            attributes: [{}],
        });
        for await (const _chunk of this.#clientNode.interaction.read(read));
    }

    #checkAttributesForNeededUpdates(endpointId: EndpointNumber, clusterId: ClusterId, attributeId: AttributeId) {
        // Any change in the Descriptor Cluster partsList attribute requires a reinitialization of the endpoint structure
        if (clusterId === Descriptor.Complete.id) {
            switch (attributeId) {
                case Descriptor.Complete.attributes.partsList.id:
                case Descriptor.Complete.attributes.serverList.id:
                case Descriptor.Complete.attributes.clientList.id:
                case Descriptor.Complete.attributes.deviceTypeList.id:
                    this.#registeredEndpointStructureChanges.set(endpointId, null); // full endpoint update needed
                    return;
            }
        } else if (clusterId === BasicInformation.Cluster.id) {
            this.#deviceInformationUpdateNeeded = true;
        }
        switch (attributeId) {
            case FeatureMap.id:
            case AttributeList.id:
            case AcceptedCommandList.id:
            case ClusterRevision.id:
                let knownForUpdate = this.#registeredEndpointStructureChanges.get(endpointId);
                if (knownForUpdate !== null) {
                    knownForUpdate = knownForUpdate ?? [];
                    if (!knownForUpdate.includes(clusterId)) {
                        knownForUpdate.push(clusterId);
                        this.#registeredEndpointStructureChanges.set(endpointId, knownForUpdate);
                    }
                }
                break;
        }
    }

    #checkEventsForNeededStructureUpdate(_endpointId: EndpointNumber, clusterId: ClusterId, eventId: EventId) {
        // When we subscribe all data here then we can also catch this case and handle it
        if (clusterId === BasicInformation.Cluster.id && eventId === BasicInformation.Cluster.events.shutDown.id) {
            this.#handleNodeShutdown();
        }
    }

    /** Handles a node shutDown event (if supported by the node and received). */
    #handleNodeShutdown() {
        logger.info(`Node ${this.nodeId}: Node shutdown detected, trying to reconnect ...`);
        this.#nodeShutdownDetected = true;
    }

    #scheduleReconnect(delay?: Duration) {
        if (this.connectionState !== NodeStates.WaitingForDeviceDiscovery) {
            this.#setConnectionState(NodeStates.Reconnecting);
        }

        if (!this.#reconnectDelayTimer?.isRunning) {
            this.#reconnectDelayTimer?.stop();
        }
        if (delay === undefined) {
            // Calculate a delay with a backoff strategy based on errorCount and maximum 10 minutes
            delay = Duration.min(Millis(RECONNECT_DELAY * 2 ** this.#reconnectErrorCount), RECONNECT_MAX_DELAY);
        }

        logger.info(`Node ${this.nodeId}: Reconnecting ${delay ? `in ${Duration.format(delay)}` : "now"} ...`);
        this.#reconnectDelayTimer = Time.getTimer("Reconnect delay", delay, async () => await this.reconnect());
        this.#reconnectDelayTimer.start();
    }

    async #updateEndpointStructure() {
        await this.#initializeEndpointStructure(true);

        const rootEndpoint = this.getRootEndpoint();
        if (rootEndpoint !== undefined) {
            await this.events.deviceInformationChanged.emit(this.#nodeDetails.details);
        }
    }

    /**
     * Traverse the structure data and collect the endpoints for the given endpointId.
     * If data was found it is added to the collectedData map.
     */
    #collectEndpoints(endpointId: EndpointNumber, collectedData: Map<EndpointNumber, ClientEndpoint>) {
        if (collectedData.has(endpointId)) {
            return;
        }
        if (!this.#clientNode.endpoints.has(endpointId)) {
            logger.info(`Endpoint ${endpointId} not found on node ${this.nodeId}! Ignoring endpoint ...`);
            return;
        }
        const endpoint = this.#clientNode.endpoints.for(endpointId);
        const descriptorData = endpoint.maybeStateOf(DescriptorClient);
        if (descriptorData === undefined) {
            logger.info(`Descriptor data for endpoint ${endpointId} not found in structure! Ignoring endpoint ...`);
            return;
        }
        collectedData.set(endpointId, endpoint);
        if (descriptorData.partsList.length) {
            for (const partEndpointId of descriptorData.partsList) {
                this.#collectEndpoints(partEndpointId, collectedData);
            }
        }
    }

    #hasEndpointChanged(device: Endpoint, endpoint?: ClientEndpoint) {
        const descriptorData = endpoint?.maybeStateOf(DescriptorClient);
        if (!descriptorData) {
            return true;
        }
        // Check if the device types (ignoring revision for now), or cluster server or cluster clients differ
        return !(
            areNumberListsSame(
                device.getDeviceTypes().map(({ code }) => code),
                descriptorData.deviceTypeList.map(({ deviceType }) => deviceType),
            ) &&
            // Check if the cluster clients are the same - they map to the serverList attribute
            areNumberListsSame(
                device.getAllClusterClients().map(({ id }) => id),
                descriptorData.serverList,
            ) &&
            // Check if the cluster servers are the same - they map to the clientList attribute
            areNumberListsSame(
                device.getAllClusterServers().map(({ id }) => id),
                descriptorData.clientList,
            )
        );
    }

    /** Reads all data from the device and create a device object structure out of it. */
    async #initializeEndpointStructure(
        updateStructure = this.#localInitializationDone || this.#remoteInitializationDone,
    ) {
        if (this.#updateEndpointStructureTimer.isRunning) {
            this.#updateEndpointStructureTimer.stop();
        }
        const eventsToEmit = new Map<EndpointNumber, keyof PairedNode.NodeStructureEvents>();
        const structureUpdateDetails = this.#registeredEndpointStructureChanges;
        this.#registeredEndpointStructureChanges = new Map();

        // Collect the descriptor data for all endpoints referenced in the structure
        const endpoints = new Map<EndpointNumber, ClientEndpoint>();
        this.#collectEndpoints(EndpointNumber(0), endpoints);

        if (updateStructure) {
            // Find out what we need to remove or retain
            const endpointsToRemove = new Set<number>(this.#endpoints.keys());
            for (const endpointId of endpoints.keys()) {
                const device = this.#endpoints.get(endpointId);
                if (device !== undefined) {
                    // Check if there are any changes to the device that require a re-creation
                    // When structureUpdateDetails from subscription updates state changes we do a deep validation
                    // to prevent ordering changes to cause unnecessary device re-creations
                    const hasChanged = structureUpdateDetails.has(endpointId);
                    if (!hasChanged || !this.#hasEndpointChanged(device, endpoints.get(endpointId))) {
                        logger.debug(
                            `Node ${this.nodeId}: Retaining endpoint`,
                            endpointId,
                            hasChanged ? "(with only structure changes)" : "(unchanged)",
                        );
                        endpointsToRemove.delete(endpointId);
                        if (hasChanged) {
                            eventsToEmit.set(endpointId, "nodeEndpointChanged");
                        }
                    } else {
                        logger.debug(`Node ${this.nodeId}: Recreating endpoint`, endpointId);
                        eventsToEmit.set(endpointId, "nodeEndpointChanged");
                    }
                }
            }
            // And remove all endpoints no longer in the structure
            for (const endpoint of endpointsToRemove.values()) {
                const endpointId = EndpointNumber(endpoint);
                const device = this.#endpoints.get(endpointId);
                if (device !== undefined) {
                    if (eventsToEmit.get(endpointId) !== "nodeEndpointChanged") {
                        logger.debug(`Node ${this.nodeId}: Removing endpoint`, endpointId);
                        eventsToEmit.set(endpointId, "nodeEndpointRemoved");
                    }
                    device.removeFromStructure();
                    this.#endpoints.delete(endpointId);
                }
            }
        } else {
            this.#endpoints.clear();
        }

        for (const [endpointId, endpoint] of endpoints.entries()) {
            if (this.#endpoints.has(endpointId)) {
                // Endpoint exists already, so no need to create device instance again
                continue;
            }

            const isRecreation = eventsToEmit.get(endpointId) === "nodeEndpointChanged";
            logger.debug(
                `Node ${this.nodeId}: ${isRecreation ? "Recreating" : "Creating"} endpoint`,
                endpointId,
                Diagnostic.json(endpoint.state),
            );
            this.#endpoints.set(endpointId, this.#createDevice(endpointId, endpoint, this.#interactionClient));
            if (!isRecreation) {
                eventsToEmit.set(endpointId, "nodeEndpointAdded");
            }
        }

        // Remove all children that are not in the partsList anymore
        for (const [endpointId, clientEndpoint] of endpoints.entries()) {
            const partsList = clientEndpoint.stateOf(DescriptorClient).partsList ?? [];

            const endpoint = this.#endpoints.get(endpointId);
            if (endpoint === undefined) {
                // Should not happen or endpoint was invalid and that's why not created, then we ignore it
                continue;
            }
            endpoint.getChildEndpoints().forEach(child => {
                if (child.number !== undefined && !partsList.includes(child.number)) {
                    // Remove this child because it is no longer in the partsList
                    endpoint.removeChildEndpoint(child);
                    if (!eventsToEmit.has(endpointId)) {
                        eventsToEmit.set(endpointId, "nodeEndpointChanged");
                    }
                }
            });
        }

        this.#structureEndpoints(endpoints);

        if (updateStructure && eventsToEmit.size) {
            const emitChangeEvents = () => {
                for (const [endpointId, eventName] of eventsToEmit.entries()) {
                    logger.debug(`Node ${this.nodeId}: Emitting event ${eventName} for endpoint ${endpointId}`);
                    this.events[eventName].emit(endpointId);
                }
                this.#options.stateInformationCallback?.(this.nodeId, NodeStateInformation.StructureChanged);
                this.events.structureChanged.emit();
            };

            if (this.#connectionState === NodeStates.Connected) {
                // If we are connected we can emit the events right away
                emitChangeEvents();
            } else {
                // If we are not connected we need to wait until we are connected again and emit these changes afterwards
                this.events.stateChanged.once(State => {
                    if (State === NodeStates.Connected) {
                        emitChangeEvents();
                    }
                });
            }
        }
    }

    /**
     * Bring the endpoints in a structure based on their partsList attribute. This method only adds endpoints into the
     * right place as children, Cleanup is not happening here
     */
    #structureEndpoints(descriptors: Map<EndpointNumber, ClientEndpoint>) {
        const partLists = Array.from(descriptors.entries()).map(
            ([epNo, ep]) => [epNo, ep.stateOf(DescriptorClient).partsList] as [EndpointNumber, EndpointNumber[]], // else Typescript gets confused
        );
        logger.debug(`Node ${this.nodeId}: Endpoints from PartsLists`, Diagnostic.json(partLists));

        const endpointUsages: { [key: EndpointNumber]: EndpointNumber[] } = {};
        partLists.forEach(([parent, partsList]) =>
            partsList.forEach(endPoint => {
                if (endPoint === parent) {
                    // There could be more cases of invalid and cycling structures that never should happen ... so lets not over optimize to try to find all of them right now
                    logger.warn(`Node ${this.nodeId}: Endpoint ${endPoint} is referencing itself!`);
                    return;
                }
                endpointUsages[endPoint] = endpointUsages[endPoint] || [];
                endpointUsages[endPoint].push(parent);
            }),
        );

        logger.debug(`Node ${this.nodeId}: Endpoint usages`, Diagnostic.json(endpointUsages));

        while (true) {
            // get all endpoints with only one usage
            const singleUsageEndpoints = Object.entries(endpointUsages).filter(([_, usages]) => usages.length === 1);
            if (singleUsageEndpoints.length === 0) {
                if (Object.entries(endpointUsages).length)
                    throw new InternalError(`Endpoint structure for Node ${this.nodeId} could not be parsed!`);
                break;
            }

            logger.debug(`Node ${this.nodeId}: Processing Endpoint ${Diagnostic.json(singleUsageEndpoints)}`);

            const idsToCleanup: { [key: EndpointNumber]: boolean } = {};
            singleUsageEndpoints.forEach(([childId, usages]) => {
                const childEndpointId = EndpointNumber(parseInt(childId));
                const childEndpoint = this.#endpoints.get(childEndpointId);
                const parentEndpoint = this.#endpoints.get(usages[0]);
                const existingChildEndpoint = parentEndpoint?.getChildEndpoint(childEndpointId);
                if (childEndpoint === undefined || parentEndpoint === undefined) {
                    logger.warn(
                        `Node ${this.nodeId}: Endpoint ${usages[0]} not found in the data received from the device!`,
                    );
                } else if (existingChildEndpoint !== childEndpoint) {
                    logger.debug(
                        `Node ${this.nodeId}: Endpoint structure: Child: ${childEndpointId} -> Parent: ${parentEndpoint.number}`,
                    );
                    if (existingChildEndpoint !== undefined) {
                        // Child endpoint changed, so we need to remove the old one first
                        parentEndpoint.removeChildEndpoint(existingChildEndpoint);
                    }

                    parentEndpoint.addChildEndpoint(childEndpoint);
                }

                delete endpointUsages[EndpointNumber(parseInt(childId))];
                idsToCleanup[usages[0]] = true;
            });
            logger.debug(`Node ${this.nodeId}: Endpoint data Cleanup`, Diagnostic.json(idsToCleanup));
            Object.keys(idsToCleanup).forEach(idToCleanup => {
                Object.keys(endpointUsages).forEach(id => {
                    const usageId = EndpointNumber(parseInt(id));
                    endpointUsages[usageId] = endpointUsages[usageId].filter(
                        endpointId => endpointId !== parseInt(idToCleanup),
                    );
                    if (!endpointUsages[usageId].length) {
                        delete endpointUsages[usageId];
                    }
                });
            });
        }
    }

    /** Create a device object from the data read from the device. */
    #createDevice(endpointId: EndpointNumber, endpoint: ClientEndpoint, interactionClient: InteractionClient) {
        const descriptorData = endpoint.stateOf(DescriptorClient);

        const deviceTypes = descriptorData.deviceTypeList.flatMap(({ deviceType, revision }) => {
            const deviceTypeDefinition = getDeviceTypeDefinitionFromModelByCode(deviceType);
            if (deviceTypeDefinition === undefined) {
                logger.info(
                    `NodeId ${this.nodeId}: Device type with code ${deviceType} not known, use generic replacement.`,
                );
                return UnknownDeviceType(deviceType, revision);
            }
            if (deviceTypeDefinition.revision < revision) {
                logger.debug(
                    `NodeId ${this.nodeId}: Device type with code ${deviceType} and revision ${revision} not supported, some data might be unknown.`,
                );
            }
            return deviceTypeDefinition;
        });
        if (deviceTypes.length === 0) {
            logger.info(`NodeId ${this.nodeId}: No device type found for endpoint ${endpointId}, ignore`);
            throw new MatterError(`NodeId ${this.nodeId}: No device type found for endpoint`);
        }

        const endpointClusters = Array<ClusterServerObj | ClusterClientObj>();

        // Add ClusterClients for all server clusters of the device
        for (const clusterId of descriptorData.serverList) {
            const cluster = getClusterById(clusterId);
            let clusterName = cluster.name;
            if (cluster.unknown) {
                clusterName = `Cluster$${cluster.id.toString(16)}`;
            }
            const data = (endpoint.state as any)[camelize(clusterName)];
            const clusterClient = ClusterClient(cluster, endpointId, interactionClient, data);
            endpointClusters.push(clusterClient);
        }

        // TODO use the attributes attributeList, acceptedCommands, generatedCommands to create the ClusterClient/Server objects
        // Add ClusterServers for all client clusters of the device
        for (const clusterId of descriptorData.clientList) {
            const cluster = getClusterById(clusterId);
            const clusterData = {} as AttributeInitialValues<Attributes>; // TODO correct typing
            // Todo add logic for Events
            endpointClusters.push(
                ClusterServer(
                    cluster,
                    /*clusterData.featureMap,*/ clusterData,
                    {},
                    undefined,
                    true,
                ) as ClusterServerObj,
            ); // TODO Add Default handler!
        }

        if (endpointId === 0) {
            // Endpoint 0 is the root endpoint, so we use a RootEndpoint object
            const rootEndpoint = new RootEndpoint(endpoint);
            rootEndpoint.setDeviceTypes(deviceTypes as AtLeastOne<DeviceTypeDefinition>); // Ideally only root one as defined
            endpointClusters.forEach(cluster => {
                if (isClusterServer(cluster)) {
                    rootEndpoint.addClusterServer(cluster);
                } else if (isClusterClient(cluster)) {
                    rootEndpoint.addClusterClient(cluster);
                }
            });
            return rootEndpoint;
        } else if (deviceTypes.find(deviceType => deviceType.code === DeviceTypes.AGGREGATOR.code) !== undefined) {
            // When AGGREGATOR is in the device type list, this is an aggregator
            const aggregator = new Aggregator(endpoint, [], { endpointId });
            aggregator.setDeviceTypes(deviceTypes as AtLeastOne<DeviceTypeDefinition>);
            endpointClusters.forEach(cluster => {
                // TODO There should be none?
                if (isClusterServer(cluster)) {
                    aggregator.addClusterServer(cluster);
                } else if (isClusterClient(cluster)) {
                    aggregator.addClusterClient(cluster);
                }
            });
            return aggregator;
        } else {
            // It seems to be device but has a partsList, so it is a composed device
            if (descriptorData.partsList.length > 0) {
                const composedDevice = new ComposedDevice(endpoint, deviceTypes[0], [], { endpointId });
                composedDevice.setDeviceTypes(deviceTypes as AtLeastOne<DeviceTypeDefinition>);
                endpointClusters.forEach(cluster => {
                    if (isClusterServer(cluster)) {
                        composedDevice.addClusterServer(cluster);
                    } else if (isClusterClient(cluster)) {
                        composedDevice.addClusterClient(cluster);
                    }
                });
                return composedDevice;
            } else {
                // else it's a normal Device
                // TODO Should we find the really correct Device derived class to instance?
                return new PairedDevice(
                    endpoint,
                    deviceTypes as AtLeastOne<DeviceTypeDefinition>,
                    endpointClusters,
                    endpointId,
                );
            }
        }
    }

    /** Returns all parts (endpoints) known for the Root Endpoint of this node. */
    get parts() {
        return this.getRootEndpoint()?.parts ?? new Map<number, Endpoint>();
    }

    /** Returns the functional devices/endpoints (the "childs" of the Root Endpoint) known for this node. */
    getDevices(): Endpoint[] {
        return this.#endpoints.get(EndpointNumber(0))?.getChildEndpoints() ?? [];
    }

    /** Returns the device/endpoint with the given endpoint ID. */
    getDeviceById(endpointId: number) {
        return this.#endpoints.get(EndpointNumber(endpointId));
    }

    /** Returns the Root Endpoint of the device. */
    getRootEndpoint() {
        return this.getDeviceById(0);
    }

    /** De-Commission (unpair) the device from this controller by removing the fabric from the device. */
    async decommission() {
        if (
            this.#connectionState === NodeStates.Reconnecting ||
            this.#connectionState === NodeStates.WaitingForDeviceDiscovery
        ) {
            throw new ImplementationError(
                `This Node ${this.nodeId} is currently in a reconnect state, decommissioning is not possible.`,
            );
        }

        await this.#clientNode.act(agent => agent.get(CommissioningClient).decommission());

        this.#setConnectionState(NodeStates.Disconnected);
        await this.#commissioningController.removeNode(this.nodeId, false);
    }

    /**
     * Opens a Basic Commissioning Window (uses the original Passcode printed on the device) with the device.
     * This is an optional method, so it might not be supported by all devices and could be rejected with an error in
     * this case! Better use openEnhancedCommissioningWindow() instead.
     */
    async openBasicCommissioningWindow(commissioningTimeout = 900 /* 15 minutes */) {
        const adminCommissioningCluster = this.getRootClusterClient(AdministratorCommissioning.Cluster.with("Basic"));
        if (adminCommissioningCluster === undefined) {
            throw new ImplementationError(`AdministratorCommissioningCluster for node ${this.nodeId} not found.`);
        }
        if (adminCommissioningCluster.supportedFeatures.basic === false) {
            throw new ImplementationError(
                `AdministratorCommissioningCluster for node ${this.nodeId} does not support basic commissioning.`,
            );
        }

        try {
            await adminCommissioningCluster.commands.revokeCommissioning();
        } catch (error) {
            // Accept the error if no window is already open
            if (
                !StatusResponseError.is(error, StatusCode.Failure) ||
                error.clusterCode !== AdministratorCommissioning.StatusCode.WindowNotOpen
            ) {
                throw error;
            }
        }

        await adminCommissioningCluster.commands.openBasicCommissioningWindow({ commissioningTimeout });
    }

    /** Opens an Enhanced Commissioning Window (uses a generated random Passcode) with the device. */
    async openEnhancedCommissioningWindow(commissioningTimeout = 900 /* 15 minutes */) {
        const adminCommissioningCluster = this.getRootClusterClient(AdministratorCommissioning.Cluster);
        if (adminCommissioningCluster === undefined) {
            throw new ImplementationError(`AdministratorCommissioningCluster for node ${this.nodeId} not found.`);
        }

        try {
            await adminCommissioningCluster.commands.revokeCommissioning();
        } catch (error) {
            // Accept the error if no window is already open
            if (
                !StatusResponseError.is(error, StatusCode.Failure) ||
                error.clusterCode !== AdministratorCommissioning.StatusCode.WindowNotOpen
            ) {
                throw error;
            }
        }

        const basicInformationCluster = this.getRootClusterClient(BasicInformation.Cluster);
        if (basicInformationCluster === undefined) {
            throw new ImplementationError(`BasicInformationCluster for node ${this.nodeId} not found.`);
        }

        const vendorId = await basicInformationCluster.getVendorIdAttribute();
        const productId = await basicInformationCluster.getProductIdAttribute();

        const discriminator = PaseClient.generateRandomDiscriminator(this.#crypto);
        const passcode = PaseClient.generateRandomPasscode(this.#crypto);
        const salt = this.#crypto.randomBytes(32);
        const iterations = 1_000; // Minimum 1_000, Maximum 100_000
        const pakePasscodeVerifier = await PaseClient.generatePakePasscodeVerifier(this.#crypto, passcode, {
            iterations,
            salt,
        });
        await adminCommissioningCluster.commands.openCommissioningWindow({
            commissioningTimeout,
            pakePasscodeVerifier,
            salt,
            iterations,
            discriminator,
        });

        // TODO: If Timeout is shorter then 15 minutes set the timeout also in TlvData of QR-Code
        const qrPairingCode = QrPairingCodeCodec.encode([
            {
                version: 0,
                vendorId,
                productId,
                flowType: CommissioningFlowType.Standard,
                discriminator: discriminator,
                passcode: passcode,
                discoveryCapabilities: DiscoveryCapabilitiesSchema.encode({
                    onIpNetwork: true,
                }),
            },
        ]);

        return {
            manualPairingCode: ManualPairingCodeCodec.encode({
                discriminator: discriminator,
                passcode: passcode,
            }),
            qrPairingCode,
        };
    }

    /** Closes the current session, ends the subscription and disconnects the device. */
    async disconnect() {
        this.close();
        await this.#commissioningController.disconnectNode(this.nodeId);
    }

    /** Closes the current subscription and ends all timers for reconnects or such used by this PairedNode instance. */
    close(sendDecommissionedStatus = false) {
        this.#newChannelReconnectDelayTimer.stop();
        this.#reconnectDelayTimer?.stop();
        this.#reconnectDelayTimer = undefined;
        this.#updateEndpointStructureTimer.stop();
        if (sendDecommissionedStatus) {
            this.#options.stateInformationCallback?.(this.nodeId, NodeStateInformation.Decommissioned);
            this.events.decommissioned.emit();
        }
        this.#setConnectionState(NodeStates.Disconnected);
        this.#currentSubscription?.close();
    }

    /**
     * Get a cluster server from the root endpoint. This is mainly used internally and not needed to be called by the user.
     *
     * @param cluster ClusterServer to get or undefined if not existing
     */
    getRootClusterServer<const T extends ClusterType>(cluster: T): ClusterServerObj<T> | undefined {
        return this.#endpoints.get(EndpointNumber(0))?.getClusterServer(cluster);
    }

    /**
     * Get a cluster client from the root endpoint. This is mainly used internally and not needed to be called by the user.
     *
     * @param cluster ClusterClient to get or undefined if not existing
     */
    getRootClusterClient<const T extends ClusterType>(cluster: T): ClusterClientObj<T> | undefined {
        return this.#endpoints.get(EndpointNumber(0))?.getClusterClient(cluster);
    }

    /**
     * Get a cluster server from the root endpoint. This is mainly used internally and not needed to be called by the user.
     *
     * @param endpointId EndpointNumber to get the cluster from
     * @param cluster ClusterServer to get or undefined if not existing
     */
    getClusterServerForDevice<const T extends ClusterType>(
        endpointId: EndpointNumber,
        cluster: T,
    ): ClusterServerObj<T> | undefined {
        return this.getDeviceById(endpointId)?.getClusterServer(cluster);
    }

    /**
     * Get a cluster client from the root endpoint. This is mainly used internally and not needed to be called by the user.
     *
     * @param endpointId EndpointNumber to get the cluster from
     * @param cluster ClusterClient to get or undefined if not existing
     */
    getClusterClientForDevice<const T extends ClusterType>(
        endpointId: EndpointNumber,
        cluster: T,
    ): ClusterClientObj<T> | undefined {
        return this.getDeviceById(endpointId)?.getClusterClient(cluster);
    }

    get [Diagnostic.value](): unknown {
        const root = this.getRootEndpoint();

        let statusIcon = "✗";
        switch (this.#connectionState) {
            case NodeStates.Reconnecting:
                statusIcon = "⌛";
                break;
            case NodeStates.WaitingForDeviceDiscovery:
                statusIcon = "💤";
                break;
            case NodeStates.Connected:
                statusIcon = "✓";
                break;
        }

        return Diagnostic.node(statusIcon, this.nodeId, {
            children: [
                Diagnostic.strong("Information"),
                Diagnostic.list([Diagnostic.dict(this.deviceInformation as object)]),
                Diagnostic.strong("Structure"),
                root ? Diagnostic.list([root]) : "Unknown",
            ],
        });
    }

    /**
     * Access to cached cluster state values of the root endpoint using node.state.clusterNameOrId.attributeNameOrId
     * Returns immutable cached attribute values from cluster clients
     */
    get state() {
        return this.#clientNode.state;
    }

    /**
     * Access to cluster commands of the root endpoint using node.commands.clusterNameOrId.commandName
     * Returns async functions that can be called to invoke commands on cluster clients
     */
    get commands() {
        return this.#clientNode.commands;
    }

    /**
     * Access to typed cached cluster state values of the root endpoint
     * Returns immutable cached attribute values from cluster clients
     */
    stateOf<T extends Behavior.Type>(type: T) {
        return this.#clientNode.stateOf(type);
    }

    /**
     * Access to typed cluster commands of the root endpoint
     * Returns async functions that can be called to invoke commands on cluster clients
     */
    commandsOf<T extends Behavior.Type>(type: T): Commands.OfBehavior<T> {
        return this.#clientNode.commandsOf(type);
    }
}

export namespace PairedNode {
    export interface NodeStructureEvents {
        /** Emitted when endpoints are added. */
        nodeEndpointAdded: Observable<[EndpointNumber]>;

        /** Emitted when endpoints are removed. */
        nodeEndpointRemoved: Observable<[EndpointNumber]>;

        /** Emitted when endpoints are updated (e.g. device type changed, structure changed). */
        nodeEndpointChanged: Observable<[EndpointNumber]>;
    }

    export interface Events extends NodeStructureEvents {
        /**
         * Emitted when the node is initialized from local data. These data usually are stale, but you can still already
         * use the node to interact with the device. If no local data are available this event will be emitted together
         * with the initializedFromRemote event.
         */
        initialized: AsyncObservable<[details: DeviceInformationData]>;

        /**
         * Emitted when the node is fully initialized from remote and all attributes and events are subscribed.
         * This event can also be awaited if code needs to be blocked until the node is fully initialized.
         */
        initializedFromRemote: AsyncObservable<[details: DeviceInformationData]>;

        /**
         * Emitted when the device information changes.
         */
        deviceInformationChanged: AsyncObservable<[details: DeviceInformationData]>;

        /** Emitted when the state of the node changes. */
        stateChanged: Observable<[nodeState: NodeStates]>;

        /** Emitted when an attribute value changes. */
        attributeChanged: Observable<[data: DecodedAttributeReportValue<any>]>;

        /** Emitted when an event is triggered. */
        eventTriggered: Observable<[DecodedEventReportValue<any>]>;

        /**
         * Emitted when all node structure changes were applied (Endpoints got added or also removed).
         * You can alternatively use the nodeEndpointAdded, nodeEndpointRemoved, and nodeEndpointChanged events to react on specific changes.
         * This event is emitted after all nodeEndpointAdded, nodeEndpointRemoved, and nodeEndpointChanged events are emitted.
         */
        structureChanged: Observable<[void]>;

        /** Emitted when the node is decommissioned. */
        decommissioned: Observable<[void]>;

        /** Emitted when a subscription alive trigger is received (max interval trigger or any data update) */
        connectionAlive: Observable<[void]>;
    }
}
