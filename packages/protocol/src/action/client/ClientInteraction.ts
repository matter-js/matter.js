/**
 * @license
 * Copyright 2022-2025 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { resolvePathForSpecifier } from "#action/index.js";
import { Interactable, InteractionSession } from "#action/Interactable.js";
import { ClientInvoke, Invoke } from "#action/request/Invoke.js";
import { Read } from "#action/request/Read.js";
import { Subscribe } from "#action/request/Subscribe.js";
import { Write } from "#action/request/Write.js";
import { DecodedInvokeResult, InvokeResult } from "#action/response/InvokeResult.js";
import { ReadResult } from "#action/response/ReadResult.js";
import { SubscribeResult } from "#action/response/SubscribeResult.js";
import { WriteResult } from "#action/response/WriteResult.js";
import {
    BasicSet,
    Diagnostic,
    Duration,
    Environment,
    Environmental,
    ImplementationError,
    isObject,
    Logger,
    PromiseQueue,
    Seconds,
} from "#general";
import { InteractionClientMessenger, MessageType } from "#interaction/InteractionMessenger.js";
import { InteractionQueue } from "#peer/InteractionQueue.js";
import { ExchangeProvider } from "#protocol/ExchangeProvider.js";
import { Status, TlvNoResponse, TlvSubscribeResponse } from "#types";
import { ClientSubscriptions } from "./ClientSubscriptions.js";
import { InputChunk } from "./InputChunk.js";

const logger = Logger.get("ClientInteraction");

export interface ClientInteractionContext {
    exchanges: ExchangeProvider;
    subscriptions: ClientSubscriptions;
    queue: PromiseQueue;
}

export const DEFAULT_MIN_INTERVAL_FLOOR = Seconds(1);

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
    readonly #queue?: PromiseQueue;
    readonly #interactions = new BasicSet<Read | Write | Invoke | Subscribe>();
    #closed = false;

    constructor(context: ClientInteractionContext) {
        this.#exchanges = context.exchanges;
        this.#subscriptions = context.subscriptions;
        this.#queue = context.queue;
    }

    async close() {
        this.#closed = true;

        while (this.#interactions.size) {
            await this.#interactions.deleted;
        }
    }

    get subscriptions() {
        return this.#subscriptions;
    }

    get queue() {
        return this.#queue;
    }

    static [Environmental.create](env: Environment) {
        const instance = new ClientInteraction({
            exchanges: env.get(ExchangeProvider),
            subscriptions: env.get(ClientSubscriptions),
            queue: env.get(InteractionQueue),
        });
        env.set(ClientInteraction, instance);
        return instance;
    }

    async *read(request: Read, _session?: SessionT): ReadResult {
        const readPathsCount = (request.attributeRequests?.length ?? 0) + (request.eventRequests?.length ?? 0);
        if (readPathsCount > 9) {
            logger.debug(
                "Read interactions with more then 9 paths might be not allowed by the device. Consider splitting then into several read requests.",
            );
        }

        this.#begin(request);

        let messenger: undefined | InteractionClientMessenger;
        try {
            messenger = await InteractionClientMessenger.create(this.#exchanges);

            logger.debug("Read »", messenger.exchange.via, request);
            await messenger.sendReadRequest(request);

            let attributeReportCount = 0;
            let eventReportCount = 0;

            for await (const report of messenger.readDataReports()) {
                attributeReportCount += report.attributeReports?.length ?? 0;
                eventReportCount += report.eventReports?.length ?? 0;
                yield InputChunk(report);
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
        } finally {
            await messenger?.close();
            this.#end(request);
        }
    }

    /**
     * Write chosen attributes remotely to the node.
     * The returned attribute write status information is returned. No error is thrown for individual attribute write
     * failures.
     */
    async write<T extends Write>(request: T, _session?: SessionT): WriteResult<T> {
        this.#begin(request);

        let messenger: undefined | InteractionClientMessenger;
        try {
            messenger = await InteractionClientMessenger.create(this.#exchanges);

            if (request.timedRequest) {
                await messenger.sendTimedRequest(request.timeout ?? DEFAULT_TIMED_REQUEST_TIMEOUT);
            }

            logger.info("Write »", messenger.exchange.via, request);

            const response = await messenger.sendWriteCommand(request);
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
        } finally {
            await messenger?.close();
            this.#end(request);
        }
    }

    async *invoke(request: ClientInvoke, _session?: SessionT): DecodedInvokeResult {
        this.#begin(request);

        let messenger: InteractionClientMessenger | undefined;
        try {
            messenger = await InteractionClientMessenger.create(this.#exchanges);

            if (request.timedRequest) {
                await messenger.sendTimedRequest(request.timeout ?? DEFAULT_TIMED_REQUEST_TIMEOUT);
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
                                    messenger!.exchange.via,
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
            }
        } finally {
            await messenger?.close();
            this.#end(request);
        }
    }

    async subscribe(request: Subscribe, _session?: SessionT): SubscribeResult {
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

        this.#begin(request);

        let messenger: undefined | InteractionClientMessenger;
        try {
            messenger = await InteractionClientMessenger.create(this.#exchanges);

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
                minIntervalFloorSeconds: Seconds.of(DEFAULT_MIN_INTERVAL_FLOOR),
                maxIntervalCeilingSeconds: Seconds.of(DEFAULT_MIN_INTERVAL_FLOOR), // TODO use better max fallback
                ...request,
            });

            await this.#handleSubscriptionResponse(request, readChunks(messenger));

            const responseMessage = await messenger.nextMessage(MessageType.SubscribeResponse);
            const response = TlvSubscribeResponse.decode(responseMessage.payload);

            logger.info(
                "Subscription successful «",
                messenger.exchange.via,
                Diagnostic.dict({
                    subId: response.subscriptionId,
                    interval: Duration.format(Seconds(response.maxInterval)),
                }),
            );

            return this.#subscriptions.add(request, response);
        } finally {
            await messenger?.close();
            this.#end(request);
        }
    }

    cancelSubscription(id: number) {
        this.#subscriptions.get(id)?.close();
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

    #begin(request: Read | Write | Invoke | Subscribe) {
        if (this.#closed) {
            throw new ImplementationError("Client interaction unavailable after close");
        }
        this.#interactions.add(request);
    }

    #end(request: Read | Write | Invoke | Subscribe) {
        this.#interactions.delete(request);
    }
}

async function* readChunks(messenger: InteractionClientMessenger) {
    for await (const report of messenger.readDataReports()) {
        yield InputChunk(report);
    }
}
