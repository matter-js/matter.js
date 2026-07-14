/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import {
    deepCopy,
    Diagnostic,
    Duration,
    ImplementationError,
    MatterError,
    MatterFlowError,
    Millis,
    Seconds,
    Semaphore,
    ServerAddressUdp,
    UnexpectedDataError,
} from "@matter/general";
import { Matter, Specification } from "@matter/model";
import type { ServerNode } from "@matter/node";
import { ClientNodeInteraction } from "@matter/node";
import {
    ClientInteraction,
    DedicatedChannelExchangeProvider,
    DiscoveryData,
    ExchangeManager,
    ExchangeProvider,
    Interactable,
    Invoke,
    PeerAddress,
    PeerAddressMap,
    PeerSet,
    Read,
    ReadResult,
    SecureSession,
    Subscribe,
    Write,
} from "@matter/protocol";
import {
    ArraySchema,
    AttributeId,
    CaseAuthenticatedTag,
    ClusterId,
    ClusterType,
    EndpointNumber,
    EventId,
    EventNumber,
    NodeId,
    resolveAttributeName,
    resolveEventName,
    Status,
    StatusResponseError,
    TlvEventFilter,
    TlvOfModel,
    TypeFromSchema,
} from "@matter/types";
import { AccessControl } from "@matter/types/clusters/access-control";
import {
    DecodedAttributeReportStatus,
    DecodedAttributeReportValue,
    DecodedDataReport,
    DecodedEventData,
    DecodedEventReportStatus,
    DecodedEventReportValue,
    toDecodedAttributeReportStatus,
    toDecodedAttributeReportValue,
    toDecodedEventReportStatus,
    toDecodedEventReportValue,
} from "./DecodedDataReport.js";

const REQUEST_ALL = [{}];
const DEFAULT_TIMED_REQUEST_TIMEOUT = Seconds(10);
const DEFAULT_MINIMUM_RESPONSE_TIMEOUT_WITH_FAILSAFE = Seconds(30);

const AclClusterId = AccessControl.id;
const AclAttributeId = AccessControl.attributes.acl.id;
const AclExtensionAttributeId = AccessControl.attributes.extension.id;

/**
 * Types of discovery that may be performed when connecting operationally.
 *
 * @deprecated node discovery is now continuous with MDNS queries sent as needed
 */
export enum NodeDiscoveryType {
    /** No discovery is done, in calls means that only known addresses are tried. */
    None = 0,

    /** Retransmission discovery means that we ignore known addresses and start a query for 5s. */
    RetransmissionDiscovery = 1,

    /** Timed discovery means that the device is discovered for a defined timeframe, including known addresses. */
    TimedDiscovery = 2,

    /** Full discovery means that the device is discovered until it is found, excluding known addresses. */
    FullDiscovery = 3,
}

/**
 * Error when an unknown node is tried to be connected or any other action done with it.
 *
 * @deprecated Legacy API, removed in 0.19. Migrate to @matter/node — see docs/MIGRATION_CONTROLLER_018.md.
 */
export class UnknownNodeError extends MatterError {}

/**
 * Configuration for discovering when establishing a peer connection.
 *
 * @deprecated discovery occurs automatically based on node state
 */
export interface DiscoveryOptions {
    discoveryType?: NodeDiscoveryType;
    timeout?: Duration;
    discoveryData?: DiscoveryData;
}

/**
 * Extended discovery options that include case authenticated tags for peer connections.
 *
 * @deprecated these options are ignored
 */
export interface PeerConnectionOptions {
    /** @deprecated Legacy API, removed in 0.19. Migrate to @matter/node — see docs/MIGRATION_CONTROLLER_018.md. */
    discoveryOptions?: DiscoveryOptions;

    /**
     * @deprecated set CATs on CommissioningBehavior#state
     */
    caseAuthenticatedTags?: CaseAuthenticatedTag[];

    /**
     * @deprected configure queuing using the NetworkProfiles environmental service
     */
    queue?: Semaphore;
}

function isAclOrExtensionPath(path: { clusterId: ClusterId; attributeId: AttributeId }) {
    const { clusterId, attributeId } = path;
    return clusterId === AclClusterId && (attributeId === AclAttributeId || attributeId === AclExtensionAttributeId);
}

/** @deprecated Legacy API, removed in 0.19. Migrate to @matter/node — see docs/MIGRATION_CONTROLLER_018.md. */
export type ResponseDataReport = Omit<
    DecodedDataReport,
    "isNormalized" | "subscriptionId" | "interactionModelRevision"
>;

/** @deprecated Legacy API, removed in 0.19. Migrate to @matter/node — see docs/MIGRATION_CONTROLLER_018.md. */
export interface AttributeStatus {
    /** @deprecated Legacy API, removed in 0.19. Migrate to @matter/node — see docs/MIGRATION_CONTROLLER_018.md. */
    path: {
        nodeId?: NodeId;
        endpointId?: EndpointNumber;
        clusterId?: ClusterId;
        attributeId?: AttributeId;
    };
    /** @deprecated Legacy API, removed in 0.19. Migrate to @matter/node — see docs/MIGRATION_CONTROLLER_018.md. */
    status: Status;
}

type CommandRequest<C extends ClusterType.Command> =
    C extends ClusterType.Command<infer F>
        ? F extends (req: infer R, ...args: unknown[]) => unknown
            ? R
            : undefined
        : unknown;

type CommandResponse<C extends ClusterType.Command> =
    C extends ClusterType.Command<infer F> ? Awaited<ReturnType<F>> : unknown;

