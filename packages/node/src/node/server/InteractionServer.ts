/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { NodeActivity } from "#behavior/context/NodeActivity.js";
import { RemoteActorContext } from "#behavior/context/server/RemoteActorContext.js";
import { AccessControlServer } from "#behaviors/access-control";
import {
    Crypto,
    Diagnostic,
    Duration,
    InternalError,
    Lifetime,
    Logger,
    MatterError,
    MaybePromise,
    Millis,
    Observable,
    Seconds,
    ServerAddressUdp,
} from "#general";
import { GLOBAL_IDS, Specification } from "#model";
import {
    DataReport,
    DataReportPayloadIterator,
    ExchangeManager,
    InteractionRecipient,
    InteractionServerMessenger,
    InvokeRequest,
    InvokeResponseForSend,
    Mark,
    Message,
    MessageExchange,
    MessageType,
    NodeSession,
    PeerAddress,
    ProtocolHandler,
    ReadRequest,
    Session,
    SessionManager,
    SessionType,
    SubscribeRequest,
    Subscription,
    TimedRequest,
    WriteRequest,
    WriteResponse,
    WriteResult,
} from "#protocol";
import {
    AttributeData,
    DEFAULT_MAX_PATHS_PER_INVOKE,
    INTERACTION_PROTOCOL_ID,
    InvokeResponseData,
    ReceivedStatusResponseError,
    Status,
    StatusCode,
    StatusResponseError,
    TlvAny,
    TlvAttributePath,
    TlvClusterPath,
    TlvEventPath,
    TlvInvokeResponseData,
    TlvInvokeResponseForSend,
    TlvSubscribeResponse,
    TypeFromSchema,
} from "#types";
import { ServerNode } from "../ServerNode.js";
import { OnlineServerInteraction } from "./OnlineServerInteraction.js";
import { ServerSubscription, ServerSubscriptionConfig, ServerSubscriptionContext } from "./ServerSubscription.js";

const logger = Logger.get("InteractionServer");

export interface PeerSubscription {
    subscriptionId: number;
    peerAddress: PeerAddress;
    minIntervalFloor: Duration;
    maxIntervalCeiling: Duration;
    attributeRequests?: TypeFromSchema<typeof TlvAttributePath>[];
    eventRequests?: TypeFromSchema<typeof TlvEventPath>[];
    isFabricFiltered: boolean;
    maxInterval: Duration;
    sendInterval: Duration;
    operationalAddress?: ServerAddressUdp;
}

function validateReadAttributesPath(path: TypeFromSchema<typeof TlvAttributePath>, isGroupSession = false) {
    if (isGroupSession) {
        throw new StatusResponseError("Illegal read request with group session", StatusCode.InvalidAction);
    }
    const { clusterId, attributeId } = path;
    if (clusterId === undefined && attributeId !== undefined) {
        if (!GLOBAL_IDS.has(attributeId)) {
            throw new StatusResponseError(
                `Illegal read request for wildcard cluster and non global attribute ${attributeId}`,
                StatusCode.InvalidAction,
            );
        }
    }
}

function validateReadEventPath(path: TypeFromSchema<typeof TlvEventPath>, isGroupSession = false) {
    const { clusterId, eventId } = path;
    if (clusterId === undefined && eventId !== undefined) {
        throw new StatusResponseError("Illegal read request with wildcard cluster ID", StatusCode.InvalidAction);
    }
    if (isGroupSession) {
        throw new StatusResponseError("Illegal read request with group session", StatusCode.InvalidAction);
    }
}

function clusterPathToId({ nodeId, endpointId, clusterId }: TypeFromSchema<typeof TlvClusterPath>) {
    return `${nodeId}/${endpointId}/${clusterId}`;
}

/**
 * Interfaces {@link InteractionServer} with other components.
 */
export interface InteractionContext {
    readonly sessions: SessionManager;
    readonly exchangeManager: ExchangeManager;
}

/**
 * Translates interactions from the Matter protocol to matter.js APIs.
 */
