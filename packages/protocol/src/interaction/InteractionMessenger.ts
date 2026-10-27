/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { isAclOrExtensionPath } from "#action/request/Write.js";
import { ReadResult } from "#action/response/ReadResult.js";
import { Mark } from "#common/Mark.js";
import { PeerUnresponsiveError } from "#peer/PeerCommunicationError.js";
import { UnexpectedMessageError } from "#protocol/errors.js";
import {
    asError,
    Bytes,
    causedBy,
    Diagnostic,
    Duration,
    InternalError,
    Logger,
    MatterFlowError,
    Millis,
    NoResponseTimeoutError,
    UnexpectedDataError,
} from "@matter/general";
import { Specification } from "@matter/model";
import {
    AttributeData,
    AttributePath,
    ReceivedStatusResponseError,
    Status,
    StatusResponseError,
    TlvAny,
    TlvAttributeData,
    TlvAttributeStatus,
    TlvBoolean,
    TlvDataReport,
    TlvDataReportForSend,
    TlvDataVersionFilter,
    TlvInvokeRequest,
    TlvInvokeResponse,
    TlvInvokeResponseForSend,
    TlvObject,
    TlvOptionalField,
    TlvReadRequest,
    TlvSchema,
    TlvStatusResponse,
    TlvStream,
    TlvSubscribeRequest,
    TlvSubscribeResponse,
    TlvTimedRequest,
    TlvType,
    TlvWriteRequest,
    TlvWriteResponse,
    TypeFromSchema,
} from "@matter/types";
import { Message, SessionType } from "../codec/MessageCodec.js";
import { ExchangeProvider, NewExchangeOptions } from "../protocol/ExchangeProvider.js";
import { ExchangeReceiveOptions, ExchangeSendOptions, MessageExchange } from "../protocol/MessageExchange.js";
import {
    AttributeReportPayload,
    BaseDataReport,
    canAttributePayloadBeChunked,
    chunkAttributePayload,
    DataReportPayloadIterator,
    encodeAttributePayload,
    encodeAttributePayloadData,
    encodeEventPayload,
    EventReportPayload,
} from "./AttributeDataEncoder.js";
import { Subscription, SubscriptionId } from "./Subscription.js";

export enum MessageType {
    StatusResponse = 0x01,
    ReadRequest = 0x02,
    SubscribeRequest = 0x03,
    SubscribeResponse = 0x04,
    ReportData = 0x05,
    WriteRequest = 0x06,
    WriteResponse = 0x07,
    InvokeRequest = 0x08,
    InvokeResponse = 0x09,
    TimedRequest = 0x0a,
}

export type ReadRequest = TypeFromSchema<typeof TlvReadRequest>;
export type DataReport = TypeFromSchema<typeof TlvDataReport>;
export type SubscribeRequest = TypeFromSchema<typeof TlvSubscribeRequest>;
export type SubscribeResponse = TypeFromSchema<typeof TlvSubscribeResponse>;
export type InvokeRequest = TypeFromSchema<typeof TlvInvokeRequest>;
export type InvokeResponse = TypeFromSchema<typeof TlvInvokeResponse>;
export type InvokeResponseForSend = TypeFromSchema<typeof TlvInvokeResponseForSend>;
export type TimedRequest = TypeFromSchema<typeof TlvTimedRequest>;
export type WriteRequest = TypeFromSchema<typeof TlvWriteRequest>;
export type WriteResponse = TypeFromSchema<typeof TlvWriteResponse>;

const logger = Logger.get("InteractionMessenger");

function isSameAttribute(a: AttributePath, b: AttributePath) {
    return a.endpointId === b.endpointId && a.clusterId === b.clusterId && a.attributeId === b.attributeId;
}

/** The largest AttributeStatusIB a peer answers {@link path} with. */
function maxStatusSizeOf(path: AttributePath) {
    return TlvAttributeStatus.encode({ path, status: { status: Status.Failure, clusterStatus: Status.Failure } })
        .byteLength;
}

function isVersionedListAdd({ path, dataVersion }: AttributeData) {
    return path.listIndex === null && dataVersion !== undefined;
}

function lastStatusOf(statuses: NonNullable<WriteResponse["writeResponses"]>, path: AttributePath) {
    for (let i = statuses.length - 1; i >= 0; i--) {
        if (isSameAttribute(statuses[i].path, path)) {
            return statuses[i].status.status;
        }
    }
}

/**
 * The TLV streams of the top-level entries of an encoded list, or undefined if the stream is not a list.
 */
function listEntriesOf(data: TlvStream) {
    if (data[0]?.typeLength.type !== TlvType.Array) {
        return;
    }

    const entries = new Array<TlvStream>();
    let depth = 0;
    for (const element of data.slice(1, -1)) {
        if (depth === 0) {
            entries.push([]);
        }
        entries[entries.length - 1].push(element);
        switch (element.typeLength.type) {
            case TlvType.Array:
            case TlvType.List:
            case TlvType.Structure:
                depth++;
                break;
            case TlvType.EndOfContainer:
                depth--;
                break;
        }
    }
    return entries;
}

/**
 * Only the SuppressResponse field of an Invoke or Write request.  Reads a request whose other fields break the schema;
 * malformed TLV anywhere in the structure still fails the read.
 */
const TlvSuppressResponseOnly = TlvObject({ suppressResponse: TlvOptionalField(0, TlvBoolean) });

function suppressResponseOf(payload: Bytes) {
    try {
        return TlvSuppressResponseOnly.decode(payload).suppressResponse === true;
    } catch {
        // Unreadable means unknown, so the action is answered; the caller rethrows the full decode's error
        return false;
    }
}

/**
 * Maximum number of messages that can be queued for a DataReport because they were not fitting into
 * the current Report. If we reach this number we send them out forced.
 */
const DATA_REPORT_MAX_QUEUED_ATTRIBUTE_MESSAGES = 20;

/**
 * An empty DataReport with all fields is roughly 23 bytes without data content.
 * So as soon as available bytes are less than 40 we should send the message. This value is the result
 * of some manual tests with usual device types
 */
const DATA_REPORT_MIN_AVAILABLE_BYTES_BEFORE_SENDING = 40;

class InteractionMessenger {
    #exchange: MessageExchange;
    #endMessagePromise?: Promise<unknown>;

    constructor(exchange: MessageExchange) {
        this.#exchange = exchange;
    }

    get exchange() {
        return this.#exchange;
    }

    protected set exchange(value: MessageExchange) {
        this.#exchange = value;
    }

    send(messageType: number, payload: Bytes, options?: ExchangeSendOptions) {
        return this.exchange.send(messageType, payload, options);
    }