/** @deprecated Legacy API, removed in 0.19. Migrate to @matter/node — see docs/MIGRATION_CONTROLLER_018.md. */
export type InvokeOptions<C extends ClusterType.Command = ClusterType.Command> = {
    /** @deprecated Legacy API, removed in 0.19. Migrate to @matter/node — see docs/MIGRATION_CONTROLLER_018.md. */
    endpointId?: EndpointNumber;
    /** @deprecated Legacy API, removed in 0.19. Migrate to @matter/node — see docs/MIGRATION_CONTROLLER_018.md. */
    clusterId: ClusterId;
    /** @deprecated Legacy API, removed in 0.19. Migrate to @matter/node — see docs/MIGRATION_CONTROLLER_018.md. */
    request: CommandRequest<C>;
    /** @deprecated Legacy API, removed in 0.19. Migrate to @matter/node — see docs/MIGRATION_CONTROLLER_018.md. */
    command: C;

    /**
     * Send as timed request. If no timedRequestTimeoutMs is provided the default of 10s will be used.
     * @deprecated Legacy API, removed in 0.19. Migrate to @matter/node — see docs/MIGRATION_CONTROLLER_018.md.
     */
    asTimedRequest?: boolean;

    /**
     * Use this timeout and send the request as Timed Request. If this is specified the above parameter is implied.
     * @deprecated Legacy API, removed in 0.19. Migrate to @matter/node — see docs/MIGRATION_CONTROLLER_018.md.
     */
    timedRequestTimeout?: Duration;

    /**
     * Expected processing time on the device side for this command.
     * useExtendedFailSafeMessageResponseTimeout is ignored if this value is set.
     *
     * @deprecated Legacy API, removed in 0.19. Migrate to @matter/node — see docs/MIGRATION_CONTROLLER_018.md.
     */
    expectedProcessingTime?: Duration;

    /**
     * Use an extended Message Response Timeout as defined for FailSafe cases which is 30s.
     * @deprecated Legacy API, removed in 0.19. Migrate to @matter/node — see docs/MIGRATION_CONTROLLER_018.md.
     */
    useExtendedFailSafeMessageResponseTimeout?: boolean;

    /**
     * Skip request data validation. Use this only when you know that your data is correct and validation would return an error.
     * @deprecated Legacy API, removed in 0.19. Migrate to @matter/node — see docs/MIGRATION_CONTROLLER_018.md.
     */
    skipValidation?: boolean;
};

/** @deprecated Legacy API, removed in 0.19. Migrate to @matter/node — see docs/MIGRATION_CONTROLLER_018.md. */
export class InteractionClientProvider {
    readonly #owner: ServerNode;
    readonly #peers: PeerSet;
    readonly #clients = new PeerAddressMap<InteractionClient>();

    /** @deprecated Legacy API, removed in 0.19. Migrate to @matter/node — see docs/MIGRATION_CONTROLLER_018.md. */
    constructor(owner: ServerNode) {
        this.#owner = owner;
        this.#peers = owner.env.get(PeerSet);
        this.#peers.deleted.on(peer => this.#onPeerLoss(peer.address));
        this.#peers.disconnected.on(peer => this.#onPeerLoss(peer.address));
    }

    /** @deprecated Legacy API, removed in 0.19. Migrate to @matter/node — see docs/MIGRATION_CONTROLLER_018.md. */
    get peers() {
        return this.#peers;
    }

    /** @deprecated Legacy API, removed in 0.19. Migrate to @matter/node — see docs/MIGRATION_CONTROLLER_018.md. */
    async connect(
        address: PeerAddress,
        _options: PeerConnectionOptions & {
            allowUnknownPeer?: boolean;
            operationalAddress?: ServerAddressUdp;
        },
    ): Promise<InteractionClient> {
        return this.getNodeInteractionClient(address);
    }

    #exchangeProviderFor(sessionOrAddress: SecureSession | PeerAddress) {
        if (sessionOrAddress instanceof SecureSession) {
            return new DedicatedChannelExchangeProvider(this.#owner.env.get(ExchangeManager), sessionOrAddress);
        }

        return this.#peers.for(sessionOrAddress).exchangeProvider;
    }

    /**
     * Returns an InteractionClient for a session or PeerAddress which is not bound to a ClientNode Interactable
     * This should only be used for special cases.
     *
     * @deprecated Legacy API, removed in 0.19. Migrate to @matter/node — see docs/MIGRATION_CONTROLLER_018.md.
     */
    async interactionClientFor(sessionOrAddress: SecureSession | PeerAddress): Promise<InteractionClient> {
        const exchangeProvider = this.#exchangeProviderFor(sessionOrAddress);
        return new InteractionClient(
            new ClientInteraction({
                environment: this.#owner.env,
                exchangeProvider,
            }),
            exchangeProvider,
        );
    }

    /**
     * Returns an InteractionClient for a specific peer address and ensures that also a peer node exists.
     *
     * @deprecated Legacy API, removed in 0.19. Migrate to @matter/node — see docs/MIGRATION_CONTROLLER_018.md.
     */
    async getNodeInteractionClient(address: PeerAddress, _options: PeerConnectionOptions = {}) {
        let client = this.#clients.get(address);
        if (client !== undefined) {
            return client;
        }

        const peerNode = await this.#owner.peers.forAddress(address);

        // We potentially override the ExchangeManager
        const exchangeProvider = this.#exchangeProviderFor(address);
        peerNode.env.set(ExchangeProvider, exchangeProvider);

        const interaction = peerNode.interaction as ClientNodeInteraction;
        client = new InteractionClient(interaction, exchangeProvider, address);
        this.#clients.set(address, client);

        return client;
    }

