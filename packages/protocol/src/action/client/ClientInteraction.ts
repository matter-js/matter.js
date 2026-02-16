/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { ClientBdxRequest, ClientBdxResponse } from "#action/client/ClientBdx.js";
import { ClientRead } from "#action/client/ClientRead.js";
import { Interactable, InteractionSession } from "#action/Interactable.js";
import { ClientInvoke, Invoke } from "#action/request/Invoke.js";
import { Read } from "#action/request/Read.js";
import { resolvePathForSpecifier } from "#action/request/Specifier.js";
import { Subscribe } from "#action/request/Subscribe.js";
import { Write } from "#action/request/Write.js";
import { DecodedInvokeResult, InvokeResult } from "#action/response/InvokeResult.js";
import { ReadResult } from "#action/response/ReadResult.js";
import { WriteResult } from "#action/response/WriteResult.js";
import { BdxMessenger } from "#bdx/BdxMessenger.js";
import { Mark } from "#common/Mark.js";
import {
    Abort,
    AsyncIterator,
    BasicSet,
    createPromise,
    Diagnostic,
    Duration,
    Entropy,
    Environment,
    ImplementationError,
    Instant,
    isObject,
    Lifetime,
    Logger,
    Minutes,
    Mutex,
    RetrySchedule,
    Seconds,
    Time,
    TimeoutError,
    Timer,
} from "#general";
import { InteractionClientMessenger, MessageType } from "#interaction/InteractionMessenger.js";
import { Subscription } from "#interaction/Subscription.js";
import { PeerAddress } from "#peer/PeerAddress.js";
import { ExchangeProvider } from "#protocol/ExchangeProvider.js";
import { SessionClosedError } from "#protocol/index.js";
import { SecureSession } from "#session/SecureSession.js";
import { Status, TlvAttributeReport, TlvNoResponse, TlvSubscribeResponse, TypeFromSchema } from "#types";
import { ClientWrite } from "./ClientWrite.js";
import { InputChunk } from "./InputChunk.js";
import { ClientSubscribe } from "./subscription/ClientSubscribe.js";
import { ClientSubscription } from "./subscription/ClientSubscription.js";
import { ClientSubscriptions } from "./subscription/ClientSubscriptions.js";
import { PeerSubscription } from "./subscription/PeerSubscription.js";
import { SustainedSubscription } from "./subscription/SustainedSubscription.js";

const logger = Logger.get("ClientInteraction");

/** Maximum value for commandRef (uint16) */
const MAX_COMMAND_REF = 0xffff;

interface PendingCommand {
    request: Invoke.ConcreteCommandRequest<any>;
    resolve: (entry: InvokeResult.DecodedData | undefined) => void;
    reject: (error: Error) => void;
}

export type SubscriptionResult<T extends ClientSubscribe = ClientSubscribe> = Promise<
    T extends { sustain: true } ? SustainedSubscription : PeerSubscription
>;

export interface ClientInteractionContext {
    environment: Environment;
    abort?: Abort.Signal;
    sustainRetries?: RetrySchedule.Configuration;
    exchangeProvider?: ExchangeProvider;
    address?: PeerAddress;
}

export const DEFAULT_MIN_INTERVAL_FLOOR = Seconds(1);

/**
 * Defines the upper limit for the publisher-selected maximum interval for any subscription.
 * ◦ If the publisher is an ICD, this SHALL be set to the Idle Mode Duration or 60 minutes, whichever is greater.
 * ◦ Otherwise, this SHALL be set to 60 minutes.
 * So for a absolute maximum if nothing was provided we use the 60 minutes
 */
export const SUBSCRIPTION_MAX_INTERVAL_PUBLISHER_LIMIT = Minutes(60);

const DEFAULT_TIMED_REQUEST_TIMEOUT = Seconds(10);
const DEFAULT_MINIMUM_RESPONSE_TIMEOUT_WITH_FAILSAFE = Seconds(30);