    protected trackEndMessage(promise: Promise<unknown>, errorMessage: string) {
        if (this.#endMessagePromise !== undefined) {
            throw new InternalError("An interaction can only have one end message");
        }
        this.#endMessagePromise = promise
            .catch(error => logger.info(this.exchange.via, errorMessage, Diagnostic.errorMessage(error)))
            .finally(() => (this.#endMessagePromise = undefined));
    }

    sendStatus(status: Status, options?: ExchangeSendOptions) {
        return this.send(
            MessageType.StatusResponse,
            TlvStatusResponse.encode({ status, interactionModelRevision: Specification.INTERACTION_MODEL_REVISION }),
            {
                ...options,
                logContext: {
                    for: options?.logContext?.for ? `I/Status-${options?.logContext?.for}` : undefined,
                    status: `${Status[status] ?? "unknown"}(${Diagnostic.hex(status)})`,
                    ...options?.logContext,
                },
            },
        );
    }

    async waitForSuccess(
        expectedMessageInfo: string,
        options?: { expectedProcessingTime?: Duration; timeout?: Duration },
    ) {
        // If the status is not Success, this would throw an Error.
        await this.nextMessage(MessageType.StatusResponse, options, `Success-${expectedMessageInfo}`);
    }

    async nextMessage(expectedMessageType: number, options?: ExchangeReceiveOptions, expectedMessageInfo?: string) {
        return await this.#nextMessage(expectedMessageType, options, expectedMessageInfo);
    }

    async anyNextMessage(expectedMessageInfo: string, options?: ExchangeReceiveOptions) {
        return this.#nextMessage(undefined, options, expectedMessageInfo);
    }

    async #nextMessage(expectedMessageType?: number, options?: ExchangeReceiveOptions, expectedMessageInfo?: string) {
        const message = await this.exchange.nextMessage(options);
        const messageType = message.payloadHeader.messageType;
        if (expectedMessageType !== undefined && expectedMessageInfo === undefined) {
            expectedMessageInfo = MessageType[expectedMessageType];
        }
        this.throwIfErrorStatusMessage(message, expectedMessageInfo);
        if (expectedMessageType !== undefined && messageType !== expectedMessageType) {
            throw new UnexpectedDataError(
                `Received unexpected message for ${expectedMessageInfo} type: ${messageType}, expected: ${expectedMessageType}`,
            );
        }
        return message;
    }

    async close() {
        if (this.#endMessagePromise !== undefined) {
            await this.#endMessagePromise;
        }
        await this.exchange.close();
    }

    protected throwIfErrorStatusMessage(message: Message, logHint?: string) {
        const {
            payloadHeader: { messageType },
            payload,
        } = message;

        if (messageType !== MessageType.StatusResponse) return;
        const { status } = TlvStatusResponse.decode(payload);
        if (status !== Status.Success)
            throw ReceivedStatusResponseError.create(
                status,
                `Received error status ${Status[status] ?? "unknown"}${logHint ? ` (${logHint})` : ""}`,
            );
    }

    get session() {
        return this.exchange.session;
    }
}

export interface InteractionRecipient {
    handleReadRequest(
        exchange: MessageExchange,
        request: ReadRequest,
        message: Message,
    ): Promise<{ dataReport: DataReport; payload?: DataReportPayloadIterator }>;
    handleWriteRequest(
        exchange: MessageExchange,
        request: WriteRequest,
        messenger: InteractionServerMessenger,
        message: Message,
    ): Promise<void>;
    handleSubscribeRequest(
        exchange: MessageExchange,
        request: SubscribeRequest,
        messenger: InteractionServerMessenger,
        message: Message,
    ): Promise<void>;
    handleInvokeRequest(
        exchange: MessageExchange,
        request: InvokeRequest,
        messenger: InteractionServerMessenger,
        message: Message,
    ): Promise<void>;
    handleTimedRequest(exchange: MessageExchange, request: TimedRequest, message: Message): void;
}

export class InteractionServerMessenger extends InteractionMessenger {
    /**
     * SuppressResponse of the Invoke or Write request decoded last; false when absent or unreadable.  Reset by every
     * message read through {@link nextMessage}.
     */
    #suppressResponse = false;

    /**
     * Send a Status Response, unless the Invoke or Write request decoded last carries SuppressResponse set to TRUE.
     * Then the transaction terminates silently.
     */
    override async sendStatus(status: Status, options?: ExchangeSendOptions) {
        if (this.#suppressResponse) {
            return;
        }
        await super.sendStatus(status, options);
    }

    override async nextMessage(
        expectedMessageType: number,
        options?: ExchangeReceiveOptions,
        expectedMessageInfo?: string,
    ) {
        this.#suppressResponse = false;
        return await super.nextMessage(expectedMessageType, options, expectedMessageInfo);
    }

    #decodeRequest<T extends { suppressResponse?: boolean }>(schema: TlvSchema<T>, payload: Bytes): T {
        try {
            const request = schema.decode(payload);
            this.#suppressResponse = request.suppressResponse === true;
            return request;
        } catch (error) {
            this.#suppressResponse = suppressResponseOf(payload);
            throw error;
        }
    }

