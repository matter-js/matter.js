/**
 * @license
 * Copyright 2022-2025 Matter.js Authors
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
    Message,
    MessageExchange,
    MessageType,
    NodeSession,
    PeerAddress,
    ProtocolHandler,
    ReadRequest,
    SessionManager,
    SessionType,
    SubscribeRequest,
    TimedRequest,
    WriteRequest,
    WriteResponse,
} from "#protocol";
import {
    DEFAULT_MAX_PATHS_PER_INVOKE,
    INTERACTION_PROTOCOL_ID,
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
            return this.clientHandler.onNewExchange(exchange, message);
        }

        // Activity tracking.  This provides diagnostic information and prevents the server from shutting down whilst
        // the exchange is active
        using activity = this.#activity.begin(`session#${exchange.session.id.toString(16)}`);
        (exchange as NodeActivity.WithActivity)[NodeActivity.activityKey] = activity;

        // Delegate to InteractionServerMessenger
        return new InteractionServerMessenger(exchange)
            .handleRequest(this)
            .finally(() => delete (exchange as NodeActivity.WithActivity)[NodeActivity.activityKey]);
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
        message: Message,
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
            "Read «",
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
        message: Message,
    ): Promise<WriteResponse> {
        const { suppressResponse, timedRequest, writeRequests, interactionModelRevision, moreChunkedMessages } =
            writeRequest;
        const sessionType = message.packetHeader.sessionType;

        logger.info(() => [
            "Write «",
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
            exchange.clearTimedInteraction(); // ??
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

        // TODO: We still need to add multi message writes!

        const result = await this.#serverInteraction.write(
            writeRequest,
            this.#prepareOnlineContext(
                exchange,
                message,
                true, // always fabric filtered
                receivedWithinTimedInteraction,
            ),
        );

        return {
            writeResponses: result?.map(({ path, status, clusterStatus }) => ({
                path,
                status: { status, clusterStatus },
            })),
            interactionModelRevision: Specification.INTERACTION_MODEL_REVISION,
        };
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
            "Subscribe «",
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
            const clearedCount = await this.#context.sessions.clearSubscriptionsForNode(
                fabric.addressOf(session.peerNodeId),
                true,
            );
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
            "Subscribe request details «",
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
            throw new StatusResponseError("minIntervalFloor should be greater or equal to 0", StatusCode.InvalidAction);
        }
        if (maxIntervalCeilingSeconds < 0) {
            throw new StatusResponseError(
                "maxIntervalCeiling should be greater or equal to 0",
                StatusCode.InvalidAction,
            );
        }
        if (maxIntervalCeilingSeconds < minIntervalFloorSeconds) {
            throw new StatusResponseError(
                "maxIntervalCeiling should be greater or equal to minIntervalFloor",
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
                `Subscription ${subscriptionId} for Session ${session.id}: Error while sending initial data reports:`,
                error instanceof MatterError ? error.message : error,
            );
            if (error instanceof StatusResponseError && !(error instanceof ReceivedStatusResponseError)) {
                logger.info(
                    "Status",
                    Diagnostic.strong(`${Status[error.code]}(${error.code})`),
                    "»",
                    exchange.via,
                    "Error:",
                    Diagnostic.errorMessage(error),
                );
                await messenger.sendStatus(error.code, {
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
                    subId: subscriptionId,
                    maxInterval,
                },
            },
        );

        // When an error occurs while sending the response, the subscription is not yet active and will be cleaned up by GC
        subscription.activate();
    }

    async #establishSubscription(
        id: number,
        {
            minIntervalFloorSeconds,
            maxIntervalCeilingSeconds,
            attributeRequests,
            dataVersionFilters,
            eventRequests,
            eventFilters,
            isFabricFiltered,
        }: SubscribeRequest,
        messenger: InteractionServerMessenger,
        session: NodeSession,
        exchange: MessageExchange,
        message: Message,
    ) {
        const context: ServerSubscriptionContext = {
            session,
            node: this.#node,
            initiateExchange: (address: PeerAddress, protocolId) =>
                this.#context.exchangeManager.initiateExchange(address, protocolId),
        };

        const subscription = new ServerSubscription({
            id,
            context,
            criteria: {
                attributeRequests,
                dataVersionFilters,
                eventRequests,
                eventFilters,
                isFabricFiltered,
            },
            minIntervalFloor: Seconds(minIntervalFloorSeconds),
            maxIntervalCeiling: Seconds(maxIntervalCeilingSeconds),
            subscriptionOptions: this.#subscriptionConfig,
        });

        const readContext = this.#prepareOnlineContext(exchange, message, isFabricFiltered);
        try {
            // Send the initial data report to prime the subscription with initial data
            await subscription.sendInitialReport(messenger, readContext);
        } catch (error) {
            await subscription.close(); // Cleanup
            throw error;
        }

        logger.info(
            "Subscribe successful »",
            exchange.via,
            Diagnostic.dict({
                subId: id,
                timing: `${Duration.format(Seconds(minIntervalFloorSeconds))} - ${Duration.format(Seconds(maxIntervalCeilingSeconds))} => ${Duration.format(subscription.maxInterval)}`,
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
        const message = {} as Message;

        logger.info(
            `Reestablish subscription »`,
            exchange.via,
            Diagnostic.dict({
                subId: subscriptionId,
                isFabricFiltered,
                maxInterval: Duration.format(maxInterval),
                sendInterval: Duration.format(sendInterval),
            }),
        );

        const context: ServerSubscriptionContext = {
            session,
            node: this.#node,
            initiateExchange: (address: PeerAddress, protocolId) =>
                this.#context.exchangeManager.initiateExchange(address, protocolId),
        };

        const subscription = new ServerSubscription({
            id: subscriptionId,
            context,
            minIntervalFloor,
            maxIntervalCeiling,
            criteria: {
                attributeRequests,
                eventRequests,
                isFabricFiltered,
            },
            subscriptionOptions: this.#subscriptionConfig,
            useAsMaxInterval: maxInterval,
            useAsSendInterval: sendInterval,
        });

        const readContext = this.#prepareOnlineContext(exchange, message, isFabricFiltered);
        try {
            // Send initial data report to prime the subscription with initial data
            await subscription.sendInitialReport(
                new InteractionServerMessenger(exchange),
                readContext,
                true, // Do not send status responses because we simulate that the subscription is still established
            );
            subscription.activate();

            logger.info(
                `Subscription successfully reestablished »`,
                exchange.via,
                Diagnostic.dict({
                    subId: subscriptionId,
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
            "Invoke «",
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
            exchange.clearTimedInteraction(); // ??
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

        const isGroupSession = message.packetHeader.sessionType === SessionType.Group;
        const invokeResponseMessage: TypeFromSchema<typeof TlvInvokeResponseForSend> = {
            suppressResponse: false, // Deprecated but must be present
            interactionModelRevision: Specification.INTERACTION_MODEL_REVISION,
            invokeResponses: [],
            moreChunkedMessages: invokeRequests.length > 1, // Assume for now we have multiple responses when having multiple invokes
        };
        const emptyInvokeResponseBytes = TlvInvokeResponseForSend.encode(invokeResponseMessage);
        let messageSize = emptyInvokeResponseBytes.byteLength;
        let invokeResultsProcessed = 0;

        // To lower potential latency when we would process all invoke messages and just send responses at the end we
        // assemble response on the fly locally here and send when message becomes too big
        // TODO generalize as streaming like DataReports
        const processResponseResult = async (
            invokeResponse: TypeFromSchema<typeof TlvInvokeResponseData>,
        ): Promise<void> => {
            invokeResultsProcessed++;

            if (isGroupSession) {
                // We send no responses at all for group sessions
                return;
            }
            const encodedInvokeResponse = TlvInvokeResponseData.encodeTlv(invokeResponse);
            const invokeResponseBytes = TlvAny.getEncodedByteLength(encodedInvokeResponse);

            if (
                messageSize + invokeResponseBytes > exchange.maxPayloadSize ||
                invokeResultsProcessed === invokeRequests.length
            ) {
                let lastMessageProcessed = false;
                if (messageSize + invokeResponseBytes <= exchange.maxPayloadSize) {
                    // last invoke response and matches in the message
                    invokeResponseMessage.invokeResponses.push(encodedInvokeResponse);
                    lastMessageProcessed = true;
                }
                // Send the response when the message is full or when all responses are processed
                if (invokeResponseMessage.invokeResponses.length > 0) {
                    if (invokeRequests.length > 1) {
                        logger.debug(
                            `${lastMessageProcessed ? "Final " : ""}Invoke response »`,
                            Diagnostic.dict({ commands: invokeResponseMessage.invokeResponses.length }),
                        );
                    }
                    const moreChunkedMessages = lastMessageProcessed ? undefined : true;
                    await messenger.send(
                        MessageType.InvokeResponse,
                        TlvInvokeResponseForSend.encode({
                            ...invokeResponseMessage,
                            moreChunkedMessages,
                        }),
                        {
                            logContext: {
                                invokeMsgFlags: Diagnostic.asFlags({
                                    suppressResponse,
                                    moreChunkedMessages,
                                }),
                            },
                        },
                    );
                    invokeResponseMessage.invokeResponses = [];
                    messageSize = emptyInvokeResponseBytes.byteLength;
                }
                if (!lastMessageProcessed) {
                    invokeResultsProcessed--; // Correct counter again because we recall the method
                    return processResponseResult(invokeResponse);
                }
            } else {
                invokeResponseMessage.invokeResponses.push(encodedInvokeResponse);
                messageSize += invokeResponseBytes;
            }
        };

        for await (const chunk of this.#serverInteraction.invoke(
            request,
            this.#prepareOnlineContext(exchange, message, undefined, receivedWithinTimedInteraction),
        )) {
            if (suppressResponse) {
                throw new InternalError("Received response that should be suppressed for invoke");
            }
            for (const data of chunk) {
                switch (data.kind) {
                    case "cmd-response": {
                        const { path: commandPath, commandRef, data: commandFields } = data;
                        await processResponseResult({
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
                        await processResponseResult({
                            status: { commandPath: path, status: { status, clusterStatus }, commandRef },
                        });
                    }
                }
            }
        }
    }

    handleTimedRequest(exchange: MessageExchange, { timeout, interactionModelRevision }: TimedRequest) {
        const interval = Millis(timeout);

        logger.debug(() => [
            "Timed request «",
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
    }
}
