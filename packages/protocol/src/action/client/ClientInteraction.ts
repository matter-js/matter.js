/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { ClientBdxRequest, ClientBdxResponse } from "#action/client/ClientBdx.js";
import { ClientRead } from "#action/client/ClientRead.js";
import { Interactable, InteractionSession } from "#action/Interactable.js";
import { ClientInvoke, Invoke } from "#action/request/Invoke.js";
import { MalformedRequestError } from "#action/request/MalformedRequestError.js";
import { Read } from "#action/request/Read.js";
import { resolvePathForSpecifier } from "#action/request/Specifier.js";
import { Subscribe } from "#action/request/Subscribe.js";
import { DecodedInvokeResult, InvokeResult } from "#action/response/InvokeResult.js";
import { ReadResult } from "#action/response/ReadResult.js";
import { WriteResult } from "#action/response/WriteResult.js";
import { BdxMessenger } from "#bdx/BdxMessenger.js";
import type { Message } from "#codec/MessageCodec.js";
import { Mark } from "#common/Mark.js";
import { InteractionClientMessenger, MessageType } from "#interaction/InteractionMessenger.js";
import { Subscription } from "#interaction/Subscription.js";
import { PeerAddress } from "#peer/PeerAddress.js";
import { PeerCommunicationError } from "#peer/PeerCommunicationError.js";
import { SessionClosedError } from "#protocol/errors.js";
import { ExchangeProvider } from "#protocol/ExchangeProvider.js";
import type { ExchangeLogContext } from "#protocol/MessageExchange.js";
import { GroupSession } from "#session/GroupSession.js";
import type { Session } from "#session/Session.js";
import { SessionParameters } from "#session/SessionParameters.js";
import {
    Abort,
    AbortedError,
    asError,
    AsyncIterator,
    BasicSet,
    causedBy,
    ChannelType,
    ClosedError,
    createPromise,
    Diagnostic,
    Duration,
    Entropy,
    Environment,
    Forever,
    ImplementationError,
    InternalError,
    Instant,
    isObject,
    Lifetime,
    Logger,
    Millis,
    Minutes,
    Mutex,
    RetrySchedule,
    Seconds,
    ServerAddressUdp,
    Time,
    Timer,
} from "@matter/general";
import {
    GroupId,
    ReceivedStatusResponseError,
    Status,
    TlvAttributeReport,
    TlvOfModel,
    TlvSchema,
    TlvSubscribeResponse,
    TypeFromSchema,
} from "@matter/types";
import { TlvVoid } from "@matter/types/tlv";
import { ClientWrite } from "./ClientWrite.js";
import { InputChunk } from "./InputChunk.js";
import { ClientSubscribe } from "./subscription/ClientSubscribe.js";
import { ClientSubscription } from "./subscription/ClientSubscription.js";
import { ClientSubscriptions } from "./subscription/ClientSubscriptions.js";
import { PeerSubscription } from "./subscription/PeerSubscription.js";
import { SustainedSubscription } from "./subscription/SustainedSubscription.js";

const logger = Logger.get("ClientInteraction");

/**
 * Returns a log-friendly peer address diagnostic for sessions that expose one
 * (currently: group multicast).
 */
function peerAddressDiagnostic(session: Session | undefined) {
    if (session !== undefined && GroupSession.is(session)) {
        const { peerNodeId } = session;
        return Diagnostic.dict({
            group: GroupId.isGroupNodeId(peerNodeId) ? GroupId.fromNodeId(peerNodeId) : undefined,
            dest: session.destination,
        });
    }
    return "";
}

/** Maximum value for commandRef (uint16) */
const MAX_COMMAND_REF = 0xffff;

/** Higher processing time to give devices a bit more time to send updates. */
export const SUBSCRIPTION_PROCESSING_TIME = Seconds(10);

/**
 * Probe commands in a {@link ClientInvoke} for the Matter "Large Message Quality" ("L") flag.
 *
 * Legacy command requests carry no model reference, so callers using {@link Invoke.LegacyCommandRequest}
 * must continue to set the request's `largeMessage` explicitly.
 *
 * @internal — exported for unit testing.
 */
export function inferLargeMessage(request: ClientInvoke): boolean {
    for (const cmd of request.commands.values()) {
        if (Invoke.isLegacy(cmd)) {
            continue;
        }
        try {
            const command = Invoke.commandOf(cmd);
            if (command.schema?.effectiveQuality?.largeMessage) {
                return true;
            }
        } catch (error) {
            // Swallow only resolution errors — downstream encode will surface them with full context.
            MalformedRequestError.accept(error);
        }
    }
    return false;
}

interface PendingCommand {
    request: Invoke.ConcreteCommandRequest<any>;
    pathKey: string;

    /** Aborts when the command's request or its session aborts. */
    abort: AbortSignal;
    resolve: (entry: InvokeResult.DecodedData | undefined) => void;
    reject: (error: Error) => void;
    aborted?: boolean;
    cleanup?: () => void;
}

/**
 * Commands queued for one network.  Each network flushes and sends its batches independently, so a command for a
 * prioritized network such as an ICD's active window never waits behind another network's batch.
 */