    async handleRequest(recipient: InteractionRecipient) {
        let continueExchange = true; // are more messages expected in this "transaction"?
        let isGroupSession = false;
        try {
            while (continueExchange) {
                const message = await this.exchange.nextMessage();
                isGroupSession = message.packetHeader.sessionType === SessionType.Group;
                continueExchange = false;
                switch (message.payloadHeader.messageType) {
                    case MessageType.ReadRequest: {
                        if (isGroupSession) {
                            throw new StatusResponseError(
                                `ReadRequest is not supported in group sessions`,
                                Status.InvalidAction,
                            );
                        }
                        const readRequest = TlvReadRequest.decode(message.payload);

                        const { dataReport, payload } = await recipient.handleReadRequest(
                            this.exchange,
                            readRequest,
                            message,
                        );

                        // This potentially sends multiple DataReport Messages
                        await this.sendDataReport({
                            baseDataReport: dataReport,
                            forFabricFilteredRead: readRequest.isFabricFiltered,
                            payload,
                        });
                        break;
                    }
                    case MessageType.WriteRequest: {
                        const writeRequest = this.#decodeRequest(TlvWriteRequest, message.payload);
                        await recipient.handleWriteRequest(this.exchange, writeRequest, this, message);
                        // response is sent by the handler
                        break;
                    }
                    case MessageType.SubscribeRequest: {
                        if (isGroupSession) {
                            throw new StatusResponseError(
                                `SubscribeRequest is not supported in group sessions`,
                                Status.InvalidAction,
                            );
                        }
                        const subscribeRequest = TlvSubscribeRequest.decode(message.payload);
                        await recipient.handleSubscribeRequest(this.exchange, subscribeRequest, this, message);
                        // response is sent by the handler
                        break;
                    }
                    case MessageType.InvokeRequest: {
                        const invokeRequest = this.#decodeRequest(TlvInvokeRequest, message.payload);
                        await recipient.handleInvokeRequest(this.exchange, invokeRequest, this, message);
                        // response is sent by the handler
                        break;
                    }
                    case MessageType.TimedRequest: {
                        if (isGroupSession) {
                            throw new StatusResponseError(
                                `TimedRequest is not supported in group sessions`,
                                Status.InvalidAction,
                            );
                        }
                        const timedRequest = TlvTimedRequest.decode(message.payload);
                        recipient.handleTimedRequest(this.exchange, timedRequest, message);
                        await this.sendStatus(Status.Success, {
                            logContext: { for: "TimedRequest" },
                        });
                        continueExchange = true;
                        break;
                    }
                    default:
                        throw new StatusResponseError(
                            `Unsupported message type ${MessageType[message.payloadHeader.messageType]} (${message.payloadHeader.messageType})`,
                            Status.InvalidAction,
                        );
                }
                if (isGroupSession) {
                    break; // We do not support multiple messages in group sessions
                }
            }
        } catch (error) {
            if (causedBy(error, NoResponseTimeoutError, PeerUnresponsiveError)) {
                logger.info(this.exchange.via, this.exchange.diagnostics, error);
                return;
            }

            let errorStatusCode = Status.Failure;
            const statusMark = this.#suppressResponse ? Mark.SUPPRESSED : Mark.OUTBOUND;
            const sre = StatusResponseError.of(error);
            if (sre) {
                errorStatusCode = sre.code;
                logger.info(
                    "Status response",
                    statusMark,
                    this.exchange.via,
                    this.exchange.diagnostics,
                    Diagnostic.strong(`${Status[sre.code]}#${sre.code}`),
                    "due to error:",
                    Diagnostic.errorMessage(sre),
                );
            } else {
                logger.warn(this.exchange.via, this.exchange.diagnostics, error);
                if (this.#suppressResponse && !isGroupSession) {
                    logger.info(
                        "Status response",
                        statusMark,
                        this.exchange.via,
                        this.exchange.diagnostics,
                        Diagnostic.strong(`${Status[Status.Failure]}#${Status.Failure}`),
                    );
                }
            }

            if (!isGroupSession) {
                await this.sendStatus(errorStatusCode);
            }
        } finally {
            await this.exchange.close();
        }
    }

