/**
 * @license
 * Copyright 2022-2025 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { Interactable, InteractionSession } from "#action/Interactable.js";
import { ClientInvoke, Invoke } from "#action/request/Invoke.js";
import { Read } from "#action/request/Read.js";
import { resolvePathForSpecifier } from "#action/request/Specifier.js";
import { Subscribe } from "#action/request/Subscribe.js";
import { Write } from "#action/request/Write.js";
import { DecodedInvokeResult, InvokeResult } from "#action/response/InvokeResult.js";
import { ReadResult } from "#action/response/ReadResult.js";
import { WriteResult } from "#action/response/WriteResult.js";
import {
    Abort,
    BasicSet,
    Diagnostic,
    Duration,
    Entropy,
    Environment,
    ImplementationError,
    isObject,
    Logger,
    Minutes,
    RetrySchedule,
    Seconds,
} from "#general";
import { InteractionClientMessenger, MessageType } from "#interaction/InteractionMessenger.js";
import { ExchangeProvider } from "#protocol/ExchangeProvider.js";
import { SecureSession } from "#session/SecureSession.js";
import { Status, TlvAttributeReport, TlvNoResponse, TlvSubscribeResponse, TypeFromSchema } from "#types";
import { InputChunk } from "./InputChunk.js";
import { ClientSubscribe } from "./subscription/ClientSubscribe.js";
import { ClientSubscription } from "./subscription/ClientSubscription.js";
import { ClientSubscriptions } from "./subscription/ClientSubscriptions.js";
import { PeerSubscription } from "./subscription/PeerSubscription.js";
import { SustainedSubscription } from "./subscription/SustainedSubscription.js";

const logger = Logger.get("ClientInteraction");

export interface ClientInteractionContext {
    environment: Environment;
    abort?: Abort.Signal;
    sustainRetries?: RetrySchedule.Configuration;
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
export class ClientInteraction<SessionT extends InteractionSession = InteractionSession>
    implements Interactable<SessionT>
{
    readonly #exchanges: ExchangeProvider;
    readonly #subscriptions: ClientSubscriptions;
    readonly #interactions = new BasicSet<Read | Write | Invoke | Subscribe>();
    readonly #abort: Abort;
    readonly #sustainRetries: RetrySchedule;

    constructor({ environment, abort, sustainRetries }: ClientInteractionContext) {
        this.#exchanges = environment.get(ExchangeProvider);
        this.#subscriptions = environment.get(ClientSubscriptions);
        this.#abort = Abort.subtask(abort);
        this.#sustainRetries = new RetrySchedule(
            environment.get(Entropy),
            RetrySchedule.Configuration(SustainedSubscription.DefaultRetrySchedule, sustainRetries),
        );
    }

    get session() {
        return this.#exchanges.session;
    }

    async close() {
        this.#abort();

        while (this.#interactions.size) {
            await this.#interactions.deleted;
        }
    }

    get subscriptions() {
        return this.#subscriptions;
    }

    /**
     * Read attributes and events.
     */
    async *read(request: Read, session?: SessionT): ReadResult {
        const readPathsCount = (request.attributeRequests?.length ?? 0) + (request.eventRequests?.length ?? 0);
        if (readPathsCount > 9) {
            logger.debug(
                "Read interactions with more then 9 paths might be not allowed by the device. Consider splitting then into several read requests.",
            );
        }

        await using context = await this.#begin(request, session);
        const { checkAbort, messenger } = context;

        logger.debug("Read »", messenger.exchange.via, request);
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

        logger.debug(
            "Read «",
            messenger.exchange.via,
            Diagnostic.weak(
                attributeReportCount + eventReportCount === 0
                    ? "(empty)"
                    : Diagnostic.dict({ attributes: attributeReportCount, events: eventReportCount }),
            ),
        );
    }

    /**
     * Update node attributes.
     *
     * Writes with the Matter protocol are generally not atomic, so this method only throws if the entire action fails.
     * You must check each {@link WriteResult.AttributeStatus} to determine whether individual updates failed.
     */
    async write<T extends Write>(request: T, session?: SessionT): WriteResult<T> {
        await using context = await this.#begin(request, session);
        const { checkAbort, messenger } = context;

        if (request.timedRequest) {
            await messenger.sendTimedRequest(request.timeout ?? DEFAULT_TIMED_REQUEST_TIMEOUT);
            checkAbort();
        }

        logger.info("Write »", messenger.exchange.via, request);

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
            "Write «",
            messenger.exchange.via,
            Diagnostic.weak(
                successCount + failureCount === 0
                    ? "(empty)"
                    : Diagnostic.dict({ success: successCount, failure: failureCount }),
            ),
        );

        return result;
    }

    /**
     * Invoke one or more commands.
     */
    async *invoke(request: ClientInvoke, session?: SessionT): DecodedInvokeResult {
        await using context = await this.#begin(request, session);
        const { checkAbort, messenger } = context;

        if (request.timedRequest) {
            await messenger.sendTimedRequest(request.timeout ?? DEFAULT_TIMED_REQUEST_TIMEOUT);
            checkAbort();
        }

        logger.info(
            "Invoke »",
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
                                "Invoke «",
                                messenger.exchange.via,
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
     * Subscribe to attribute values and events.
     */
    async subscribe(request: ClientSubscribe, session?: SessionT) {
        const subscriptionPathsCount = (request.attributeRequests?.length ?? 0) + (request.eventRequests?.length ?? 0);
        if (subscriptionPathsCount > 3) {
            logger.debug("Subscribe interactions with more then 3 paths might be not allowed by the device.");
        }

        if (!request.keepSubscriptions) {
            for (const subscription of this.#subscriptions) {
                logger.debug(
                    `Removing subscription with ID ${subscription.subscriptionId} because new subscription replaces it`,
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

        SecureSession.assert(this.#exchanges.session);
        const peer = this.#exchanges.session.peerAddress;

        const subscribe = async (request: ClientSubscribe) => {
            await using context = await this.#begin(request, session);
            const { checkAbort, messenger } = context;

            logger.info(
                "Subscribe »",
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

            logger.info(
                "Subscription successful «",
                messenger.exchange.via,
                Diagnostic.dict({
                    id: response.subscriptionId,
                    interval: Duration.format(Seconds(response.maxInterval)),
                }),
            );

            const subscription = new PeerSubscription({
                request,
                peer,
                closed: () => this.#subscriptions.delete(subscription),
                response,
                abort: session?.abort,
            });
            this.#subscriptions.addPeer(subscription);

            return subscription;
        };

        let subscription: ClientSubscription;
        if (request.sustain) {
            subscription = new SustainedSubscription({
                subscribe,
                peer,
                closed: () => this.#subscriptions.delete(subscription),
                request,
                abort: session?.abort,
                retries: this.#sustainRetries,
            });
        } else {
            subscription = await subscribe(request);
        }

        this.#subscriptions.addActive(subscription);

        return subscription;
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

    async #begin(request: Read | Write | Invoke | Subscribe, session: SessionT | undefined) {
        if (this.#abort.aborted) {
            throw new ImplementationError("Client interaction unavailable after close");
        }
        this.#interactions.add(request);

        const checkAbort = Abort.checkerFor(session);

        const messenger = await InteractionClientMessenger.create(this.#exchanges);

        const context: RequestContext = {
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

        return context;
    }
}

interface RequestContext {
    checkAbort(): void;
    messenger: InteractionClientMessenger;

    [Symbol.asyncDispose](): Promise<void>;
}

async function* readChunks(messenger: InteractionClientMessenger) {
    const leftOverData = new Array<TypeFromSchema<typeof TlvAttributeReport>>();
    for await (const report of messenger.readDataReports()) {
        yield InputChunk(report, leftOverData);
    }
}
