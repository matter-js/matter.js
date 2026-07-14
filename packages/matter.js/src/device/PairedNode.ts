/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { ClusterClient } from "#cluster/client/ClusterClient.js";
import { ClusterClientObj } from "#cluster/client/ClusterClientTypes.js";
import { DecodedAttributeReportValue, DecodedEventReportValue } from "#cluster/client/DecodedDataReport.js";
import { InteractionClient, UnknownNodeError } from "#cluster/client/InteractionClient.js";
import {
    AsyncObservable,
    AtLeastOne,
    camelize,
    Construction,
    Crypto,
    CRYPTO_PBKDF_ITERATIONS_MIN,
    Diagnostic,
    Immutable,
    ImplementationError,
    InternalError,
    Logger,
    MatterError,
    MaybePromise,
    Observable,
    ObserverGroup,
    Seconds,
    Time,
} from "@matter/general";
import {
    AcceptedCommandList,
    AggregatorDt,
    AttributeList,
    ClusterModel,
    ClusterRevision,
    FeatureMap,
    Matter,
} from "@matter/model";
import {
    Behavior,
    ChangeNotificationService,
    Endpoint as ClientEndpoint,
    ClientNode,
    ClusterBehavior,
    Commands,
    EndpointLifecycle,
    IcdClient,
    NetworkClient,
    type GlobalAttributeState,
} from "@matter/node";
import { DescriptorClient } from "@matter/node/behaviors/descriptor";
import { PaseClient, Peer, PeerAddress, Read, SustainedSubscription, Val } from "@matter/protocol";
import {
    AttributeId,
    CaseAuthenticatedTag,
    ClusterId,
    ClusterType,
    CommissioningFlowType,
    DiscoveryCapabilitiesSchema,
    EndpointNumber,
    EventId,
    ManualPairingCodeCodec,
    NodeId,
    QrPairingCodeCodec,
    Status,
    StatusResponseError,
} from "@matter/types";
import { AdministratorCommissioning } from "@matter/types/clusters/administrator-commissioning";
import { BasicInformation } from "@matter/types/clusters/basic-information";
import { Descriptor } from "@matter/types/clusters/descriptor";
import { CommissioningController } from "../CommissioningController.js";
import { Aggregator } from "./Aggregator.js";
import { ComposedDevice } from "./ComposedDevice.js";
import { PairedDevice, RootEndpoint } from "./Device.js";
import { DeviceInformation, DeviceInformationData } from "./DeviceInformation.js";
import { DeviceTypeDefinition, getDeviceTypeDefinitionFromModelByCode, UnknownDeviceType } from "./DeviceTypes.js";
import { Endpoint } from "./Endpoint.js";
import { asClusterClientInternal } from "./TypeHelpers.js";

const logger = Logger.get("PairedNode");

/** Delay after receiving a changed partList  from a device to update the device structure */
const STRUCTURE_UPDATE_TIMEOUT = Seconds(5);

/** @deprecated Legacy API, removed in 0.19. Migrate to @matter/node — see docs/MIGRATION_CONTROLLER_018.md. */
export enum NodeStates {
    /**
     * Node seems active nd last communications were successful and subscription updates were received and all data is
     * up-to-date.
     */
    Connected = 0,

    /**
     * Node is disconnected. This means that the node was not connected so far or the developer disconnected it by API
     * call or the node is removed. A real disconnection cannot be detected because the main Matter protocol uses UDP.
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

/** @deprecated Legacy API, removed in 0.19. Migrate to @matter/node — see docs/MIGRATION_CONTROLLER_018.md. */
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

/** @deprecated Legacy API, removed in 0.19. Migrate to @matter/node — see docs/MIGRATION_CONTROLLER_018.md. */
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
     * @deprecated Please use the events.stateChanged observable and the extra events for structureChanged and
     *  decommissioned instead.
     */
    readonly stateInformationCallback?: (nodeId: NodeId, state: NodeStateInformation) => void;

    /**
     * Optional Case Authenticated Tags (CATs) to be used when establishing CASE sessions with the node.
     * These tags provide additional authentication context for the operational session.
     */
    readonly caseAuthenticatedTags?: CaseAuthenticatedTag[];
};

/** @deprecated Legacy API, removed in 0.19. Migrate to @matter/node — see docs/MIGRATION_CONTROLLER_018.md. */
export class NodeNotConnectedError extends MatterError {}

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
 *
 * @deprecated Legacy API, removed in 0.19. Migrate to @matter/node — see docs/MIGRATION_CONTROLLER_018.md.
 */
export class PairedNode {
    readonly #clientNode: ClientNode;

