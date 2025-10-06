/**
 * @license
 * Copyright 2022-2025 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { Interactable, InteractionSession } from "#action/Interactable.js";
import { Invoke } from "#action/request/Invoke.js";
import { Read } from "#action/request/Read.js";
import { Subscribe } from "#action/request/Subscribe.js";
import { Write } from "#action/request/Write.js";
import { InvokeResult } from "#action/response/InvokeResult.js";
import { ReadResult } from "#action/response/ReadResult.js";
import { SubscribeResult } from "#action/response/SubscribeResult.js";
import { WriteResult } from "#action/response/WriteResult.js";
import { BasicSet, Environment, Environmental, ImplementationError, PromiseQueue, Seconds } from "#general";
import { InteractionClientMessenger, MessageType } from "#interaction/InteractionMessenger.js";
import { InteractionQueue } from "#peer/InteractionQueue.js";
import { ExchangeProvider } from "#protocol/ExchangeProvider.js";
import { TlvSubscribeResponse } from "#types";
import { ClientSubscriptions } from "./ClientSubscriptions.js";
import { InputChunk } from "./InputChunk.js";

export interface ClientInteractionContext {
    exchanges: ExchangeProvider;
    subscriptions: ClientSubscriptions;
    queue: PromiseQueue;
}

export const DEFAULT_MIN_INTERVAL_FLOOR = Seconds(1);

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
        try {
            this.#begin(request);
            const messenger = await InteractionClientMessenger.create(this.#exchanges);

            await messenger.sendReadRequest(request);

            for await (const report of messenger.readDataReports()) {
                yield InputChunk(report);
            }
        } finally {
            this.#end(request);
        }
    }

    async write<T extends Write>(request: T, _session?: SessionT): WriteResult<T> {
        let messenger: undefined | InteractionClientMessenger;
        try {
            this.#begin(request);
            messenger = await InteractionClientMessenger.create(this.#exchanges);
            const response = await messenger.sendWriteCommand(request);
            if (request.suppressResponse) {
                return undefined as Awaited<WriteResult<T>>;
            }
            if (!response || !response.writeResponses?.length) {
                return new Array<WriteResult.AttributeStatus>() as Awaited<WriteResult<T>>;
            } else {
                return response.writeResponses.map(
                    ({
                        path: { nodeId, endpointId, clusterId, attributeId, listIndex },
                        status: { status, clusterStatus },
                    }) => ({
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
                    }),
                ) as Awaited<WriteResult<T>>;
            }
        } finally {
            await messenger?.close();
            this.#end(request);
        }
    }

    async *invoke(request: Invoke, _session?: SessionT): InvokeResult {
        let messenger: undefined | InteractionClientMessenger;
        try {
            this.#begin(request);
            messenger = await InteractionClientMessenger.create(this.#exchanges);
            const result = await messenger.sendInvokeCommand(request);
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
                                const res: InvokeResult.CommandResponse = {
                                    kind: "cmd-response",
                                    path: {
                                        endpointId: endpointId!,
                                        clusterId: clusterId,
                                        commandId: commandId,
                                    },
                                    commandRef,
                                    data: commandFields!, // TODO add decoding
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
        let messenger: undefined | InteractionClientMessenger;
        try {
            this.#begin(request);

            messenger = await InteractionClientMessenger.create(this.#exchanges);

            await messenger.sendSubscribeRequest({
                minIntervalFloorSeconds: Seconds.of(DEFAULT_MIN_INTERVAL_FLOOR),
                maxIntervalCeilingSeconds: Seconds.of(DEFAULT_MIN_INTERVAL_FLOOR), // TODO use better max fallback
                ...request,
            });

            await this.#handleSubscriptionResponse(request, readChunks(messenger));

            const responseMessage = await messenger.nextMessage(MessageType.SubscribeResponse);
            const response = TlvSubscribeResponse.decode(responseMessage.payload);

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
