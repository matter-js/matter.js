/**
 * @license
 * Copyright 2022-2025 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { AccessControl } from "#clusters/access-control";
import {
    Diagnostic,
    Duration,
    ImplementationError,
    isObject,
    MatterFlowError,
    Millis,
    Seconds,
    ServerAddressUdp,
    UnexpectedDataError,
} from "#general";
import { Specification } from "#model";
import { ClientNodeInteraction } from "#node/client/ClientNodeInteraction.js";
import type { ServerNode } from "#node/ServerNode.js";
import {
    ClientInteraction,
    DecodedAttributeReportStatus,
    DecodedAttributeReportValue,
    DecodedDataReport,
    DecodedEventData,
    DecodedEventReportStatus,
    DecodedEventReportValue,
    ExchangeProvider,
    Interactable,
    Invoke,
    PeerAddress,
    PeerAddressMap,
    PeerConnectionOptions,
    PeerSet,
    Read,
    ReadResult,
    ReconnectableExchangeProvider,
    SecureSession,
    Subscribe,
    Write,
} from "#protocol";
import {
    ArraySchema,
    Attribute,
    AttributeId,
    AttributeJsType,
    ClusterId,
    Command,
    EndpointNumber,
    Event,
    EventId,
    EventNumber,
    FabricIndex,
    getClusterAttributeById,
    getClusterById,
    getClusterEventById,
    NodeId,
    ObjectSchema,
    RequestType,
    resolveAttributeName,
    resolveCommandName,
    resolveEventName,
    ResponseType,
    StatusCode,
    StatusResponseError,
    TlvEventFilter,
    TypeFromSchema,
} from "#types";

const REQUEST_ALL = [{}];
const DEFAULT_TIMED_REQUEST_TIMEOUT = Seconds(10);
const DEFAULT_MINIMUM_RESPONSE_TIMEOUT_WITH_FAILSAFE = Seconds(30);

const AclClusterId = AccessControl.Complete.id;
const AclAttributeId = AccessControl.Complete.attributes.acl.id;
const AclExtensionAttributeId = AccessControl.Complete.attributes.extension.id;

function isAclOrExtensionPath(path: { clusterId: ClusterId; attributeId: AttributeId }) {
    const { clusterId, attributeId } = path;
    return clusterId === AclClusterId && (attributeId === AclAttributeId || attributeId === AclExtensionAttributeId);
}

export type ResponseDataReport = Omit<
    DecodedDataReport,
    "isNormalized" | "subscriptionId" | "interactionModelRevision"
>;

export interface AttributeStatus {
    path: {
        nodeId?: NodeId;
        endpointId?: EndpointNumber;
        clusterId?: ClusterId;
        attributeId?: AttributeId;
    };
    status: StatusCode;
}

export type InvokeOptions<C extends Command<any, any, any>> = {
    endpointId?: EndpointNumber;
    clusterId: ClusterId;
    request: RequestType<C>;
    command: C;

    /** Send as timed request. If no timedRequestTimeoutMs is provided the default of 10s will be used. */
    asTimedRequest?: boolean;

    /** Use this timeout and send the request as Timed Request. If this is specified the above parameter is implied. */
    timedRequestTimeout?: Duration;

    /**
     * Expected processing time on the device side for this command.
     * useExtendedFailSafeMessageResponseTimeout is ignored if this value is set.
     */
    expectedProcessingTime?: Duration;

    /** Use an extended Message Response Timeout as defined for FailSafe cases which is 30s. */
    useExtendedFailSafeMessageResponseTimeout?: boolean;

    /** Skip request data validation. Use this only when you know that your data is correct and validation would return an error. */
    skipValidation?: boolean;
};

export class InteractionClientProvider {
    readonly #owner: ServerNode;
    readonly #peers: PeerSet;
    readonly #clients = new PeerAddressMap<InteractionClient>();

    constructor(owner: ServerNode) {
        this.#owner = owner;
        this.#peers = owner.env.get(PeerSet);
        this.#peers.deleted.on(peer => this.#onPeerLoss(peer.address));
        this.#peers.disconnected.on(peer => this.#onPeerLoss(peer.address));
    }

    get peers() {
        return this.#peers;
    }

    async connect(
        address: PeerAddress,
        options: PeerConnectionOptions & {
            allowUnknownPeer?: boolean;
            operationalAddress?: ServerAddressUdp;
        },
    ): Promise<InteractionClient> {
        await this.#peers.connect(address, options);

        return this.getNodeInteractionClient(address);
    }