    /**
     * Handle a DataReport with a Payload Iterator for a DataReport to send, split them into multiple DataReport
     * messages and send them out based on the size.
     */
    async sendDataReport(options: {
        baseDataReport: BaseDataReport;
        forFabricFilteredRead: boolean;
        payload?: DataReportPayloadIterator;
        waitForAck?: boolean;
        suppressEmptyReport?: boolean;
    }) {
        const {
            baseDataReport,
            forFabricFilteredRead,
            payload,
            waitForAck = true,
            suppressEmptyReport = false,
        } = options;
        const { subscriptionId, suppressResponse, interactionModelRevision } = baseDataReport;

        const dataReport: TypeFromSchema<typeof TlvDataReportForSend> = {
            subscriptionId,
            suppressResponse,
            interactionModelRevision: interactionModelRevision ?? Specification.INTERACTION_MODEL_REVISION,
            attributeReports: undefined,
            eventReports: undefined,
        };

        if (payload !== undefined) {
            // TODO Add tag compressing once https://github.com/project-chip/connectedhomeip/issues/29359 is solved
            //  (or likely remove it)
            dataReport.moreChunkedMessages = true; // Assume we have multiple chunks, also for size calculation

            /** The empty data report to calculate the size of the message. */
            const emptyDataReportBytes = TlvDataReportForSend.encode(dataReport);

            /** Do we have received all data? In that case only the queue is left if filled. */
            let allDataReceived = false;

            /** Should the queue be sent out first? This defaults to true and is set to false if we try to fill up the message. */
            let processQueueFirst = true;

            /** Helper method to send out the current dataReport and reset the relevant state for the next chunk. */
            const sendAndResetReport = async () => {
                await this.sendDataReportMessage(dataReport, waitForAck);
                // Empty the dataReport data fields for the next chunk and reset the messageSize
                delete dataReport.attributeReports;
                delete dataReport.eventReports;
                messageSize = emptyDataReportBytes.byteLength;
                processQueueFirst = true; // After sending a message we first try to process queue
            };

            /** Current size of the message */
            let messageSize = emptyDataReportBytes.byteLength;

            /** Queue of attribute reports to send */
            const attributeReportsToSend = new Array<{
                /** The attribute report to send */
                attributeReport: AttributeReportPayload;
                /** The encoded attribute report */
                encoded: TlvStream;
                /** The size of the encoded attribute report */
                encodedSize: number;

                /** If the attribute report needs to be sent in the next message. When set no new data are added. */
                needSendNext?: boolean;
            }>();

            /** Queue of event reports to send */
            const eventReportsToSend = new Array<{
                /** The event report to send */
                eventReport: EventReportPayload;

                /** The encoded event report */
                encoded: TlvStream;

                /** The size of the encoded event report */
                encodedSize: number;
            }>();

            while (true) {
                // Decide if entries in the queue are processed first or if we read new data
                if (
                    !allDataReceived &&
                    ((attributeReportsToSend.length === 0 && eventReportsToSend.length === 0) ||
                        (attributeReportsToSend.length <= DATA_REPORT_MAX_QUEUED_ATTRIBUTE_MESSAGES &&
                            !processQueueFirst &&
                            !attributeReportsToSend[0].needSendNext))
                ) {
                    const { done, value } = await payload.next();
                    if (done) {
                        allDataReceived = true;
                        if (attributeReportsToSend.length === 0 && eventReportsToSend.length === 0) {
                            // No more chunks to send and queue is empty, so we are done
                            delete dataReport.moreChunkedMessages;
                            break;
                        } else {
                            // We got all data, so only queue needs to be sent now, so flag all values to be sent next
                            // but leave moreChunkedMessages flag set because we do not know if all queue entries match
                            // into the message
                            for (const attributeReport of attributeReportsToSend) {
                                attributeReport.needSendNext = true;
                            }
                            continue;
                        }
                    }
                    if (value === undefined) {
                        // Should never happen but better handle here
                        continue;
                    }

                    if ("attributeData" in value || "attributeStatus" in value) {
                        // If read value is an attributeReport, encode it and add it to the queue
                        const allowMissingFieldsForNonFabricFilteredRead =
                            !forFabricFilteredRead && value.hasFabricSensitiveData;
                        const encoded = encodeAttributePayload(value, {
                            allowMissingFieldsForNonFabricFilteredRead,
                        });
                        const encodedSize = TlvAny.getEncodedByteLength(encoded);
                        if (attributeReportsToSend.length === 0) {
                            attributeReportsToSend.push({
                                attributeReport: value,
                                encoded,
                                encodedSize,
                            });
                        } else {
                            // Check if the new attribute belongs to the same endpoint and cluster as the first queued attribute
                            // Remove once https://github.com/project-chip/connectedhomeip/issues/37384 is fixed and some time passed
                            const firstQueuedAttributeData = attributeReportsToSend[0].attributeReport.attributeData;
                            if (
                                firstQueuedAttributeData !== undefined &&
                                value.attributeData !== undefined &&
                                firstQueuedAttributeData.path.nodeId === value.attributeData.path.nodeId &&
                                firstQueuedAttributeData.path.endpointId === value.attributeData.path.endpointId &&
                                firstQueuedAttributeData.path.clusterId === value.attributeData.path.clusterId
                            ) {
                                // Prioritize this attribute in queue because we know others are too big for current message
                                attributeReportsToSend.unshift({
                                    attributeReport: value,
                                    encoded,
                                    encodedSize,
                                });
                            } else {
                                // No, we have a cluster change: Queue needs to go out next before we can process this one
                                // SO flag all queued entries to be sent next and add the new one to the end of the queue
                                for (const attributeReport of attributeReportsToSend) {
                                    attributeReport.needSendNext = true;
                                }
                                attributeReportsToSend.push({
                                    attributeReport: value,
                                    encoded,
                                    encodedSize,
                                });
                            }
                        }
                    } else if ("eventData" in value || "eventStatus" in value) {
                        // If read value is an eventReport, encode it and add it to the queue
                        const allowMissingFieldsForNonFabricFilteredRead =
                            !forFabricFilteredRead && value.hasFabricSensitiveData;

                        const encoded = encodeEventPayload(value, { allowMissingFieldsForNonFabricFilteredRead });
                        const encodedSize = TlvAny.getEncodedByteLength(encoded);
                        eventReportsToSend.push({
                            eventReport: value,
                            encoded,
                            encodedSize,
                        });
                    } else {
                        throw new InternalError(`Invalid report type: ${value}`);
                    }
                }

                // If we have attribute data to send, we add them first
                if (attributeReportsToSend.length > 0) {
                    const attributeToSend = attributeReportsToSend.shift();
                    if (attributeToSend === undefined) {
                        continue; // should never happen, but better check
                    }

                    const { attributeReport, encoded, encodedSize, needSendNext } = attributeToSend;

                    /** Number of bytes available in the message. */
                    let availableBytes = this.exchange.maxPayloadSize - messageSize - 3; // 3 bytes for the attributeReports array

                    /** Does the message need to be sent out before we can send this packet? */
                    let sendOutTheMessage = false;
                    if (encodedSize > availableBytes) {
                        // This packet is too big for the current message ...
                        if ((allDataReceived || needSendNext) && canAttributePayloadBeChunked(attributeReport)) {
                            // Attribute is a non-empty array: chunk it and try to get as much as possible into the
                            // initial REPLACE ALL message and add rest to the queue
                            const chunks = chunkAttributePayload(attributeReport);

                            // Get the Array and the first data chunk of the list and pack them together.
                            // If this is already too big, it is more optimal to postpone this list completely to the next message
                            const initialChunk = chunks.shift(); // This is the empty array chunk
                            const firstDataChunk = chunks.shift(); // First data chunk
                            if (initialChunk === undefined || firstDataChunk === undefined) {
                                throw new InternalError(
                                    "Chunked attribute payload is unexpected. This should not happen!",
                                );
                            }
                            initialChunk.attributeData!.payload.push(firstDataChunk.attributeData!.payload);

                            // Let's encode the initial REPLACE-ALL entry including one array entry
                            const allowMissingFieldsForNonFabricFilteredRead =
                                !forFabricFilteredRead && attributeReport.hasFabricSensitiveData;
                            const encodedInitialChunk = encodeAttributePayload(initialChunk, {
                                allowMissingFieldsForNonFabricFilteredRead,
                            });
                            const encodedInitialChunkSize = TlvAny.getEncodedByteLength(encodedInitialChunk);
                            if (availableBytes > encodedInitialChunkSize) {
                                // The initial chunk fits into the message, so lets see how much more we can add
                                availableBytes -= encodedInitialChunkSize;
                                messageSize += encodedInitialChunkSize;
                                while (chunks.length > 0) {
                                    const nextChunk = chunks.shift();
                                    if (nextChunk === undefined) {
                                        throw new InternalError(
                                            "Chunked attribute payload is undefined. This should not happen!",
                                        );
                                    }
                                    const encodedChunkData = encodeAttributePayloadData(nextChunk, {
                                        allowMissingFieldsForNonFabricFilteredRead,
                                    });
                                    const encodedChunkDataSize = TlvAny.getEncodedByteLength(encodedChunkData);
                                    if (encodedChunkDataSize > availableBytes) {
                                        // This chunks does not match anymore, put it and next chunks back to the queue
                                        chunks.unshift(nextChunk);
                                        for (let i = chunks.length - 1; i >= 0; i--) {
                                            const chunk = chunks[i];
                                            const encodedChunk = encodeAttributePayload(chunk, {
                                                allowMissingFieldsForNonFabricFilteredRead,
                                            });
                                            const encodedChunkSize = TlvAny.getEncodedByteLength(encodedChunk);
                                            attributeReportsToSend.unshift({
                                                attributeReport: chunk,
                                                encoded: encodedChunk,
                                                encodedSize: encodedChunkSize,
                                                needSendNext: true,
                                            });
                                        }
                                        if (dataReport.attributeReports === undefined) {
                                            dataReport.attributeReports = [];
                                        }
                                        dataReport.attributeReports.push(
                                            encodeAttributePayload(initialChunk, {
                                                allowMissingFieldsForNonFabricFilteredRead,
                                            }),
                                        );
                                        break;
                                    }
                                    availableBytes -= encodedChunkDataSize;
                                    messageSize += encodedChunkDataSize;
                                    initialChunk.attributeData!.payload.push(nextChunk.attributeData!.payload);
                                }
                                continue;
                            } else if (needSendNext) {
                                // The initial chunk does not fit into the message, but we need to send it next, flag that
                                sendOutTheMessage = true;
                            }
                        } else {
                            // Current attribute is too big for the current message, and we can't/won't chunk it
                            if (needSendNext) {
                                // ... but if we need to send it now, flag that we need to send it next
                                sendOutTheMessage = true;
                            } else {
                                // ... otherwise we start filling up the queue
                                processQueueFirst = false;
                            }
                        }

                        let messageWasSent = false;
                        // If only 40 bytes are left, or we added a chunked array element as prio,
                        // or the queue has reached its maximum size, then we send the message now because it is full
                        if (
                            sendOutTheMessage ||
                            availableBytes < DATA_REPORT_MIN_AVAILABLE_BYTES_BEFORE_SENDING ||
                            (attributeReportsToSend.length > 0 && attributeReportsToSend[0].needSendNext) ||
                            attributeReportsToSend.length >= DATA_REPORT_MAX_QUEUED_ATTRIBUTE_MESSAGES
                        ) {
                            await sendAndResetReport();
                            messageWasSent = true;
                        }
                        if (!messageWasSent) {
                            // We did not send the message, means assumption is that there is more space in the message
                            // So we add the current attribute to the end of the queue
                            attributeReportsToSend.push(attributeToSend);
                            continue;
                        }
                        if (encodedSize > this.exchange.maxPayloadSize - emptyDataReportBytes.byteLength - 3) {
                            // We sent the message but the current attribute is too big for a message alone so needs to
                            // be chunked, so add it to the queue at the beginning
                            attributeReportsToSend.unshift(attributeToSend);
                            continue;
                        }
                    }
                    messageSize += encodedSize;
                    if (dataReport.attributeReports === undefined) {
                        dataReport.attributeReports = [];
                    }
                    dataReport.attributeReports.push(encoded);
                } else if (eventReportsToSend.length > 0) {
                    const eventToSend = eventReportsToSend.shift();
                    if (eventToSend === undefined) {
                        continue;
                    }

                    const { encoded, encodedSize } = eventToSend;
                    if (
                        messageSize + 3 + (dataReport.attributeReports ? 3 : 0) + encodedSize >
                        this.exchange.maxPayloadSize
                    ) {
                        await sendAndResetReport();
                    }
                    messageSize += encodedSize;
                    if (dataReport.eventReports === undefined) {
                        dataReport.eventReports = [];
                    }
                    dataReport.eventReports.push(encoded);
                } else if (allDataReceived) {
                    // We have received all data and queue is empty, so we are done
                    delete dataReport.moreChunkedMessages;
                    break;
                }
            }
        }

        if (!suppressEmptyReport || dataReport.attributeReports?.length || dataReport.eventReports?.length) {
            await this.sendDataReportMessage(dataReport, waitForAck);
        }
    }