interface BatchLane {
    network?: string;
    pending: Map<number, PendingCommand>;
    mutex: Mutex;
    timer?: Timer;
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
    network?: string;
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
 * Whether a single-command request may join an automatic batch.
 *
 * A batch request is rebuilt from the queued commands and carries only what {@link ClientInteraction} reconstructs
 * for it, so a request that sets anything else is sent on its own.  Each field of {@link ClientInvoke} is classified
 * here, so a new field does not compile until someone decides whether it blocks batching.
 */
function isBatchable(request: ClientInvoke) {
    const endpointId = request.invokeRequests[0]?.commandPath.endpointId;
    const blocks: { [K in keyof Required<ClientInvoke>]: boolean } = {
        commands: false,
        invokeRequests: request.invokeRequests.length !== 1 || endpointId === undefined || endpointId === 0,
        skipValidation: false,
        abort: false,
        network: false,
        // Applied by the node before the request reaches the interaction
        icdAwaitTimeout: false,
        batchDuration: request.batchDuration === false,
        interactionModelRevision:
            request.interactionModelRevision !== undefined &&
            request.interactionModelRevision !== SessionParameters.fallbacks.interactionModelRevision,
        suppressResponse: !!request.suppressResponse,
        timedRequest: !!request.timedRequest,
        // Only used with timedRequest, which Invoke() sets alongside it
        timeout: request.timeout !== undefined,
        delayReportData: request.delayReportData !== undefined,
        // Large Message Quality commands must not be batched
        largeMessage: !!request.largeMessage,
        expectedProcessingTime: request.expectedProcessingTime !== undefined,
        useExtendedFailSafeMessageResponseTimeout: !!request.useExtendedFailSafeMessageResponseTimeout,
        additionalMrpDelay: request.additionalMrpDelay !== undefined,
        addressOverride: request.addressOverride !== undefined,
        // Server only
        beforeDispatch: request.beforeDispatch !== undefined,
    };
    return !Object.values(blocks).includes(true);
}

/**
 * Client-side implementation of the Matter protocol.
 */
export class ClientInteraction<
    SessionT extends InteractionSession = InteractionSession,
> implements Interactable<SessionT> {
    readonly #environment: Environment;
    readonly #lifetime: Lifetime;
    readonly #exchangeProvider: ExchangeProvider;
    /** One entry per running interaction; retries may reuse request objects. */
    readonly #interactions = new BasicSet<symbol>();
    #subscriptions?: ClientSubscriptions;
    readonly #abort: Abort;
    readonly #sustainRetries: RetrySchedule;
    readonly #address?: PeerAddress;
    readonly #network?: string;

    // Command batching state
    readonly #batchLanes = new Map<string | undefined, BatchLane>();
    #nextCommandRef = 1;
    #closeReason?: Error;

    constructor({ environment, abort, sustainRetries, exchangeProvider, address, network }: ClientInteractionContext) {
        this.#environment = environment;
        this.#exchangeProvider = exchangeProvider ?? environment.get(ExchangeProvider);
        if (environment.has(ClientSubscriptions)) {
            this.#subscriptions = environment.get(ClientSubscriptions);
        }
        this.#abort = Abort.subtask(abort);
        this.#sustainRetries = new RetrySchedule(
            environment.get(Entropy),
            RetrySchedule.Configuration(SustainedSubscription.DefaultRetrySchedule, sustainRetries),
        );
        this.#address = address;
        this.#network = network;

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

    async close(reason?: Error) {
        if (reason === undefined) {
            reason = new ClosedError("Interaction component closed");
        }
        this.#closeReason = reason;

        using _closing = this.#lifetime.closing();

        // Close subscriptions established through this interaction so they do not outlive the interactable; a
        // sustained subscription would otherwise retry forever against a closed interactable.
        const peer = this.#exchangeProvider.peerAddress;
        if (this.#subscriptions !== undefined && peer !== undefined) {
            for (const subscription of [...this.#subscriptions]) {
                if (PeerAddress.is(peer, subscription.peer)) {
                    subscription.close();
                }
            }
        }

        // Close batching
        for (const lane of this.#batchLanes.values()) {
            lane.timer?.stop();
            for (const [, pending] of lane.pending) {
                pending.cleanup?.();
                pending.reject(reason);
            }
            lane.pending.clear();
        }

        // Abort before draining the mutexes so an in-flight batch cancels instead of running to completion
        this.#abort(reason);
        await Promise.all([...this.#batchLanes.values()].map(({ mutex }) => mutex.close()));

        await this.#interactions.empty;
    }

    async [Symbol.asyncDispose]() {
        await this.close();
    }

    get subscriptions() {
        if (this.#subscriptions === undefined) {
            this.#subscriptions = this.#environment.get(ClientSubscriptions);
        }
        return this.#subscriptions;
    }

    /**
     * Read attributes and events.
     */
    async *read(request: ClientRead, session?: SessionT, extraAbort?: AbortSignal): ReadResult {
        const readPathsCount = (request.attributeRequests?.length ?? 0) + (request.eventRequests?.length ?? 0);
        if (readPathsCount > this.#exchangeProvider.readPathsSupported) {
            logger.info(
                `Read interactions with more than ${this.#exchangeProvider.readPathsSupported} paths might be not allowed by the device. Consider splitting them into several read requests.`,
            );
        }

        await using context = await this.#begin("reading", request, session, extraAbort);
        const { abort, messenger } = context;

        logger.info("Read", Mark.OUTBOUND, messenger.exchange.via, session?.logContext ?? "", request);
        await messenger.sendReadRequest(request, { abort });

        let attributeReportCount = 0;
        let eventReportCount = 0;

        const leftOverData = new Array<TypeFromSchema<typeof TlvAttributeReport>>();
        for await (const report of messenger.readDataReports({ abort })) {
            attributeReportCount += report.attributeReports?.length ?? 0;
            eventReportCount += report.eventReports?.length ?? 0;
            yield InputChunk(report, leftOverData);
            abort.throwIfAborted();
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
     * Probe the peer with an empty read to verify session liveness.
     *
     * Optionally sends to a different address than the session's current one via {@link addressOverride},
     * without affecting other exchanges on the session.
     *
     * @returns true if the probe succeeded, false otherwise
     */
    async probe(options?: ClientProbeOptions): Promise<boolean> {
        if (this.#abort.aborted) {
            return false;
        }

        const abort = new Abort({ abort: [options?.abort, this.#abort] });

        let messenger: InteractionClientMessenger;
        try {
            messenger = await InteractionClientMessenger.create(this.#exchangeProvider, {
                network: options?.network ?? this.#network,
                abort,
                addressOverride: options?.addressOverride,
                requireExistingSession: true,
            });
        } catch {
            abort[Symbol.dispose]();
            return false;
        }

        logger.info("Probe", Mark.OUTBOUND, messenger.exchange.via);

        try {
            await messenger.sendReadRequest(Read({ fabricFilter: false }), {
                abort,
                suppressPeerLoss: options?.suppressPeerLoss,
                maxRetransmissions: options?.maxRetransmissions,
            });
            for await (const _report of messenger.readDataReports({ abort }));
            logger.info(
                "Probe",
                Mark.INBOUND,
                messenger.exchange.via,
                messenger.exchange.diagnostics,
                Diagnostic.weak("(success)"),
            );
            return true;
        } catch {
            if (!abort.aborted) {
                logger.info(
                    "Probe",
                    Mark.INBOUND,
                    messenger.exchange.via,
                    messenger.exchange.diagnostics,
                    Diagnostic.weak("(failed)"),
                );
            }
            return false;
        } finally {
            await messenger.close();
            abort[Symbol.dispose]();
        }
    }

    /**
     * Write to node attributes.
     */
    async write<T extends ClientWrite>(request: T, session?: SessionT): WriteResult<T> {
        await using context = await this.#begin("writing", request, session);
        const { abort, messenger } = context;

        if (request.timedRequest) {
            await messenger.sendTimedRequest(request.timeout ?? DEFAULT_TIMED_REQUEST_TIMEOUT, { abort });
        }

        logger.info(
            "Write",
            Mark.OUTBOUND,
            messenger.exchange.via,
            peerAddressDiagnostic(messenger.exchange.session),
            request,
        );

        const response = await messenger.sendWriteCommand(request, { abort });
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
                    received: true,
                } satisfies WriteResult.AttributeStatus;
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
        const { abort, messenger } = context;

        if (request.timedRequest) {
            await messenger.sendTimedRequest(request.timeout ?? DEFAULT_TIMED_REQUEST_TIMEOUT, { abort });
        }

        logger.info(
            "Invoke",
            Mark.OUTBOUND,
            messenger.exchange.via,
            peerAddressDiagnostic(messenger.exchange.session),
            Diagnostic.asFlags({ suppressResponse: request.suppressResponse, timed: request.timedRequest }),
            Diagnostic.dict({
                delayReport:
                    request.delayReportData === undefined
                        ? undefined
                        : `${Duration.format(Millis(request.delayReportData.delayMinMs))}/${Duration.format(Millis(request.delayReportData.delayJitterWindowMs))}`,
            }),
            request,
        );

        // Per spec, commandRef is only defined for multi-command messages; servers without batch-invoke
        // support do not echo it, so keep it off the wire and correlate single commands by position.
        const isSingleCommand = request.invokeRequests.length === 1;
        const singleCommandRef = isSingleCommand ? request.invokeRequests[0].commandRef : undefined;
        let wireRequest = request;
        if (singleCommandRef !== undefined) {
            wireRequest = { ...request, invokeRequests: [{ ...request.invokeRequests[0], commandRef: undefined }] };
        }

        const { expectedProcessingTime, useExtendedFailSafeMessageResponseTimeout } = request;
        const result = await messenger.sendInvokeCommand(wireRequest, {
            expectedProcessingTime:
                expectedProcessingTime ??
                (useExtendedFailSafeMessageResponseTimeout
                    ? DEFAULT_MINIMUM_RESPONSE_TIMEOUT_WITH_FAILSAFE
                    : undefined),
            abort,
        });
        if (!request.suppressResponse) {
            const chunk = new Array<InvokeResult.DecodedData>();

            for (const response of result?.invokeResponses ?? []) {
                if (response.command !== undefined) {
                    const {
                        commandPath: { endpointId, clusterId, commandId },
                        commandRef: responseRef,
                        commandFields,
                    } = response.command;
                    const commandRef = isSingleCommand ? singleCommandRef : responseRef;
                    const cmd = request.commands.get(commandRef);
                    if (!cmd) {
                        logger.warn(
                            `Discarding unexpected invoke response for commandRef ${commandRef} (endpoint ${endpointId}, cluster ${clusterId}, command ${commandId})`,
                        );
                        continue;
                    }
                    let responseSchema: TlvSchema<any>;
                    if (Invoke.isLegacy(cmd)) {
                        responseSchema = cmd.command.responseSchema ?? TlvVoid;
                    } else {
                        const command = Invoke.commandOf(cmd);
                        const responseModel = command.schema.responseModel;
                        responseSchema = responseModel ? (TlvOfModel(responseModel) ?? TlvVoid) : TlvVoid;
                    }
                    if (commandFields === undefined && responseSchema !== TlvVoid) {
                        logger.warn(
                            `Discarding invoke response without mandated payload for commandRef ${commandRef} (endpoint ${endpointId}, cluster ${clusterId}, command ${commandId})`,
                        );
                        continue;
                    }

                    const data = commandFields === undefined ? undefined : responseSchema?.decodeTlv(commandFields);

                    logger.info(
                        "Invoke",
                        Mark.INBOUND,
                        messenger.exchange.via,
                        messenger.exchange.diagnostics,
                        Diagnostic.strong(Invoke.isLegacy(cmd) ? "(legacy)" : resolvePathForSpecifier(cmd)),
                        isObject(data) ? Diagnostic.dict(data) : Diagnostic.weak("(no payload)"),
                    );

                    chunk.push({
                        kind: "cmd-response",
                        path: {
                            endpointId: endpointId!,
                            clusterId,
                            commandId,
                        },
                        commandRef,
                        data,
                    });
                } else if (response.status !== undefined) {
                    const {
                        commandPath: { endpointId, clusterId, commandId },
                        commandRef: responseRef,
                        status: { status, clusterStatus },
                    } = response.status;
                    const commandRef = isSingleCommand ? singleCommandRef : responseRef;
                    const cmd = request.commands.get(commandRef);
                    if (cmd) {
                        logger.info(
                            "Invoke",
                            Mark.INBOUND,
                            messenger.exchange.via,
                            messenger.exchange.diagnostics,
                            Diagnostic.strong(Invoke.isLegacy(cmd) ? "(legacy)" : resolvePathForSpecifier(cmd)),
                            Diagnostic.dict({ status: `${Status[status]} (${status})`, clusterStatus }),
                        );
                    }

                    chunk.push({
                        kind: "cmd-status",
                        path: {
                            endpointId: endpointId!,
                            clusterId,
                            commandId,
                        },
                        commandRef,
                        status,
                        clusterStatus,
                        received: true,
                    });
                }
            }

            const respondedRefs = new Set(chunk.map(entry => entry.commandRef));
            for (const [commandRef] of request.commands) {
                if (respondedRefs.has(commandRef)) {
                    continue;
                }
                const invokeRequest = request.invokeRequests.find(ir => ir.commandRef === commandRef);
                if (invokeRequest === undefined) {
                    continue;
                }
                const { endpointId, clusterId, commandId } = invokeRequest.commandPath;
                if (endpointId === undefined) {
                    // A wildcard command has no concrete path to report a synthesized status against; the server
                    // simply returns no response entry when nothing matches.
                    continue;
                }
                logger.warn(
                    `No invoke response received for commandRef ${commandRef} (endpoint ${endpointId}, cluster ${clusterId}, command ${commandId}); reporting NoCommandResponse`,
                );
                chunk.push({
                    kind: "cmd-status",
                    path: {
                        endpointId,
                        clusterId,
                        commandId,
                    },
                    commandRef,
                    status: Status.NoCommandResponse,
                    clusterStatus: undefined,
                });
            }

            yield chunk;
            abort.throwIfAborted();
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
        // Batches of zero would never consume a command and allocate without end
        if (maxPathsPerInvoke < 1) {
            throw new InternalError(`Cannot split an invoke into batches of ${maxPathsPerInvoke} paths`);
        }

        // Split commands into batches
        const allCommands = [...request.commands.entries()];
        const batches = new Array<ClientInvoke["commands"]>();

        for (let i = 0; i < allCommands.length; i += maxPathsPerInvoke) {
            const batchEntries = allCommands.slice(i, i + maxPathsPerInvoke);
            batches.push(new Map(batchEntries));
        }

        // Create async iterators for each batch and merge results as they arrive
        const iterators = batches.map(batchCommands => {
            const batchInvokeRequests = request.invokeRequests.filter(ir => batchCommands.has(ir.commandRef));
            const batchRequest: ClientInvoke = {
                ...request,
                commands: batchCommands,
                invokeRequests: batchInvokeRequests,
                [Diagnostic.value]: () =>
                    Diagnostic.list(
                        [...batchCommands.values()].map(cmd => {
                            const { commandRef } = cmd;
                            const fields = "fields" in cmd ? cmd.fields : undefined;
                            return [
                                Diagnostic.strong(Invoke.isLegacy(cmd) ? "(legacy)" : resolvePathForSpecifier(cmd)),
                                "with",
                                isObject(fields) ? Diagnostic.dict(fields) : "(no payload)",
                                commandRef !== undefined && batchCommands.size > 1 ? `(ref ${commandRef})` : "",
                            ];
                        }),
                    ),
            };
            return this.#invokeSingle(batchRequest, session);
        });

        yield* AsyncIterator.merge(iterators, "One or more invoke batches failed");
    }

    /**
     * Invoke one or more commands.
     *
     * When the number of commands exceeds the peer's MaxPathsPerInvoke limit (or 1 for older nodes),
     * commands are split across multiple parallel exchanges automatically.
     *
     * Single commands are automatically batched with other commands invoked in the same timer tick
     * when the device supports multiple invokes per exchange and the target is not endpoint 0.  A command that sets
     * per-request options (such as an expected processing time, an address override or timed/suppressResponse
     * flags) is sent on its own so it keeps them, and batches are formed and sent per network.  A command sent on
     * its own goes out at once while batched commands wait for the batch timer, and batches of different networks
     * do not wait for each other, so the order on the wire can differ from the call order.
     */
    async *invoke(request: ClientInvoke, session?: SessionT): DecodedInvokeResult {
        if (request.largeMessage === undefined && inferLargeMessage(request)) {
            // Copy instead of mutating the caller-owned request
            request = { ...request, largeMessage: true };
        }

        const maxPathsPerInvoke = this.#exchangeProvider.maxPathsPerInvoke ?? 1;

        // Batching buys nothing when the peer only accepts one path per invoke.  A Large Message Quality request is
        // never batched but may still be split below, which carries largeMessage to each part and so forces TCP in
        // #begin.
        if (maxPathsPerInvoke > 1 && isBatchable(request)) {
            yield* this.#invokeWithBatching(request, session);
            return;
        }

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
    async *#invokeWithBatching(request: ClientInvoke, session?: SessionT): DecodedInvokeResult {
        if (this.#abort.aborted) {
            throw new ImplementationError("Client interaction unavailable after close");
        }

        if (request.abort?.aborted) {
            throw new AbortedError();
        }

        using commandAbort = Abort.any(session?.abort, request.abort);

        // Validate peer connectivity before queuing — respects connectionTimeout and abort. Establishing the
        // connection is where a command addressed to an unreachable peer spends its time.
        await this.#exchangeProvider.connect({
            connectionTimeout: session?.connectionTimeout,
            abort: commandAbort.signal,
        });
        if (this.#closeReason !== undefined) {
            throw this.#closeReason;
        }

        const lane = this.#batchLaneFor(request.network ?? this.#network);
        const cmd = [...request.commands.values()][0];
        const commandRef = this.#allocateCommandRef(lane);
        const { endpointId, clusterId, commandId } = request.invokeRequests[0].commandPath;
        const pathKey = `${endpointId}-${clusterId}-${commandId}`;
        const { promise, resolver, rejecter } = createPromise<InvokeResult.DecodedData | undefined>();

        const pending: PendingCommand = {
            request: { ...cmd, commandRef } as Invoke.ConcreteCommandRequest<any>,
            pathKey,
            abort: commandAbort.signal,
            resolve: resolver,
            reject: rejecter,
        };

        lane.pending.set(commandRef, pending);

        // A batch carries commands of several callers, so an abort belongs to its own command: it rejects that one
        // and leaves the batch to the others.
        if (commandAbort.aborted) {
            lane.pending.delete(commandRef);
            throw new AbortedError();
        }
        const onAbort = () => {
            pending.aborted = true;
            lane.pending.delete(commandRef);
            pending.reject(new AbortedError());
        };
        commandAbort.addEventListener("abort", onAbort, { once: true });
        pending.cleanup = () => commandAbort.removeEventListener("abort", onAbort);

        const duration = request.batchDuration || Instant;

        if (lane.timer?.isRunning) {
            // Restart with a shorter duration if the new command needs a faster flush than the remaining time
            const remaining = lane.timer.interval - (lane.timer.elapsed?.time ?? 0);
            if (duration < remaining) {
                lane.timer.stop();
                lane.timer.interval = duration;
                lane.timer.start();
            }
        } else {
            if (!lane.timer) {
                lane.timer = Time.getTimer("invoke-batch", duration, () => this.#flushBatch(lane));
            } else {
                lane.timer.interval = duration;
            }
            lane.timer.start();
        }

        try {
            const entry = await promise;
            if (entry !== undefined) {
                yield [entry];
            }
        } finally {
            pending.cleanup?.();
        }
    }

    #batchLaneFor(network: string | undefined) {
        let lane = this.#batchLanes.get(network);
        if (lane === undefined) {
            lane = { network, pending: new Map(), mutex: new Mutex(this) };
            this.#batchLanes.set(network, lane);
        }
        return lane;
    }

    #allocateCommandRef(lane: BatchLane): number {
        const startRef = this.#nextCommandRef;

        do {
            const ref = this.#nextCommandRef;
            this.#nextCommandRef = this.#nextCommandRef >= MAX_COMMAND_REF ? 1 : this.#nextCommandRef + 1;

            if (!lane.pending.has(ref)) {
                return ref;
            }
        } while (this.#nextCommandRef !== startRef);

        throw new ImplementationError("No available commandRef values");
    }

    async #flushBatch(lane: BatchLane) {
        if (lane.pending.size === 0) {
            return;
        }

        // Snapshot current commands and clear for next batch
        const commands = new Map(lane.pending);
        lane.pending.clear();

        // Partition into sub-batches with unique command paths per batch
        const batches = this.#partitionBatch(commands);

        for (const batch of batches) {
            try {
                await lane.mutex.produce(async () => {
                    await this.#executeBatch(batch, lane.network);
                });
            } catch (error) {
                // Mutex may be closed during shutdown — reject remaining commands with the close reason
                const reason = this.#closeReason ?? asError(error);
                for (const [, pending] of batch) {
                    pending.reject(reason);
                }
            }
        }
    }

    /**
     * Partition commands into sub-batches where each sub-batch has unique command paths.
     * Uses greedy fill: each command goes into the first batch that doesn't already contain its path.
     */
    #partitionBatch(commands: Map<number, PendingCommand>): Map<number, PendingCommand>[] {
        if (commands.size <= 1) {
            return [commands];
        }

        const batches: { paths: Set<string>; commands: Map<number, PendingCommand> }[] = [];

        for (const [ref, pending] of commands) {
            let placed = false;
            for (const batch of batches) {
                if (!batch.paths.has(pending.pathKey)) {
                    batch.paths.add(pending.pathKey);
                    batch.commands.set(ref, pending);
                    placed = true;
                    break;
                }
            }
            if (!placed) {
                batches.push({
                    paths: new Set([pending.pathKey]),
                    commands: new Map([[ref, pending]]),
                });
            }
        }

        return batches.map(b => b.commands);
    }

    async #executeBatch(commands: Map<number, PendingCommand>, network: string | undefined) {
        let releaseAbortListeners: (() => void) | undefined;
        try {
            // Filter out commands aborted between snapshot and send
            for (const [ref, pending] of commands) {
                if (pending.aborted) {
                    commands.delete(ref);
                }
            }

            if (commands.size === 0) {
                return;
            }

            const commandList = [...commands.values()];
            const invokeRequests = commandList.map(c => c.request);

            logger.debug(`Executing ${invokeRequests.length} command(s)`);

            // Use #invokeSingle directly to avoid re-entering the batching path in invoke()
            // Skip validation: already validated on submit. timed=false: only non-timed commands
            // reach this path (isBatchable); prevents Invoke() spec-based auto-promotion.
            // A batch outlives the caller of any one of its commands, so it stops sending only once
            // every command in it has been abandoned — until then the others still want the peer's
            // answer.
            const batchAbort = new AbortController();
            const commandSignals = commandList.map(({ abort }) => abort);
            // Per command, not per signal: two commands may share one signal, and a listener
            // registered twice with the same callback counts once, which would strand the batch
            // one abandonment short of stopping.
            let unabandoned = commandSignals.filter(signal => !signal.aborted).length;
            const releases = new Array<() => void>();
            for (const signal of commandSignals) {
                if (signal.aborted) {
                    continue;
                }
                const onCommandAbort = () => {
                    if (--unabandoned === 0) {
                        batchAbort.abort(new AbortedError());
                    }
                };
                signal.addEventListener("abort", onCommandAbort, { once: true });
                releases.push(() => signal.removeEventListener("abort", onCommandAbort));
            }
            releaseAbortListeners = () => releases.forEach(release => release());

            if (unabandoned === 0) {
                batchAbort.abort(new AbortedError());
            }

            const batchRequest = {
                ...Invoke({ commands: invokeRequests, skipValidation: true, timed: false }),
                network,
                abort: batchAbort.signal,
            } satisfies ClientInvoke;
            const maxPathsPerInvoke = this.#exchangeProvider.maxPathsPerInvoke ?? 1;
            const chunks =
                invokeRequests.length > maxPathsPerInvoke
                    ? this.#invokeWithSplitting(batchRequest, maxPathsPerInvoke)
                    : this.#invokeSingle(batchRequest);

            for await (const chunk of chunks) {
                for (const entry of chunk) {
                    const pending = commands.get(entry.commandRef!);
                    if (!pending) {
                        if (entry.commandRef !== undefined) {
                            logger.info(`Response for aborted commandRef ${entry.commandRef} discarded`);
                        } else {
                            logger.warn(`Received response for unknown commandRef ${entry.commandRef}`);
                        }
                        continue;
                    }
                    commands.delete(entry.commandRef!);

                    if (pending.aborted) {
                        logger.info(`Response for aborted command discarded`);
                        continue;
                    }

                    pending.resolve(entry);
                }
            }

            // Resolve any remaining commands with undefined (valid for suppressResponse)
            for (const [, pending] of commands) {
                if (!pending.aborted) {
                    pending.resolve(undefined);
                }
            }
        } catch (error) {
            for (const [, pending] of commands) {
                if (!pending.aborted) {
                    pending.reject(asError(error));
                }
            }
        } finally {
            releaseAbortListeners?.();
        }
    }

    /**
     * Subscribe to attribute values and events.
     */
    async subscribe<T extends ClientSubscribe>(request: T, session?: SessionT): SubscriptionResult<T> {
        let interactionSession = session;

        const subscriptionPathsCount = (request.attributeRequests?.length ?? 0) + (request.eventRequests?.length ?? 0);
        if (subscriptionPathsCount === 0) {
            throw new ImplementationError("When subscribing to attributes and events, at least one must be specified.");
        }
        if (subscriptionPathsCount > this.#exchangeProvider.subscribePathsSupported) {
            logger.info(
                `Subscribe interactions with more than ${this.#exchangeProvider.subscribePathsSupported} paths might be not allowed by the device.`,
            );
        }

        const peer = this.#exchangeProvider.peerAddress;
        if (peer === undefined) {
            throw new ImplementationError("Subscription unavailable because peer is uncommissioned");
        }

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

        const subscribe = async (request: ClientSubscribe, extraAbort?: AbortSignal) => {
            await using context = await this.#begin("subscribing", request, interactionSession, extraAbort);
            const { abort, messenger } = context;

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

            let responseMessage: Message;
            try {
                await messenger.sendSubscribeRequest(
                    {
                        ...request,
                        minIntervalFloorSeconds: Seconds.of(minIntervalFloor),
                        maxIntervalCeilingSeconds: Seconds.of(maxIntervalCeiling),
                    },
                    { abort },
                );

                await this.#handleSubscriptionResponse(request, readChunks(messenger, abort));
                abort.throwIfAborted();

                responseMessage = await messenger.nextMessage(MessageType.SubscribeResponse, { abort });
            } catch (error) {
                // The request may have reached the peer even if its send failed; unless the peer or the session ended the
                // interaction, the peer may hold the subscription and its report may still come
                const awaitReport = !causedBy(
                    error,
                    PeerCommunicationError,
                    SessionClosedError,
                    ReceivedStatusResponseError,
                );
                context.abandon(closing => messenger.abandonSubscription({ awaitReport, abort: closing }));
                throw error;
            }
            const response = TlvSubscribeResponse.decode(responseMessage.payload);

            const subscription = new PeerSubscription({
                lifetime: this.subscriptions,
                request,
                peer,
                closed: () => this.subscriptions.delete(subscription),
                response,
                abort,
                maxPeerResponseTime: this.maximumPeerResponseTime(SUBSCRIPTION_PROCESSING_TIME),
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

        const read = (request: Read, extraAbort?: AbortSignal, logContext?: ExchangeLogContext) => {
            let readSession = interactionSession;
            if (logContext !== undefined) {
                readSession = {
                    ...readSession,
                    logContext: readSession?.logContext ? { ...readSession.logContext, ...logContext } : logContext,
                } as SessionT;
            }
            return this.read(request, readSession, extraAbort);
        };

        let subscription: ClientSubscription;
        if (request.sustain) {
            // For sustained subscriptions, the connection process should not time out; it should only stop on abort.
            // Update interactionSession BEFORE constructing SustainedSubscription so closures see the correct value
            interactionSession = { ...interactionSession, connectionTimeout: Forever } as SessionT;

            subscription = new SustainedSubscription({
                lifetime: this.subscriptions,
                subscribe,
                peer,
                closed: () => this.subscriptions.delete(subscription),
                request,
                // Both, or an abort by the caller would end only the attempt in flight while the
                // sustainer treats that as a failure to retry
                abort: [session?.abort, request.abort],
                retries: this.#sustainRetries,
                read,
                probe: abort =>
                    this.#exchangeProvider.channelType === ChannelType.TCP
                        ? // TCP evicts the session when its connection drops, so no liveness probe is needed.
                          Promise.resolve(true)
                        : this.#exchangeProvider.verifyReachability({ reason: "session-suspect", abort }),
                wakefulness: request.icdWakefulness,
                peerFed: request.icdPeerFed,
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
        // Registered before the exchange exists, so close() waits for a creation in progress, which it aborts
        const entry = Symbol("bdx");
        this.#interactions.add(entry);
        const abort = new Abort({ abort: [session?.abort, this.#abort] });
        let messenger: BdxMessenger;
        try {
            messenger = await BdxMessenger.create(this.#exchangeProvider, request.messageTimeout, abort.signal);
        } catch (e) {
            this.#interactions.delete(entry);
            abort[Symbol.dispose]();
            throw e;
        }

        const context: RequestContext<BdxMessenger> = {
            abort,
            messenger,
            [Symbol.asyncDispose]: async () => {
                try {
                    await messenger.close();
                } finally {
                    this.#interactions.delete(entry);
                    abort[Symbol.dispose]();
                }
            },
        };

        try {
            abort.throwIfAborted();
        } catch (e) {
            await context[Symbol.asyncDispose]();
            throw e;
        }

        return { context };
    }

    async #begin(
        what: string,
        request: ClientRead | ClientWrite | ClientInvoke | ClientSubscribe,
        session: InteractionSession | undefined,
        extraAbort?: AbortSignal,
    ) {
        // Ownership of lifetime transfers to the returned context; do not use `using` here as
        // that would dispose prematurely when #begin returns, creating a zombie in the spans Set
        const lifetime = this.#lifetime.join(what);

        const requiredTransport = request.largeMessage ? ChannelType.TCP : undefined;

        let abort: Abort;
        let messenger: InteractionClientMessenger;
        try {
            if (this.#abort.aborted) {
                throw new ImplementationError(
                    `Cannot start ${what} ${this.#address ?? this.#exchangeProvider.peerAddress ?? "uncommissioned node"} because interactable is closed`,
                );
            }

            abort = new Abort({ abort: [session?.abort, this.#abort, extraAbort, request.abort] });

            try {
                messenger = await InteractionClientMessenger.create(this.#exchangeProvider, {
                    network: request.network ?? this.#network,
                    additionalMrpDelay: request.additionalMrpDelay,
                    abort,
                    connectionTimeout: session?.connectionTimeout,
                    addressOverride: request.addressOverride,
                    requiredTransport,
                });
            } catch (e) {
                abort[Symbol.dispose]();
                throw e;
            }
        } catch (e) {
            lifetime[Symbol.dispose]();
            throw e;
        }

        const entry = Symbol(what);
        this.#interactions.add(entry);

        // Provide via dynamically so is up to date if exchange changes due to retry
        Object.defineProperty(lifetime.details, "via", {
            get() {
                return messenger.exchange.via;
            },
        });

        const dispose = async () => {
            using _closing = lifetime.closing();
            try {
                await messenger.close();
            } finally {
                this.#interactions.delete(entry);
                abort[Symbol.dispose]();
            }
        };
        let state: "active" | "abandoned" | "disposed" = "active";
        const context: AbandonableRequestContext = {
            abort,
            messenger,
            abandon: task => {
                if (state !== "active") {
                    throw new InternalError(`Cannot abandon ${what} interaction that is already ${state}`);
                }
                state = "abandoned";
                const finish = async () => {
                    try {
                        await task(this.#abort.signal);
                    } finally {
                        await dispose();
                    }
                };
                finish().catch(error =>
                    logger.debug(messenger.exchange.via, "Error finishing interaction in the background", error),
                );
            },
            [Symbol.asyncDispose]: async () => {
                if (state === "active") {
                    state = "disposed";
                    await dispose();
                }
            },
        };

        try {
            abort.throwIfAborted();
        } catch (e) {
            await context[Symbol.asyncDispose]();
            throw e;
        }

        return context;
    }

    get channelType() {
        return this.#exchangeProvider.channelType;
    }

    /** Dedicated secure session backing this interaction, if the provider exposes one. */
    get session() {
        return this.#exchangeProvider.session;
    }

    /** Calculates the current maximum response time for a message use in additional logic like timers. */
    maximumPeerResponseTime(expectedProcessingTime?: Duration, includeMaximumSendingTime = false) {
        return this.#exchangeProvider.maximumPeerResponseTime(expectedProcessingTime, includeMaximumSendingTime);
    }

    get address() {
        if (this.#address === undefined) {
            throw new ImplementationError("Uncommissioned node has no peer address");
        }
        return this.#address;
    }
}

export interface RequestContext<M extends InteractionClientMessenger | BdxMessenger = InteractionClientMessenger> {
    abort: Abort;
    messenger: M;

    [Symbol.asyncDispose](): Promise<void>;
}

/**
 * The context of an interaction whose remainder can outlive the caller's scope.
 */
export interface AbandonableRequestContext extends RequestContext<InteractionClientMessenger> {
    /**
     * Hands the rest of the interaction to `task`, which runs in the background.  Disposal then waits for the task
     * instead of the caller's scope, and {@link ClientInteraction.close} waits for it.  Caller and session aborts do not
     * reach the task; only {@link ClientInteraction.close} stops it, through the signal it gets.  The task must settle
     * soon after `closing` fires, or close never returns.
     *
     * @throws InternalError when the context was already abandoned or disposed
     */
    abandon(task: (closing: AbortSignal) => Promise<void>): void;
}

/**
 * Options for {@link ClientInteraction.probe}.
 */
export interface ClientProbeOptions {
    /** Network profile to use for the probe exchange. */
    network?: string;

    /** Override the destination address for the probe without changing the session's channel. */
    addressOverride?: ServerAddressUdp;

    /** Abort signal for the probe. */
    abort?: AbortSignal;

    /** Suppress peer-loss reporting so the session stays alive even if the probe fails. */
    suppressPeerLoss?: boolean;

    /** Cap MRP transmission attempts for this probe (default: MRP.MAX_TRANSMISSIONS). */
    maxRetransmissions?: number;
}

async function* readChunks(messenger: InteractionClientMessenger, abort: Abort) {
    const leftOverData = new Array<TypeFromSchema<typeof TlvAttributeReport>>();
    for await (const report of messenger.readDataReports({ abort })) {
        yield InputChunk(report, leftOverData);
        abort.throwIfAborted();
    }
}
