import { RemoteActorContext } from "#behavior/context/server/RemoteActorContext.js";
import { Diagnostic, Logger, NotImplementedError } from "#general";
import { Specification } from "#model";
import {
    AttributeWriteResponse,
    Interactable,
    InteractionServerMessenger,
    Invoke,
    InvokeResponseForSend,
    InvokeResult,
    Mark,
    NodeProtocol,
    Read,
    ReadResult,
    ServerInteraction,
    SessionType,
    Subscribe,
    SubscribeResult,
    Write,
    WriteResponse,
    WriteResult,
} from "#protocol";
import {
    InvokeResponseData,
    StatusCode,
    StatusResponseError,
    TlvAny,
    TlvInvokeResponseData,
    TlvInvokeResponseForSend,
    TypeFromSchema,
} from "#types";

const logger = Logger.get("OnlineServerInteraction");

export class OnlineServerInteraction implements Interactable<RemoteActorContext.Options> {
    readonly #interaction: ServerInteraction;
    readonly #node: NodeProtocol;

    constructor(node: NodeProtocol) {
        this.#node = node;
        this.#interaction = new ServerInteraction(node);
    }

    async *read(request: Read, context: RemoteActorContext.Options): ReadResult {
        const session = RemoteActorContext(context).beginReadOnly();
        try {
            for await (const report of this.#interaction.read(request, session)) {
                yield report;
            }
        } finally {
            session[Symbol.dispose]();
        }
    }

    subscribe(_request: Subscribe, _context: RemoteActorContext.Options): SubscribeResult {
        throw new NotImplementedError("subscribe not implemented");
    }

    /**
     * Process a write-request including chunking messages as needed.
     * Yields write status results while also sending WriteResponses via the messenger.
     */
    async *write(request: Write, context: RemoteActorContext.Options): WriteResult {
        const { exchange, messenger: existingMessenger } = context;
        const messenger = existingMessenger ?? new InteractionServerMessenger(exchange);

        let { writeRequests, moreChunkedMessages, suppressResponse } = request;

        // Create a writer that persists across all chunks to maintain list operation state
        // (REPLACE_ALL followed by ADD needs to track previousProcessedAttributePath)
        let writer: AttributeWriteResponse | undefined;

        // Process chunks until moreChunkedMessages is false
        while (true) {
            // Each write-message needs its own transaction for proper isolation
            const chunkResults = await RemoteActorContext(context).act(async session => {
                const results = new Array<WriteResult.AttributeStatus>();

                if (writer === undefined) {
                    // First chunk: create the writer
                    writer = new AttributeWriteResponse(this.#node, session);
                } else {
                    // Subsequent chunks: update session to maintain the list operation state
                    writer.continueWithSession(session);
                }

                const chunkResult = await writer.process({ writeRequests, suppressResponse } as Write);
                if (chunkResult !== undefined) {
                    results.push(...chunkResult);
                }
                return results;
            });

            // Yield results after session is fully closed
            for (const status of chunkResults) {
                yield [status];
            }

            if (suppressResponse) {
                // Can only have one chunk, no response to send, so we are done.
                break;
            }

            // Send WriteResponse for this chunk
            const chunkResponse: WriteResponse = {
                writeResponses: chunkResults.map(({ path, status, clusterStatus }) => ({
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
                Diagnostic.weak(writeRequests.map(req => this.#node.inspectPath(req.path)).join(", ")),
            ]);

            if (suppressResponse) {
                throw new StatusResponseError(
                    "Multiple chunked messages and SuppressResponse cannot be used together in write messages",
                    StatusCode.InvalidAction,
                );
            }
        }
    }

    /**
     * Handle a complete invoke interaction including chunked responses.
     * Yields invoke results while also sending InvokeResponses via the messenger.
     */
    async *invoke(request: Invoke, context: RemoteActorContext.Options): InvokeResult {
        const { exchange, message, messenger: existingMessenger } = context;
        const { suppressResponse } = request;
        const isGroupSession = message?.packetHeader.sessionType === SessionType.Group;
        const messenger = existingMessenger ?? new InteractionServerMessenger(exchange);

        const session = RemoteActorContext({ ...context, command: true }).open();

        // Track accumulated responses for the current chunk
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
         * Process a single invoke-response result. Accumulates in the current chunk,
         * sends chunk when a message would exceeds the size limit.
         */
        const processResponseResult = async (
            invokeResponse: TypeFromSchema<typeof TlvInvokeResponseData>,
        ): Promise<void> => {
            const encodedInvokeResponse = TlvInvokeResponseData.encodeTlv(invokeResponse);
            const invokeResponseBytes = TlvAny.getEncodedByteLength(encodedInvokeResponse);

            // Check if adding this response would exceed message size
            if (messageSize + invokeResponseBytes > exchange.maxPayloadSize) {
                logger.debug(
                    "Invoke (chunk)",
                    Mark.OUTBOUND,
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

        try {
            // Process invoke requests
            for await (const chunk of this.#interaction.invoke(request, session)) {
                for (const data of chunk) {
                    // Yield data in the internal format
                    yield [data];

                    if (suppressResponse || isGroupSession || chunkedTransmissionTerminated) {
                        // No one cares about responses (anymore), so skip message sending
                        continue;
                    }

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
        } catch (error) {
            await session.reject(error);
        }

        await session.resolve(undefined);

        // Send the final response if needed
        if (!suppressResponse && !isGroupSession && !chunkedTransmissionTerminated) {
            if (request.invokeRequests.length > 1) {
                logger.debug(
                    "Invoke (final)",
                    Mark.OUTBOUND,
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
}