    async sendDataReportMessage(dataReport: TypeFromSchema<typeof TlvDataReportForSend>, waitForAck = true) {
        const dataReportToSend = {
            ...dataReport,
            suppressResponse: dataReport.moreChunkedMessages ? false : dataReport.suppressResponse, // always false when moreChunkedMessages is true
        };
        const encodedMessage = TlvDataReportForSend.encode(dataReportToSend);
        if (encodedMessage.byteLength > this.exchange.maxPayloadSize) {
            throw new MatterFlowError(
                `DataReport with ${encodedMessage.byteLength}bytes is too long to fit in a single chunk (${this.exchange.maxPayloadSize}bytes), This should not happen! Data: ${Diagnostic.json(
                    dataReportToSend,
                )}`,
            );
        }

        const logContext = {
            ...Subscription.diagnosticOf(dataReportToSend),
            interactionFlags: Diagnostic.asFlags({
                empty: !dataReportToSend.attributeReports?.length && !dataReportToSend.eventReports?.length,
                suppressResponse: dataReportToSend.suppressResponse,
                moreChunkedMessages: dataReportToSend.moreChunkedMessages,
            }),
            attr: dataReportToSend.attributeReports?.length,
            ev: dataReportToSend.eventReports?.length,
        };

        if (dataReportToSend.suppressResponse) {
            // We do not expect a response other than a Standalone Ack, so if we receive anything else, we throw an error
            try {
                await this.exchange.send(MessageType.ReportData, encodedMessage, {
                    expectAckOnly: true,
                    disableMrpLogic: !waitForAck,
                    logContext,
                });
            } catch (e) {
                UnexpectedMessageError.accept(e);

                const { receivedMessage } = e;
                this.throwIfErrorStatusMessage(receivedMessage);
            }
        } else {
            await this.exchange.send(MessageType.ReportData, encodedMessage, {
                disableMrpLogic: !waitForAck,
                logContext,
            });
            // We wait for a Success Message - when we don't request an Ack only wait 500ms
            await this.waitForSuccess("DataReport", { timeout: waitForAck ? undefined : Millis(500) });
        }
    }

    /**
     * Convert a server interaction report to a DataReport entry
     * TODO remove when anything is migrated completely
     */
    static convertServerInteractionReport(report: ReadResult.Report) {
        switch (report.kind) {
            case "attr-value": {
                const { path, value: payload, version: dataVersion, tlv } = report;
                if (tlv === undefined) {
                    throw new InternalError(`Attribute ${path.clusterId}/${path.attributeId} not found`);
                }
                const data: AttributeReportPayload = {
                    attributeData: {
                        path,
                        payload,
                        tlv,
                        dataVersion,
                    },
                    hasFabricSensitiveData: true, // With this we disable the validation for missing data in encoding, we trust behavior logic
                };
                return data;
            }
            case "attr-status": {
                const { path, status, clusterStatus } = report;
                const statusReport: AttributeReportPayload = {
                    attributeStatus: {
                        path,
                        status: { status },
                    },
                    hasFabricSensitiveData: false,
                };
                if (clusterStatus !== undefined) {
                    statusReport.attributeStatus!.status.clusterStatus = clusterStatus;
                }
                return statusReport;
            }
            case "event-value": {
                const { path, value: payload, number: eventNumber, priority, timestamp: epochTimestamp, tlv } = report;
                const data: EventReportPayload = {
                    eventData: {
                        path,
                        eventNumber,
                        priority,
                        epochTimestamp,
                        payload,
                        tlv,
                    },
                    hasFabricSensitiveData: true, // There are no Fabric sensitive events as of now. If ever added sanitizing needs to be added
                };
                return data;
            }
            case "event-status": {
                const { path, status, clusterStatus } = report;
                const statusReport: EventReportPayload = {
                    eventStatus: {
                        path,
                        status: { status },
                    },
                    hasFabricSensitiveData: false,
                };
                if (clusterStatus !== undefined) {
                    statusReport.eventStatus!.status.clusterStatus = clusterStatus;
                }
                return statusReport;
            }
        }
    }

    /**
     * Send a WriteResponse message.
     */
    async sendWriteResponse(response: WriteResponse, options?: { logContext?: string }) {
        await this.send(MessageType.WriteResponse, TlvWriteResponse.encode(response), {
            logContext: options?.logContext ? { for: options.logContext } : undefined,
        });
    }

    /**
     * Wait for and decode the next WriteRequest message (for chunked writes).
     */
    async readNextWriteRequest(): Promise<{ writeRequest: WriteRequest; message: Message }> {
        const message = await this.nextMessage(MessageType.WriteRequest, undefined, "WriteRequest-chunk");
        return {
            writeRequest: this.#decodeRequest(TlvWriteRequest, message.payload),
            message,
        };
    }

