/**
 * @license
 * Copyright 2022-2025 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { ReadScope } from "#action/client/ReadScope.js";
import { AccessControl } from "#clusters/access-control";
import { Mark } from "#common/Mark.js";
import {
    Diagnostic,
    Duration,
    Environment,
    Environmental,
    ImplementationError,
    Logger,
    MatterFlowError,
    MaybePromise,
    PromiseQueue,
    Seconds,
    ServerAddressUdp,
    Timer,
    UnexpectedDataError,
    isDeepEqual,
    serialize,
} from "#general";
import { Specification } from "#model";
import { PeerAddress, PeerAddressMap } from "#peer/PeerAddress.js";
import { PeerDataStore } from "#peer/PeerAddressStore.js";
import { PeerConnectionOptions, PeerSet } from "#peer/PeerSet.js";
import { SecureSession } from "#session/SecureSession.js";
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
    NodeId,
    ObjectSchema,
    RequestType,
    ResponseType,
    StatusCode,
    StatusResponseError,
    SubscribeRequest,
    TlvEventFilter,
    TlvInvokeResponse,
    TlvNoResponse,
    TlvSubscribeResponse,
    TlvWriteResponse,
    TypeFromSchema,
    resolveAttributeName,
    resolveCommandName,
    resolveEventName,
} from "#types";
import { ExchangeProvider, ReconnectableExchangeProvider } from "../protocol/ExchangeProvider.js";
import { DecodedAttributeReportStatus, DecodedAttributeReportValue } from "./AttributeDataDecoder.js";
import { DecodedDataReport } from "./DecodedDataReport.js";
import { DecodedEventData, DecodedEventReportStatus, DecodedEventReportValue } from "./EventDataDecoder.js";
import { InteractionClientMessenger, ReadRequest } from "./InteractionMessenger.js";
import { Subscription } from "./Subscription.js";
import { RegisteredSubscription, SubscriptionClient } from "./SubscriptionClient.js";

const logger = Logger.get("InteractionClient");

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

export interface AttributeStatus {
    path: {
        nodeId?: NodeId;
        endpointId?: EndpointNumber;
        clusterId?: ClusterId;
        attributeId?: AttributeId;
    };
    status: StatusCode;
}

export class InteractionClientProvider {
    readonly #peers: PeerSet;
    readonly #clients = new PeerAddressMap<InteractionClient>();
    readonly #subscriptionClient = new SubscriptionClient();

    constructor(peers: PeerSet) {
        this.#peers = peers;
        this.#peers.deleted.on(peer => this.#onPeerLoss(peer.address));
        this.#peers.disconnected.on(peer => this.#onPeerLoss(peer.address));
    }

    static [Environmental.create](env: Environment) {
        const instance = new InteractionClientProvider(env.get(PeerSet));
        env.set(InteractionClientProvider, instance);
        return instance;
    }

    get peers() {
        return this.#peers;
    }

    get subscriptionClient() {
        return this.#subscriptionClient;
    }

    async connect(
        address: PeerAddress,
        options: PeerConnectionOptions & {
            allowUnknownPeer?: boolean;
            operationalAddress?: ServerAddressUdp;
        },
    ): Promise<InteractionClient> {
        await this.#peers.connect(address, options);

        return this.getInteractionClient(address, options);
    }

    async interactionClientFor(session: SecureSession): Promise<InteractionClient> {
        const exchangeProvider = await this.#peers.exchangeProviderFor(session);

        return new InteractionClient(
            exchangeProvider,
            this.#subscriptionClient,
            undefined,
            this.#peers.interactionQueue,
        );
    }

    async getInteractionClient(address: PeerAddress, options: PeerConnectionOptions = {}) {
        let client = this.#clients.get(address);
        if (client !== undefined) {
            return client;
        }

        const isGroupAddress = PeerAddress.isGroup(address);
        const nodeStore = isGroupAddress ? undefined : this.#peers.get(address)?.descriptor.dataStore;
        await nodeStore?.construction; // Lazy initialize the data if not already done

        const exchangeProvider = await this.#peers.exchangeProviderFor(address, options);

        client = new InteractionClient(
            exchangeProvider,
            this.#subscriptionClient,
            address,
            this.#peers.interactionQueue,
            nodeStore,
        );
        this.#clients.set(address, client);

        return client;
    }

    #onPeerLoss(address: PeerAddress) {
        const client = this.#clients.get(address);
        if (client !== undefined) {
            client.close();
            this.#clients.delete(address);
        }
    }
}

export class InteractionClient {
    readonly #exchangeProvider: ExchangeProvider;
    readonly #nodeStore?: PeerDataStore;
    readonly #ownSubscriptionIds = new Set<number>();
    readonly #queue?: PromiseQueue;
    readonly #address?: PeerAddress;
    readonly isGroupAddress: boolean;

    // TODO - SubscriptionClient is used by CommissioningController but not ClientNode.  However InteractionClient *is*
    // used by ClientNode to perform commissioning, during which time SubscriptionClient is unnecessary. So this should
    // be set after commissioning
    //
    // If we remove CommissioningController then this entire class goes away; if we first move commissioning to
    // ClientInteraction then this should become required
    readonly #subscriptionClient?: SubscriptionClient;

    constructor(
        exchangeProvider: ExchangeProvider,
        subscriptionClient?: SubscriptionClient,
        address?: PeerAddress,
        queue?: PromiseQueue,
        nodeStore?: PeerDataStore,
    ) {
        this.#exchangeProvider = exchangeProvider;
        this.#nodeStore = nodeStore;
        this.#subscriptionClient = subscriptionClient;
        this.#queue = queue;
        this.#address = address;
        this.isGroupAddress = address !== undefined ? PeerAddress.isGroup(address) : false;
    }

    get address() {
        if (this.#address === undefined) {
            throw new ImplementationError("This InteractionClient is not bound to a specific peer.");
        }
        return this.#address;
    }

    get isReconnectable() {
        return this.#exchangeProvider instanceof ReconnectableExchangeProvider;
    }

    get channelUpdated() {
        if (this.#exchangeProvider instanceof ReconnectableExchangeProvider) {
            return this.#exchangeProvider.channelUpdated;
        }
        throw new ImplementationError("ExchangeProvider does not support channelUpdated");
    }

    /** Calculates the current maximum response time for a message use in additional logic like timers. */
    maximumPeerResponseTime(expectedProcessingTime?: Duration) {
        return this.#exchangeProvider.maximumPeerResponseTime(expectedProcessingTime);
    }

    removeSubscription(subscriptionId: number) {
        this.#ownSubscriptionIds.delete(subscriptionId);
        this.#subscriptionClient?.delete(subscriptionId);
    }

    async getAllAttributes(
        options: {
            dataVersionFilters?: { endpointId: EndpointNumber; clusterId: ClusterId; dataVersion: number }[];
            enrichCachedAttributeData?: boolean;
            isFabricFiltered?: boolean;
            executeQueued?: boolean;
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
            executeQueued?: boolean;
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
            executeQueued?: boolean;
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
            executeQueued?: boolean;
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
            executeQueued?: boolean;
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
            executeQueued?: boolean;
        } = {},
    ): Promise<DecodedEventReportValue<any>[]> {
        return (await this.getMultipleAttributesAndEvents(options)).eventReports;
    }

    async getMultipleEventsAndStatus(
        options: {
            events?: { endpointId?: EndpointNumber; clusterId?: ClusterId; eventId?: EventId }[];
            eventFilters?: TypeFromSchema<typeof TlvEventFilter>[];
            isFabricFiltered?: boolean;
            executeQueued?: boolean;
        } = {},
    ): Promise<{ eventData: DecodedEventReportValue<any>[]; eventStatus?: DecodedEventReportStatus[] }> {
        const { eventReports, eventStatus } = await this.getMultipleAttributesAndEvents(options);
        return { eventData: eventReports, eventStatus };
    }

    async getMultipleAttributesAndEvents(
        options: {
            attributes?: { endpointId?: EndpointNumber; clusterId?: ClusterId; attributeId?: AttributeId }[];
            dataVersionFilters?: { endpointId: EndpointNumber; clusterId: ClusterId; dataVersion: number }[];
            enrichCachedAttributeData?: boolean;
            events?: { endpointId?: EndpointNumber; clusterId?: ClusterId; eventId?: EventId }[];
            eventFilters?: TypeFromSchema<typeof TlvEventFilter>[];
            isFabricFiltered?: boolean;
            executeQueued?: boolean;
            attributeChangeListener?: (
                data: DecodedAttributeReportValue<any>,
                valueChanged?: boolean,
                oldValue?: any,
            ) => void;
        } = {},
    ): Promise<DecodedDataReport> {
        if (this.isGroupAddress) {
            throw new ImplementationError("Reading data from group addresses is not supported.");
        }

        const {
            attributes: attributeRequests,
            dataVersionFilters,
            executeQueued,
            events: eventRequests,
            enrichCachedAttributeData,
            eventFilters,
            isFabricFiltered = true,
            attributeChangeListener,
        } = options;
        if (attributeRequests === undefined && eventRequests === undefined) {
            throw new ImplementationError("When reading attributes and events, at least one must be specified.");
        }

        const readPathsCount = (attributeRequests?.length ?? 0) + (eventRequests?.length ?? 0);
        if (readPathsCount > 9) {
            logger.debug(
                "Read interactions with more then 9 paths might be not allowed by the device. Consider splitting then into several read requests.",
            );
        }

        const result = await this.withMessenger(async messenger => {
            return await this.processReadRequest(
                messenger,
                {
                    attributeRequests,
                    dataVersionFilters: dataVersionFilters?.map(({ endpointId, clusterId, dataVersion }) => ({
                        path: { endpointId, clusterId },
                        dataVersion,
                    })),
                    eventRequests,
                    eventFilters,
                    isFabricFiltered,
                    interactionModelRevision: Specification.INTERACTION_MODEL_REVISION,
                },
                attributeChangeListener,
            );
        }, executeQueued);

        if (dataVersionFilters !== undefined && dataVersionFilters.length > 0 && enrichCachedAttributeData) {
            this.#enrichCachedAttributeData(result.attributeReports, dataVersionFilters);
        }

        return result;
    }

    async getAttribute<A extends Attribute<any, any>>(options: {
        endpointId: EndpointNumber;
        clusterId: ClusterId;
        attribute: A;
        isFabricFiltered?: boolean;
        requestFromRemote?: boolean;
        executeQueued?: boolean;
        attributeChangeListener?: (
            data: DecodedAttributeReportValue<any>,
            valueChanged?: boolean,
            oldValue?: any,
        ) => void;
    }): Promise<AttributeJsType<A> | undefined> {
        const { requestFromRemote } = options;
        const response = await this.getAttributeWithVersion({
            ...options,
            requestFromRemote,
        });
        return response?.value;
    }

    getStoredAttribute<A extends Attribute<any, any>>(options: {
        endpointId: EndpointNumber;
        clusterId: ClusterId;
        attribute: A;
    }): AttributeJsType<A> | undefined {
        return this.getStoredAttributeWithVersion(options)?.value;
    }

    getStoredAttributeWithVersion<A extends Attribute<any, any>>(options: {
        endpointId: EndpointNumber;
        clusterId: ClusterId;
        attribute: A;
    }): { value: AttributeJsType<A>; version: number } | undefined {
        if (this.isGroupAddress) {
            throw new ImplementationError("Reading data from group addresses is not supported.");
        }

        const { endpointId, clusterId, attribute } = options;
        const { id: attributeId } = attribute;
        if (this.#nodeStore !== undefined) {
            const { value, version } = this.#nodeStore.retrieveAttribute(endpointId, clusterId, attributeId) ?? {};
            if (value !== undefined && version !== undefined) {
                return { value, version } as { value: AttributeJsType<A>; version: number };
            }
        }
        return undefined;
    }

    async getAttributeWithVersion<A extends Attribute<any, any>>(options: {
        endpointId: EndpointNumber;
        clusterId: ClusterId;
        attribute: A;
        isFabricFiltered?: boolean;
        requestFromRemote?: boolean;
        executeQueued?: boolean;
        attributeChangeListener?: (
            data: DecodedAttributeReportValue<any>,
            valueChanged?: boolean,
            oldValue?: any,
        ) => void;
    }): Promise<{ value: AttributeJsType<A>; version: number } | undefined> {
        if (this.isGroupAddress) {
            throw new ImplementationError("Reading data from group addresses is not supported.");
        }

        const {
            endpointId,
            clusterId,
            attribute,
            requestFromRemote,
            isFabricFiltered,
            executeQueued,
            attributeChangeListener,
        } = options;
        const { id: attributeId } = attribute;
        if (this.#nodeStore !== undefined) {
            if (!requestFromRemote) {
                const { value, version } = this.#nodeStore.retrieveAttribute(endpointId, clusterId, attributeId) ?? {};
                if (value !== undefined && version !== undefined) {
                    return { value, version } as { value: AttributeJsType<A>; version: number };
                }
            }
            if (requestFromRemote === false) {
                return undefined;
            }
        }

        const { attributeReports } = await this.getMultipleAttributesAndEvents({
            attributes: [{ endpointId, clusterId, attributeId }],
            isFabricFiltered,
            executeQueued,
            attributeChangeListener,
        });

        if (attributeReports.length === 0) {
            return undefined;
        }
        if (attributeReports.length > 1) {
            throw new UnexpectedDataError("Unexpected response with more then one attribute");
        }
        return { value: attributeReports[0].value, version: attributeReports[0].version };
    }

    async getEvent<T, E extends Event<T, any>>(options: {
        endpointId: EndpointNumber;
        clusterId: ClusterId;
        event: E;
        minimumEventNumber?: EventNumber;
        isFabricFiltered?: boolean;
        executeQueued?: boolean;
    }): Promise<DecodedEventData<T>[] | undefined> {
        const { endpointId, clusterId, event, minimumEventNumber, isFabricFiltered = true, executeQueued } = options;
        const { id: eventId } = event;
        const response = await this.getMultipleAttributesAndEvents({
            events: [{ endpointId, clusterId, eventId }],
            eventFilters: minimumEventNumber !== undefined ? [{ eventMin: minimumEventNumber }] : undefined,
            isFabricFiltered,
            executeQueued,
        });
        return response?.eventReports[0]?.events;
    }

    private async processReadRequest(
        messenger: InteractionClientMessenger,
        request: ReadRequest,
        attributeChangeListener?: (
            data: DecodedAttributeReportValue<any>,
            valueChanged?: boolean,
            oldValue?: any,
        ) => void,
    ): Promise<DecodedDataReport> {
        const { attributeRequests, eventRequests, dataVersionFilters, eventFilters, isFabricFiltered } = request;
        logger.debug(() => [
            "Read",
            Mark.OUTBOUND,
            messenger.exchange.via,
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
                              ({ path: { endpointId, clusterId }, dataVersion }) =>
                                  `${endpointId}/${clusterId}=${dataVersion}`,
                          )
                          .join(", ")
                    : undefined,
                eventFilters: eventFilters?.length
                    ? eventFilters.map(({ nodeId, eventMin }) => `${nodeId}=${eventMin}`).join(", ")
                    : undefined,
                fabricFiltered: isFabricFiltered,
            }),
        ]);

        // Send read request and combine all (potentially chunked) responses
        await messenger.sendReadRequest(request);
        const scope = ReadScope(request);
        const response = await messenger.readAggregateDataReport(chunk =>
            this.processAttributeUpdates(scope, chunk, attributeChangeListener),
        );

        // Normalize and decode the response
        const { attributeReports, attributeStatus, eventReports, eventStatus } = response;

        if (attributeReports.length || eventReports.length || attributeStatus?.length || eventStatus?.length) {
            logger.debug(() => [
                "Read",
                Mark.INBOUND,
                messenger.exchange.via,
                Diagnostic.dict({
                    attributes: attributeReports.length
                        ? attributeReports
                              .map(({ path, value }) => `${resolveAttributeName(path)}=${serialize(value)}`)
                              .join(", ")
                        : undefined,
                    events: eventReports.length
                        ? eventReports.map(({ path }) => resolveEventName(path)).join(", ")
                        : undefined,
                    attributeStatus: attributeStatus?.length
                        ? attributeStatus.map(({ path }) => resolveAttributeName(path)).join(", ")
                        : undefined,
                    eventStatus: eventStatus?.length
                        ? eventStatus.map(({ path }) => resolveEventName(path)).join(", ")
                        : undefined,
                    fabricFiltered: isFabricFiltered,
                }),
            ]);
        } else {
            logger.debug("Read", Mark.INBOUND, messenger.exchange.via, "empty response");
        }

        return response;
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
        executeQueued?: boolean;
        chunkLists?: boolean;
    }): Promise<void> {
        const { attributeData, asTimedRequest, timedRequestTimeout, suppressResponse, executeQueued, chunkLists } =
            options;
        const { endpointId, clusterId, attribute, value, dataVersion } = attributeData;
        const response = await this.setMultipleAttributes({
            attributes: [{ endpointId, clusterId, attribute, value, dataVersion }],
            asTimedRequest,
            timedRequestTimeout,
            suppressResponse,
            executeQueued,
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
        executeQueued?: boolean;
        chunkLists?: boolean;
    }): Promise<AttributeStatus[]> {
        const { executeQueued } = options;

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

        const response = await this.withMessenger<TypeFromSchema<typeof TlvWriteResponse> | undefined>(
            async messenger => {
                if (timedRequest) {
                    await messenger.sendTimedRequest(timedRequestTimeout);
                }

                logger.debug(() => [
                    "Write",
                    Mark.OUTBOUND,
                    messenger.exchange.via,
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
                ]);

                return await messenger.sendWriteCommand({
                    suppressResponse,
                    timedRequest,
                    writeRequests,
                    moreChunkedMessages: false,
                    interactionModelRevision: Specification.INTERACTION_MODEL_REVISION,
                });
            },
            executeQueued,
        );

        if (response === undefined) {
            if (!suppressResponse) {
                throw new MatterFlowError(`No response received from write interaction but expected.`);
            }
            return [];
        }
        return response.writeResponses
            .flatMap(({ status: { status, clusterStatus }, path: { nodeId, endpointId, clusterId, attributeId } }) => {
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
        updateTimeoutHandler?: Timer.Callback;
        updateReceived?: () => void;
        executeQueued?: boolean;
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
            executeQueued,
        } = options;
        const { id: attributeId } = attribute;

        if (!keepSubscriptions) {
            for (const subscriptionId of this.#ownSubscriptionIds) {
                logger.debug(
                    `Removing subscription ${Subscription.idStrOf(subscriptionId)} from InteractionClient because new subscription replaces it`,
                );
                this.removeSubscription(subscriptionId);
            }
        }

        const request: SubscribeRequest = {
            interactionModelRevision: Specification.INTERACTION_MODEL_REVISION,
            attributeRequests: [{ endpointId, clusterId, attributeId }],
            dataVersionFilters:
                knownDataVersion !== undefined
                    ? [{ path: { endpointId, clusterId }, dataVersion: knownDataVersion }]
                    : undefined,
            keepSubscriptions,
            minIntervalFloorSeconds,
            maxIntervalCeilingSeconds,
            isFabricFiltered,
        };
        const scope = ReadScope(request);

        const {
            subscribeResponse: { subscriptionId, maxInterval },
            report,
            maximumPeerResponseTime,
        } = await this.withMessenger<{
            subscribeResponse: TypeFromSchema<typeof TlvSubscribeResponse>;
            report: DecodedDataReport;
            maximumPeerResponseTime: Duration;
        }>(async messenger => {
            logger.debug(() => [
                "Subscribe",
                Mark.OUTBOUND,
                messenger.exchange.via,
                Diagnostic.dict({
                    attributes: resolveAttributeName({ endpointId, clusterId, attributeId }),
                    dataVersionFilter: knownDataVersion,
                    fabricFiltered: isFabricFiltered,
                    minInterval: Duration.format(Seconds(minIntervalFloorSeconds)),
                    maxInterval: Duration.format(Seconds(maxIntervalCeilingSeconds)),
                }),
            ]);

            await messenger.sendSubscribeRequest(request);
            const { subscribeResponse, report } = await messenger.readAggregateSubscribeResponse();
            return {
                subscribeResponse,
                report,
                maximumPeerResponseTime: this.maximumPeerResponseTime(),
            };
        }, executeQueued);

        const subscriptionListener = async (dataReport: DecodedDataReport) => {
            const { attributeReports } = dataReport;

            if (attributeReports.length === 0) {
                throw new MatterFlowError("Subscription result reporting undefined/no value not specified");
            }
            if (attributeReports.length > 1) {
                throw new UnexpectedDataError("Unexpected response with more then one attribute");
            }
            const { value, version } = attributeReports[0];
            if (value === undefined)
                throw new MatterFlowError("Subscription result reporting undefined value not specified.");

            await this.#nodeStore?.persistAttributes(attributeReports, scope);

            listener?.(value, version);

            updateReceived?.();
        };

        await this.#registerSubscription(
            {
                id: subscriptionId,
                maximumPeerResponseTime,
                maxInterval: Seconds(maxInterval),
                onData: subscriptionListener,
                onTimeout: updateTimeoutHandler,
            },
            report,
        );

        return { maxInterval };
    }

    async #registerSubscription(subscription: RegisteredSubscription, initialReport: DecodedDataReport) {
        this.#ownSubscriptionIds.add(subscription.id);
        this.#subscriptionClient?.add(subscription);
        await subscription.onData(initialReport);
    }

    async subscribeEvent<T, E extends Event<T, any>>(options: {
        endpointId: EndpointNumber;
        clusterId: ClusterId;
        event: E;
        minIntervalFloor: Duration;
        maxIntervalCeiling: Duration;
        isUrgent?: boolean;
        minimumEventNumber?: EventNumber;
        isFabricFiltered?: boolean;
        listener?: (value: DecodedEventData<T>) => void;
        updateTimeoutHandler?: Timer.Callback;
        updateReceived?: () => void;
        executeQueued?: boolean;
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
            minIntervalFloor,
            maxIntervalCeiling,
            isUrgent,
            minimumEventNumber,
            isFabricFiltered = true,
            listener,
            updateTimeoutHandler,
            updateReceived,
            executeQueued,
        } = options;
        const { id: eventId } = event;

        const {
            report,
            subscribeResponse: { subscriptionId, maxInterval },
            maximumPeerResponseTime,
        } = await this.withMessenger<{
            subscribeResponse: TypeFromSchema<typeof TlvSubscribeResponse>;
            report: DecodedDataReport;
            maximumPeerResponseTime: Duration;
        }>(async messenger => {
            logger.debug(() => [
                "Subscribe",
                Mark.OUTBOUND,
                messenger.exchange.via,
                Diagnostic.dict({
                    events: resolveEventName({ endpointId, clusterId, eventId }),
                    fabricFiltered: isFabricFiltered,
                    minInterval: Duration.format(minIntervalFloor),
                    maxInterval: Duration.format(maxIntervalCeiling),
                }),
            ]);

            await messenger.sendSubscribeRequest({
                interactionModelRevision: Specification.INTERACTION_MODEL_REVISION,
                eventRequests: [{ endpointId, clusterId, eventId, isUrgent }],
                eventFilters: minimumEventNumber !== undefined ? [{ eventMin: minimumEventNumber }] : undefined,
                keepSubscriptions: true,
                minIntervalFloorSeconds: Seconds.of(minIntervalFloor),
                maxIntervalCeilingSeconds: Seconds.of(maxIntervalCeiling),
                isFabricFiltered,
            });
            const { subscribeResponse, report } = await messenger.readAggregateSubscribeResponse();
            return {
                subscribeResponse,
                report,
                maximumPeerResponseTime: this.maximumPeerResponseTime(),
            };
        }, executeQueued);

        const subscriptionListener = (dataReport: DecodedDataReport) => {
            const { eventReports } = dataReport;

            if (eventReports.length === 0) {
                throw new MatterFlowError("Received empty subscription result value.");
            }
            if (eventReports.length > 1) {
                throw new UnexpectedDataError("Unexpected response with more then one attribute.");
            }
            const { events } = eventReports[0];
            if (events === undefined)
                throw new MatterFlowError("Subscription result reporting undefined value not specified.");

            events.forEach(event => listener?.(event));

            updateReceived?.();
        };

        await this.#registerSubscription(
            {
                id: subscriptionId,
                maximumPeerResponseTime,
                maxInterval: Seconds(maxInterval),
                onData: subscriptionListener,
                onTimeout: updateTimeoutHandler,
            },
            report,
        );

        return { maxInterval };
    }

    async subscribeAllAttributesAndEvents(options: {
        minIntervalFloorSeconds: number;
        maxIntervalCeilingSeconds: number;
        attributeListener?: (
            data: DecodedAttributeReportValue<any>,
            valueChanged?: boolean,
            oldValue?: unknown,
        ) => void;
        eventListener?: (data: DecodedEventReportValue<any>) => void;
        isUrgent?: boolean;
        keepSubscriptions?: boolean;
        isFabricFiltered?: boolean;
        eventFilters?: TypeFromSchema<typeof TlvEventFilter>[];
        dataVersionFilters?: { endpointId: EndpointNumber; clusterId: ClusterId; dataVersion: number }[];
        enrichCachedAttributeData?: boolean;
        updateTimeoutHandler?: Timer.Callback;
        updateReceived?: () => void;
        executeQueued?: boolean;
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
        attributeListener?: (data: DecodedAttributeReportValue<any>, valueChanged?: boolean, oldValue?: any) => void;
        eventListener?: (data: DecodedEventReportValue<any>) => void;
        eventFilters?: TypeFromSchema<typeof TlvEventFilter>[];
        dataVersionFilters?: { endpointId: EndpointNumber; clusterId: ClusterId; dataVersion: number }[];
        enrichCachedAttributeData?: boolean;
        updateTimeoutHandler?: Timer.Callback;
        updateReceived?: () => void;
        executeQueued?: boolean;
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
            executeQueued,
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
            enrichCachedAttributeData,
        } = options;

        const subscriptionPathsCount = (attributeRequests?.length ?? 0) + (eventRequests?.length ?? 0);
        if (subscriptionPathsCount > 3) {
            logger.debug("Subscribe interactions with more then 3 paths might be not allowed by the device.");
        }

        if (!keepSubscriptions) {
            for (const subscriptionId of this.#ownSubscriptionIds) {
                logger.debug(
                    `Removing subscription with ID ${Subscription.idStrOf(subscriptionId)} from InteractionClient because new subscription replaces it`,
                );
                this.removeSubscription(subscriptionId);
            }
        }

        const request: SubscribeRequest = {
            interactionModelRevision: Specification.INTERACTION_MODEL_REVISION,
            attributeRequests,
            eventRequests,
            keepSubscriptions,
            minIntervalFloorSeconds,
            maxIntervalCeilingSeconds,
            isFabricFiltered,
            eventFilters,
            dataVersionFilters: dataVersionFilters?.map(({ endpointId, clusterId, dataVersion }) => ({
                path: { endpointId, clusterId },
                dataVersion,
            })),
        };
        const scope = ReadScope(request);

        let processNewAttributeChangesInListener = false;
        const {
            report,
            subscribeResponse: { subscriptionId, maxInterval },
            maximumPeerResponseTime,
        } = await this.withMessenger<{
            subscribeResponse: TypeFromSchema<typeof TlvSubscribeResponse>;
            report: DecodedDataReport;
            maximumPeerResponseTime: Duration;
        }>(async messenger => {
            logger.debug(() => [
                "Subscribe",
                Mark.OUTBOUND,
                messenger.exchange.via,
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
            ]);

            await messenger.sendSubscribeRequest(request);
            const { subscribeResponse, report } = await messenger.readAggregateSubscribeResponse(attributeReports =>
                this.processAttributeUpdates(scope, attributeReports, attributeListener),
            );

            logger.info(
                "Subscription successful",
                Mark.INBOUND,
                messenger.exchange.via,
                Diagnostic.dict({
                    ...Subscription.diagnosticOf(subscribeResponse.subscriptionId),
                    maxInterval: Duration.format(Seconds(subscribeResponse.maxInterval)),
                }),
            );

            return {
                subscribeResponse,
                report,
                maximumPeerResponseTime: this.maximumPeerResponseTime(),
            };
        }, executeQueued);

        const subscriptionListener = async (dataReport: {
            attributeReports?: DecodedAttributeReportValue<any>[];
            eventReports?: DecodedEventReportValue<any>[];
            subscriptionId?: number;
        }) => {
            if (
                (!Array.isArray(dataReport.attributeReports) || !dataReport.attributeReports.length) &&
                (!Array.isArray(dataReport.eventReports) || !dataReport.eventReports.length)
            ) {
                updateReceived?.();
                return;
            }
            const { attributeReports, eventReports } = dataReport;

            // We emit events first because events usually happened and lead to a new final attribute value
            if (eventReports?.length) {
                let maxEventNumber = this.#nodeStore?.maxEventNumber ?? eventReports[0].events[0].eventNumber;
                eventReports.forEach(data => {
                    logger.debug(
                        `Event update ${Mark.INBOUND} ${resolveEventName(data.path)}: ${Diagnostic.json(data.events)}`,
                    );
                    const { events } = data;

                    maxEventNumber =
                        events.length === 1
                            ? events[0].eventNumber
                            : events.reduce(
                                  (max, { eventNumber }) => (max < eventNumber ? eventNumber : max),
                                  maxEventNumber,
                              );
                    eventListener?.(data);
                });
                await this.#nodeStore?.updateLastEventNumber(maxEventNumber);
            }

            // Initial Data reports during seeding are handled directly
            if (processNewAttributeChangesInListener && attributeReports !== undefined) {
                await this.processAttributeUpdates(scope, attributeReports, attributeListener);
            }
            updateReceived?.();
        };

        await this.#registerSubscription(
            {
                id: subscriptionId,
                maximumPeerResponseTime,
                maxInterval: Seconds(maxInterval),

                onData: dataReport => subscriptionListener(dataReport),

                onTimeout: updateTimeoutHandler,
            },
            report,
        );
        processNewAttributeChangesInListener = true;

        if (dataVersionFilters !== undefined && dataVersionFilters.length > 0 && enrichCachedAttributeData) {
            this.#enrichCachedAttributeData(report.attributeReports, dataVersionFilters);
        }

        return {
            ...report,
            maxInterval,
        };
    }

    /**
     * Process changed attributes, detect changes and persist them to the node store
     */
    async processAttributeUpdates(
        scope: ReadScope,
        attributeReports: DecodedAttributeReportValue<any>[],
        attributeListener?: (data: DecodedAttributeReportValue<any>, valueChanged?: boolean, oldValue?: any) => void,
    ) {
        for (const data of attributeReports) {
            const {
                path: { endpointId, clusterId, attributeId },
                value,
                version,
            } = data;

            if (value === undefined) {
                throw new MatterFlowError("Received empty subscription result value.");
            }
            const { value: oldValue, version: oldVersion } =
                this.#nodeStore?.retrieveAttribute(endpointId, clusterId, attributeId) ?? {};
            const changed = oldValue !== undefined ? !isDeepEqual(oldValue, value) : undefined;
            if (changed !== false || version !== oldVersion) {
                await this.#nodeStore?.persistAttributes([data], scope);
            }
            logger.debug(
                `Attribute update ${Mark.INBOUND}${changed ? " (value changed)" : ""}: ${resolveAttributeName({
                    endpointId,
                    clusterId,
                    attributeId,
                })} = ${serialize(value)} (version=${version})`,
            );

            attributeListener?.(data, changed, oldValue);
        }
    }

    async invoke<C extends Command<any, any, any>>(options: {
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

        /** Execute this request queued - mainly used to execute invokes sequentially for thread devices. */
        executeQueued?: boolean;

        /** Skip request data validation. Use this only when you know that your data is correct and validation would return an error. */
        skipValidation?: boolean;
    }): Promise<ResponseType<C>> {
        const { executeQueued } = options;

        const {
            endpointId,
            clusterId,
            command: { requestId, requestSchema, responseId, responseSchema, optional, timed },
            asTimedRequest,
            timedRequestTimeout: timedRequestTimeoutMs = DEFAULT_TIMED_REQUEST_TIMEOUT,
            expectedProcessingTime,
            useExtendedFailSafeMessageResponseTimeout = false,
            skipValidation,
        } = options;
        let { request } = options;
        const timedRequest =
            (timed && !skipValidation) || asTimedRequest === true || options.timedRequestTimeout !== undefined;

        if (this.isGroupAddress) {
            if (endpointId !== undefined) {
                throw new ImplementationError("Invoking a concrete command on a group address is not supported.");
            }
            if (timedRequest) {
                throw new ImplementationError("Timed requests are not supported for group address invokes.");
            }
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

        logger.debug(
            `Invoking command: ${resolveCommandName({
                endpointId,
                clusterId,
                commandId: requestId,
            })} with ${Diagnostic.json(request)}`,
        );

        if (!skipValidation) {
            requestSchema.validate(request);
        }

        const commandFields = requestSchema.encodeTlv(request);

        const invokeResponse = await this.withMessenger<TypeFromSchema<typeof TlvInvokeResponse>>(async messenger => {
            if (timedRequest) {
                await messenger.sendTimedRequest(timedRequestTimeoutMs);
            }

            const response = await messenger.sendInvokeCommand(
                {
                    invokeRequests: [{ commandPath: { endpointId, clusterId, commandId: requestId }, commandFields }],
                    timedRequest,
                    suppressResponse: false,
                    interactionModelRevision: Specification.INTERACTION_MODEL_REVISION,
                },
                expectedProcessingTime ??
                    (useExtendedFailSafeMessageResponseTimeout
                        ? DEFAULT_MINIMUM_RESPONSE_TIMEOUT_WITH_FAILSAFE
                        : undefined),
            );
            if (response === undefined) {
                throw new MatterFlowError("No response received from invoke interaction but expected.");
            }
            return response;
        }, executeQueued);

        const { invokeResponses } = invokeResponse;
        if (invokeResponses.length === 0) {
            throw new MatterFlowError("Received invoke response with no invoke results.");
        }
        const { command, status } = invokeResponses[0];
        if (status !== undefined) {
            const resultCode = status.status.status;
            if (resultCode !== StatusCode.Success)
                throw new StatusResponseError(
                    `Received non-success result: ${resultCode}`,
                    resultCode ?? StatusCode.Failure,
                    status.status.clusterStatus,
                );
            if ((responseSchema as any) !== TlvNoResponse)
                throw new MatterFlowError("A response was expected for this command.");
            return undefined as unknown as ResponseType<C>; // ResponseType is void, force casting the empty result
        }
        if (command !== undefined) {
            const {
                commandPath: { commandId },
                commandFields,
            } = command;
            if (commandId !== responseId) {
                throw new MatterFlowError(
                    `Received invoke response with unexpected command ID ${commandId}, expected ${responseId}.`,
                );
            }
            if (commandFields === undefined) {
                if ((responseSchema as any) !== TlvNoResponse)
                    throw new MatterFlowError(`A response was expected for command ${requestId}.`);
                return undefined as unknown as ResponseType<C>; // ResponseType is void, force casting the empty result
            }
            const response = responseSchema.decodeTlv(commandFields);
            logger.debug(
                "Invoke",
                Mark.INBOUND,
                resolveCommandName({
                    endpointId,
                    clusterId,
                    commandId: requestId,
                }),
                "with",
                Diagnostic.json(response),
            );
            return response;
        }
        if (optional) {
            return undefined as ResponseType<C>; // ResponseType allows undefined for optional commands
        }
        throw new MatterFlowError("Received invoke response with no result nor response.");
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
        executeQueued?: boolean;
    }): Promise<void> {
        const { executeQueued } = options;

        const {
            endpointId,
            clusterId,
            request,
            command: { requestId, requestSchema, timed },
            asTimedRequest,
            timedRequestTimeout = DEFAULT_TIMED_REQUEST_TIMEOUT,
        } = options;
        const timedRequest = timed || asTimedRequest === true || options.timedRequestTimeout !== undefined;

        if (this.isGroupAddress) {
            if (timed) {
                throw new ImplementationError("Timed requests are not supported for group address invokes.");
            }
            if (endpointId !== undefined) {
                throw new ImplementationError("Invoking a concrete command on a group address is not supported.");
            }
        }

        logger.debug(
            `Invoking command with suppressedResponse: ${resolveCommandName({
                endpointId,
                clusterId,
                commandId: requestId,
            })} with ${Diagnostic.json(request)}`,
        );
        const commandFields = requestSchema.encodeTlv(request);

        await this.withMessenger<void>(async messenger => {
            if (timedRequest) {
                await messenger.sendTimedRequest(timedRequestTimeout);
            }

            const response = await messenger.sendInvokeCommand({
                invokeRequests: [{ commandPath: { endpointId, clusterId, commandId: requestId }, commandFields }],
                timedRequest,
                suppressResponse: true,
                interactionModelRevision: Specification.INTERACTION_MODEL_REVISION,
            });
            if (response !== undefined) {
                throw new MatterFlowError(
                    "Response received from invoke interaction but none expected because response is suppressed.",
                );
            }
        }, executeQueued);

        logger.debug(
            "Invoke successful",
            Mark.INBOUND,
            resolveCommandName({
                endpointId,
                clusterId,
                commandId: requestId,
            }),
        );
    }

    private async withMessenger<T>(
        invoke: (messenger: InteractionClientMessenger) => Promise<T>,
        executeQueued = false,
    ): Promise<T> {
        const messenger = await InteractionClientMessenger.create(this.#exchangeProvider);
        let result: T;
        try {
            if (executeQueued) {
                if (this.#queue === undefined) {
                    throw new ImplementationError("Cannot execute queued operation without a queue.");
                }
                return await this.#queue.add(() => invoke(messenger));
            }
            result = await invoke(messenger);
        } finally {
            // No need to wait for closing and final ack message here, for us all is done
            messenger.close().catch(error => logger.info(`Error closing messenger: ${error}`));
        }
        return result;
    }

    removeAllSubscriptions() {
        for (const subscriptionId of this.#ownSubscriptionIds) {
            this.removeSubscription(subscriptionId);
        }
    }

    close() {
        this.removeAllSubscriptions();
    }

    get session() {
        return this.#exchangeProvider.session;
    }

    get channelType() {
        return this.#exchangeProvider.channelType;
    }

    /** Enrich cached data to get complete responses when data version filters were used. */
    #enrichCachedAttributeData(
        attributeReports: DecodedAttributeReportValue<any>[],
        dataVersionFilters: { endpointId: EndpointNumber; clusterId: ClusterId; dataVersion: number }[],
    ) {
        if (this.#nodeStore === undefined) {
            return;
        }

        // Collect the Endpoints and clusters to potentially enrich data from the cache
        const candidates = new Map<EndpointNumber, Map<ClusterId, number>>();
        for (const { endpointId, clusterId, dataVersion } of dataVersionFilters) {
            if (!candidates.has(endpointId)) {
                candidates.set(endpointId, new Map());
            }
            candidates
                .get(endpointId)
                ?.set(clusterId, this.#nodeStore.getClusterDataVersion(endpointId, clusterId) ?? dataVersion);
        }

        // Remove all where data were returned because there the versions did not match
        attributeReports.forEach(({ path: { endpointId, clusterId } }) => {
            if (candidates.has(endpointId)) {
                candidates.get(endpointId)?.delete(clusterId);
            }
        });

        // Enrich the data from the cache for all Endpoints and clusters that are left
        for (const [endpointId, clusters] of candidates) {
            for (const [clusterId, version] of clusters) {
                const clusterValues = this.#nodeStore.retrieveAttributes(endpointId, clusterId);
                logger.debug(
                    `Enriching cached data (${clusterValues.length} attributes) for ${endpointId}/${clusterId} with version=${version}`,
                );
                attributeReports.push(...clusterValues);
            }
        }
    }

    /**
     * Returns the list (optionally filtered by endpointId and/or clusterId) of the dataVersions of the currently cached
     * values to use them as knownDataVersion for read or subscription requests.
     */
    getCachedClusterDataVersions(filter?: {
        endpointId?: EndpointNumber;
        clusterId?: ClusterId;
    }): { endpointId: EndpointNumber; clusterId: ClusterId; dataVersion: number }[] {
        if (this.#nodeStore === undefined) {
            return [];
        }
        const { endpointId, clusterId } = filter ?? {};
        return this.#nodeStore.getClusterDataVersions(endpointId, clusterId);
    }

    get maxKnownEventNumber() {
        return this.#nodeStore?.maxEventNumber;
    }

    cleanupAttributeData(endpointId: EndpointNumber, clusterIds?: ClusterId[]): MaybePromise<void> {
        return this.#nodeStore?.cleanupAttributeData(endpointId, clusterIds);
    }

    getAllCachedClusterData() {
        const result = new Array<DecodedAttributeReportValue<any>>();
        this.#enrichCachedAttributeData(result, this.getCachedClusterDataVersions());
        return result;
    }
}