    #onPeerLoss(address: PeerAddress) {
        const client = this.#clients.get(address);
        if (client !== undefined) {
            this.#clients.delete(address);
        }
    }
}

/** @deprecated Legacy API, removed in 0.19. Migrate to @matter/node — see docs/MIGRATION_CONTROLLER_018.md. */
export class InteractionClient {
    readonly #address?: PeerAddress;
    readonly isGroupAddress: boolean;
    readonly #interaction: Interactable;
    readonly #exchanges: ExchangeProvider;

    /** @deprecated Legacy API, removed in 0.19. Migrate to @matter/node — see docs/MIGRATION_CONTROLLER_018.md. */
    constructor(interaction: Interactable, exchanges: ExchangeProvider, address?: PeerAddress) {
        this.#address = address;
        this.#interaction = interaction;
        this.#exchanges = exchanges;
        this.isGroupAddress = address !== undefined ? PeerAddress.isGroup(address) : false;
    }

    /** @deprecated Legacy API, removed in 0.19. Migrate to @matter/node — see docs/MIGRATION_CONTROLLER_018.md. */
    get interaction() {
        return this.#interaction;
    }

    /** @deprecated Legacy API, removed in 0.19. Migrate to @matter/node — see docs/MIGRATION_CONTROLLER_018.md. */
    get address() {
        if (this.#address === undefined) {
            throw new ImplementationError("This InteractionClient is not bound to a specific peer.");
        }
        return this.#address;
    }

    /** @deprecated Legacy API, removed in 0.19. Migrate to @matter/node — see docs/MIGRATION_CONTROLLER_018.md. */
    get maybeAddress() {
        return this.#address;
    }

    /** @deprecated Legacy API, removed in 0.19. Migrate to @matter/node — see docs/MIGRATION_CONTROLLER_018.md. */
    get isReconnectable() {
        return false;
    }

    /** @deprecated Legacy API, removed in 0.19. Migrate to @matter/node — see docs/MIGRATION_CONTROLLER_018.md. */
    get channelUpdated(): never {
        throw new ImplementationError("ExchangeProvider does not support channelUpdated");
    }

    /** @deprecated Legacy API, removed in 0.19. Migrate to @matter/node — see docs/MIGRATION_CONTROLLER_018.md. */
    async getAllAttributes(
        options: {
            dataVersionFilters?: { endpointId: EndpointNumber; clusterId: ClusterId; dataVersion: number }[];
            isFabricFiltered?: boolean;
            attributeChangeListener?: (
                data: DecodedAttributeReportValue<any>,
                valueChanged?: boolean,
                oldValue?: any,
            ) => void;
        } = {},
    ): Promise<DecodedAttributeReportValue<any>[]> {
        return (
            await this.getMultipleAttributesAndEvents({
                attributes: REQUEST_ALL,
                ...options,
            })
        ).attributeReports;
    }

    /** @deprecated Legacy API, removed in 0.19. Migrate to @matter/node — see docs/MIGRATION_CONTROLLER_018.md. */
    async getAllEvents(
        options: {
            eventFilters?: TypeFromSchema<typeof TlvEventFilter>[];
            isFabricFiltered?: boolean;
        } = {},
    ): Promise<DecodedEventReportValue<any>[]> {
        return (
            await this.getMultipleAttributesAndEvents({
                events: REQUEST_ALL,
                ...options,
            })
        ).eventReports;
    }

    /** @deprecated Legacy API, removed in 0.19. Migrate to @matter/node — see docs/MIGRATION_CONTROLLER_018.md. */
    async getAllAttributesAndEvents(
        options: {
            dataVersionFilters?: {
                endpointId: EndpointNumber;
                clusterId: ClusterId;
                dataVersion: number;
            }[];
            eventFilters?: TypeFromSchema<typeof TlvEventFilter>[];
            isFabricFiltered?: boolean;
            attributeChangeListener?: (
                data: DecodedAttributeReportValue<any>,
                valueChanged?: boolean,
                oldValue?: any,
            ) => void;
        } = {},
    ): Promise<{
        attributeReports: DecodedAttributeReportValue<any>[];
        eventReports: DecodedEventReportValue<any>[];
    }> {
        return this.getMultipleAttributesAndEvents({
            attributes: REQUEST_ALL,
            events: REQUEST_ALL,
            ...options,
        });
    }

    /** @deprecated Legacy API, removed in 0.19. Migrate to @matter/node — see docs/MIGRATION_CONTROLLER_018.md. */
    async getMultipleAttributes(
        options: {
            attributes?: { endpointId?: EndpointNumber; clusterId?: ClusterId; attributeId?: AttributeId }[];
            dataVersionFilters?: { endpointId: EndpointNumber; clusterId: ClusterId; dataVersion: number }[];
            isFabricFiltered?: boolean;
            attributeChangeListener?: (
                data: DecodedAttributeReportValue<any>,
                valueChanged?: boolean,
                oldValue?: any,
            ) => void;
        } = {},
    ): Promise<DecodedAttributeReportValue<any>[]> {
        return (await this.getMultipleAttributesAndEvents(options)).attributeReports;
    }

    /** @deprecated Legacy API, removed in 0.19. Migrate to @matter/node — see docs/MIGRATION_CONTROLLER_018.md. */
    async getMultipleAttributesAndStatus(
        options: {
            attributes?: { endpointId?: EndpointNumber; clusterId?: ClusterId; attributeId?: AttributeId }[];
            dataVersionFilters?: { endpointId: EndpointNumber; clusterId: ClusterId; dataVersion: number }[];
            isFabricFiltered?: boolean;
            attributeChangeListener?: (
                data: DecodedAttributeReportValue<any>,
                valueChanged?: boolean,
                oldValue?: any,
            ) => void;
        } = {},
    ): Promise<{
        attributeData: DecodedAttributeReportValue<any>[];
        attributeStatus?: DecodedAttributeReportStatus[];
    }> {
        const { attributeReports, attributeStatus } = await this.getMultipleAttributesAndEvents(options);
        return { attributeData: attributeReports, attributeStatus };
    }