    /**
     * Send an intermediate InvokeResponse chunk with moreChunkedMessages=true and wait for Status.Success.
     * Returns true if a client acknowledged, and we should continue, false if a client terminated the chunked series.
     */
    async sendInvokeResponseChunk(response: InvokeResponseForSend): Promise<boolean> {
        await this.send(
            MessageType.InvokeResponse,
            TlvInvokeResponseForSend.encode({
                ...response,
                moreChunkedMessages: true,
            }),
            {
                logContext: { for: "InvokeResponse-chunk" },
            },
        );

        try {
            await this.waitForSuccess("InvokeResponse-chunk");
            return true; // Continue sending chunks
        } catch (error) {
            // Any non-success status or error terminate further transmission of InvokeResponseMessages,
            // close the exchange, and consider the Invoke Interaction completed.
            logger.debug("Chunked invoke response terminated by client", error);
            return false;
        }
    }

    /**
     * Send the final InvokeResponse (without moreChunkedMessages flag).
     */
    async sendInvokeResponse(response: InvokeResponseForSend) {
        await this.send(MessageType.InvokeResponse, TlvInvokeResponseForSend.encode(response));
    }
}

/** The subscription ID of a data report, for logging only; a report that does not decode has none. */
function subscriptionIdOf(message: Message) {
    try {
        return TlvDataReport.decode(message.payload).subscriptionId;
    } catch (error) {
        logger.debug("Undecodable data report:", Diagnostic.errorMessage(asError(error)));
        return undefined;
    }
}

export class IncomingInteractionClientMessenger extends InteractionMessenger {
    #reportAwaitsStatus = false;
    #subscriptionId?: SubscriptionId;

    async waitFor(expectedMessageInfo: string, messageType: number, options?: ExchangeReceiveOptions) {
        const message = await this.anyNextMessage(expectedMessageInfo, options);
        const {
            payloadHeader: { messageType: receivedMessageType },
        } = message;
        if (receivedMessageType !== messageType) {
            if (receivedMessageType === MessageType.StatusResponse) {
                const statusCode = TlvStatusResponse.decode(message.payload).status;
                throw ReceivedStatusResponseError.create(
                    statusCode,
                    `Received status response ${Status[statusCode] ?? "unknown"}`,
                );
            }
            throw new MatterFlowError(
                `Received unexpected message type ${receivedMessageType.toString(16)}. Expected ${messageType.toString(
                    16,
                )}`,
            );
        }
        return message;
    }

    /**
     * Read data reports as they come in on the wire.
     *
     * Data reports payloads are decoded but list attributes may be split across messages; these will require reassembly.
     */
    async *readDataReports(options?: ExchangeReceiveOptions) {
        while (true) {
            const dataReportMessage = await this.waitFor("DataReport", MessageType.ReportData, options);
            this.#reportAwaitsStatus = true;
            this.#subscriptionId = undefined;
            const report = TlvDataReport.decode(dataReportMessage.payload);
            this.#subscriptionId = report.subscriptionId;
            if (report.suppressResponse && !report.moreChunkedMessages) {
                this.#reportAwaitsStatus = false;
            }

            yield report;

            this.#reportAwaitsStatus = false;
            if (report.moreChunkedMessages) {
                await this.sendStatus(Status.Success, {
                    multipleMessageInteraction: true,
                    logContext: this.#logContextOf(report),
                });
            } else if (!report.suppressResponse) {
                // We don't need to wait for this promise to succeed and any error is non-fatal.  But we do need to
                // track the promise and thus prevent the session from closing prematurely to prevent errors in the logs
                // if a dependent process closes its session after the read.
                try {
                    this.trackEndMessage(
                        this.sendStatus(Status.Success, {
                            multipleMessageInteraction: true,
                            logContext: this.#logContextOf(report),
                        }),
                        "Error sending success after final data report chunk",
                    );
                } catch (e) {
                    // This error is non-fatal
                    logger.info(this.exchange.via, `Error reading successful datareport read to peer:`, e);
                }
            }

            if (!report.moreChunkedMessages) {
                break;
            }
        }
    }

    /** Whether the peer waits for our status on the last data report it sent. */
    get reportAwaitsStatus() {
        return this.#reportAwaitsStatus;
    }

    /** The subscription ID of the last data report, if it had one. */
    protected get reportSubscriptionId() {
        return this.#subscriptionId;
    }

    /**
     * Answers the peer's data report with INVALID_SUBSCRIPTION, which makes the peer terminate the subscription.
     *
     * @see {@link MatterSpecification.v161.Core} § 8.5
     */
    async sendInvalidSubscription(
        subscriptionId?: SubscriptionId,
        options?: Pick<ExchangeSendOptions, "ackWaitAbort">,
    ) {
        this.#reportAwaitsStatus = false;
        await this.sendStatus(Status.InvalidSubscription, {
            ...options,
            multipleMessageInteraction: true,
            logContext: Subscription.diagnosticOf(subscriptionId),
        });
    }

    #logContextOf(report: DataReport) {
        return {
            subId: report.subscriptionId === undefined ? undefined : Subscription.idStrOf(report.subscriptionId),
            dataReportFlags: Diagnostic.asFlags({
                empty: !report.attributeReports?.length && !report.eventReports?.length,
                suppressResponse: report.suppressResponse,
                moreChunkedMessages: report.moreChunkedMessages,
            }),
            attr: report.attributeReports?.length,
            ev: report.eventReports?.length,
        };
    }
}

export class InteractionClientMessenger extends IncomingInteractionClientMessenger {
    static async create(exchangeProvider: ExchangeProvider, options?: NewExchangeOptions) {
        const exchange = await exchangeProvider.initiateExchange(options);
        return new this(exchange);
    }

    /**
     * Ends a subscribe interaction the client gave up, or that failed, before the peer confirmed the subscription.
     *
     * The peer holds the subscription from the moment it accepts the request, so it must learn that the client no
     * longer wants it.  Answers the report the peer waits on with INVALID_SUBSCRIPTION.  If there is none and
     * `awaitReport` is set, waits for the next message until `abort` or the usual response time and answers it if it
     * is a report.  A SubscribeResponse cannot be answered; the peer then drops the subscription when its next report
     * is refused.
     *
     * `abort` never suppresses an owed answer: an abort that fired before the first transmission still sends it, once,
     * without retransmission, and a later abort stops the waits for its ack and retransmissions.  Never throws.
     *
     * @see {@link MatterSpecification.v161.Core} § 8.5
     */
    async abandonSubscription({ awaitReport, abort }: { awaitReport: boolean; abort?: AbortSignal }) {
        try {
            let subscriptionId = this.reportSubscriptionId;
            if (!this.reportAwaitsStatus) {
                if (!awaitReport) {
                    return;
                }
                const message = await this.anyNextMessage("DataReport", { abort, suppressPeerLoss: true });
                if (message.payloadHeader.messageType !== MessageType.ReportData) {
                    return;
                }
                subscriptionId = subscriptionIdOf(message);
            }
            await this.sendInvalidSubscription(subscriptionId, { ackWaitAbort: abort });
        } catch (error) {
            logger.debug(
                this.exchange.via,
                "Abandoned subscription not terminated on the peer:",
                Diagnostic.errorMessage(asError(error)),
            );
        }
    }