/**
 * Client-side implementation of the Matter protocol.
 */
export class ClientInteraction<
    SessionT extends InteractionSession = InteractionSession,
> implements Interactable<SessionT> {
    protected readonly environment: Environment;
    readonly #lifetime: Lifetime;
    readonly #exchanges: ExchangeProvider;
    readonly #interactions = new BasicSet<Read | Write | Invoke | Subscribe | ClientBdxRequest>();
    #subscriptions?: ClientSubscriptions;
    readonly #abort: Abort;
    readonly #sustainRetries: RetrySchedule;
    readonly #address?: PeerAddress;

    // Command batching state
    readonly #pendingCommands = new Map<number, PendingCommand>();
    readonly #batchMutex: Mutex;
    #batchTimer?: Timer;
    #nextCommandRef = 1;

    constructor({ environment, abort, sustainRetries, exchangeProvider, address }: ClientInteractionContext) {
        this.environment = environment;
        this.#exchanges = exchangeProvider ?? environment.get(ExchangeProvider);
        if (environment.has(ClientSubscriptions)) {
            this.#subscriptions = environment.get(ClientSubscriptions);
        }
        this.#abort = Abort.subtask(abort);
        this.#sustainRetries = new RetrySchedule(
            environment.get(Entropy),
            RetrySchedule.Configuration(SustainedSubscription.DefaultRetrySchedule, sustainRetries),
        );
        this.#address = address;
        this.#batchMutex = new Mutex(this);

        this.#lifetime = environment.join("interactions");
        Object.defineProperties(this.#lifetime.details, {
            "# active": {
                get: () => {
                    return this.#interactions.size;
                },

                enumerable: true,
            },
        });
    }

    get exchanges() {
        return this.#exchanges;
    }

    get session() {
        return this.#exchanges.session;
    }

    async close() {
        using _closing = this.#lifetime.closing();

        // Close batching
        this.#batchTimer?.stop();
        for (const [, pending] of this.#pendingCommands) {
            pending.reject(new ImplementationError("ClientInteraction closed"));
        }
        this.#pendingCommands.clear();
        await this.#batchMutex.close();

        this.#abort();

        while (this.#interactions.size) {
            await this.#interactions.deleted;
        }
    }

    get subscriptions() {
        if (this.#subscriptions === undefined) {
            this.#subscriptions = this.environment.get(ClientSubscriptions);
        }
        return this.#subscriptions;
    }

    /**
     * Read attributes and events.
     */
    async *read(request: ClientRead, session?: SessionT): ReadResult {
        const readPathsCount = (request.attributeRequests?.length ?? 0) + (request.eventRequests?.length ?? 0);
        if (readPathsCount === 0) {
            throw new ImplementationError("When reading attributes and events, at least one must be specified.");
        }
        if (readPathsCount > 9) {
            logger.info(
                "Read interactions with more than 9 paths might be not allowed by the device. Consider splitting them into several read requests.",
            );
        }

        await using context = await this.#begin("reading", request, session);
        const { checkAbort, messenger } = context;

        logger.info("Read", Mark.OUTBOUND, messenger.exchange.via, request);
        await messenger.sendReadRequest(request);
        checkAbort();

        let attributeReportCount = 0;
        let eventReportCount = 0;

        const leftOverData = new Array<TypeFromSchema<typeof TlvAttributeReport>>();
        for await (const report of messenger.readDataReports()) {
            checkAbort();
            attributeReportCount += report.attributeReports?.length ?? 0;
            eventReportCount += report.eventReports?.length ?? 0;
            yield InputChunk(report, leftOverData);
            checkAbort();
        }

        logger.info(
            "Read",
            Mark.INBOUND,
            messenger.exchange.via,
            messenger.exchange.diagnostics,
            Diagnostic.weak(
                attributeReportCount + eventReportCount === 0
                    ? "(empty)"
                    : Diagnostic.dict({ attributes: attributeReportCount, events: eventReportCount }),
            ),
        );
    }

    /**
     * Write to node attributes.
     */
    async write<T extends ClientWrite>(request: T, session?: SessionT): WriteResult<T> {
        await using context = await this.#begin("writing", request, session);
        const { checkAbort, messenger } = context;

        if (request.timedRequest) {
            await messenger.sendTimedRequest(request.timeout ?? DEFAULT_TIMED_REQUEST_TIMEOUT);
            checkAbort();
        }

        logger.info("Write", Mark.OUTBOUND, messenger.exchange.via, request);

        const response = await messenger.sendWriteCommand(request);
        checkAbort();
        if (request.suppressResponse) {
            return undefined as Awaited<WriteResult<T>>;
        }
        if (!response || !response.writeResponses?.length) {
            return [] as Awaited<WriteResult<T>>;
        }

        let successCount = 0;
        let failureCount = 0;
        const result = response.writeResponses.map(
            ({
                path: { nodeId, endpointId, clusterId, attributeId, listIndex },
                status: { status, clusterStatus },
            }) => {
                if (status === Status.Success) {
                    successCount++;
                } else {
                    failureCount++;
                }
                return {
                    kind: "attr-status",
                    path: {
                        nodeId,
                        endpointId: endpointId!,
                        clusterId: clusterId!,
                        attributeId: attributeId!,
                        listIndex,
                    },
                    status,
                    clusterStatus,
                };
            },
        ) as Awaited<WriteResult<T>>;

        logger.info(
            "Write",
            Mark.INBOUND,
            messenger.exchange.via,
            messenger.exchange.diagnostics,
            Diagnostic.weak(
                successCount + failureCount === 0
                    ? "(empty)"
                    : Diagnostic.dict({ success: successCount, failure: failureCount }),
            ),
        );

        return result;
    }

    /**
     * Invoke a single batch of commands (internal implementation).
     */
    async *#invokeSingle(request: ClientInvoke, session?: SessionT): DecodedInvokeResult {
        await using context = await this.#begin("invoking", request, session);
        const { checkAbort, messenger } = context;

        if (request.timedRequest) {
            await messenger.sendTimedRequest(request.timeout ?? DEFAULT_TIMED_REQUEST_TIMEOUT);
            checkAbort();
        }

        logger.info(
            "Invoke",
            Mark.OUTBOUND,
            messenger.exchange.via,
            Diagnostic.asFlags({ suppressResponse: request.suppressResponse, timed: request.timedRequest }),
            request,
        );

        const { expectedProcessingTime, useExtendedFailSafeMessageResponseTimeout } = request;
        const result = await messenger.sendInvokeCommand(
            request,
            expectedProcessingTime ??
                (useExtendedFailSafeMessageResponseTimeout
                    ? DEFAULT_MINIMUM_RESPONSE_TIMEOUT_WITH_FAILSAFE
                    : undefined),
        );
        checkAbort();
        if (!request.suppressResponse) {
            if (result && result.invokeResponses?.length) {
                const chunk: InvokeResult.Chunk = result.invokeResponses
                    .map(response => {
                        if (response.command !== undefined) {
                            const {
                                commandPath: { endpointId, clusterId, commandId },
                                commandRef,
                                commandFields,
                            } = response.command;
                            const cmd = request.commands.get(commandRef);
                            if (!cmd) {
                                throw new ImplementationError(
                                    `No response schema found for commandRef ${commandRef} (endpoint ${endpointId}, cluster ${clusterId}, command ${commandId})`,
                                );
                            }
                            const responseSchema = Invoke.commandOf(cmd).responseSchema;
                            if (commandFields === undefined && responseSchema !== TlvNoResponse) {
                                throw new ImplementationError(
                                    `No command fields found for commandRef ${commandRef} (endpoint ${endpointId}, cluster ${clusterId}, command ${commandId})`,
                                );
                            }

                            const data =
                                commandFields === undefined ? undefined : responseSchema.decodeTlv(commandFields);

                            logger.info(
                                "Invoke",
                                Mark.INBOUND,
                                messenger.exchange.via,
                                messenger.exchange.diagnostics,
                                Diagnostic.strong(resolvePathForSpecifier(cmd)),
                                isObject(data) ? Diagnostic.dict(data) : Diagnostic.weak("(no payload)"),
                            );

                            const res: InvokeResult.DecodedCommandResponse = {
                                kind: "cmd-response",
                                path: {
                                    endpointId: endpointId!,
                                    clusterId,
                                    commandId,
                                },
                                commandRef,
                                data,
                            };
                            return res;
                        } else if (response.status !== undefined) {
                            const {
                                commandPath: { endpointId, clusterId, commandId },
                                commandRef,
                                status: { status, clusterStatus },
                            } = response.status;
                            const res: InvokeResult.CommandStatus = {
                                kind: "cmd-status",
                                path: {
                                    endpointId: endpointId!,
                                    clusterId: clusterId,
                                    commandId: commandId,
                                },
                                commandRef,
                                status,
                                clusterStatus,
                            };
                            return res;
                        } else {
                            // Should not happen but if we ignore the response?
                            return undefined;
                        }
                    })
                    .filter(r => r !== undefined);
                yield chunk;
            } else {
                yield [];
            }
            checkAbort();
        }
    }

    /**
     * Split commands across multiple parallel invoke-exchanges.
     * Results are streamed as they arrive from any batch, not buffered.
     */
    async *#invokeWithSplitting(
        request: ClientInvoke,
        maxPathsPerInvoke: number,
        session?: SessionT,
    ): DecodedInvokeResult {
        // Split commands into batches
        const allCommands = [...request.commands.entries()];
        const batches = new Array<ClientInvoke["commands"]>();

        for (let i = 0; i < allCommands.length; i += maxPathsPerInvoke) {
            const batchEntries = allCommands.slice(i, i + maxPathsPerInvoke);
            batches.push(new Map(batchEntries));
        }

        // Create async iterators for each batch and merge results as they arrive
        const iterators = batches.map(batchCommands => {
            const batchRequest: ClientInvoke = {
                ...request,
                commands: batchCommands,
            };
            return this.#invokeSingle(batchRequest, session);
        });

        yield* AsyncIterator.merge(iterators, "One or more invoke batches failed");
    }

    /** Get the effective MaxPathsPerInvoke parameter from the session, or 1 as a fallback as defined by spec. */
    get #maxPathsPerInvoke(): number {
        try {
            return this.session.parameters.maxPathsPerInvoke;
        } catch (error) {
            SessionClosedError.accept(error);
            return 1;
        }
    }

    /**
     * Invoke one or more commands.
     *
     * When the number of commands exceeds the peer's MaxPathsPerInvoke limit (or 1 for older nodes),
     * commands are split across multiple parallel exchanges automatically.
     *
     * Single commands are automatically batched with other commands invoked in the same timer tick
     * when the device supports multiple invokes per exchange and the target is not endpoint 0.
     */
    async *invoke(request: ClientInvoke, session?: SessionT): DecodedInvokeResult {
        // Single command with batching support — auto-batch
        if (request.invokeRequests.length === 1 && request.batchDuration !== false && this.#maxPathsPerInvoke > 1) {
            const endpointId = request.invokeRequests[0].commandPath.endpointId;
            if (endpointId !== undefined && endpointId !== 0) {
                yield* this.#invokeWithBatching(request);
                return;
            }
        }

        const maxPathsPerInvoke = this.#maxPathsPerInvoke;
        const commandCount = request.commands.size;

        if (commandCount > maxPathsPerInvoke) {
            yield* this.#invokeWithSplitting(request, maxPathsPerInvoke, session);
        } else {
            yield* this.#invokeSingle(request, session);
        }
    }

    /**
     * Queue a single command for batched execution.
     * Yields the raw response entry when the batch completes.
     */
    async *#invokeWithBatching(request: ClientInvoke): DecodedInvokeResult {
        if (this.#abort.aborted) {
            throw new ImplementationError("Client interaction unavailable after close");
        }

        const cmd = [...request.commands.values()][0];
        const commandRef = this.#allocateCommandRef();
        const { promise, resolver, rejecter } = createPromise<InvokeResult.DecodedData | undefined>();

        this.#pendingCommands.set(commandRef, {
            request: { ...cmd, commandRef } as Invoke.ConcreteCommandRequest<any>,
            resolve: resolver,
            reject: rejecter,
        });

        const duration = request.batchDuration || Instant;

        if (this.#batchTimer?.isRunning) {
            // Restart with a shorter duration if the new command needs a faster flush than the remaining time
            const remaining = this.#batchTimer.interval - (this.#batchTimer.elapsed?.time ?? 0);
            if (duration < remaining) {
                this.#batchTimer.stop();
                this.#batchTimer.interval = duration;
                this.#batchTimer.start();
            }
        } else {
            if (!this.#batchTimer) {
                this.#batchTimer = Time.getTimer("invoke-batch", duration, () => this.#flushBatch());
            } else {
                this.#batchTimer.interval = duration;
            }
            this.#batchTimer.start();
        }

        const entry = await promise;
        if (entry !== undefined) {
            yield [entry];
        }
    }

    #allocateCommandRef(): number {
        const startRef = this.#nextCommandRef;

        do {
            const ref = this.#nextCommandRef;
            this.#nextCommandRef = this.#nextCommandRef >= MAX_COMMAND_REF ? 1 : this.#nextCommandRef + 1;

            if (!this.#pendingCommands.has(ref)) {
                return ref;
            }
        } while (this.#nextCommandRef !== startRef);

        throw new ImplementationError("No available commandRef values");
    }

    async #flushBatch() {
        if (this.#pendingCommands.size === 0) {
            return;
        }

        // Snapshot current commands and clear for next batch
        const commands = new Map(this.#pendingCommands);
        this.#pendingCommands.clear();

        try {
            await this.#batchMutex.produce(async () => {
                await this.#executeBatch(commands);
            });
        } catch (error) {
            // Mutex may be closed during shutdown — reject remaining commands
            for (const [, pending] of commands) {
                pending.reject(error as Error);
            }
        }
    }

    async #executeBatch(commands: Map<number, PendingCommand>) {
        try {
            const commandList = [...commands.values()];

            // For single commands, don't include commandRef (optimization)
            const isSingleCommand = commandList.length === 1;
            const invokeRequests = isSingleCommand
                ? [{ ...commandList[0].request, commandRef: undefined }]
                : commandList.map(c => c.request);

            logger.debug(`Executing ${invokeRequests.length} command(s)${isSingleCommand ? "" : " (batched)"}`);

            // Use #invokeSingle directly to avoid re-entering the batching path in invoke()
            const batchRequest = Invoke({ commands: invokeRequests }) as ClientInvoke;
            const maxPathsPerInvoke = this.#maxPathsPerInvoke;
            const chunks =
                invokeRequests.length > maxPathsPerInvoke
                    ? this.#invokeWithSplitting(batchRequest, maxPathsPerInvoke)
                    : this.#invokeSingle(batchRequest);

            for await (const chunk of chunks) {
                for (const entry of chunk) {
                    let pending: PendingCommand | undefined;

                    if (isSingleCommand) {
                        pending = commandList[0];
                        commands.clear();
                    } else {
                        pending = commands.get(entry.commandRef!);
                        if (!pending) {
                            logger.warn(`Received response for unknown commandRef ${entry.commandRef}`);
                            continue;
                        }
                        commands.delete(entry.commandRef!);
                    }

                    pending.resolve(entry);
                }
            }

            // Resolve any remaining commands with undefined (valid for suppressResponse)
            for (const [, pending] of commands) {
                pending.resolve(undefined);
            }
        } catch (error) {
            for (const [, pending] of commands) {
                pending.reject(error as Error);
            }
        }
    }

    /**
     * Subscribe to attribute values and events.
     */
    async subscribe<T extends ClientSubscribe>(request: T, session?: SessionT): SubscriptionResult<T> {
        const subscriptionPathsCount = (request.attributeRequests?.length ?? 0) + (request.eventRequests?.length ?? 0);
        if (subscriptionPathsCount === 0) {
            throw new ImplementationError("When subscribing to attributes and events, at least one must be specified.");
        }
        if (subscriptionPathsCount > 3) {
            logger.info("Subscribe interactions with more than 3 paths might be not allowed by the device.");
        }

        SecureSession.assert(this.#exchanges.session);
        const peer = this.#exchanges.session.peerAddress;

        if (!request.keepSubscriptions) {
            for (const subscription of this.subscriptions) {
                // TODO Adjust this filtering when subscriptions move to Peer
                if (!PeerAddress.is(peer, subscription.peer)) {
                    // Ignore subscriptions from other peers
                    continue;
                }
                logger.debug(
                    `Removing subscription with ID ${Subscription.idStrOf(subscription)} because new subscription replaces it`,
                );
                subscription.close();
            }
        }

        const {
            minIntervalFloor = DEFAULT_MIN_INTERVAL_FLOOR,
            maxIntervalCeiling = SUBSCRIPTION_MAX_INTERVAL_PUBLISHER_LIMIT,
        } = request;

        if (maxIntervalCeiling < minIntervalFloor) {
            throw new ImplementationError(
                `Invalid subscription request: maxIntervalCeiling (${Duration.format(
                    maxIntervalCeiling,
                )}) is less than minIntervalFloor (${Duration.format(minIntervalFloor)})`,
            );
        }

        const subscribe = async (request: ClientSubscribe) => {
            await using context = await this.#begin("subscribing", request, session);
            const { checkAbort, messenger } = context;

            logger.info(
                "Subscribe",
                Mark.OUTBOUND,
                messenger.exchange.via,
                Diagnostic.asFlags({ keepSubscriptions: request.keepSubscriptions }),
                Diagnostic.dict({
                    min: Duration.format(request.minIntervalFloor),
                    max: Duration.format(request.maxIntervalCeiling),
                }),
                request,
            );

            await messenger.sendSubscribeRequest({
                ...request,
                minIntervalFloorSeconds: Seconds.of(minIntervalFloor),
                maxIntervalCeilingSeconds: Seconds.of(maxIntervalCeiling),
            });
            checkAbort();

            await this.#handleSubscriptionResponse(request, readChunks(messenger));
            checkAbort();

            const responseMessage = await messenger.nextMessage(MessageType.SubscribeResponse);
            const response = TlvSubscribeResponse.decode(responseMessage.payload);

            const subscription = new PeerSubscription({
                lifetime: this.subscriptions,
                request,
                peer,
                closed: () => this.subscriptions.delete(subscription),
                response,
                abort: session?.abort,
                maxPeerResponseTime: this.#exchanges.maximumPeerResponseTime(),
            });
            this.subscriptions.addPeer(subscription);

            logger.info(
                "Subscription successful",
                Mark.INBOUND,
                messenger.exchange.via,
                messenger.exchange.diagnostics,
                Diagnostic.dict({
                    id: Subscription.idStrOf(response.subscriptionId),
                    interval: Duration.format(Seconds(response.maxInterval)),
                    timeout: Duration.format(subscription.timeout),
                }),
            );

            return subscription;
        };

        let subscription: ClientSubscription;
        if (request.sustain) {
            subscription = new SustainedSubscription({
                lifetime: this.subscriptions,
                subscribe,
                peer,
                closed: () => this.subscriptions.delete(subscription),
                request,
                abort: session?.abort,
                retries: this.#sustainRetries,
            });
        } else {
            subscription = await subscribe(request);
        }

        this.subscriptions.addActive(subscription);

        return subscription as unknown as SubscriptionResult<T>;
    }

    async #handleSubscriptionResponse(request: Subscribe, result: ReadResult) {
        if (request.updated) {
            await request.updated(result);
        } else {
            // It doesn't really make sense to subscribe without listening to the result, but higher-level Interactables
            // may process responses so the subscriber doesn't need to.  So "updated" may be omitted from the API, so
            // we handle this case
            //
            // We need to await the generator or the interactable will hang
            for await (const _chunk of result);
        }
    }

    async initBdx(request: ClientBdxRequest, session?: SessionT): Promise<ClientBdxResponse> {
        if (this.#abort.aborted) {
            throw new ImplementationError("Client interaction unavailable after close");
        }
        this.#interactions.add(request);

        const checkAbort = Abort.checkerFor(session);

        const messenger = await BdxMessenger.create(this.#exchanges, request.messageTimeout);

        const context: RequestContext<BdxMessenger> = {
            checkAbort,
            messenger,
            [Symbol.asyncDispose]: async () => {
                await messenger.close();
                this.#interactions.delete(request);
            },
        };

        try {
            context.checkAbort();
        } catch (e) {
            await context[Symbol.asyncDispose]();
        }

        return { context };
    }

    async #begin(what: string, request: Read | Write | Invoke | Subscribe, session: SessionT | undefined) {
        using lifetime = this.#lifetime.join(what);

        if (this.#abort.aborted) {
            throw new ImplementationError("Client interaction unavailable after close");
        }

        const checkAbort = Abort.checkerFor(session);

        const now = Time.nowMs;
        let messenger: InteractionClientMessenger;
        try {
            messenger = await InteractionClientMessenger.create(this.#exchanges);
        } catch (error) {
            TimeoutError.accept(error);

            // This logic implements a very basic automatic reconnection mechanism which is a bit like PairedNode
            // The exchange creation fails only when the node is considered to be unavailable, so in this case we
            // either try the last addresses again (if existing), or do a short-timed re-discovery. This would block
            // the execution max 10s. What's missing is that one layer (like Sustained Subscription) would trigger a
            // FullDiscovery instead of just a timed one, but for the tests and currently this should be enough.
            await this.exchanges.reconnectChannel({ asOf: now, resetInitialState: true });
            messenger = await InteractionClientMessenger.create(this.#exchanges);
        }

        this.#interactions.add(request);

        // Provide via dynamically so is up to date if exchange changes due to retry
        Object.defineProperty(lifetime.details, "via", {
            get() {
                return messenger.exchange.via;
            },
        });

        const context: RequestContext = {
            checkAbort,
            messenger,
            [Symbol.asyncDispose]: async () => {
                using _closing = lifetime.closing();
                await messenger.close();
                this.#interactions.delete(request);
            },
        };

        try {
            context.checkAbort();
        } catch (e) {
            await context[Symbol.asyncDispose]();
        }

        return context;
    }

    get channelType() {
        return this.#exchanges.channelType;
    }

    /** Calculates the current maximum response time for a message use in additional logic like timers. */
    maximumPeerResponseTime(expectedProcessingTime?: Duration) {
        return this.#exchanges.maximumPeerResponseTime(expectedProcessingTime);
    }

    get address() {
        if (this.#address === undefined) {
            throw new ImplementationError("This InteractionClient is not bound to a specific peer.");
        }
        return this.#address;
    }
}

export interface RequestContext<M extends InteractionClientMessenger | BdxMessenger = InteractionClientMessenger> {
    checkAbort(): void;
    messenger: M;

    [Symbol.asyncDispose](): Promise<void>;
}

async function* readChunks(messenger: InteractionClientMessenger) {
    const leftOverData = new Array<TypeFromSchema<typeof TlvAttributeReport>>();
    for await (const report of messenger.readDataReports()) {
        yield InputChunk(report, leftOverData);
    }
}