    /**
     * Returns an InteractionClient  for a session or PeerAddress which is not bound to a ClientNode Interactable
     * This should only be used for special cases.
     */
    async interactionClientFor(sessionOrAddress: SecureSession | PeerAddress): Promise<InteractionClient> {
        const exchangeProvider = await this.#peers.exchangeProviderFor(sessionOrAddress);
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
     */
    async getNodeInteractionClient(address: PeerAddress, options: PeerConnectionOptions = {}) {
        let client = this.#clients.get(address);
        if (client !== undefined) {
            return client;
        }

        const peerNode = await this.#owner.peers.forAddress(address);

        // We potentially override the ExchangeManager
        const exchangeProvider = await this.#peers.exchangeProviderFor(address, options);
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

export class InteractionClient {
    readonly #address?: PeerAddress;
    readonly isGroupAddress: boolean;
    readonly #interaction: Interactable;
    readonly #exchanges: ExchangeProvider;

    constructor(interaction: Interactable, exchanges: ExchangeProvider, address?: PeerAddress) {
        this.#address = address;
        this.#interaction = interaction;
        this.#exchanges = exchanges;
        this.isGroupAddress = address !== undefined ? PeerAddress.isGroup(address) : false;
    }

    get address() {
        if (this.#address === undefined) {
            throw new ImplementationError("This InteractionClient is not bound to a specific peer.");
        }
        return this.#address;
    }

    get isReconnectable() {
        return this.#exchanges instanceof ReconnectableExchangeProvider;
    }

    get channelUpdated() {
        if (this.#exchanges instanceof ReconnectableExchangeProvider) {
            return this.#exchanges.channelUpdated;
        }
        throw new ImplementationError("ExchangeProvider does not support channelUpdated");
    }

    /** Calculates the current maximum response time for a message use in additional logic like timers. */
    maximumPeerResponseTime(expectedProcessingTime?: Duration) {
        return this.#exchanges.maximumPeerResponseTime(expectedProcessingTime);
    }

    async getAllAttributes(
        options: {
            dataVersionFilters?: { endpointId: EndpointNumber; clusterId: ClusterId; dataVersion: number }[];
            enrichCachedAttributeData?: boolean;
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

    async getAllAttributesAndEvents(
        options: {
            dataVersionFilters?: {
                endpointId: EndpointNumber;
                clusterId: ClusterId;
                dataVersion: number;
            }[];
            enrichCachedAttributeData?: boolean;
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

    async getMultipleAttributes(
        options: {
            attributes?: { endpointId?: EndpointNumber; clusterId?: ClusterId; attributeId?: AttributeId }[];
            dataVersionFilters?: { endpointId: EndpointNumber; clusterId: ClusterId; dataVersion: number }[];
            enrichCachedAttributeData?: boolean;
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

    async getMultipleAttributesAndStatus(
        options: {
            attributes?: { endpointId?: EndpointNumber; clusterId?: ClusterId; attributeId?: AttributeId }[];
            dataVersionFilters?: { endpointId: EndpointNumber; clusterId: ClusterId; dataVersion: number }[];
            enrichCachedAttributeData?: boolean;
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

    async getMultipleEvents(
        options: {
            events?: { endpointId?: EndpointNumber; clusterId?: ClusterId; eventId?: EventId }[];
            eventFilters?: TypeFromSchema<typeof TlvEventFilter>[];
            isFabricFiltered?: boolean;
        } = {},
    ): Promise<DecodedEventReportValue<any>[]> {
        return (await this.getMultipleAttributesAndEvents(options)).eventReports;
    }

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

        const read = this.#interaction.read({
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

    #convertAttributePath(entry: ReadResult.ConcreteAttributePath) {
        const { endpointId, clusterId, attributeId } = entry;

        const cluster = getClusterById(clusterId);
        const attribute = getClusterAttributeById(cluster, attributeId);

        return {
            endpointId,
            clusterId,
            attributeId,
            attributeName: attribute?.name ?? `Unknown (${Diagnostic.hex(attributeId)})`,
        };
    }

    #convertEventPath(entry: ReadResult.ConcreteEventPath) {
        const { endpointId, clusterId, eventId } = entry;
        const cluster = getClusterById(clusterId);
        const event = getClusterEventById(cluster, eventId);

        return {
            endpointId,
            clusterId,
            eventId,
            eventName: event?.name ?? `Unknown (${Diagnostic.hex(eventId)})`,
        };
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
            for (const entry of chunks) {
                switch (entry.kind) {
                    case "attr-value": {
                        const { path, value, version } = entry;
                        const reportValue: DecodedAttributeReportValue<any> = {
                            path: this.#convertAttributePath(path),
                            value,
                            version,
                        };
                        attributeReports.push(reportValue);
                        attributeListener?.(reportValue);
                        break;
                    }

                    case "attr-status": {
                        const { path, status, clusterStatus } = entry;
                        const reportStatus: DecodedAttributeReportStatus = {
                            path: this.#convertAttributePath(path),
                            status,
                            clusterStatus,
                        };
                        attributeStatus.push(reportStatus);
                        break;
                    }

                    case "event-value": {
                        const { path, number, timestamp, priority, value } = entry;
                        const reportValue: DecodedEventReportValue<any> = {
                            path: this.#convertEventPath(path),
                            events: [{ eventNumber: number, epochTimestamp: timestamp, priority, data: value }],
                        };
                        eventReports.push(reportValue);
                        eventListener?.(reportValue);
                        break;
                    }

                    case "event-status": {
                        const { path, status, clusterStatus } = entry;
                        const reportStatus: DecodedEventReportStatus = {
                            path: this.#convertEventPath(path),
                            status,
                            clusterStatus,
                        };
                        eventStatus.push(reportStatus);
                        break;
                    }
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

    getStoredAttribute<A extends Attribute<any, any>>(options: {
        endpointId: EndpointNumber;
        clusterId: ClusterId;
        attribute: A;
    }): AttributeJsType<A> | undefined {
        if (this.isGroupAddress) {
            throw new ImplementationError("Reading data from group addresses is not supported.");
        }

        const { endpointId, clusterId, attribute } = options;
        const { id: attributeId } = attribute;

        if (this.#interaction instanceof ClientNodeInteraction) {
            return this.#interaction.localStateFor(endpointId)?.[clusterId]?.[attributeId] as
                | AttributeJsType<A>
                | undefined;
        }
        return undefined;
    }

    async getAttribute<A extends Attribute<any, any>>(options: {
        endpointId: EndpointNumber;
        clusterId: ClusterId;
        attribute: A;
        isFabricFiltered?: boolean;
        requestFromRemote?: boolean;
        attributeChangeListener?: (data: DecodedAttributeReportValue<any>) => void;
    }): Promise<AttributeJsType<A> | undefined> {
        if (this.isGroupAddress) {
            throw new ImplementationError("Reading data from group addresses is not supported.");
        }

        const { endpointId, clusterId, attribute, requestFromRemote, isFabricFiltered, attributeChangeListener } =
            options;
        const { id: attributeId } = attribute;
        if (!requestFromRemote) {
            const value = this.getStoredAttribute({ endpointId, clusterId, attribute });
            if (value !== undefined) {
                return value as AttributeJsType<A>;
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
        return attributeReports[0]?.value;
    }

    async getEvent<T, E extends Event<T, any>>(options: {
        endpointId: EndpointNumber;
        clusterId: ClusterId;
        event: E;
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
        return response?.eventReports[0]?.events;
    }

    async setAttribute<T>(options: {
        attributeData: {
            endpointId?: EndpointNumber;
            clusterId: ClusterId;
            attribute: Attribute<T, any>;
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
            if (status !== undefined && status !== StatusCode.Success) {
                throw new StatusResponseError(
                    `Error setting attribute ${endpointId}/${clusterId}/${attributeId}`,
                    status,
                );
            }
        }
    }

    async setMultipleAttributes(options: {
        attributes: {
            endpointId?: EndpointNumber;
            clusterId: ClusterId;
            attribute: Attribute<any, any>;
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

        // TODO Add multi message write handling with streamed encoding
        const writeRequests = attributes.flatMap(
            ({ endpointId, clusterId, attribute: { id, schema }, value, dataVersion }) => {
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
            },
        );
        const timedRequest =
            attributes.some(({ attribute: { timed } }) => timed) ||
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
                    status: status ?? clusterStatus ?? StatusCode.Failure,
                };
            })
            .filter(({ status }) => status !== StatusCode.Success);
    }

    async subscribeAttribute<A extends Attribute<any, any>>(options: {
        endpointId: EndpointNumber;
        clusterId: ClusterId;
        attribute: A;
        minIntervalFloorSeconds: number;
        maxIntervalCeilingSeconds: number;
        isFabricFiltered?: boolean;
        knownDataVersion?: number;
        keepSubscriptions?: boolean;
        listener?: (value: AttributeJsType<A>, version: number) => void;
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

    async subscribeEvent<T, E extends Event<T, any>>(options: {
        endpointId: EndpointNumber;
        clusterId: ClusterId;
        event: E;
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
            sustain: false,
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

    async #invoke<C extends Command<any, any, any>>(
        options: InvokeOptions<C> & { suppressResponse: boolean },
    ): Promise<ResponseType<C>> {
        const { command: commandObj } = options;

        const {
            endpointId,
            clusterId,
            command: { requestId, requestSchema, timed },
            asTimedRequest,
            timedRequestTimeout: timedRequestTimeoutMs = DEFAULT_TIMED_REQUEST_TIMEOUT,
            expectedProcessingTime,
            useExtendedFailSafeMessageResponseTimeout = false,
            skipValidation,
        } = options;
        let { suppressResponse, request } = options;
        const timedRequest =
            (timed && !skipValidation) || asTimedRequest === true || options.timedRequestTimeout !== undefined;

        if (this.isGroupAddress) {
            if (endpointId !== undefined) {
                throw new ImplementationError("Invoking a concrete command on a group address is not supported.");
            }
            if (timedRequest) {
                throw new ImplementationError("Timed requests are not supported for group address invokes.");
            }
            suppressResponse = true;
        }

        if (requestSchema instanceof ObjectSchema) {
            if (request === undefined) {
                // If developer did not provide a request object, create an empty one if it needs to be an object
                // This can happen when all object properties are optional
                request = {} as RequestType<C>;
            }
            if (requestSchema.isFabricScoped && request.fabricIndex === undefined) {
                request.fabricIndex = FabricIndex.NO_FABRIC;
            }
        }

        if (!skipValidation) {
            requestSchema.validate(request);
        }
        const commandFields = requestSchema.encodeTlv(request);

        const invokeRequests = [
            {
                commandPath: {
                    endpointId,
                    clusterId,
                    commandId: requestId,
                },
                commandFields,
                timed: timedRequest ?? false,
                command: commandObj,
            },
        ];
        const invoke = this.#interaction.invoke({
            ...Invoke({
                invokeRequests,
                timeout: timedRequest ? Millis(timedRequestTimeoutMs) : undefined,
                suppressResponse: suppressResponse ?? false,
            }),
            expectedProcessingTime:
                expectedProcessingTime ??
                (useExtendedFailSafeMessageResponseTimeout
                    ? DEFAULT_MINIMUM_RESPONSE_TIMEOUT_WITH_FAILSAFE
                    : undefined),
            [Diagnostic.value]: () =>
                Diagnostic.list(
                    invokeRequests.map(({ commandPath }) => {
                        return [
                            Diagnostic.strong(resolveCommandName(commandPath)),
                            "with",
                            isObject(request) ? Diagnostic.dict(request) : "(no payload)",
                        ];
                    }),
                ),
        });

        for await (const chunks of invoke) {
            for (const chunk of chunks) {
                if (chunk.kind === "cmd-response") {
                    return chunk.data as ResponseType<C>;
                }

                const resultCode = chunk.status;
                if (resultCode !== StatusCode.Success) {
                    throw new StatusResponseError(
                        `Received non-success result: ${resultCode}`,
                        resultCode ?? StatusCode.Failure,
                        chunk.clusterStatus,
                    );
                }
                return undefined as unknown as ResponseType<C>; // ResponseType is void, force casting the empty result
            }
        }

        if (suppressResponse) {
            return undefined as unknown as ResponseType<C>;
        }

        throw new MatterFlowError("Received invoke response with no result nor response.");
    }

    async invoke<C extends Command<any, any, any>>(options: InvokeOptions<C>): Promise<ResponseType<C>> {
        return this.#invoke<C>({ ...options, suppressResponse: false });
    }

    // TODO Add to ClusterClient when needed/when Group communication is implemented
    // TODO Additionally support it without endpoint
    async invokeWithSuppressedResponse<C extends Command<any, any, any>>(options: {
        endpointId?: EndpointNumber;
        clusterId: ClusterId;
        request: RequestType<C>;
        command: C;
        asTimedRequest?: boolean;
        timedRequestTimeout?: Duration;
        skipValidation?: boolean;
    }): Promise<void> {
        return this.#invoke<C>({ ...options, suppressResponse: true });
    }

    get session() {
        return this.#exchanges.session;
    }

    get channelType() {
        return this.#exchanges.channelType;
    }
}