    async sendReadRequest(readRequest: ReadRequest, options?: ExchangeSendOptions) {
        await this.send(MessageType.ReadRequest, this.#encodeReadingRequest(TlvReadRequest, readRequest), options);
    }

    #encodeReadingRequest<T extends TlvSchema<any>>(schema: T, request: TypeFromSchema<T>) {
        const encoded = schema.encode(request);
        if (encoded.byteLength <= this.exchange.maxPayloadSize) {
            return encoded;
        }

        const originalDataVersionFilters = [...(request.dataVersionFilters ?? [])];

        const requestWithoutDataVersionFilters = schema.encode({
            ...request,
            dataVersionFilters: [],
        });
        if (requestWithoutDataVersionFilters.byteLength > this.exchange.maxPayloadSize) {
            throw new MatterFlowError(
                `Request is too long to fit in a single chunk, This should not happen! Data: ${Diagnostic.json(request)}`,
            );
        }

        return schema.encode({
            ...request,
            dataVersionFilters: this.#shortenDataVersionFilters(
                originalDataVersionFilters,
                this.exchange.maxPayloadSize - requestWithoutDataVersionFilters.byteLength,
            ),
        });
    }

    #shortenDataVersionFilters(
        originalDataVersionFilters: TypeFromSchema<typeof TlvDataVersionFilter>[],
        availableBytes: number,
    ) {
        const dataVersionFilters = new Array<TypeFromSchema<typeof TlvDataVersionFilter>>();

        while (availableBytes > 0 && originalDataVersionFilters.length > 0) {
            const dataVersionFilter = originalDataVersionFilters.shift();
            if (dataVersionFilter === undefined) {
                break;
            }
            const encodedDataVersionFilter = TlvDataVersionFilter.encode(dataVersionFilter);
            const encodedDataVersionFilterLength = encodedDataVersionFilter.byteLength;
            if (encodedDataVersionFilterLength > availableBytes) {
                originalDataVersionFilters.unshift(dataVersionFilter);
                break;
            }
            dataVersionFilters.push(dataVersionFilter);
            availableBytes -= encodedDataVersionFilterLength;
        }
        logger.debug(
            `Removed ${originalDataVersionFilters.length} DataVersionFilters from Request to fit into a single message`,
        );

        return dataVersionFilters;
    }

    async sendSubscribeRequest(subscribeRequest: SubscribeRequest, options?: ExchangeSendOptions) {
        const request = this.#encodeReadingRequest(TlvSubscribeRequest, subscribeRequest);
        await this.send(MessageType.SubscribeRequest, request, options);
    }

    /**
     * Send an invoke command and handle chunked responses.
     * Returns a combined InvokeResponse with all responses from all chunks, or undefined if suppressResponse
     */
    async sendInvokeCommand(
        invokeRequest: InvokeRequest,
        options?: ExchangeSendOptions,
    ): Promise<InvokeResponse | undefined> {
        if (invokeRequest.suppressResponse) {
            await this.requestWithSuppressedResponse(
                MessageType.InvokeRequest,
                TlvInvokeRequest,
                invokeRequest,
                options,
            );
            return undefined;
        }

        // Send invoke request
        await this.send(MessageType.InvokeRequest, TlvInvokeRequest.encode(invokeRequest), options);

        // Receive and accumulate responses from potentially multiple chunks
        const allInvokeResponses: InvokeResponse["invokeResponses"] = [];
        let finalResponse: InvokeResponse | undefined;

        while (true) {
            const responseMessage = await this.nextMessage(MessageType.InvokeResponse, options, "InvokeResponse");
            const response = TlvInvokeResponse.decode(responseMessage.payload);

            // Accumulate responses from this chunk
            if (response.invokeResponses) {
                allInvokeResponses.push(...response.invokeResponses);
            }

            // Check if more chunks are coming
            if (response.moreChunkedMessages) {
                await this.sendStatus(Status.Success, {
                    multipleMessageInteraction: true,
                    logContext: { for: "InvokeResponse-chunk" },
                });
            } else {
                // This is the final chunk
                finalResponse = {
                    ...response,
                    invokeResponses: allInvokeResponses,
                };
                break;
            }
        }

        return finalResponse;
    }

    /**
     * Send a write and return the WriteResponse, or undefined if suppressResponse.
     *
     * A write that does not fit one message is sent as several chunked WriteRequestMessages in this exchange.  Each
     * chunk waits for its WriteResponse before the next is sent; the returned response carries the statuses of all
     * chunks.
     *
     * A list write whose ADDs carry a DataVersion sends its REPLACE as the last AttributeDataIB of a chunk.  Once the
     * REPLACE succeeded, the ADDs are sent without DataVersion: the REPLACE changed the data version, so the held one
     * can no longer match.  If the REPLACE failed, the ADDs keep it, so a version mismatch rejects them too.  A timed or
     * suppressResponse write that fits one message is not chunked for this, as such a write cannot be chunked.
     *
     * @see {@link MatterSpecification.v161.Core} § 10.7.6.2
     */
    async sendWriteCommand(
        writeRequest: WriteRequest,
        options?: ExchangeSendOptions,
    ): Promise<WriteResponse | undefined> {
        const chunks = this.#chunkWriteRequest(writeRequest);

        if (writeRequest.suppressResponse) {
            await this.requestWithSuppressedResponse(MessageType.WriteRequest, TlvWriteRequest, writeRequest, options);
            return;
        }

        const writeResponses = new Array<WriteResponse["writeResponses"][number]>();
        const replacedLists = new Array<AttributePath>();
        let response: WriteResponse | undefined;
        for (const chunk of chunks) {
            const writeRequests = chunk.writeRequests.map(attributeData =>
                attributeData.path.listIndex === null &&
                attributeData.dataVersion !== undefined &&
                replacedLists.some(path => isSameAttribute(path, attributeData.path))
                    ? { ...attributeData, dataVersion: undefined }
                    : attributeData,
            );
            response = await this.request(
                MessageType.WriteRequest,
                TlvWriteRequest,
                MessageType.WriteResponse,
                TlvWriteResponse,
                { ...chunk, writeRequests },
                options,
            );
            const statuses = response.writeResponses ?? [];
            writeResponses.push(...statuses);

            for (const { path, dataVersion } of chunk.writeRequests) {
                if (path.listIndex !== undefined || dataVersion === undefined) {
                    continue;
                }
                const replaced = replacedLists.findIndex(replacedPath => isSameAttribute(replacedPath, path));
                if (replaced !== -1) {
                    replacedLists.splice(replaced, 1);
                }
                // A versioned REPLACE followed by ADDs ends its chunk, so its status is the last for this attribute
                if (lastStatusOf(statuses, path) === Status.Success) {
                    replacedLists.push(path);
                }
            }
        }
        return { ...response, writeResponses };
    }

    /**
     * Split a write into WriteRequestMessages that each fit {@link MessageExchange.maxPayloadSize}, and whose
     * WriteResponse fits it too, counting the largest status for each path.  A WriteResponse cannot be chunked, so a
     * peer cannot send a status list larger than one message.  A wildcard path counts as one status although the
     * peer answers it with one per matching endpoint, which the client cannot know.
     *
     * AttributeDataIBs keep their order, so the ADDs of a chunked list still follow its REPLACE.  A whole-list IB too
     * large for one message is sent as a REPLACE followed by an ADD per remaining entry.  The REPLACE of the ACL or its
     * Extension carries as many leading entries as fit, so the ACL is never emptied in between; for any other list it
     * is empty.
     *
     * @see {@link MatterSpecification.v161.Core} § 10.6.4.3.1
     */
    #chunkWriteRequest(writeRequest: WriteRequest): WriteRequest[] {
        const { maxPayloadSize } = this.exchange;
        const { writeRequests, timedRequest, suppressResponse } = writeRequest;
        const availableForStatuses = suppressResponse
            ? Infinity
            : maxPayloadSize -
              TlvWriteResponse.encode({
                  writeResponses: [],
                  interactionModelRevision: Specification.INTERACTION_MODEL_REVISION,
              }).byteLength;

        const encodedSize = TlvWriteRequest.encode(writeRequest).byteLength;
        const statusesSize = suppressResponse
            ? 0
            : writeRequests.reduce((size, { path }) => size + maxStatusSizeOf(path), 0);
        if (encodedSize <= maxPayloadSize && statusesSize <= availableForStatuses) {
            if (timedRequest || suppressResponse || !writeRequests.some(isVersionedListAdd)) {
                return [writeRequest];
            }
        } else if (timedRequest || suppressResponse) {
            throw new MatterFlowError(
                `Write of ${encodedSize} bytes with statuses of up to ${statusesSize} bytes exceeds the maximum message size of ${maxPayloadSize} bytes and cannot be chunked because it is ${timedRequest ? "timed" : "sent with suppressResponse"}`,
            );
        }

        const available =
            maxPayloadSize -
            TlvWriteRequest.encode({ ...writeRequest, writeRequests: [], moreChunkedMessages: true }).byteLength;
        const chunks = new Array<WriteRequest>();
        let current = new Array<AttributeData>();
        let used = 0;
        let usedForStatuses = 0;

        const flush = () => {
            if (current.length) {
                chunks.push({ ...writeRequest, writeRequests: current, moreChunkedMessages: true });
                current = [];
                used = 0;
                usedForStatuses = 0;
            }
        };

        const add = (attributeData: AttributeData) => {
            const size = TlvAttributeData.encode(attributeData).byteLength;
            const statusSize = maxStatusSizeOf(attributeData.path);
            const previous = current[current.length - 1];
            if (
                used + size > available ||
                usedForStatuses + statusSize > availableForStatuses ||
                (isVersionedListAdd(attributeData) &&
                    previous !== undefined &&
                    previous.path.listIndex === undefined &&
                    isSameAttribute(previous.path, attributeData.path))
            ) {
                flush();
            }
            if (size > available) {
                throw new MatterFlowError(
                    `Write data for ${Diagnostic.json(attributeData.path)} has ${size} bytes and does not fit a single message of ${maxPayloadSize} bytes`,
                );
            }
            current.push(attributeData);
            used += size;
            usedForStatuses += statusSize;
        };

        for (const attributeData of writeRequest.writeRequests) {
            const { path, data } = attributeData;
            const entries =
                path.listIndex === undefined && TlvAttributeData.encode(attributeData).byteLength > available
                    ? listEntriesOf(data)
                    : undefined;
            if (entries === undefined) {
                add(attributeData);
                continue;
            }
            if (path.endpointId === undefined || path.clusterId === undefined || path.attributeId === undefined) {
                throw new MatterFlowError(
                    `Write of the list at wildcard path ${Diagnostic.json(path)} does not fit a single message and cannot be chunked, because list ADDs need a concrete path`,
                );
            }

            const [start, ...rest] = data;
            const end = rest[rest.length - 1];
            const replaceAll = (count: number): AttributeData => ({
                ...attributeData,
                data: [start, ...entries.slice(0, count).flat(), end],
            });
            let count = 0;
            if (isAclOrExtensionPath(path)) {
                while (
                    count < entries.length &&
                    TlvAttributeData.encode(replaceAll(count + 1)).byteLength <= available
                ) {
                    count++;
                }
            }
            add(replaceAll(count));
            for (const entry of entries.slice(count)) {
                add({ ...attributeData, path: { ...path, listIndex: null }, data: entry });
            }
        }

        flush();
        chunks[chunks.length - 1].moreChunkedMessages = false;
        return chunks;
    }

    sendTimedRequest(timeout: Duration, options?: ExchangeSendOptions) {
        return this.request(
            MessageType.TimedRequest,
            TlvTimedRequest,
            MessageType.StatusResponse,
            TlvStatusResponse,
            {
                timeout,
                interactionModelRevision: Specification.INTERACTION_MODEL_REVISION,
            },
            options,
        );
    }

    private async requestWithSuppressedResponse<RequestT>(
        requestMessageType: number,
        requestSchema: TlvSchema<RequestT>,
        request: RequestT,
        options?: ExchangeSendOptions,
    ): Promise<void> {
        try {
            await this.send(requestMessageType, requestSchema.encode(request), {
                expectAckOnly: true,
                expectedProcessingTime: options?.expectedProcessingTime,
                abort: options?.abort,
                logContext: {
                    invokeFlags: Diagnostic.asFlags({
                        suppressResponse: true,
                    }),
                },
            });
        } catch (e) {
            // If we got anything other than a standalone ack, we throw when receiving a status response, otherwise we ignore it
            // Mainly needed because of a Matter-SDK bug where a command response is sent even when suppressResponse is true
            UnexpectedMessageError.accept(e);
            const { receivedMessage } = e;
            this.throwIfErrorStatusMessage(receivedMessage);
        }
    }

    private async request<RequestT, ResponseT>(
        requestMessageType: number,
        requestSchema: TlvSchema<RequestT>,
        responseMessageType: number,
        responseSchema: TlvSchema<ResponseT>,
        request: RequestT,
        options?: ExchangeSendOptions,
    ): Promise<ResponseT> {
        await this.send(requestMessageType, requestSchema.encode(request), {
            expectAckOnly: false,
            expectedProcessingTime: options?.expectedProcessingTime,
            abort: options?.abort,
        });
        const responseMessage = await this.nextMessage(
            responseMessageType,
            {
                expectedProcessingTime: options?.expectedProcessingTime,
                abort: options?.abort,
            },
            MessageType[responseMessageType] ?? `Response-${Diagnostic.hex(responseMessageType)}`,
        );
        return responseSchema.decode(responseMessage.payload);
    }
}