    /** @deprecated Legacy API, removed in 0.19. Migrate to @matter/node — see docs/MIGRATION_CONTROLLER_018.md. */
    async getMultipleEvents(
        options: {
            events?: { endpointId?: EndpointNumber; clusterId?: ClusterId; eventId?: EventId }[];
            eventFilters?: TypeFromSchema<typeof TlvEventFilter>[];
            isFabricFiltered?: boolean;
        } = {},
    ): Promise<DecodedEventReportValue<any>[]> {
        return (await this.getMultipleAttributesAndEvents(options)).eventReports;
    }

    /** @deprecated Legacy API, removed in 0.19. Migrate to @matter/node — see docs/MIGRATION_CONTROLLER_018.md. */
    async getMultipleEventsAndStatus(
        options: {
            events?: { endpointId?: EndpointNumber; clusterId?: ClusterId; eventId?: EventId }[];
            eventFilters?: TypeFromSchema<typeof TlvEventFilter>[];
            isFabricFiltered?: boolean;
        } = {},
    ): Promise<{ eventData: DecodedEventReportValue<any>[]; eventStatus?: DecodedEventReportStatus[] }> {
        const { eventReports, eventStatus } = await this.getMultipleAttributesAndEvents(options);
        return { eventData: eventReports, eventStatus };
    }

    /** @deprecated Legacy API, removed in 0.19. Migrate to @matter/node — see docs/MIGRATION_CONTROLLER_018.md. */
    async getMultipleAttributesAndEvents(
        options: {
            attributes?: { endpointId?: EndpointNumber; clusterId?: ClusterId; attributeId?: AttributeId }[];
            dataVersionFilters?: { endpointId: EndpointNumber; clusterId: ClusterId; dataVersion: number }[];
            events?: { endpointId?: EndpointNumber; clusterId?: ClusterId; eventId?: EventId }[];
            eventFilters?: TypeFromSchema<typeof TlvEventFilter>[];
            isFabricFiltered?: boolean;
            attributeChangeListener?: (data: DecodedAttributeReportValue<any>) => void;
        } = {},
    ): Promise<ResponseDataReport> {
        if (this.isGroupAddress) {
            throw new ImplementationError("Reading data from group addresses is not supported.");
        }

        const {
            attributes: attributeRequests,
            dataVersionFilters,
            events: eventRequests,
            eventFilters,
            isFabricFiltered = true,
            attributeChangeListener: attributeListener,
        } = options;

        const read = (this.#interaction as ClientNodeInteraction).read({
            ...Read({
                attributes: attributeRequests,
                events: eventRequests,
                versionFilters: dataVersionFilters?.map(({ endpointId, clusterId, dataVersion }) => ({
                    path: { endpointId, clusterId },
                    dataVersion,
                })),
                eventFilters,
                fabricFilter: isFabricFiltered,
                interactionModelRevision: Specification.INTERACTION_MODEL_REVISION,
            }),
            includeKnownVersions: !dataVersionFilters,
            [Diagnostic.value]: () =>
                Diagnostic.dict({
                    attributes: attributeRequests?.length
                        ? attributeRequests?.map(path => resolveAttributeName(path)).join(", ")
                        : undefined,
                    events: eventRequests?.length
                        ? eventRequests?.map(path => resolveEventName(path)).join(", ")
                        : undefined,
                    dataVersionFilters: dataVersionFilters?.length
                        ? dataVersionFilters
                              .map(
                                  ({ endpointId, clusterId, dataVersion }) =>
                                      `${endpointId}/${clusterId}=${dataVersion}`,
                              )
                              .join(", ")
                        : undefined,
                    eventFilters: eventFilters?.length
                        ? eventFilters.map(({ nodeId, eventMin }) => `${nodeId}=${eventMin}`).join(", ")
                        : undefined,
                    fabricFiltered: isFabricFiltered,
                }),
        });