export class InteractionServer implements ProtocolHandler, InteractionRecipient {
    readonly #lifetime: Lifetime;
    readonly id = INTERACTION_PROTOCOL_ID;
    readonly requiresSecureSession = true;
    #context: InteractionContext;
    #nextSubscriptionId: number;
    #isClosing = false;
    #clientHandler?: ProtocolHandler;
    readonly #subscriptionConfig: ServerSubscriptionConfig;
    readonly #maxPathsPerInvoke;
    readonly #subscriptionEstablishmentStarted = Observable<[peerAddress: PeerAddress]>();
    #node: ServerNode;
    #activity: NodeActivity;
    #newActivityBlocked = false;
    #aclServer?: AccessControlServer;
    #serverInteraction: OnlineServerInteraction;

    constructor(node: ServerNode, sessions: SessionManager) {
        this.#lifetime = node.construction.join("interaction server");

        this.#nextSubscriptionId = node.env.get(Crypto).randomUint32;

        this.#context = {
            sessions,
            exchangeManager: node.env.get(ExchangeManager),
        };

        this.#subscriptionConfig = ServerSubscriptionConfig.of(node.state.network.subscriptionOptions);
        this.#maxPathsPerInvoke = node.state.basicInformation.maxPathsPerInvoke ?? DEFAULT_MAX_PATHS_PER_INVOKE;

        this.#activity = node.env.get(NodeActivity);

        this.#node = node;