    /** Legacy Endpoint structure, only initialized when needed */
    #endpoints?: Map<number, Endpoint>;
    readonly #interactionClient: InteractionClient;
    readonly #updateEndpointStructureTimer = Time.getTimer("Endpoint structure update", STRUCTURE_UPDATE_TIMEOUT, () =>
        this.#updateEndpointStructure(),
    );
    #connectionState: NodeStates = NodeStates.Disconnected;
    #localInitializationDone = false;
    #remoteInitializationDone = false;
    #nodeDetails: DeviceInformation;
    readonly #construction: Construction<PairedNode>;

    /**
     * When true, attribute/event changes are forwarded to callbacks and events. Set after initial data is processed.
     */
    #changesActive = false;
    readonly #commissioningController: CommissioningController;
    #options: CommissioningControllerNodeOptions;
    readonly #crypto: Crypto;
    #deviceInformationUpdateNeeded = false;
    #observers = new ObserverGroup();
    #attributeIdToNameMap = new Map<string, string>();

    /** Collected Node change events from the node level. Only filled when the legacy endpoint structure is NOT used. */
    #pendingNodeChangeEvents = new Map<EndpointNumber, keyof PairedNode.NodeStructureEvents>();
    #decommissioned = false;
    readonly #peerAddress: PeerAddress;
    #closing = false;

    /**
     * Endpoint structure change information that are checked when updating structure
     * - null means that the endpoint itself changed, so will be regenerated completely any case
     * - array of ClusterIds means that only these clusters changed and will be updated
     */
    #registeredEndpointStructureChanges = new Map<EndpointNumber, ClusterId[] | null>();

    /** @deprecated Legacy API, removed in 0.19. Migrate to @matter/node — see docs/MIGRATION_CONTROLLER_018.md. */
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

    /** @deprecated Legacy API, removed in 0.19. Migrate to @matter/node — see docs/MIGRATION_CONTROLLER_018.md. */
    static async create(
        nodeId: NodeId,
        commissioningController: CommissioningController,
        options: CommissioningControllerNodeOptions = {},
        clientNode: ClientNode,
        interactionClient: InteractionClient,
        peer: Peer,
        crypto: Crypto,
        changes: Observable<[changes: ChangeNotificationService.Change]>,
    ): Promise<PairedNode> {
        const node = new PairedNode(
            nodeId,
            commissioningController,
            options,
            clientNode,
            interactionClient,
            peer,
            crypto,
            changes,
        );
        await node.construction;
        return node;
    }

    /** @deprecated Legacy API, removed in 0.19. Migrate to @matter/node — see docs/MIGRATION_CONTROLLER_018.md. */
    constructor(
        readonly nodeId: NodeId,
        commissioningController: CommissioningController,
        options: CommissioningControllerNodeOptions = {},
        clientNode: ClientNode,
        interactionClient: InteractionClient,
        peer: Peer,
        crypto: Crypto,
        changes: Observable<[changes: ChangeNotificationService.Change]>,
    ) {
        this.#commissioningController = commissioningController;
        this.#peerAddress = commissioningController.fabric.addressOf(nodeId);
        this.#options = options;
        this.#crypto = crypto;
        this.#clientNode = clientNode;
        this.#interactionClient = interactionClient;

        // Wire up observers -- these persist for the lifetime of this PairedNode
        this.#observers.on(changes, this.#handleNodeChange.bind(this));
        this.#observers.on(this.#clientNode.lifecycle.changed, (type, endpoint) => {
            if (this.#endpoints !== undefined) {
                // When using legacy Endpoint structure, we handle that differently
                return;
            }
            switch (type) {
                case EndpointLifecycle.Change.PartsReady:
                    this.#pendingNodeChangeEvents.set(endpoint.number, "nodeEndpointAdded");
                    break;
            }
        });
        this.#observers.on(this.#clientNode.lifecycle.decommissioned, () => this.#handleNodeDecommissioning());
        this.#observers.on(
            this.#clientNode.eventsOf(NetworkClient).subscriptionStatusChanged,
            this.#handleSubscriptionStatusChanged.bind(this),
        );
        this.#observers.on(
            this.#clientNode.eventsOf(NetworkClient).subscriptionAlive,
            this.#handleSubscriptionAlive.bind(this),
        );

        // A missed Check-In escalates a held Reconnecting; a parked subscription alone must not.
        if (this.#clientNode.behaviors.has(IcdClient)) {
            this.#observers.on(
                this.#clientNode.eventsOf(IcdClient).checkInMissed,
                this.#handleIcdCheckInMissed.bind(this),
            );
        }

        this.#observers.on(peer.service.changed, () => {
            if (!peer.service.addresses.size && this.#connectionState === NodeStates.Reconnecting) {
                this.#setConnectionState(NodeStates.WaitingForDeviceDiscovery);
            }
        });
        this.#observers.on(peer.sessions.deleted, () => {
            if (peer.sessions.size) {
                // We still have a session, do nothing
                return;
            }
            if (peer.service.addresses.size) {
                if (this.#connectionState === NodeStates.Connected) {
                    // No session anymore, but still known addresses and state is "connected" - we do reconnection
                    this.#setConnectionState(NodeStates.Reconnecting);
                }
            } else if (this.#connectionState === NodeStates.Reconnecting) {
                // No session anymore, and we already were reconnecting, but also no known addresses - we wait for device discovery
                this.#setConnectionState(NodeStates.WaitingForDeviceDiscovery);
            }
        });

        this.#nodeDetails = new DeviceInformation(clientNode);
        logger.info(this.#peerAddress, `Created paired node with device data`, this.#nodeDetails.meta);

        this.#construction = Construction(this, async () => {
            // We try to initialize from stored data already
            await this.#initializeFromStoredData();

            let state: NodeStates = NodeStates.Reconnecting;
            const subscription = this.#clientNode.behaviors.internalsOf(NetworkClient).activeSubscription;
            if (subscription instanceof SustainedSubscription) {
                if (subscription.active.value) {
                    state = NodeStates.Connected;
                } else if (!peer.service.addresses.size) {
                    state = NodeStates.WaitingForDeviceDiscovery;
                }
            }
            this.#setConnectionState(state);

            if (this.#options.autoConnect !== false) {
                if (this.#options.autoSubscribe === false) {
                    // No subscription desired -- do a one-time wildcard read to populate state
                    this.#initializeWithRead().catch(error => {
                        logger.warn(this.#peerAddress, `Error during read-only initialization`, error);
                    });
                } else {
                    // Activate the sustained subscription on NetworkClient
                    this.#activateSubscription();
                }
            }
        });
    }

    /** @deprecated Legacy API, removed in 0.19. Migrate to @matter/node — see docs/MIGRATION_CONTROLLER_018.md. */
    get construction() {
        return this.#construction;
    }

    /** @deprecated Legacy API, removed in 0.19. Migrate to @matter/node — see docs/MIGRATION_CONTROLLER_018.md. */
    get isConnected() {
        return this.#connectionState === NodeStates.Connected;
    }

    /**
     * Returns the Node connection state.
     * @deprecated Legacy API, removed in 0.19. Migrate to @matter/node — see docs/MIGRATION_CONTROLLER_018.md.
     */
    get connectionState() {
        return this.#connectionState;
    }

    /**
     * Returns the BasicInformation cluster metadata collected from the device.
     * @deprecated Legacy API, removed in 0.19. Migrate to @matter/node — see docs/MIGRATION_CONTROLLER_018.md.
     */
    get basicInformation() {
        return this.#nodeDetails.basicInformation;
    }

    /**
     * Returns the general capability metadata collected from the device.
     * @deprecated Legacy API, removed in 0.19. Migrate to @matter/node — see docs/MIGRATION_CONTROLLER_018.md.
     */
    get deviceInformation() {
        return this.#nodeDetails.meta;
    }

    /**
     * Is the Node fully initialized with formerly stored subscription data? False when the node was never connected so far.
     * @deprecated Legacy API, removed in 0.19. Migrate to @matter/node — see docs/MIGRATION_CONTROLLER_018.md.
     */
    get localInitializationDone() {
        return this.#localInitializationDone;
    }

    /**
     * Is the Node fully initialized with remote subscription or read data?
     * @deprecated Legacy API, removed in 0.19. Migrate to @matter/node — see docs/MIGRATION_CONTROLLER_018.md.
     */
    get remoteInitializationDone() {
        return this.#remoteInitializationDone;
    }

    /**
     * Is the Node initialized - locally or remotely?
     * @deprecated Legacy API, removed in 0.19. Migrate to @matter/node — see docs/MIGRATION_CONTROLLER_018.md.
     */
    get initialized() {
        return this.#remoteInitializationDone || this.#localInitializationDone;
    }

    /** @deprecated Legacy API, removed in 0.19. Migrate to @matter/node — see docs/MIGRATION_CONTROLLER_018.md. */
    get id() {
        return this.#clientNode.id;
    }

    /** @deprecated Legacy API, removed in 0.19. Migrate to @matter/node — see docs/MIGRATION_CONTROLLER_018.md. */
    get node() {
        return this.#clientNode;
    }

    /**
     * If a subscription is established, then this is the interval in seconds, otherwise undefined
     * @deprecated Legacy API, removed in 0.19. Migrate to @matter/node — see docs/MIGRATION_CONTROLLER_018.md.
     */
    get currentSubscriptionIntervalSeconds() {
        const sub = this.#clientNode.behaviors.internalsOf(NetworkClient).activeSubscription;
        return sub?.maxInterval !== undefined ? sub.maxInterval : undefined;
    }

    #setConnectionState(state: NodeStates) {
        if (
            this.#connectionState === state ||
            (this.#connectionState === NodeStates.WaitingForDeviceDiscovery && state === NodeStates.Reconnecting)
        ) {
            return;
        }
        this.#connectionState = state;
        this.#options.stateInformationCallback?.(this.nodeId, state as unknown as NodeStateInformation);
        this.events.stateChanged.emit(state);
    }

    /**
     * Activate the sustained subscription on NetworkClient. This triggers the Read and Subscribe flow.
     */
    #activateSubscription() {
        if (this.#options.autoSubscribe === false) {
            return;
        }
        const networkState = this.#clientNode.stateOf(NetworkClient);
        if (!networkState.autoSubscribe) {
            this.#clientNode.act(agent => (agent.get(NetworkClient).state.autoSubscribe = true));
        }
    }

    /**
     * Perform a one-time wildcard read (no subscription) and complete remote initialization.
     * Used when autoSubscribe is false to still populate the node state once.
     */
    async #initializeWithRead() {
        const read = Read({
            fabricFilter: true,
            attributes: [{}],
        });
        for await (const _chunk of this.#clientNode.interaction.read(read));

        if (this.#endpoints !== undefined) {
            this.#initializeEndpointStructure();
        }

        this.#remoteInitializationDone = true;
        this.#changesActive = true;
        this.#setConnectionState(NodeStates.Connected);
        await this.events.initializedFromRemote.emit(this.#nodeDetails.details);
        if (!this.#localInitializationDone) {
            this.#localInitializationDone = true;
            await this.events.initialized.emit(this.#nodeDetails.details);
        }

        try {
            await this.#commissioningController.validateAndUpdateFabricLabel(this.nodeId);
        } catch (error) {
            logger.warn(this.#peerAddress, `Error updating fabric label`, error);
        }
    }

    /**
     * Schedule a connection to the device. This method is non-blocking and will return immediately.
     * The connection happens in the background. Please monitor the state events of the node to see if the
     * connection was successful.
     * The provided connection options will be set and used internally if the node reconnects successfully.
     *
     * @deprecated Legacy API, removed in 0.19. Migrate to @matter/node — see docs/MIGRATION_CONTROLLER_018.md.
     */
    connect(connectOptions?: CommissioningControllerNodeOptions) {
        if (this.#decommissioned) {
            throw new UnknownNodeError("This node is decommissioned and cannot be connected to.");
        }
        if (connectOptions !== undefined) {
            this.#options = connectOptions;
        }
        this.#connect(connectOptions).catch(error => logger.warn(this.#peerAddress, `Error connecting to node`, error));
    }

    async #connect(connectOptions?: CommissioningControllerNodeOptions) {
        // Per-connect subscription intervals must reach the NetworkClient that drives the subscription; the
        // create-time path only applies them when passed to getNode()/connectNode().
        await this.#applyDefaultSubscription(connectOptions);

        // disconnect() disables the underlying node; re-enable it so the node restarts and NetworkClient can
        // (re)subscribe.  Without this a connect() after disconnect() is a no-op because isDisabled stays set.
        if (this.#clientNode.stateOf(NetworkClient).isDisabled) {
            await this.#clientNode.enable();
        }

        if (this.#options.autoSubscribe === false) {
            await this.#initializeWithRead();
        } else {
            this.#activateSubscription();
        }
    }

    /** Push per-connect subscription intervals onto the NetworkClient that drives the sustained subscription. */
    async #applyDefaultSubscription(connectOptions?: CommissioningControllerNodeOptions) {
        if (connectOptions === undefined) {
            return;
        }
        const defaultSubscription: Record<string, unknown> = {};
        if (connectOptions.subscribeMinIntervalFloorSeconds !== undefined) {
            defaultSubscription.minIntervalFloor = Seconds(connectOptions.subscribeMinIntervalFloorSeconds);
        }
        if (connectOptions.subscribeMaxIntervalCeilingSeconds !== undefined) {
            defaultSubscription.maxIntervalCeiling = Seconds(connectOptions.subscribeMaxIntervalCeilingSeconds);
        }
        if (Object.keys(defaultSubscription).length > 0) {
            await this.#clientNode.set({ network: { defaultSubscription } });
        }
    }

    /**
     * Trigger a reconnection to the device. This method is non-blocking and will return immediately.
     * The reconnection happens in the background. Please monitor the state events of the node to see if the
     * reconnection was successful.
     *
     * @deprecated Legacy API, removed in 0.19. Migrate to @matter/node — see docs/MIGRATION_CONTROLLER_018.md.
     */
    triggerReconnect() {
        this.reconnect().catch(error => logger.error(this.#peerAddress, `Failed to reconnect to node`, error));
    }

    /**
     * Force a reconnection by tearing down and re-establishing the sustained subscription.
     *
     * @deprecated Legacy API, removed in 0.19. Migrate to @matter/node — see docs/MIGRATION_CONTROLLER_018.md.
     */
    async reconnect(connectOptions?: CommissioningControllerNodeOptions) {
        if (this.#decommissioned) {
            logger.debug(this.#peerAddress, "Ignoring reconnect request because node is decommissioned.");
            return;
        }
        if (connectOptions !== undefined) {
            this.#options = connectOptions;
        }
        // Toggle autoSubscribe to tear down and re-create the sustained subscription
        await this.#clientNode.set({ network: { autoSubscribe: false } });
        this.#activateSubscription();
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

        // We need more data of the device, postpone initialization
        if (!rootEndpointIncluded || !otherEndpointIncluded) {
            return;
        }

        // Inform interested parties that the node is initialized
        await this.events.initialized.emit(this.#nodeDetails.details);
        this.#localInitializationDone = true;
    }

    #handleNodeChange(changes: ChangeNotificationService.Change) {
        const { kind } = changes;

        switch (kind) {
            case "update": {
                if (!this.#changesActive) {
                    return;
                }
                const { behavior, endpoint, properties, version } = changes;
                if (!ClusterBehavior.is(behavior)) {
                    return;
                }
                const endpointId = endpoint.number;
                const clusterId = behavior.cluster.id;

                if (!endpoint.behaviors.supported[behavior.id]) {
                    logger.info(
                        `Ignoring attribute changes for ${endpointId}.${behavior.cluster.name} for fields`,
                        properties,
                    );
                    return;
                }

                const state = endpoint.stateOf(behavior);
                const attributes = behavior.cluster.attributes ?? {};
                for (const attribute of properties ?? Object.keys(attributes)) {
                    let attributeId = parseInt(attribute, 10);
                    if (isNaN(attributeId)) {
                        attributeId = attributes[attribute]?.id;
                        if (attributeId === undefined) {
                            continue;
                        }
                    }
                    const attrKey = `${clusterId}.${attributeId}`;

                    // We need to determine the attribute name for the API
                    let attributeName = this.#attributeIdToNameMap.get(attrKey);
                    if (attributeName === undefined) {
                        const clusterModel = Matter.clusters(clusterId);
                        const attrModel = clusterModel?.attributes(attributeId);
                        attributeName = attrModel ? attrModel.propertyName : `Unknown (${Diagnostic.hex(attributeId)})`;
                        this.#attributeIdToNameMap.set(attrKey, attributeName);
                    }
                    const value = (state as Val.Struct)[attribute];

                    const data: DecodedAttributeReportValue<any> = {
                        path: {
                            endpointId,
                            clusterId,
                            attributeId: attributeId as AttributeId,
                            attributeName,
                        },
                        value,
                        version,
                    };

                    // Update legacy ClusterClient if initialized
                    const cluster = this.#endpoints?.get(endpointId)?.getClusterClientById(clusterId);
                    if (this.#endpoints !== undefined && cluster === undefined) {
                        continue;
                    }
                    logger.debug(
                        this.#peerAddress,
                        `Trigger attribute update for ${endpointId}.${cluster?.name ?? Matter.clusters(clusterId)?.name ?? Diagnostic.hex(clusterId)}.${attributeId} to ${Diagnostic.json(value)}`,
                    );
                    if (cluster !== undefined) {
                        asClusterClientInternal(cluster)._triggerAttributeUpdate(attributeId as AttributeId, value);
                    }

                    // Emit callbacks and events
                    this.#options.attributeChangedCallback?.(this.nodeId, data);
                    this.events.attributeChanged.emit(data);

                    this.#checkAttributesForNeededUpdates(endpointId, clusterId, attributeId as AttributeId, value);
                }
                break;
            }

            case "event": {
                if (!this.#changesActive) {
                    return;
                }
                const { endpoint, behavior, event, number, timestamp: epochTimestamp, priority, payload } = changes;
                if (!ClusterBehavior.is(behavior)) {
                    return;
                }

                const endpointId = endpoint.number;
                const clusterId = behavior.cluster.id;
                const eventId = event.id as EventId;
                const data: DecodedEventReportValue<any> = {
                    path: {
                        endpointId,
                        clusterId,
                        eventId,
                        eventName: event.propertyName,
                    },
                    events: [{ eventNumber: number, epochTimestamp, priority, data: payload }],
                };

                // Update legacy ClusterClient if initialized
                const cluster = this.#endpoints?.get(endpointId)?.getClusterClientById(clusterId);
                if (this.#endpoints !== undefined && cluster === undefined) {
                    break;
                }
                logger.debug(
                    this.#peerAddress,
                    `Trigger event update for ${endpointId}.${cluster?.name ?? Matter.clusters(clusterId)?.name ?? Diagnostic.hex(clusterId)}.${eventId} for ${data.events.length} events`,
                );
                if (cluster !== undefined) {
                    asClusterClientInternal(cluster)._triggerEventUpdate(eventId, data.events);
                }

                // Emit callbacks and events
                this.#options.eventTriggeredCallback?.(this.nodeId, data);
                this.events.eventTriggered.emit(data);

                this.#checkEventsForNeededStructureUpdate(endpointId, clusterId, eventId);
                break;
            }

            case "delete": {
                if (this.#endpoints !== undefined) {
                    // When using the legacy Endpoint structure, events are handled differently
                    return;
                }
                const { endpoint } = changes;
                if (endpoint === this.#clientNode) {
                    // Node was deleted, so the event is useless anyway, we get a decommission event
                    return;
                }
                this.#pendingNodeChangeEvents.set(endpoint.number, "nodeEndpointRemoved");
                break;
            }
        }
    }

    /**
     * Called when NetworkClient reports, the subscription is alive (data received).
     * Handles structure update scheduling, device info updates, and connectionAlive events.
     */
    #handleSubscriptionAlive() {
        if (this.#remoteInitializationDone && !this.#closing && !this.#decommissioned) {
            this.#setConnectionState(NodeStates.Connected);
        }

        // Schedule endpoint structure update if needed
        if (
            this.#remoteInitializationDone &&
            (this.#registeredEndpointStructureChanges.size > 0 || this.#pendingNodeChangeEvents.size > 0) &&
            !this.#updateEndpointStructureTimer.isRunning
        ) {
            if (!this.#closing && !this.#decommissioned) {
                logger.info(this.#peerAddress, `Endpoint structure needs to be updated ...`);
                this.#updateEndpointStructureTimer.stop().start();
            }
        } else if (this.#deviceInformationUpdateNeeded) {
            this.events.deviceInformationChanged.emit(this.#nodeDetails.details);
        }
        this.#deviceInformationUpdateNeeded = false;

        this.events.connectionAlive.emit();
    }

    /**
     * Called when NetworkClient reports the subscription status changed.
     * On first activation after startup, triggers the remote initialization completion flow.
     */
    async #handleSubscriptionStatusChanged(isActive: boolean) {
        if (isActive) {
            this.#setConnectionState(NodeStates.Connected);

            // On the first successful subscription, complete remote initialization
            if (!this.#remoteInitializationDone) {
                if (this.#endpoints !== undefined) {
                    this.#initializeEndpointStructure();
                }

                this.#remoteInitializationDone = true;
                this.#changesActive = true;
                await this.events.initializedFromRemote.emit(this.#nodeDetails.details);
                if (!this.#localInitializationDone) {
                    this.#localInitializationDone = true;
                    await this.events.initialized.emit(this.#nodeDetails.details);
                }

                try {
                    await this.#commissioningController.validateAndUpdateFabricLabel(this.nodeId);
                } catch (error) {
                    logger.warn(this.#peerAddress, `Error updating fabric label`, error);
                }
            }
        } else if (this.#connectionState === NodeStates.Connected) {
            // Subscription is not active anymore, and we were connected before, we use Reconnecting as state
            // When all sessions disconnect, we go to WaitingForDiscovery
            this.#setConnectionState(NodeStates.Reconnecting);
        }
    }

    /** Escalate a held Reconnecting when a registered LIT peer misses its expected Check-In; recovery stays with the liveness handler. */
    #handleIcdCheckInMissed() {
        if (this.#connectionState === NodeStates.Reconnecting && !this.#closing && !this.#decommissioned) {
            this.#setConnectionState(NodeStates.WaitingForDeviceDiscovery);
        }
    }

    /**
     * Request the current InteractionClient for custom special interactions with the device. Usually the
     * ClusterClients of the Devices of the node should be used instead. An own InteractionClient is only needed
     * when you want to read or write multiple attributes or events in a single request or send batch invokes.
     *
     * @deprecated Legacy API, removed in 0.19. Migrate to @matter/node — see docs/MIGRATION_CONTROLLER_018.md.
     */
    getInteractionClient() {
        return this.#interactionClient;
    }

    /**
     * Method to log the structure of this node with all endpoints and clusters.
     * @deprecated Legacy API, removed in 0.19. Migrate to @matter/node — see docs/MIGRATION_CONTROLLER_018.md.
     */
    logStructure() {
        logger.info(this.#clientNode);
    }

    /**
     * Subscribe to all attributes and events of the device. Unless setting the Controller property autoSubscribe to
     * false, this is executed automatically. Alternatively, you can manually subscribe by calling this method.
     *
     * @deprecated Subscription is now managed by NetworkClient on the ClientNode. Use connect() to activate.
     */
    async subscribeAllAttributesAndEvents(_options?: {
        ignoreInitialTriggers?: boolean;
        attributeChangedCallback?: (data: DecodedAttributeReportValue<any>) => void;
        eventTriggeredCallback?: (data: DecodedEventReportValue<any>) => void;
    }) {
        // Activate a subscription through NetworkClient if not already active
        this.#activateSubscription();
        return this.currentSubscriptionIntervalSeconds;
    }

    #checkAttributesForNeededUpdates(
        endpointId: EndpointNumber,
        clusterId: ClusterId,
        attributeId: AttributeId,
        _value: any,
    ) {
        // Any change in the Descriptor Cluster partsList attribute requires a reinitialization of the endpoint structure
        if (clusterId === Descriptor.id) {
            switch (attributeId) {
                case Descriptor.attributes.partsList.id:
                case Descriptor.attributes.serverList.id:
                case Descriptor.attributes.clientList.id:
                case Descriptor.attributes.deviceTypeList.id:
                    this.#registeredEndpointStructureChanges.set(endpointId, null); // full endpoint update needed
                    return;
            }
        } else if (clusterId === BasicInformation.id) {
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
        /*
        TODO: Do we want to move the "longer reconnection timeframe for OTA reboots into new logic?
        if (
            clusterId === OtaSoftwareUpdateRequestor.id &&
            attributeId == OtaSoftwareUpdateRequestor.attributes.updateState.id
        ) {
            if (value === OtaSoftwareUpdateRequestor.UpdateState.Applying) {
                this.#nodeShutdownReason = NodeShutDownReason.ForUpdate;
            }
        }
        */
    }

    #checkEventsForNeededStructureUpdate(_endpointId: EndpointNumber, clusterId: ClusterId, eventId: EventId) {
        // When we subscribe all data here then we can also catch this case and handle it
        if (clusterId === BasicInformation.id && eventId === BasicInformation.events.shutDown.id) {
            this.#handleNodeShutdown();
        }
    }

    /** Handles a node shutDown event (if supported by the node and received). */
    #handleNodeShutdown() {
        logger.info(this.#peerAddress, `Node shutdown detected. SustainedSubscription will handle reconnection.`);
    }

    #updateEndpointStructure() {
        if (this.#decommissioned || this.#closing) {
            return;
        }
        if (this.#endpoints === undefined) {
            // Combine triggers from attribute changes with the collected node details
            for (const endpointId of this.#registeredEndpointStructureChanges.keys()) {
                if (!this.#pendingNodeChangeEvents.has(endpointId)) {
                    this.#pendingNodeChangeEvents.set(endpointId, "nodeEndpointChanged");
                }
            }
            const eventsToEmit = new Map(this.#pendingNodeChangeEvents);

            this.#registeredEndpointStructureChanges.clear();
            this.#pendingNodeChangeEvents.clear();

            this.#triggerNodeStructureChanges(eventsToEmit);
        } else {
            this.#initializeEndpointStructure(true);
        }

        MaybePromise.then(
            this.events.deviceInformationChanged.emit(this.#nodeDetails.details),
            () => {},
            error => logger.warn(this.#peerAddress, `Error updating endpoint structure`, error),
        );
    }

    /**
     * Traverse the structure data and collect the endpoints for the given endpointId.
     * If data was found, it is added to the collectedData map.
     */
    #collectEndpoints(endpointId: EndpointNumber, collectedData: Map<EndpointNumber, ClientEndpoint>) {
        if (collectedData.has(endpointId)) {
            return;
        }
        if (!this.#clientNode.endpoints.has(endpointId)) {
            logger.debug(this.#peerAddress, `Endpoint ${endpointId} not found on node. Ignoring endpoint ...`);
            return;
        }
        const endpoint = this.#clientNode.endpoints.for(endpointId);
        const descriptorData = endpoint.maybeStateOf(DescriptorClient);
        if (descriptorData === undefined) {
            logger.debug(`Descriptor data for endpoint ${endpointId} not found in structure! Ignoring endpoint ...`);
            return;
        }
        collectedData.set(endpointId, endpoint);
        for (const partEndpointId of descriptorData.partsList ?? []) {
            this.#collectEndpoints(partEndpointId, collectedData);
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
                (descriptorData.deviceTypeList ?? []).map(({ deviceType }) => deviceType),
            ) &&
            // Check if the cluster clients are the same - they map to the serverList attribute
            areNumberListsSame(
                device.getAllClusterClients().map(({ id }) => id),
                descriptorData.serverList ?? [],
            )
        );
    }

    /** Trigger collected node and endpoint changes */
    #triggerNodeStructureChanges(eventsToEmit: Map<EndpointNumber, keyof PairedNode.NodeStructureEvents>) {
        const emitChangeEvents = () => {
            for (const [endpointId, eventName] of eventsToEmit.entries()) {
                logger.debug(this.#peerAddress, `Emitting event ${eventName} for endpoint ${endpointId}`);
                this.events[eventName].emit(endpointId);
            }
            this.#options.stateInformationCallback?.(this.nodeId, NodeStateInformation.StructureChanged);
            this.events.structureChanged.emit();
        };

        if (this.#connectionState === NodeStates.Connected) {
            // If we are connected, we can emit the events right away
            emitChangeEvents();
        } else {
            // If we are not connected, we need to wait until we are connected again and emit these changes afterward
            this.events.stateChanged.once(state => {
                if (state === NodeStates.Connected) {
                    emitChangeEvents();
                }
            });
        }
    }

    /**
     * This method initializes the legacy ClusterClient-based structure.
     * Reads all data from the device and create a device object structure out of it.
     *
     */
    #initializeEndpointStructure(updateStructure = this.#localInitializationDone || this.#remoteInitializationDone) {
        if (this.#endpoints === undefined) {
            this.#endpoints = new Map();
        }
        if (this.#updateEndpointStructureTimer.isRunning) {
            this.#updateEndpointStructureTimer.stop();
        }
        const eventsToEmit = new Map<EndpointNumber, keyof PairedNode.NodeStructureEvents>();
        const structureUpdateDetails = new Map(this.#registeredEndpointStructureChanges);
        this.#registeredEndpointStructureChanges.clear();
        this.#pendingNodeChangeEvents.clear();

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
                    // When structureUpdateDetails from subscription updates state changes, we do a deep validation
                    // to prevent ordering changes to cause unnecessary device re-creations
                    const hasChanged = structureUpdateDetails.has(endpointId);
                    if (!hasChanged || !this.#hasEndpointChanged(device, endpoints.get(endpointId))) {
                        logger.debug(
                            this.#peerAddress,
                            `Retaining endpoint`,
                            endpointId,
                            hasChanged ? "(with only structure changes)" : "(unchanged)",
                        );
                        endpointsToRemove.delete(endpointId);
                        if (hasChanged) {
                            eventsToEmit.set(endpointId, "nodeEndpointChanged");
                        }
                    } else {
                        logger.debug(this.#peerAddress, `Recreating endpoint`, endpointId);
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
                        logger.debug(this.#peerAddress, `Removing endpoint`, endpointId);
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
            logger.debug(() => [
                this.#peerAddress,
                `${isRecreation ? "Recreating" : "Creating"} endpoint`,
                endpointId,
                Diagnostic.json(endpoint.state),
            ]);
            const device = this.#createDevice(endpointId, endpoint, this.#interactionClient);
            if (device === undefined) {
                continue;
            }
            this.#endpoints.set(endpointId, device);
            if (!isRecreation) {
                eventsToEmit.set(endpointId, "nodeEndpointAdded");
            }
        }

        // Remove all children that are not in the partsList anymore
        for (const [endpointId, clientEndpoint] of endpoints.entries()) {
            const partsList = clientEndpoint.stateOf(DescriptorClient).partsList ?? [];

            const endpoint = this.#endpoints.get(endpointId);
            if (endpoint === undefined) {
                // Should not happen, or endpoint was invalid and that's why not created, then we ignore it
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
            this.#triggerNodeStructureChanges(eventsToEmit);
        }
    }

    /**
     * Bring the endpoints in a structure based on their partsList attribute. This method only adds endpoints into the
     * right place as children, Cleanup is not happening here
     */
    #structureEndpoints(descriptors: Map<EndpointNumber, ClientEndpoint>) {
        if (this.#endpoints === undefined) {
            throw new InternalError("Endpoints not initialized yet! Should never happen");
        }
        const partLists = Array.from(descriptors.entries()).map(
            ([epNo, ep]) => [epNo, ep.stateOf(DescriptorClient).partsList ?? []] as [EndpointNumber, EndpointNumber[]], // else Typescript gets confused
        );
        logger.debug(() => [this.#peerAddress, `Endpoints from PartsLists`, Diagnostic.json(partLists)]);

        const endpointUsages: { [key: EndpointNumber]: EndpointNumber[] } = {};
        partLists.forEach(([parent, partsList]) =>
            partsList.forEach(endPoint => {
                if (endPoint === parent) {
                    // There could be more cases of invalid and cycling structures that never should happen ... so lets not over optimize to try to find all of them right now
                    logger.warn(this.#peerAddress, `Endpoint ${endPoint} is referencing itself!`);
                    return;
                }
                endpointUsages[endPoint] = endpointUsages[endPoint] || [];
                endpointUsages[endPoint].push(parent);
            }),
        );

        while (true) {
            // get all endpoints with only one usage
            const singleUsageEndpoints = Object.entries(endpointUsages).filter(([_, usages]) => usages.length === 1);
            if (singleUsageEndpoints.length === 0) {
                if (Object.entries(endpointUsages).length)
                    throw new InternalError(`Endpoint structure for Node ${this.nodeId} could not be parsed!`);
                break;
            }

            const idsToCleanup: { [key: EndpointNumber]: boolean } = {};
            for (const [childId, usages] of singleUsageEndpoints) {
                const childEndpointId = EndpointNumber(parseInt(childId));
                const childEndpoint = this.#endpoints.get(childEndpointId);
                const parentEndpoint = this.#endpoints.get(usages[0]);
                const existingChildEndpoint = parentEndpoint?.getChildEndpoint(childEndpointId);
                if (childEndpoint === undefined || parentEndpoint === undefined) {
                    logger.warn(
                        this.#peerAddress,
                        `Endpoint ${usages[0]} not found in the data received from the device!`,
                    );
                } else if (existingChildEndpoint !== childEndpoint) {
                    if (existingChildEndpoint !== undefined) {
                        // Child endpoint changed, so we need to remove the old one first
                        parentEndpoint.removeChildEndpoint(existingChildEndpoint);
                    }

                    parentEndpoint.addChildEndpoint(childEndpoint);
                }

                delete endpointUsages[EndpointNumber(parseInt(childId))];
                idsToCleanup[usages[0]] = true;
            }
            logger.debug(() => [this.#peerAddress, `Endpoint data Cleanup`, Diagnostic.json(idsToCleanup)]);
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

        const deviceTypes = (descriptorData.deviceTypeList ?? []).flatMap(({ deviceType, revision }) => {
            const deviceTypeDefinition = getDeviceTypeDefinitionFromModelByCode(deviceType);
            if (deviceTypeDefinition === undefined) {
                logger.info(
                    this.#peerAddress,
                    `Device type with code ${deviceType} not known, use generic replacement.`,
                );
                return UnknownDeviceType(deviceType, revision);
            }
            if (deviceTypeDefinition.revision < revision) {
                logger.debug(
                    this.#peerAddress,
                    `Device type with code ${deviceType} and revision ${revision} not supported, some data might be unknown.`,
                );
            }
            return deviceTypeDefinition;
        });
        if (deviceTypes.length === 0) {
            if (endpointId !== 0) {
                logger.warn(this.#peerAddress, `No device type found for endpoint ${endpointId}, ignoring it`);
                return undefined;
            }
            logger.warn(
                this.#peerAddress,
                `No device type found for root endpoint, using default Root Node device type`,
            );
        }

        const endpointClusters = Array<ClusterClientObj>();

        // Add ClusterClients for all server clusters of the device
        for (const clusterId of descriptorData.serverList ?? []) {
            const clusterModel = Matter.clusters(clusterId);
            const cluster = (
                clusterModel !== undefined
                    ? ClusterType(clusterModel)
                    : ClusterType(new ClusterModel({ id: clusterId, name: `Cluster$${clusterId.toString(16)}` }))
            ) as ClusterType.Concrete;
            const data = (endpoint.state as any)[camelize(cluster.name)];
            endpointClusters.push(ClusterClient(cluster, endpointId, interactionClient, data) as ClusterClientObj);
        }

        if (endpointId === 0) {
            // Endpoint 0 is the root endpoint, so we use a RootEndpoint object
            const rootEndpoint = new RootEndpoint(endpoint);
            if (deviceTypes.length > 0) {
                rootEndpoint.setDeviceTypes(deviceTypes as AtLeastOne<DeviceTypeDefinition>); // Ideally only root one as defined
            }
            endpointClusters.forEach(cluster => rootEndpoint.addClusterClient(cluster));
            return rootEndpoint;
        } else if (deviceTypes.find(deviceType => deviceType.code === AggregatorDt.id) !== undefined) {
            // When AGGREGATOR is in the device type list, this is an aggregator
            const aggregator = new Aggregator(endpoint, [], { endpointId });
            aggregator.setDeviceTypes(deviceTypes as AtLeastOne<DeviceTypeDefinition>);
            endpointClusters.forEach(cluster => aggregator.addClusterClient(cluster));
            return aggregator;
        } else {
            // It seems to be device but has a partsList, so it is a composed device
            if ((descriptorData.partsList ?? []).length > 0) {
                const composedDevice = new ComposedDevice(endpoint, deviceTypes[0], [], { endpointId });
                composedDevice.setDeviceTypes(deviceTypes as AtLeastOne<DeviceTypeDefinition>);
                endpointClusters.forEach(cluster => composedDevice.addClusterClient(cluster));
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

    /**
     * Returns all parts (endpoints) known for the Root Endpoint of this node.
     * @deprecated Legacy API, removed in 0.19. Migrate to @matter/node — see docs/MIGRATION_CONTROLLER_018.md.
     */
    get parts() {
        return this.getRootEndpoint()?.parts ?? new Map<number, Endpoint>();
    }

    /** Ensures that the legacy Endpoint structure is initialized when needed. */
    #ensureLegacyEndpointStructure() {
        if (this.#endpoints === undefined) {
            this.#initializeEndpointStructure(false);
        }
        return this.#endpoints!;
    }

    /**
     * Returns the functional devices/endpoints (the "children" of the Root Endpoint) known for this node.
     * @deprecated Legacy API, removed in 0.19. Migrate to @matter/node — see docs/MIGRATION_CONTROLLER_018.md.
     */
    getDevices(): Endpoint[] {
        return this.#ensureLegacyEndpointStructure().get(EndpointNumber(0))?.getChildEndpoints() ?? [];
    }

    /**
     * Returns the device/endpoint with the given endpoint ID.
     * @deprecated Legacy API, removed in 0.19. Migrate to @matter/node — see docs/MIGRATION_CONTROLLER_018.md.
     */
    getDeviceById(endpointId: number) {
        return this.#ensureLegacyEndpointStructure().get(EndpointNumber(endpointId));
    }

    /**
     * Returns the Root Endpoint of the device.
     * @deprecated Legacy API, removed in 0.19. Migrate to @matter/node — see docs/MIGRATION_CONTROLLER_018.md.
     */
    getRootEndpoint() {
        return this.getDeviceById(0);
    }

    /**
     * De-Commission (unpair) the device from this controller by removing the fabric from the device.
     * @deprecated Legacy API, removed in 0.19. Migrate to @matter/node — see docs/MIGRATION_CONTROLLER_018.md.
     */
    async decommission() {
        if (
            this.#connectionState === NodeStates.Reconnecting ||
            this.#connectionState === NodeStates.WaitingForDeviceDiscovery
        ) {
            throw new ImplementationError(
                `This Node ${this.nodeId} is currently in a reconnect state, decommissioning is not possible.`,
            );
        }

        await this.#clientNode.decommission();

        await this.#handleNodeDecommissioning();
    }

    async #handleNodeDecommissioning() {
        if (this.#decommissioned) {
            return;
        }
        this.#decommissioned = true;

        this.#updateEndpointStructureTimer?.stop();

        this.#options.stateInformationCallback?.(this.nodeId, NodeStateInformation.Decommissioned);

        this.#setConnectionState(NodeStates.Disconnected);

        this.events.decommissioned.emit();
    }

    /**
     * Opens a Basic Commissioning Window (uses the original Passcode printed on the device) with the device.
     * This is an optional method, so it might not be supported by all devices and could be rejected with an error in
     * this case! Better use openEnhancedCommissioningWindow() instead.
     *
     * @deprecated Legacy API, removed in 0.19. Migrate to @matter/node — see docs/MIGRATION_CONTROLLER_018.md.
     */
    async openBasicCommissioningWindow(commissioningTimeout = 900 /* 15 minutes */) {
        const adminCommissioningCluster = this.getRootClusterClient(AdministratorCommissioning);
        if (adminCommissioningCluster === undefined) {
            throw new ImplementationError(`AdministratorCommissioningCluster for node ${this.nodeId} not found.`);
        }
        if (adminCommissioningCluster.supportedFeatures?.basic === false) {
            throw new ImplementationError(
                `AdministratorCommissioningCluster for node ${this.nodeId} does not support basic commissioning.`,
            );
        }

        try {
            await adminCommissioningCluster.commands.revokeCommissioning();
        } catch (error) {
            // Accept the error if no window is already open
            if (
                !StatusResponseError.is(error, Status.Failure) ||
                StatusResponseError.of(error)?.clusterCode !== AdministratorCommissioning.StatusCode.WindowNotOpen
            ) {
                throw error;
            }
        }

        await adminCommissioningCluster.commands.openBasicCommissioningWindow({ commissioningTimeout });
    }

    /**
     * Opens an Enhanced Commissioning Window (uses a generated random Passcode) with the device.
     * @deprecated Legacy API, removed in 0.19. Migrate to @matter/node — see docs/MIGRATION_CONTROLLER_018.md.
     */
    async openEnhancedCommissioningWindow(commissioningTimeout = 900 /* 15 minutes */) {
        const adminCommissioningCluster = this.getRootClusterClient(AdministratorCommissioning);
        if (adminCommissioningCluster === undefined) {
            throw new ImplementationError(`AdministratorCommissioningCluster for node ${this.nodeId} not found.`);
        }

        try {
            await adminCommissioningCluster.commands.revokeCommissioning();
        } catch (error) {
            // Accept the error if no window is already open
            if (
                !StatusResponseError.is(error, Status.Failure) ||
                StatusResponseError.of(error)?.clusterCode !== AdministratorCommissioning.StatusCode.WindowNotOpen
            ) {
                throw error;
            }
        }

        const basicInformationCluster = this.getRootClusterClient(BasicInformation);
        if (basicInformationCluster === undefined) {
            throw new ImplementationError(`BasicInformationCluster for node ${this.nodeId} not found.`);
        }

        const vendorId = await basicInformationCluster.getVendorIdAttribute();
        const productId = await basicInformationCluster.getProductIdAttribute();

        const discriminator = PaseClient.generateRandomDiscriminator(this.#crypto);
        const passcode = PaseClient.generateRandomPasscode(this.#crypto);
        const salt = this.#crypto.randomBytes(32);
        const iterations = CRYPTO_PBKDF_ITERATIONS_MIN;
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
                flowType: CommissioningFlowType.Standard,
            }),
            qrPairingCode,
        };
    }

    /**
     * Closes the current session, ends the subscription and disconnects the device. The node can be reconnected via connect().
     * @deprecated Legacy API, removed in 0.19. Migrate to @matter/node — see docs/MIGRATION_CONTROLLER_018.md.
     */
    async disconnect() {
        // Unlike close() this keeps the instance (observers, construction) intact so connect() can reconnect it; the
        // node is disabled via disconnectNode() which ends the subscription.
        this.#updateEndpointStructureTimer.stop();
        this.#setConnectionState(NodeStates.Disconnected);
        await this.#commissioningController.disconnectNode(this.nodeId);
    }

    /**
     * Closes the subscription and ends all timers used by this PairedNode instance.
     * @deprecated Legacy API, removed in 0.19. Migrate to @matter/node — see docs/MIGRATION_CONTROLLER_018.md.
     */
    close(sendDecommissionedStatus = false) {
        this.#closing = true;
        this.#observers.close();
        this.#updateEndpointStructureTimer.stop();
        // Deactivate the subscription via NetworkClient
        if (sendDecommissionedStatus) {
            this.#decommissioned = true;
            this.#options.stateInformationCallback?.(this.nodeId, NodeStateInformation.Decommissioned);
            this.events.decommissioned.emit();
        }
        this.#setConnectionState(NodeStates.Disconnected);
        this.#construction.close();
    }

    /**
     * Get a cluster client from the root endpoint. This is mainly used internally and not needed to be called by the user.
     *
     * @param cluster ClusterClient to get or undefined if not existing
     * @deprecated Legacy API, removed in 0.19. Migrate to @matter/node — see docs/MIGRATION_CONTROLLER_018.md.
     */
    getRootClusterClient<const N extends ClusterType.Concrete>(cluster: N): ClusterClientObj<N["Typing"]> | undefined;
    getRootClusterClient(cluster: ClusterType.Concrete): ClusterClientObj | undefined {
        return this.#ensureLegacyEndpointStructure().get(EndpointNumber(0))?.getClusterClient(cluster);
    }

    /**
     * Get a cluster client from the root endpoint. This is mainly used internally and not needed to be called by the user.
     *
     * @param endpointId EndpointNumber to get the cluster from
     * @param cluster ClusterClient to get or undefined if not existing
     * @deprecated Legacy API, removed in 0.19. Migrate to @matter/node — see docs/MIGRATION_CONTROLLER_018.md.
     */
    getClusterClientForDevice<const N extends ClusterType.Concrete>(
        endpointId: EndpointNumber,
        cluster: N,
    ): ClusterClientObj<N["Typing"]> | undefined;
    getClusterClientForDevice(endpointId: EndpointNumber, cluster: ClusterType.Concrete): ClusterClientObj | undefined {
        return this.getDeviceById(endpointId)?.getClusterClient(cluster);
    }

    /** @deprecated Legacy API, removed in 0.19. Migrate to @matter/node — see docs/MIGRATION_CONTROLLER_018.md. */
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
     *
     * @deprecated Legacy API, removed in 0.19. Migrate to @matter/node — see docs/MIGRATION_CONTROLLER_018.md.
     */
    get state() {
        return this.#clientNode.state;
    }

    /**
     * Access to cluster commands of the root endpoint using node.commands.clusterNameOrId.commandName
     * Returns async functions that can be called to invoke commands on cluster clients
     *
     * @deprecated Legacy API, removed in 0.19. Migrate to @matter/node — see docs/MIGRATION_CONTROLLER_018.md.
     */
    get commands() {
        return this.#clientNode.commands;
    }

    /**
     * Access cached state of the root endpoint for a specific behavior ID.
     *
     * Be aware that using a string type does not provide type checking and does not enforce the correctness of the used
     * Behavior type including all enabled features. Because of this the returned state is typed as a plain string
     * indexed record (Val.Struct). Please ensure to have proper checks in place when using this method with string type.
     *
     * @deprecated Legacy API, removed in 0.19. Migrate to @matter/node — see docs/MIGRATION_CONTROLLER_018.md.
     */
    stateOf(type: string): Immutable<Val.Struct>;

    /**
     * Access cached state of the root endpoint for a specific behavior.
     *
     * This is the recommended way to access state for a specific behavior because it provides proper type checking
     * and enforces the correctness of the used Behavior type including all enabled features.
     *
     * @deprecated Legacy API, removed in 0.19. Migrate to @matter/node — see docs/MIGRATION_CONTROLLER_018.md.
     */
    stateOf<T extends Behavior.Type>(type: T): Immutable<Behavior.StateOf<T>>;

    stateOf(type: Behavior.Type | string) {
        return this.#clientNode.stateOf(type as any);
    }

    /**
     * Version of {@link stateOf} that returns undefined instead of throwing if the requested behavior is unsupported.
     *
     * @deprecated Legacy API, removed in 0.19. Migrate to @matter/node — see docs/MIGRATION_CONTROLLER_018.md.
     */
    maybeStateOf(type: string): Immutable<Val.Struct> | undefined;

    /**
     * Version of {@link stateOf} that returns undefined instead of throwing if the requested behavior is unsupported.
     *
     * @deprecated Legacy API, removed in 0.19. Migrate to @matter/node — see docs/MIGRATION_CONTROLLER_018.md.
     */
    maybeStateOf<T extends Behavior.Type>(type: T): Immutable<Behavior.StateOf<T>> | undefined;

    maybeStateOf(type: Behavior.Type | string) {
        return this.#clientNode.maybeStateOf(type as any);
    }

    /**
     * Cluster commands for a behavior id on the root endpoint (untyped).
     * @deprecated Legacy API, removed in 0.19. Migrate to @matter/node — see docs/MIGRATION_CONTROLLER_018.md.
     */
    commandsOf(type: string): Record<string, Commands.Command>;

    /**
     * Typed variant of {@link commandsOf}.
     * @deprecated Legacy API, removed in 0.19. Migrate to @matter/node — see docs/MIGRATION_CONTROLLER_018.md.
     */
    commandsOf<T extends Behavior.Type>(type: T): Commands.OfBehavior<T>;

    commandsOf(type: Behavior.Type | string): unknown {
        return this.#clientNode.commandsOf(type as Behavior.Type);
    }

    /**
     * Activated cluster features for a behavior id on the root endpoint (untyped).
     * @deprecated Legacy API, removed in 0.19. Migrate to @matter/node — see docs/MIGRATION_CONTROLLER_018.md.
     */
    featuresOf(type: string): Immutable<Record<string, boolean>>;

    /**
     * Typed variant of {@link featuresOf}; preserves the cluster's per-feature flag type.
     * @deprecated Legacy API, removed in 0.19. Migrate to @matter/node — see docs/MIGRATION_CONTROLLER_018.md.
     */
    featuresOf<T extends ClusterBehavior.Type>(type: T): T["features"];

    featuresOf(type: ClusterBehavior.Type | string) {
        return this.#clientNode.featuresOf(type as ClusterBehavior.Type);
    }

    /**
     * {@link featuresOf} variant returning undefined for unknown or non-cluster behaviors.
     * @deprecated Legacy API, removed in 0.19. Migrate to @matter/node — see docs/MIGRATION_CONTROLLER_018.md.
     */
    maybeFeaturesOf(type: string): Immutable<Record<string, boolean>> | undefined;
    /** @deprecated Legacy API, removed in 0.19. Migrate to @matter/node — see docs/MIGRATION_CONTROLLER_018.md. */
    maybeFeaturesOf<T extends ClusterBehavior.Type>(type: T): T["features"] | undefined;
    maybeFeaturesOf(type: ClusterBehavior.Type | string) {
        return this.#clientNode.maybeFeaturesOf(type as ClusterBehavior.Type);
    }

    /**
     * Global cluster attribute state for a behavior id on the root endpoint (untyped).
     * @deprecated Legacy API, removed in 0.19. Migrate to @matter/node — see docs/MIGRATION_CONTROLLER_018.md.
     */
    globalsOf(type: string): Immutable<GlobalAttributeState>;

    /**
     * Typed variant of {@link globalsOf}; narrows `featureMap` to the cluster's per-feature flag type.
     * @deprecated Legacy API, removed in 0.19. Migrate to @matter/node — see docs/MIGRATION_CONTROLLER_018.md.
     */
    globalsOf<T extends ClusterBehavior.Type>(
        type: T,
    ): Immutable<Omit<GlobalAttributeState, "featureMap"> & { featureMap: T["features"] }>;

    globalsOf(type: ClusterBehavior.Type | string) {
        return this.#clientNode.globalsOf(type as ClusterBehavior.Type);
    }

    /**
     * {@link globalsOf} variant returning undefined for unknown or non-cluster behaviors.
     * @deprecated Legacy API, removed in 0.19. Migrate to @matter/node — see docs/MIGRATION_CONTROLLER_018.md.
     */
    maybeGlobalsOf(type: string): Immutable<GlobalAttributeState> | undefined;
    /** @deprecated Legacy API, removed in 0.19. Migrate to @matter/node — see docs/MIGRATION_CONTROLLER_018.md. */
    maybeGlobalsOf<T extends ClusterBehavior.Type>(
        type: T,
    ): Immutable<Omit<GlobalAttributeState, "featureMap"> & { featureMap: T["features"] }> | undefined;
    maybeGlobalsOf(type: ClusterBehavior.Type | string) {
        return this.#clientNode.maybeGlobalsOf(type as ClusterBehavior.Type);
    }

    /**
     * Read selected behavior state on the root endpoint via the underlying client node.
     *
     * @see {@link ClientEndpoint.get}
     * @deprecated Legacy API, removed in 0.19. Migrate to @matter/node — see docs/MIGRATION_CONTROLLER_018.md.
     */
    get(): Promise<unknown>;
    /** @deprecated Legacy API, removed in 0.19. Migrate to @matter/node — see docs/MIGRATION_CONTROLLER_018.md. */
    get(selector: object | undefined, options?: ClientEndpoint.GetOptions): Promise<unknown>;
    get(selector?: object, options?: ClientEndpoint.GetOptions): Promise<unknown> {
        return this.#clientNode.get(selector as never, options);
    }

    /**
     * Read state for a single behavior on the root endpoint via the underlying client node.
     *
     * @see {@link ClientEndpoint.getStateOf}
     * @deprecated Legacy API, removed in 0.19. Migrate to @matter/node — see docs/MIGRATION_CONTROLLER_018.md.
     */
    getStateOf<B extends Behavior.Type>(
        type: B,
        selector?: true,
        options?: ClientEndpoint.GetOptions,
    ): Promise<Behavior.StateOf<B>>;
    /** @deprecated Legacy API, removed in 0.19. Migrate to @matter/node — see docs/MIGRATION_CONTROLLER_018.md. */
    getStateOf<B extends Behavior.Type, K extends keyof Behavior.StateOf<B>>(
        type: B,
        selector: readonly K[],
        options?: ClientEndpoint.GetOptions,
    ): Promise<{ readonly [P in K]?: Behavior.StateOf<B>[P] }>;
    /** @deprecated Legacy API, removed in 0.19. Migrate to @matter/node — see docs/MIGRATION_CONTROLLER_018.md. */
    getStateOf(type: string, selector?: readonly string[], options?: ClientEndpoint.GetOptions): Promise<Val.Struct>;
    getStateOf(
        type: Behavior.Type | string,
        selector?: true | readonly (string | number | symbol)[],
        options?: ClientEndpoint.GetOptions,
    ): Promise<unknown> {
        return this.#clientNode.getStateOf(type as Behavior.Type, selector as never, options);
    }

    /**
     * Events of the root endpoint for a specific behavior ID.
     *
     * Be aware that using a string type does not provide type checking and does not enforce the correctness of the used
     * Behavior type including all enabled features. Because of this each event is typed as Observable | undefined.
     * Please ensure to have proper checks in place when using this method with string type.
     *
     * Note: this exposes per-behavior events of the root endpoint. The {@link events} field on this class is the
     * lifecycle event bus of the {@link PairedNode} itself ({@link PairedNode.Events}) and unrelated to behavior
     * events.
     *
     * @deprecated Legacy API, removed in 0.19. Migrate to @matter/node — see docs/MIGRATION_CONTROLLER_018.md.
     */
    eventsOf(type: string): Immutable<Record<string, Observable | undefined>>;

    /**
     * Events of the root endpoint for a specific behavior.
     *
     * This is the recommended way to access events for a specific behavior because it provides proper type checking
     * and enforces the correctness of the used Behavior type including all enabled features.
     *
     * @deprecated Legacy API, removed in 0.19. Migrate to @matter/node — see docs/MIGRATION_CONTROLLER_018.md.
     */
    eventsOf<T extends Behavior.Type>(type: T): Behavior.EventsOf<T>;

    eventsOf(type: Behavior.Type | string): unknown {
        return this.#clientNode.eventsOf(type as any);
    }
}

/** @deprecated Legacy API, removed in 0.19. Migrate to @matter/node — see docs/MIGRATION_CONTROLLER_018.md. */
export namespace PairedNode {
    /** @deprecated Legacy API, removed in 0.19. Migrate to @matter/node — see docs/MIGRATION_CONTROLLER_018.md. */
    export interface NodeStructureEvents {
        /**
         * Emitted when endpoints are added.
         * @deprecated Legacy API, removed in 0.19. Migrate to @matter/node — see docs/MIGRATION_CONTROLLER_018.md.
         */
        nodeEndpointAdded: Observable<[EndpointNumber]>;

        /**
         * Emitted when endpoints are removed.
         * @deprecated Legacy API, removed in 0.19. Migrate to @matter/node — see docs/MIGRATION_CONTROLLER_018.md.
         */
        nodeEndpointRemoved: Observable<[EndpointNumber]>;

        /**
         * Emitted when endpoints are updated (e.g. device type changed, structure changed).
         * @deprecated Legacy API, removed in 0.19. Migrate to @matter/node — see docs/MIGRATION_CONTROLLER_018.md.
         */
        nodeEndpointChanged: Observable<[EndpointNumber]>;
    }

    /** @deprecated Legacy API, removed in 0.19. Migrate to @matter/node — see docs/MIGRATION_CONTROLLER_018.md. */
    export interface Events extends NodeStructureEvents {
        /**
         * Emitted when the node is initialized from local data. These data usually are stale, but you can still already
         * use the node to interact with the device. If no local data are available this event will be emitted together
         * with the initializedFromRemote event.
         *
         * @deprecated Legacy API, removed in 0.19. Migrate to @matter/node — see docs/MIGRATION_CONTROLLER_018.md.
         */
        initialized: AsyncObservable<[details: DeviceInformationData]>;

        /**
         * Emitted when the node is fully initialized from remote and all attributes and events are subscribed.
         * This event can also be awaited if code needs to be blocked until the node is fully initialized.
         *
         * @deprecated Legacy API, removed in 0.19. Migrate to @matter/node — see docs/MIGRATION_CONTROLLER_018.md.
         */
        initializedFromRemote: AsyncObservable<[details: DeviceInformationData]>;

        /**
         * Emitted when the device information changes.
         *
         * @deprecated Legacy API, removed in 0.19. Migrate to @matter/node — see docs/MIGRATION_CONTROLLER_018.md.
         */
        deviceInformationChanged: AsyncObservable<[details: DeviceInformationData]>;

        /**
         * Emitted when the state of the node changes.
         * @deprecated Legacy API, removed in 0.19. Migrate to @matter/node — see docs/MIGRATION_CONTROLLER_018.md.
         */
        stateChanged: Observable<[nodeState: NodeStates]>;

        /**
         * Emitted when an attribute value changes.
         * @deprecated Legacy API, removed in 0.19. Migrate to @matter/node — see docs/MIGRATION_CONTROLLER_018.md.
         */
        attributeChanged: Observable<[data: DecodedAttributeReportValue<any>]>;

        /**
         * Emitted when an event is triggered.
         * @deprecated Legacy API, removed in 0.19. Migrate to @matter/node — see docs/MIGRATION_CONTROLLER_018.md.
         */
        eventTriggered: Observable<[DecodedEventReportValue<any>]>;

        /**
         * Emitted when all node structure changes were applied (Endpoints got added or also removed).
         * You can alternatively use the nodeEndpointAdded, nodeEndpointRemoved, and nodeEndpointChanged events to react on specific changes.
         * This event is emitted after all nodeEndpointAdded, nodeEndpointRemoved, and nodeEndpointChanged events are emitted.
         *
         * @deprecated Legacy API, removed in 0.19. Migrate to @matter/node — see docs/MIGRATION_CONTROLLER_018.md.
         */
        structureChanged: Observable<[void]>;

        /**
         * Emitted when the node is decommissioned.
         * @deprecated Legacy API, removed in 0.19. Migrate to @matter/node — see docs/MIGRATION_CONTROLLER_018.md.
         */
        decommissioned: Observable<[void]>;

        /**
         * Emitted when a subscription alive trigger is received (max interval trigger or any data update)
         * @deprecated Legacy API, removed in 0.19. Migrate to @matter/node — see docs/MIGRATION_CONTROLLER_018.md.
         */
        connectionAlive: Observable<[void]>;
    }
}