        return await this.#processReadResult(read, { attributeListener });
    }

    async #processReadResult(
        report: ReadResult<ReadResult.Chunk>,
        listeners: {
            attributeListener?: (data: DecodedAttributeReportValue<any>) => void;
            eventListener?: (value: DecodedEventReportValue<any>) => void;
        },
    ): Promise<ResponseDataReport> {
        const { attributeListener, eventListener } = listeners;
        const attributeReports = new Array<DecodedAttributeReportValue<any>>();
        const attributeStatus = new Array<DecodedAttributeReportStatus>();
        const eventReports = new Array<DecodedEventReportValue<any>>();
        const eventStatus = new Array<DecodedEventReportStatus>();

        for await (const chunks of report) {
            for await (const entry of chunks) {
                switch (entry.kind) {
                    case "attr-value": {
                        const reportValue = toDecodedAttributeReportValue(entry);
                        attributeReports.push(reportValue);
                        attributeListener?.(reportValue);
                        break;
                    }
                    case "attr-status":
                        attributeStatus.push(toDecodedAttributeReportStatus(entry));
                        break;
                    case "event-value": {
                        const reportValue = toDecodedEventReportValue(entry);
                        eventReports.push(reportValue);
                        eventListener?.(reportValue);
                        break;
                    }
                    case "event-status":
                        eventStatus.push(toDecodedEventReportStatus(entry));
                        break;
                }
            }
        }

        return {
            attributeReports,
            attributeStatus: attributeStatus.length > 0 ? attributeStatus : undefined,
            eventReports,
            eventStatus: eventStatus.length > 0 ? eventStatus : undefined,
        };
    }

    /** @deprecated Legacy API, removed in 0.19. Migrate to @matter/node — see docs/MIGRATION_CONTROLLER_018.md. */
    getStoredAttribute<T>(options: {
        endpointId: EndpointNumber;
        clusterId: ClusterId;
        attribute: ClusterType.Attribute<T>;
    }): T | undefined {
        if (this.isGroupAddress) {
            throw new ImplementationError("Reading data from group addresses is not supported.");
        }

        const { endpointId, clusterId, attribute } = options;
        const { id: attributeId } = attribute;

        if (this.#interaction instanceof ClientNodeInteraction) {
            return deepCopy(this.#interaction.localStateFor(endpointId)?.[clusterId]?.[attributeId]) as T | undefined;
        }
        return undefined;
    }

    /** @deprecated Legacy API, removed in 0.19. Migrate to @matter/node — see docs/MIGRATION_CONTROLLER_018.md. */
    async getAttribute<T>(options: {
        endpointId: EndpointNumber;
        clusterId: ClusterId;
        attribute: ClusterType.Attribute<T>;
        isFabricFiltered?: boolean;
        requestFromRemote?: boolean;
        attributeChangeListener?: (data: DecodedAttributeReportValue<any>) => void;
    }): Promise<T | undefined> {
        if (this.isGroupAddress) {
            throw new ImplementationError("Reading data from group addresses is not supported.");
        }

        const { endpointId, clusterId, attribute, requestFromRemote, isFabricFiltered, attributeChangeListener } =
            options;
        const { id: attributeId } = attribute;
        if (!requestFromRemote) {
            const value = this.getStoredAttribute({ endpointId, clusterId, attribute });
            if (value !== undefined) {
                return value;
            }
            if (requestFromRemote === false) {
                return undefined;
            }
        }

        const { attributeReports } = await this.getMultipleAttributesAndEvents({
            attributes: [{ endpointId, clusterId, attributeId }],
            isFabricFiltered,
            attributeChangeListener,
        });

        if (attributeReports.length === 0) {
            return undefined;
        }
        if (attributeReports.length > 1) {
            throw new UnexpectedDataError("Unexpected response with more then one attribute");
        }
        return attributeReports[0]?.value as T | undefined;
    }

    /** @deprecated Legacy API, removed in 0.19. Migrate to @matter/node — see docs/MIGRATION_CONTROLLER_018.md. */
    async getEvent<T>(options: {
        endpointId: EndpointNumber;
        clusterId: ClusterId;
        event: ClusterType.Event<T>;
        minimumEventNumber?: EventNumber;
        isFabricFiltered?: boolean;
    }): Promise<DecodedEventData<T>[] | undefined> {
        const { endpointId, clusterId, event, minimumEventNumber, isFabricFiltered = true } = options;
        const { id: eventId } = event;
        const response = await this.getMultipleAttributesAndEvents({
            events: [{ endpointId, clusterId, eventId }],
            eventFilters: minimumEventNumber !== undefined ? [{ eventMin: minimumEventNumber }] : undefined,
            isFabricFiltered,
        });
        return response?.eventReports[0]?.events as DecodedEventData<T>[] | undefined;
    }

    /** @deprecated Legacy API, removed in 0.19. Migrate to @matter/node — see docs/MIGRATION_CONTROLLER_018.md. */
    async setAttribute<T>(options: {
        attributeData: {
            endpointId?: EndpointNumber;
            clusterId: ClusterId;
            attribute: ClusterType.Attribute<T>;
            value: T;
            dataVersion?: number;
        };
        asTimedRequest?: boolean;
        timedRequestTimeout?: Duration;
        suppressResponse?: boolean;
        chunkLists?: boolean;
    }): Promise<void> {
        const { attributeData, asTimedRequest, timedRequestTimeout, suppressResponse, chunkLists } = options;
        const { endpointId, clusterId, attribute, value, dataVersion } = attributeData;
        const response = await this.setMultipleAttributes({
            attributes: [{ endpointId, clusterId, attribute, value, dataVersion }],
            asTimedRequest,
            timedRequestTimeout,
            suppressResponse,
            chunkLists,
        });

        // Response contains Status error if there was an error on write
        if (response.length) {
            const {
                path: { endpointId, clusterId, attributeId },
                status,
            } = response[0];
            if (status !== undefined && status !== Status.Success) {
                throw new StatusResponseError(
                    `Error setting attribute ${endpointId}/${clusterId}/${attributeId}`,
                    status,
                );
            }
        }
    }

    /** @deprecated Legacy API, removed in 0.19. Migrate to @matter/node — see docs/MIGRATION_CONTROLLER_018.md. */
    async setMultipleAttributes(options: {
        attributes: {
            endpointId?: EndpointNumber;
            clusterId: ClusterId;
            attribute: ClusterType.Attribute;
            value: any;
            dataVersion?: number;
        }[];
        asTimedRequest?: boolean;
        timedRequestTimeout?: Duration;
        suppressResponse?: boolean;
        chunkLists?: boolean;
    }): Promise<AttributeStatus[]> {
        const {
            attributes,
            asTimedRequest,
            timedRequestTimeout = DEFAULT_TIMED_REQUEST_TIMEOUT,
            suppressResponse = this.isGroupAddress,
            chunkLists = true, // Should be true currently to stay in sync with chip sdk
        } = options;
        if (this.isGroupAddress) {
            if (!suppressResponse) {
                throw new ImplementationError("Writing attributes on a group address can not return a response.");
            }
            if (
                attributes.some(
                    ({ endpointId, clusterId, attribute }) =>
                        endpointId !== undefined || clusterId === undefined || attribute.id === undefined,
                )
            ) {
                throw new ImplementationError("Not all attribute write paths are valid for group address writes.");
            }
        }

        const writeRequests = attributes.flatMap(({ endpointId, clusterId, attribute, value, dataVersion }) => {
            const { id } = attribute;
            const schema = TlvOfModel(attribute.schema);
            if (
                chunkLists &&
                Array.isArray(value) &&
                schema instanceof ArraySchema &&
                // As implemented for Matter 1.4.2 in https://github.com/project-chip/connectedhomeip/pull/38263
                // Acl writes will no longer be chunked by default, all others still
                // Will be streamlined later ... see https://github.com/project-chip/connectedhomeip/issues/38270
                !isAclOrExtensionPath({ clusterId, attributeId: id })
            ) {
                return schema
                    .encodeAsChunkedArray(value, { forWriteInteraction: true })
                    .map(({ element: data, listIndex }) => ({
                        path: { endpointId, clusterId, attributeId: id, listIndex },
                        data,
                        dataVersion,
                    }));
            }
            return [
                {
                    path: { endpointId, clusterId, attributeId: id },
                    data: schema.encodeTlv(value, { forWriteInteraction: true }),
                    dataVersion,
                },
            ];
        });
        const timedRequest =
            attributes.some(({ attribute }) => attribute.schema.effectiveAccess.timed === true) ||
            asTimedRequest === true ||
            options.timedRequestTimeout !== undefined;
        if (this.isGroupAddress && timedRequest) {
            throw new ImplementationError("Timed requests are not supported for group address writes.");
        }

        const response = await this.#interaction.write({
            ...Write({
                writes: writeRequests,
                timed: asTimedRequest,
                timeout: timedRequestTimeout,
                suppressResponse,
            }),
            [Diagnostic.value]: () =>
                Diagnostic.dict({
                    attributes: attributes
                        .map(
                            ({ endpointId, clusterId, attribute: { id }, value, dataVersion }) =>
                                `${resolveAttributeName({ endpointId, clusterId, attributeId: id })} = ${Diagnostic.json(
                                    value,
                                )} (version=${dataVersion})`,
                        )
                        .join(", "),
                }),
        });

        if (response === undefined) {
            if (!suppressResponse) {
                throw new MatterFlowError(`No response received from write interaction but expected.`);
            }
            return [];
        }
        return response
            .flatMap(({ status, clusterStatus, path: { nodeId, endpointId, clusterId, attributeId } }) => {
                return {
                    path: { nodeId, endpointId, clusterId, attributeId },
                    status: status ?? clusterStatus ?? Status.Failure,
                };
            })
            .filter(({ status }) => status !== Status.Success);
    }

    /** @deprecated Legacy API, removed in 0.19. Migrate to @matter/node — see docs/MIGRATION_CONTROLLER_018.md. */
    async subscribeAttribute<T>(options: {
        endpointId: EndpointNumber;
        clusterId: ClusterId;
        attribute: ClusterType.Attribute<T>;
        minIntervalFloorSeconds: number;
        maxIntervalCeilingSeconds: number;
        isFabricFiltered?: boolean;
        knownDataVersion?: number;
        keepSubscriptions?: boolean;
        listener?: (value: T, version: number) => void;
        updateTimeoutHandler?: () => void;
        updateReceived?: () => void;
    }): Promise<{
        maxInterval: number;
    }> {
        if (this.isGroupAddress) {
            throw new ImplementationError("Subscribing to attributes on a group address is not supported.");
        }
        const {
            endpointId,
            clusterId,
            attribute,
            minIntervalFloorSeconds,
            maxIntervalCeilingSeconds,
            isFabricFiltered = true,
            listener,
            knownDataVersion,
            keepSubscriptions = true,
            updateTimeoutHandler,
            updateReceived,
        } = options;
        const { id: attributeId } = attribute;

        const { maxInterval } = await this.subscribeMultipleAttributesAndEvents({
            attributes: [{ endpointId, clusterId, attributeId }],
            minIntervalFloorSeconds,
            maxIntervalCeilingSeconds,
            isFabricFiltered,
            dataVersionFilters:
                knownDataVersion !== undefined ? [{ endpointId, clusterId, dataVersion: knownDataVersion }] : undefined,
            keepSubscriptions,
            attributeListener: ({ value, version }) => listener?.(value, version),
            updateTimeoutHandler,
            updateReceived,
        });

        return { maxInterval };
    }

    /** @deprecated Legacy API, removed in 0.19. Migrate to @matter/node — see docs/MIGRATION_CONTROLLER_018.md. */
    async subscribeEvent<T>(options: {
        endpointId: EndpointNumber;
        clusterId: ClusterId;
        event: ClusterType.Event<T>;
        minIntervalFloorSeconds: number;
        maxIntervalCeilingSeconds: number;
        keepSubscriptions?: boolean;
        isUrgent?: boolean;
        minimumEventNumber?: EventNumber;
        isFabricFiltered?: boolean;
        listener?: (value: DecodedEventData<T>) => void;
        updateTimeoutHandler?: () => void;
        updateReceived?: () => void;
    }): Promise<{
        maxInterval: number;
    }> {
        if (this.isGroupAddress) {
            throw new ImplementationError("Subscribing to events on a group address is not supported.");
        }
        const {
            endpointId,
            clusterId,
            event,
            minIntervalFloorSeconds,
            maxIntervalCeilingSeconds,
            isUrgent,
            minimumEventNumber,
            isFabricFiltered = true,
            keepSubscriptions = true,
            listener,
            updateTimeoutHandler,
            updateReceived,
        } = options;
        const { id: eventId } = event;

        const { maxInterval } = await this.subscribeMultipleAttributesAndEvents({
            events: [{ endpointId, clusterId, eventId, isUrgent }],
            eventFilters: minimumEventNumber !== undefined ? [{ eventMin: minimumEventNumber }] : undefined,
            minIntervalFloorSeconds,
            maxIntervalCeilingSeconds,
            isFabricFiltered,
            keepSubscriptions,
            eventListener: ({ events }) => {
                for (const event of events) {
                    listener?.(event);
                }
            },
            updateTimeoutHandler,
            updateReceived,
        });

        return { maxInterval };
    }

    /** @deprecated Legacy API, removed in 0.19. Migrate to @matter/node — see docs/MIGRATION_CONTROLLER_018.md. */
    async subscribeAllAttributesAndEvents(options: {
        minIntervalFloorSeconds: number;
        maxIntervalCeilingSeconds: number;
        attributeListener?: (data: DecodedAttributeReportValue<any>) => void;
        eventListener?: (data: DecodedEventReportValue<any>) => void;
        isUrgent?: boolean;
        keepSubscriptions?: boolean;
        isFabricFiltered?: boolean;
        eventFilters?: TypeFromSchema<typeof TlvEventFilter>[];
        dataVersionFilters?: { endpointId: EndpointNumber; clusterId: ClusterId; dataVersion: number }[];
        updateTimeoutHandler?: () => void;
        updateReceived?: () => void;
    }): Promise<{
        attributeReports?: DecodedAttributeReportValue<any>[];
        eventReports?: DecodedEventReportValue<any>[];
        maxInterval: number;
    }> {
        const { isUrgent } = options;
        return this.subscribeMultipleAttributesAndEvents({
            ...options,
            attributes: REQUEST_ALL,
            events: [{ isUrgent }],
        });
    }

    /** @deprecated Legacy API, removed in 0.19. Migrate to @matter/node — see docs/MIGRATION_CONTROLLER_018.md. */
    async subscribeMultipleAttributesAndEvents(options: {
        attributes?: { endpointId?: EndpointNumber; clusterId?: ClusterId; attributeId?: AttributeId }[];
        events?: { endpointId?: EndpointNumber; clusterId?: ClusterId; eventId?: EventId; isUrgent?: boolean }[];
        minIntervalFloorSeconds: number;
        maxIntervalCeilingSeconds: number;
        keepSubscriptions?: boolean;
        isFabricFiltered?: boolean;
        attributeListener?: (data: DecodedAttributeReportValue<any>) => void;
        eventListener?: (data: DecodedEventReportValue<any>) => void;
        eventFilters?: TypeFromSchema<typeof TlvEventFilter>[];
        dataVersionFilters?: { endpointId: EndpointNumber; clusterId: ClusterId; dataVersion: number }[];
        updateTimeoutHandler?: () => void;
        updateReceived?: () => void;
    }): Promise<{
        attributeReports?: DecodedAttributeReportValue<any>[];
        eventReports?: DecodedEventReportValue<any>[];
        maxInterval: number;
    }> {
        if (this.isGroupAddress) {
            throw new ImplementationError("Subscribing to attributes or events on a group address is not supported.");
        }
        const {
            attributes: attributeRequests = [],
            events: eventRequests = [],
            minIntervalFloorSeconds,
            maxIntervalCeilingSeconds,
            keepSubscriptions = true,
            isFabricFiltered = true,
            attributeListener,
            eventListener,
            eventFilters,
            dataVersionFilters,
            updateTimeoutHandler,
            updateReceived,
        } = options;

        // Will be set to undefined when initially send and then no longer collected
        let fullReport: ResponseDataReport | undefined = {
            attributeReports: [],
            eventReports: [],
        };

        const subscribe = await (this.#interaction as ClientNodeInteraction).subscribe({
            ...Subscribe({
                interactionModelRevision: Specification.INTERACTION_MODEL_REVISION,
                attributes: attributeRequests,
                events: eventRequests,
                eventFilters,
                versionFilters: dataVersionFilters?.map(({ endpointId, clusterId, dataVersion }) => ({
                    path: { endpointId, clusterId },
                    dataVersion,
                })),
                keepSubscriptions,
                minIntervalFloor: Seconds(minIntervalFloorSeconds),
                maxIntervalCeiling: Seconds(maxIntervalCeilingSeconds),
                fabricFilter: isFabricFiltered,
            }),
            updated: async (data: ReadResult) => {
                const isUpdate = fullReport === undefined;
                const newData = await this.#processReadResult(data, {
                    attributeListener:
                        attributeListener !== undefined
                            ? (...args) => {
                                  if (isUpdate) {
                                      attributeListener?.(...args);
                                  }
                              }
                            : undefined,
                    eventListener:
                        eventListener !== undefined
                            ? (...args) => {
                                  if (isUpdate) {
                                      eventListener?.(...args);
                                  }
                              }
                            : undefined,
                });
                if (fullReport === undefined) {
                    updateReceived?.();
                    return;
                }
                // Merge newData into fullResponse
                if (newData.attributeReports.length > 0) {
                    for (const rep of newData.attributeReports) {
                        fullReport.attributeReports.push(rep);
                    }
                }
                if (newData.eventReports.length > 0) {
                    for (const rep of newData.eventReports) {
                        fullReport.eventReports.push(rep);
                    }
                }
                if (newData.attributeStatus !== undefined) {
                    fullReport.attributeStatus ??= [];
                    for (const status of newData.attributeStatus) {
                        fullReport.attributeStatus.push(status);
                    }
                }
                if (newData.eventStatus !== undefined) {
                    fullReport.eventStatus ??= [];
                    for (const status of newData.eventStatus) {
                        fullReport.eventStatus.push(status);
                    }
                }
            },
            closed: updateTimeoutHandler,
            [Diagnostic.value]: () =>
                Diagnostic.dict({
                    attributes: attributeRequests.length
                        ? attributeRequests.map(path => resolveAttributeName(path)).join(", ")
                        : undefined,
                    events: eventRequests.length
                        ? eventRequests.map(path => resolveEventName(path)).join(", ")
                        : undefined,
                    dataVersionFilter: dataVersionFilters?.length
                        ? dataVersionFilters
                              .map(
                                  ({ endpointId, clusterId, dataVersion }) =>
                                      `${endpointId}/${clusterId}=${dataVersion}`,
                              )
                              .join(", ")
                        : undefined,
                    eventFilters: eventFilters?.length
                        ? eventFilters.map(({ nodeId, eventMin }) => `${nodeId}=${eventMin}`).join(", ")
                        : undefined,
                    fabricFiltered: isFabricFiltered,
                    keepSubscriptions,
                    minInterval: Duration.format(Seconds(minIntervalFloorSeconds)),
                    maxInterval: Duration.format(Seconds(maxIntervalCeilingSeconds)),
                }),
        });

        const report = fullReport;
        fullReport = undefined; // Prevent further data collection and handle updates

        updateReceived?.();

        return {
            ...report,
            maxInterval: subscribe.maxInterval,
        };
    }

    async #invoke<C extends ClusterType.Command>(
        options: InvokeOptions<C> & { suppressResponse: boolean },
    ): Promise<CommandResponse<C>> {
        const {
            endpointId,
            clusterId,
            command,
            asTimedRequest,
            timedRequestTimeout: timedRequestTimeoutMs = DEFAULT_TIMED_REQUEST_TIMEOUT,
            expectedProcessingTime,
            useExtendedFailSafeMessageResponseTimeout = false,
            skipValidation,
            request,
        } = options;
        const timed = command.schema.effectiveAccess.timed === true;
        let { suppressResponse } = options;
        const timedRequest = (timed && !skipValidation) || asTimedRequest === true || !!options.timedRequestTimeout;

        if (this.isGroupAddress) {
            if (endpointId !== undefined) {
                throw new ImplementationError("Invoking a concrete command on a group address is not supported.");
            }
            if (timedRequest) {
                throw new ImplementationError("Timed requests are not supported for group address invokes.");
            }
            suppressResponse = true;
        }

        const clusterModel = Matter.clusters(clusterId);
        const cluster = { id: clusterId, name: clusterModel?.name ?? `Unknown (${Diagnostic.hex(clusterId)})` };
        const invoke = this.#interaction.invoke(
            Invoke({
                commands: [
                    endpointId === undefined
                        ? Invoke.WildcardCommandRequest({
                              cluster,
                              command,
                              fields: request,
                          })
                        : Invoke.ConcreteCommandRequest({
                              endpoint: endpointId,
                              cluster,
                              command,
                              fields: request,
                          }),
                ],
                skipValidation,
                timeout: timedRequest ? Millis(timedRequestTimeoutMs) : undefined,
                timed: timedRequest ?? false,
                suppressResponse: suppressResponse ?? false,
                expectedProcessingTime:
                    expectedProcessingTime ??
                    (useExtendedFailSafeMessageResponseTimeout
                        ? DEFAULT_MINIMUM_RESPONSE_TIMEOUT_WITH_FAILSAFE
                        : undefined),
            }),
        );

        for await (const chunks of invoke) {
            for (const chunk of chunks) {
                if (chunk.kind === "cmd-response") {
                    return chunk.data as CommandResponse<C>;
                }

                const resultCode = chunk.status;
                if (resultCode !== Status.Success) {
                    throw new StatusResponseError(
                        `Received non-success result: ${resultCode}`,
                        resultCode ?? Status.Failure,
                        chunk.clusterStatus,
                    );
                }
                return undefined as CommandResponse<C>; // ResponseType is void
            }
        }

        if (suppressResponse) {
            return undefined as CommandResponse<C>;
        }

        throw new MatterFlowError("Received invoke response with no result nor response.");
    }

    /** @deprecated Legacy API, removed in 0.19. Migrate to @matter/node — see docs/MIGRATION_CONTROLLER_018.md. */
    async invoke<C extends ClusterType.Command>(options: InvokeOptions<C>): Promise<CommandResponse<C>> {
        return this.#invoke({ ...options, suppressResponse: false });
    }

    // TODO Add to ClusterClient when needed/when Group communication is implemented
    // TODO Additionally support it without endpoint
    /** @deprecated Legacy API, removed in 0.19. Migrate to @matter/node — see docs/MIGRATION_CONTROLLER_018.md. */
    async invokeWithSuppressedResponse<C extends ClusterType.Command>(options: {
        endpointId?: EndpointNumber;
        clusterId: ClusterId;
        request: CommandRequest<C>;
        command: C;
        asTimedRequest?: boolean;
        timedRequestTimeout?: Duration;
        skipValidation?: boolean;
    }): Promise<void> {
        return this.#invoke({ ...options, suppressResponse: true }) as Promise<void>;
    }

    /** @deprecated Legacy API, removed in 0.19. Migrate to @matter/node — see docs/MIGRATION_CONTROLLER_018.md. */
    get channelType() {
        return this.#exchanges.channelType;
    }
}