        // ServerInteraction is the "new way" and will replace most logic here over time and especially
        // the InteractionEndpointStructure, which is currently a duplication of the node protocol
        this.#serverInteraction = new OnlineServerInteraction(node.protocol);
    }

    async [Symbol.asyncDispose]() {
        await this.close();
    }

    blockNewActivity() {
        this.#newActivityBlocked = true;
    }

    protected get isClosing() {
        return this.#isClosing;
    }

    get maxPathsPerInvoke() {
        return this.#maxPathsPerInvoke;
    }

    get subscriptionEstablishmentStarted() {
        return this.#subscriptionEstablishmentStarted;
    }

    async onNewExchange(exchange: MessageExchange, message: Message) {
        // When closing, ignore anything newly incoming
        if (this.#newActivityBlocked || this.isClosing) {
            return;
        }

        // An incoming data report as the first message is not a valid server operation.  We instead delegate to a
        // client implementation if available
        if (message.payloadHeader.messageType === MessageType.ReportData && this.clientHandler) {
            return await this.clientHandler.onNewExchange(exchange, message);
        }

        // Activity tracking.  This provides diagnostic information and prevents the server from shutting down whilst
        // the exchange is active
        using activity = this.#activity.begin(`session#${exchange.session.id.toString(16)}`);
        (exchange as NodeActivity.WithActivity)[NodeActivity.activityKey] = activity;

        // Delegate to InteractionServerMessenger
        try {
            return await new InteractionServerMessenger(exchange).handleRequest(this);
        } finally {
            delete (exchange as NodeActivity.WithActivity)[NodeActivity.activityKey];
        }
    }

    get aclServer() {
        if (this.#aclServer !== undefined) {
            return this.#aclServer;
        }
        const aclServer = this.#node.act(agent => agent.get(AccessControlServer));
        if (MaybePromise.is(aclServer)) {
            throw new InternalError("AccessControlServer should already be initialized.");
        }
        return (this.#aclServer = aclServer);
    }

    get clientHandler(): ProtocolHandler | undefined {
        return this.#clientHandler;
    }

    set clientHandler(clientHandler: ProtocolHandler) {
        this.#clientHandler = clientHandler;
    }

    #prepareOnlineContext(
        exchange: MessageExchange,
        message?: Message,
        fabricFiltered?: boolean,
        timed = false,
    ): RemoteActorContext.Options {
        return {
            activity: (exchange as NodeActivity.WithActivity)[NodeActivity.activityKey],
            fabricFiltered,
            timed,
            message,
            exchange,
            node: this.#node,
        };
    }

    /**
     * Returns an iterator that yields the data reports and events data for the given read request.
     */
    async *#executeReadInteraction(readRequest: ReadRequest, exchange: MessageExchange, message: Message) {
        const readContext = this.#prepareOnlineContext(exchange, message, readRequest.isFabricFiltered);

        for await (const chunk of this.#serverInteraction.read(readRequest, readContext)) {
            for (const report of chunk) {
                yield InteractionServerMessenger.convertServerInteractionReport(report);
            }
        }
    }

    async handleReadRequest(
        exchange: MessageExchange,
        readRequest: ReadRequest,
        message: Message,
    ): Promise<{ dataReport: DataReport; payload?: DataReportPayloadIterator }> {
        const {
            attributeRequests,
            eventRequests,
            isFabricFiltered,
            dataVersionFilters,
            eventFilters,
            interactionModelRevision,
        } = readRequest;

        logger.debug(() => [
            "Read",
            Mark.INBOUND,
            exchange.via,
            Diagnostic.asFlags({ fabricFiltered: isFabricFiltered }),
            Diagnostic.dict({
                attributes: `${
                    attributeRequests?.map(path => this.#node.protocol.inspectPath(path)).join(", ") ?? "none"
                }${dataVersionFilters?.length ? ` with ${dataVersionFilters?.length} filters` : ""}`,
                events: `${
                    eventRequests?.map(path => this.#node.protocol.inspectPath(path)).join(", ") ?? "none"
                }${eventFilters?.length ? `, ${eventFilters?.length} filters` : ""}`,
            }),
        ]);

        if (interactionModelRevision > Specification.INTERACTION_MODEL_REVISION) {
            logger.debug(
                `Interaction model revision of sender ${interactionModelRevision} is higher than supported ${Specification.INTERACTION_MODEL_REVISION}.`,
            );
        }
        if (attributeRequests === undefined && eventRequests === undefined) {
            return {
                dataReport: {
                    interactionModelRevision: Specification.INTERACTION_MODEL_REVISION,
                    suppressResponse: true,
                },
            };
        }

        if (message.packetHeader.sessionType !== SessionType.Unicast) {
            throw new StatusResponseError(
                "Reads are only allowed on unicast sessions", // Means "No groups"
                StatusCode.InvalidAction,
            );
        }

        return {
            dataReport: {
                interactionModelRevision: Specification.INTERACTION_MODEL_REVISION,
                suppressResponse: true,
            },
            payload: this.#executeReadInteraction(readRequest, exchange, message),
        };
    }

    async handleWriteRequest(
        exchange: MessageExchange,
        writeRequest: WriteRequest,
        messenger: InteractionServerMessenger,
        message: Message,
    ): Promise<void> {
        let { suppressResponse, writeRequests, moreChunkedMessages } = writeRequest;
        const { timedRequest, interactionModelRevision } = writeRequest;
        const sessionType = message.packetHeader.sessionType;

        logger.info(() => [
            "Write",
            Mark.INBOUND,
            exchange.via,
            Diagnostic.asFlags({ suppressResponse, moreChunkedMessages }),
            Diagnostic.weak(writeRequests.map(req => this.#node.protocol.inspectPath(req.path)).join(", ")),
        ]);

        if (moreChunkedMessages && suppressResponse) {
            throw new StatusResponseError(
                "MoreChunkedMessages and SuppressResponse cannot be used together in write messages",
                StatusCode.InvalidAction,
            );
        }

        if (interactionModelRevision > Specification.INTERACTION_MODEL_REVISION) {
            logger.debug(
                `Interaction model revision of sender ${interactionModelRevision} is higher than supported ${Specification.INTERACTION_MODEL_REVISION}.`,
            );
        }

        const receivedWithinTimedInteraction = exchange.hasActiveTimedInteraction();

        if (receivedWithinTimedInteraction && moreChunkedMessages) {
            throw new StatusResponseError(
                "Write Request action that is part of a Timed Write Interaction SHALL NOT be chunked.",
                StatusCode.InvalidAction,
            );
        }

        if (exchange.hasExpiredTimedInteraction()) {
            exchange.clearTimedInteraction();
            throw new StatusResponseError(`Timed request window expired. Decline write request.`, StatusCode.Timeout);
        }

        if (timedRequest !== exchange.hasTimedInteraction()) {
            throw new StatusResponseError(
                `timedRequest flag of write interaction (${timedRequest}) mismatch with expected timed interaction (${receivedWithinTimedInteraction}).`,
                StatusCode.TimedRequestMismatch,
            );
        }

        if (receivedWithinTimedInteraction) {
            logger.debug("Write request for timed interaction on", exchange.channel.name);
            exchange.clearTimedInteraction();
            if (sessionType !== SessionType.Unicast) {
                throw new StatusResponseError(
                    "Write requests are only allowed on unicast sessions when a timed interaction is running.",
                    StatusCode.InvalidAction,
                );
            }
        }

        if (sessionType === SessionType.Group && !suppressResponse) {
            throw new StatusResponseError(
                "Write requests are only allowed as group casts when suppressResponse=true.",
                StatusCode.InvalidAction,
            );
        }

        // Track the previous processed attribute path for list operations across chunks.
        // A list ADD (listIndex === null) is only valid if the previous write was to the same attribute.
        let previousProcessedAttributePath: WriteResult.ConcreteAttributePath | undefined;

        // Process chunks until moreChunkedMessages is false
        while (true) {
            const allResponses = new Array<WriteResult.AttributeStatus>();

            // Separate write requests into batches based on list validity
            // A list ADD without a prior REPLACE_ALL to the same attribute gets a BUSY response
            let currentBatch = new Array<AttributeData>();

            const processBatch = async () => {
                if (currentBatch.length === 0) {
                    return;
                }

                const context = this.#prepareOnlineContext(
                    exchange,
                    message,
                    true, // always fabric filtered
                    receivedWithinTimedInteraction,
                );

                // Send batch to OnlineServerInteraction
                const batchRequest = { ...writeRequest, writeRequests: currentBatch, suppressResponse: false };
                const batchResults = await this.#serverInteraction.write(batchRequest, context);
                if (batchResults) {
                    allResponses.push(...batchResults);
                }

                currentBatch = [];
            };

            for (const request of writeRequests) {
                const { path } = request;
                const listIndex = path.listIndex;

                if (listIndex === null) {
                    // This is a list ADD - check if a previous path matches
                    if (
                        previousProcessedAttributePath?.endpointId !== path.endpointId ||
                        previousProcessedAttributePath?.clusterId !== path.clusterId ||
                        previousProcessedAttributePath?.attributeId !== path.attributeId
                    ) {
                        // Invalid ADD - process any pending batch first
                        await processBatch();

                        // According to Specification, ADDs are only allowed with a REPLACE before them
                        // Chip SDK returns "BUSY" in cases where this rule is not followed, so we do too
                        allResponses.push({
                            kind: "attr-status",
                            path: path as WriteResult.ConcreteAttributePath,
                            status: Status.Busy,
                        });

                        // Don't update previousProcessedAttributePath for BUSY responses
                        continue;
                    }
                }

                // Valid write - add to batch and update tracking
                currentBatch.push(request);
                if (path.endpointId !== undefined && path.clusterId !== undefined && path.attributeId !== undefined) {
                    previousProcessedAttributePath = path as WriteResult.ConcreteAttributePath;
                }
            }

            // Process any remaining batch
            await processBatch();

            if (suppressResponse) {
                // No response to send, we are done
                break;
            }

            // Send WriteResponse for this chunk
            const chunkResponse: WriteResponse = {
                writeResponses: allResponses.map(({ path, status, clusterStatus }) => ({
                    path,
                    status: { status, clusterStatus },
                })),
                interactionModelRevision: Specification.INTERACTION_MODEL_REVISION,
            };

            await messenger.sendWriteResponse(chunkResponse, {
                logContext: moreChunkedMessages ? "WriteResponse-chunk" : undefined,
            });

            if (!moreChunkedMessages) {
                // Was the last message, so we are done
                break;
            }

            // Wait for the next chunk
            const nextChunk = await messenger.readNextWriteRequest();
            const nextRequest = nextChunk.writeRequest;
            ({ writeRequests, moreChunkedMessages, suppressResponse } = nextRequest);

            logger.info(() => [
                "Write",
                Mark.INBOUND,
                exchange.via,
                Diagnostic.asFlags({ suppressResponse, moreChunkedMessages }),
                Diagnostic.weak(writeRequests.map(req => this.#node.protocol.inspectPath(req.path)).join(", ")),
            ]);

            if (suppressResponse) {
                throw new StatusResponseError(
                    "Multiple chunked messages and SuppressResponse cannot be used together in write messages",
                    StatusCode.InvalidAction,
                );
            }
        }
    }

    async handleSubscribeRequest(
        exchange: MessageExchange,
        request: SubscribeRequest,
        messenger: InteractionServerMessenger,
        message: Message,
    ): Promise<void> {
        const {
            minIntervalFloorSeconds,
            maxIntervalCeilingSeconds,
            attributeRequests,
            dataVersionFilters,
            eventRequests,
            eventFilters,
            keepSubscriptions,
            isFabricFiltered,
            interactionModelRevision,
        } = request;

        logger.info(() => [
            "Subscribe",
            Mark.INBOUND,
            exchange.via,
            Diagnostic.asFlags({ fabricFiltered: isFabricFiltered, keepSubscriptions }),
            Diagnostic.dict({
                attributePaths: attributeRequests?.length,
                eventPaths: eventRequests?.length,
            }),
        ]);

        if (interactionModelRevision > Specification.INTERACTION_MODEL_REVISION) {
            logger.debug(
                `Interaction model revision of sender ${interactionModelRevision} is higher than supported ${Specification.INTERACTION_MODEL_REVISION}.`,
            );
        }

        if (message.packetHeader.sessionType !== SessionType.Unicast) {
            throw new StatusResponseError(
                "Subscriptions are only allowed on unicast sessions",
                StatusCode.InvalidAction,
            );
        }

        NodeSession.assert(exchange.session, "Subscriptions are only implemented on secure sessions");
        const session = exchange.session;
        const fabric = session.fabric;

        if (fabric !== undefined && !keepSubscriptions) {
            let clearedCount = 0;
            for (const sess of this.#context.sessions.sessions) {
                // TODO Adjust this filtering when subscriptions move to Peer
                if (!PeerAddress.is(sess.peerAddress, session.peerAddress)) {
                    // Ignore subscriptions from other peers
                    continue;
                }
                for (const subscription of sess.subscriptions) {
                    await subscription.handlePeerCancel();
                    clearedCount++;
                }
            }
            if (clearedCount > 0) {
                logger.debug(
                    `Cleared ${clearedCount} subscriptions for Subscriber node ${session.peerNodeId} because keepSubscriptions=false`,
                );
            }
        }

        if (
            (!Array.isArray(attributeRequests) || attributeRequests.length === 0) &&
            (!Array.isArray(eventRequests) || eventRequests.length === 0)
        ) {
            throw new StatusResponseError("No attributes or events requested", StatusCode.InvalidAction);
        }

        logger.debug(() => [
            "Subscribe request details",
            Mark.INBOUND,
            exchange.via,
            Diagnostic.dict({
                attributes: attributeRequests?.length
                    ? attributeRequests?.map(path => this.#node.protocol.inspectPath(path)).join(", ")
                    : undefined,
                dataVersionFilters: dataVersionFilters?.length
                    ? dataVersionFilters
                          .map(
                              ({ path: { nodeId, endpointId, clusterId }, dataVersion }) =>
                                  `${clusterPathToId({ nodeId, endpointId, clusterId })}=${dataVersion}`,
                          )
                          .join(", ")
                    : undefined,
                events: eventRequests?.length
                    ? eventRequests.map(path => this.#node.protocol.inspectPath(path)).join(", ")
                    : undefined,
                eventFilters: eventFilters?.length
                    ? eventFilters.map(filter => `${filter.nodeId}/${filter.eventMin}`).join(", ")
                    : undefined,
            }),
        ]);

        // Validate of the paths before proceeding
        attributeRequests?.forEach(path => validateReadAttributesPath(path));
        eventRequests?.forEach(path => validateReadEventPath(path));

        if (minIntervalFloorSeconds < 0) {
            throw new StatusResponseError(
                "minIntervalFloorSeconds should be greater or equal to 0",
                StatusCode.InvalidAction,
            );
        }
        if (maxIntervalCeilingSeconds < 0) {
            throw new StatusResponseError(
                "maxIntervalCeilingSeconds should be greater or equal to 0",
                StatusCode.InvalidAction,
            );
        }
        if (maxIntervalCeilingSeconds < minIntervalFloorSeconds) {
            throw new StatusResponseError(
                "maxIntervalCeilingSeconds should be greater or equal to minIntervalFloorSeconds",
                StatusCode.InvalidAction,
            );
        }

        if (this.#nextSubscriptionId === 0xffffffff) this.#nextSubscriptionId = 0;
        const subscriptionId = this.#nextSubscriptionId++;

        this.#subscriptionEstablishmentStarted.emit(session.peerAddress);
        let subscription: ServerSubscription;
        try {
            subscription = await this.#establishSubscription(
                subscriptionId,
                request,
                messenger,
                session,
                exchange,
                message,
            );
        } catch (error) {
            logger.error(
                `Subscription ${Subscription.idStrOf(subscriptionId)} for session ${session.via}: Error while sending initial data reports:`,
                error instanceof MatterError ? error.message : error,
            );
            const sre = StatusResponseError.of(error);
            if (sre && !(sre instanceof ReceivedStatusResponseError)) {
                logger.info(
                    "Status",
                    Diagnostic.strong(`${Status[sre.code]}(${sre.code})`),
                    Mark.OUTBOUND,
                    exchange.via,
                    exchange.diagnostics,
                    "Error:",
                    Diagnostic.errorMessage(sre),
                );
                await messenger.sendStatus(sre.code, {
                    logContext: {
                        for: "I/SubscriptionSeed-Status",
                    },
                });
            }
            await messenger.close();
            return; // Make sure to not bubble up the exception
        }

        const maxInterval = subscription.maxInterval;

        // Then send the subscription response
        await messenger.send(
            MessageType.SubscribeResponse,
            TlvSubscribeResponse.encode({
                subscriptionId,
                maxInterval: Seconds.of(maxInterval),
                interactionModelRevision: Specification.INTERACTION_MODEL_REVISION,
            }),
            {
                logContext: {
                    ...Subscription.diagnosticOf(subscriptionId),
                    maxInterval: Duration.format(maxInterval),
                },
            },
        );

        // When an error occurs while sending the response, the subscription is not yet active and will be cleaned up by GC
        subscription.activate();
    }

    #initiateSubscriptionExchange(addressOrSession: PeerAddress | Session, protocolId: number) {
        if (addressOrSession instanceof Session) {
            return this.#context.exchangeManager.initiateExchangeForSession(addressOrSession, protocolId);
        }
        return this.#context.exchangeManager.initiateExchange(addressOrSession, protocolId);
    }

    async #establishSubscription(
        id: number,
        request: SubscribeRequest,
        messenger: InteractionServerMessenger,
        session: NodeSession,
        exchange: MessageExchange,
        message: Message,
    ) {
        const context: ServerSubscriptionContext = {
            session,
            node: this.#node,
            initiateExchange: (addressOrSession, protocolId) =>
                this.#initiateSubscriptionExchange(addressOrSession, protocolId),
        };

        const subscription = new ServerSubscription({
            id,
            context,
            request,
            subscriptionOptions: this.#subscriptionConfig,
        });

        const readContext = this.#prepareOnlineContext(exchange, message, request.isFabricFiltered);
        try {
            // Send the initial data report to prime the subscription with initial data
            await subscription.sendInitialReport(messenger, readContext);
        } catch (error) {
            await subscription.close(); // Cleanup
            throw error;
        }

        logger.info(
            "Subscribe successful",
            Mark.OUTBOUND,
            exchange.via,
            exchange.diagnostics,
            Diagnostic.dict({
                ...Subscription.diagnosticOf(subscription),
                timing: `${Duration.format(subscription.minIntervalFloor)} - ${Duration.format(subscription.maxIntervalCeiling)} => ${Duration.format(subscription.maxInterval)}`,
                sendInterval: Duration.format(subscription.sendInterval),
            }),
        );

        return subscription;
    }

    async establishFormerSubscription(
        {
            subscriptionId,
            attributeRequests,
            eventRequests,
            isFabricFiltered,
            minIntervalFloor,
            maxIntervalCeiling,
            maxInterval,
            sendInterval,
        }: PeerSubscription,
        session: NodeSession,
    ) {
        const exchange = this.#context.exchangeManager.initiateExchange(session.peerAddress, INTERACTION_PROTOCOL_ID);

        logger.info(
            `Reestablish subscription`,
            Mark.OUTBOUND,
            exchange.via,
            Diagnostic.dict({
                ...Subscription.diagnosticOf(subscriptionId),
                isFabricFiltered,
                maxInterval: Duration.format(maxInterval),
                sendInterval: Duration.format(sendInterval),
            }),
        );

        const context: ServerSubscriptionContext = {
            session,
            node: this.#node,
            initiateExchange: (addressOrSession, protocolId) =>
                this.#initiateSubscriptionExchange(addressOrSession, protocolId),
        };

        const subscription = new ServerSubscription({
            id: subscriptionId,
            context,
            request: {
                attributeRequests,
                eventRequests,
                isFabricFiltered,
                minIntervalFloorSeconds: Seconds.of(minIntervalFloor),
                maxIntervalCeilingSeconds: Seconds.of(maxIntervalCeiling),
            },
            subscriptionOptions: this.#subscriptionConfig,
            useAsMaxInterval: maxInterval,
            useAsSendInterval: sendInterval,
        });

        const readContext = this.#prepareOnlineContext(exchange, undefined, isFabricFiltered);
        try {
            // Send initial data report to prime the subscription with initial data
            await subscription.sendInitialReport(
                new InteractionServerMessenger(exchange),
                readContext,
                true, // Do not send status responses because we simulate that the subscription is still established
            );
            subscription.activate();

            logger.info(
                `Subscription successfully reestablished`,
                Mark.OUTBOUND,
                exchange.via,
                exchange.diagnostics,
                Diagnostic.dict({
                    ...Subscription.diagnosticOf(subscriptionId),
                    timing: `${Duration.format(minIntervalFloor)} - ${Duration.format(maxIntervalCeiling)} => ${Duration.format(subscription.maxInterval)}`,
                    sendInterval: Duration.format(subscription.sendInterval),
                }),
            );
        } catch (error) {
            await subscription.close(); // Cleanup
            throw error;
        }
        return subscription;
    }

    async handleInvokeRequest(
        exchange: MessageExchange,
        request: InvokeRequest,
        messenger: InteractionServerMessenger,
        message: Message,
    ): Promise<void> {
        const { invokeRequests, timedRequest, suppressResponse, interactionModelRevision } = request;
        logger.info(() => [
            "Invoke",
            Mark.INBOUND,
            exchange.via,
            Diagnostic.asFlags({ suppressResponse, timedRequest }),
            Diagnostic.dict({
                invokes: invokeRequests
                    .map(({ commandPath: { endpointId, clusterId, commandId } }) =>
                        this.#node.protocol.inspectPath({ endpointId, clusterId, commandId }),
                    )
                    .join(", "),
            }),
        ]);

        if (interactionModelRevision > Specification.INTERACTION_MODEL_REVISION) {
            logger.debug(
                `Interaction model revision of sender ${interactionModelRevision} is higher than supported ${Specification.INTERACTION_MODEL_REVISION}.`,
            );
        }

        const receivedWithinTimedInteraction = exchange.hasActiveTimedInteraction();
        if (exchange.hasExpiredTimedInteraction()) {
            exchange.clearTimedInteraction();
            throw new StatusResponseError(`Timed request window expired. Decline invoke request.`, StatusCode.Timeout);
        }

        if (timedRequest !== exchange.hasTimedInteraction()) {
            throw new StatusResponseError(
                `timedRequest flag of invoke interaction (${timedRequest}) mismatch with expected timed interaction (${receivedWithinTimedInteraction}).`,
                StatusCode.TimedRequestMismatch,
            );
        }

        if (receivedWithinTimedInteraction) {
            logger.debug("Invoke request for timed interaction on", exchange.channel.name);
            exchange.clearTimedInteraction();
            if (message.packetHeader.sessionType !== SessionType.Unicast) {
                throw new StatusResponseError(
                    "Invoke requests are only allowed on unicast sessions when a timed interaction is running.",
                    StatusCode.InvalidAction,
                );
            }
        }

        if (invokeRequests.length > this.#maxPathsPerInvoke) {
            throw new StatusResponseError(
                `Only ${this.#maxPathsPerInvoke} invoke requests are supported in one message. This message contains ${invokeRequests.length}`,
                StatusCode.InvalidAction,
            );
        }

        const context = this.#prepareOnlineContext(exchange, message, undefined, receivedWithinTimedInteraction);

        const isGroupSession = message.packetHeader.sessionType === SessionType.Group;

        // Get the invoke-results from the server interaction
        const results = this.#serverInteraction.invoke(request, context);

        // For suppressResponse or group sessions, just consume the iterator without sending responses
        if (suppressResponse || isGroupSession) {
            for await (const _chunk of results);
            return;
        }

        // Track accumulated responses for the current message
        const currentChunkResponses = new Array<InvokeResponseData>();
        const emptyInvokeResponse: InvokeResponseForSend = {
            suppressResponse: false, // Deprecated but must be present
            interactionModelRevision: Specification.INTERACTION_MODEL_REVISION,
            invokeResponses: [],
        };
        const emptyInvokeResponseLength = TlvInvokeResponseForSend.encode(emptyInvokeResponse).byteLength;
        let messageSize = emptyInvokeResponseLength;
        let chunkedTransmissionTerminated = false;

        /**
         * Send a chunk when the message size limit would be exceeded.
         */
        const sendChunkIfNeeded = async (invokeResponse: InvokeResponseData): Promise<void> => {
            const encodedInvokeResponse = TlvInvokeResponseData.encodeTlv(invokeResponse);
            const invokeResponseBytes = TlvAny.getEncodedByteLength(encodedInvokeResponse);

            // Check if adding this response would exceed message size
            if (messageSize + invokeResponseBytes > exchange.maxPayloadSize && currentChunkResponses.length > 0) {
                logger.debug(
                    "Invoke (chunk)",
                    Mark.OUTBOUND,
                    exchange.via,
                    Diagnostic.dict({ commands: currentChunkResponses.length }),
                );

                const chunkResponse: InvokeResponseForSend = {
                    ...emptyInvokeResponse,
                    invokeResponses: currentChunkResponses.map(r => TlvInvokeResponseData.encodeTlv(r)),
                };

                if (!(await messenger.sendInvokeResponseChunk(chunkResponse))) {
                    chunkedTransmissionTerminated = true;
                    return;
                }

                // Reset for next chunk
                currentChunkResponses.length = 0;
                messageSize = emptyInvokeResponseLength;
            }

            // Add to the current chunk
            currentChunkResponses.push(invokeResponse);
            messageSize += invokeResponseBytes;
        };

        // Process all invoke results
        for await (const chunk of results) {
            if (chunkedTransmissionTerminated) {
                // Client terminated the chunked series, continue consuming but don't send
                continue;
            }

            for (const data of chunk) {
                switch (data.kind) {
                    case "cmd-response": {
                        const { path: commandPath, commandRef, data: commandFields } = data;
                        await sendChunkIfNeeded({
                            command: {
                                commandPath,
                                commandFields,
                                commandRef,
                            },
                        });
                        break;
                    }

                    case "cmd-status": {
                        const { path, commandRef, status, clusterStatus } = data;
                        await sendChunkIfNeeded({
                            status: { commandPath: path, status: { status, clusterStatus }, commandRef },
                        });
                        break;
                    }
                }
            }
        }

        // Send the final response if not already terminated
        if (!chunkedTransmissionTerminated) {
            if (currentChunkResponses.length > 0) {
                logger.debug(
                    "Invoke (final)",
                    Mark.OUTBOUND,
                    exchange.via,
                    Diagnostic.dict({ commands: currentChunkResponses.length }),
                );
            }

            const finalResponse: InvokeResponseForSend = {
                ...emptyInvokeResponse,
                invokeResponses: currentChunkResponses.map(r => TlvInvokeResponseData.encodeTlv(r)),
            };
            await messenger.sendInvokeResponse(finalResponse);
        }
    }

    handleTimedRequest(exchange: MessageExchange, { timeout, interactionModelRevision }: TimedRequest) {
        const interval = Millis(timeout);

        logger.debug(() => [
            "Timed request",
            Mark.INBOUND,
            exchange.via,
            Diagnostic.dict({
                interval: Duration.format(interval),
            }),
        ]);

        if (interactionModelRevision > Specification.INTERACTION_MODEL_REVISION) {
            logger.debug(
                `Interaction model revision of sender ${interactionModelRevision} is higher than supported ${Specification.INTERACTION_MODEL_REVISION}.`,
            );
        }

        exchange.startTimedInteraction(interval);
    }

    async close() {
        this.#isClosing = true;
        this.#lifetime[Symbol.dispose]();
    }
}
