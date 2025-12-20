/**
 * @license
 * Copyright 2022-2025 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { ReadResult } from "#action/response/ReadResult.js";
import { Mark } from "#common/Mark.js";
import {
    Bytes,
    Diagnostic,
    Duration,
    InternalError,
    Logger,
    MatterFlowError,
    Millis,
    NoResponseTimeoutError,
    Time,
    UnexpectedDataError,
} from "#general";
import { Specification } from "#model";
import { RetransmissionLimitReachedError, SessionClosedError, UnexpectedMessageError } from "#protocol/errors.js";
import {
    ReceivedStatusResponseError,
    Status,
    StatusResponseError,
    TlvAny,
    TlvDataReport,
    TlvDataReportForSend,
    TlvDataVersionFilter,
    TlvInvokeRequest,
    TlvInvokeResponse,
    TlvReadRequest,
    TlvSchema,
    TlvStatusResponse,
    TlvStream,
    TlvSubscribeRequest,
    TlvSubscribeResponse,
    TlvTimedRequest,
    TlvWriteRequest,
    TlvWriteResponse,
    TypeFromSchema,
} from "#types";
import { Message, SessionType } from "../codec/MessageCodec.js";
import { ExchangeProvider } from "../protocol/ExchangeProvider.js";
import { ExchangeSendOptions, MessageExchange } from "../protocol/MessageExchange.js";
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
import { Subscription } from "./Subscription.js";

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
export type TimedRequest = TypeFromSchema<typeof TlvTimedRequest>;
export type WriteRequest = TypeFromSchema<typeof TlvWriteRequest>;
export type WriteResponse = TypeFromSchema<typeof TlvWriteResponse>;

const logger = Logger.get("InteractionMessenger");

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

    async nextMessage(
        expectedMessageType: number,
        options?: {
            expectedProcessingTime?: Duration;
            timeout?: Duration;
        },
        expectedMessageInfo?: string,
    ) {
        return this.#nextMessage(expectedMessageType, options, expectedMessageInfo);
    }

    async anyNextMessage(
        expectedMessageInfo: string,
        options?: {
            expectedProcessingTime?: Duration;
            timeout?: Duration;
        },
    ) {
        return this.#nextMessage(undefined, options, expectedMessageInfo);
    }

    async #nextMessage(
        expectedMessageType?: number,
        options?: {
            expectedProcessingTime?: Duration;
            timeout?: Duration;
        },
        expectedMessageInfo?: string,
    ) {
        const { expectedProcessingTime, timeout } = options ?? {};
        const message = await this.exchange.nextMessage({ expectedProcessingTime, timeout });
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
            throw new ReceivedStatusResponseError(
                `Received error status: ${status}${logHint ? ` (${logHint})` : ""}`,
                status,
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
    handleWriteRequest(exchange: MessageExchange, request: WriteRequest, message: Message): Promise<WriteResponse>;
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
                        const writeRequest = TlvWriteRequest.decode(message.payload);
                        const { suppressResponse } = writeRequest;
                        const writeResponse = await recipient.handleWriteRequest(this.exchange, writeRequest, message);
                        if (!suppressResponse && !isGroupSession) {
                            await this.send(MessageType.WriteResponse, TlvWriteResponse.encode(writeResponse));
                        }
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
                        // response is sent by handler
                        break;
                    }
                    case MessageType.InvokeRequest: {
                        const invokeRequest = TlvInvokeRequest.decode(message.payload);
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
            if (error instanceof NoResponseTimeoutError) {
                logger.info(this.exchange.via, error);
                return;
            }

            let errorStatusCode = Status.Failure;
            if (error instanceof StatusResponseError) {
                logger.info(
                    this.exchange.via,
                    "Status response",
                    Mark.OUTBOUND,
                    Diagnostic.strong(`${Status[error.code]}#${error.code}`),
                    "due to error:",
                    Diagnostic.errorMessage(error),
                );
                errorStatusCode = error.code;
            } else {
                logger.warn(this.exchange.via, error);
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
            interactionModelRevision,
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
                const { path, value: payload, version: dataVersion, tlv: schema } = report;
                if (schema === undefined) {
                    throw new InternalError(`Attribute ${path.clusterId}/${path.attributeId} not found`);
                }
                const data: AttributeReportPayload = {
                    attributeData: {
                        path,
                        payload,
                        schema,
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
                const {
                    path,
                    value: payload,
                    number: eventNumber,
                    priority,
                    timestamp: epochTimestamp,
                    tlv: schema,
                } = report;
                const data: EventReportPayload = {
                    eventData: {
                        path,
                        eventNumber,
                        priority,
                        epochTimestamp,
                        payload,
                        schema,
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
}

export class IncomingInteractionClientMessenger extends InteractionMessenger {
    async waitFor(expectedMessageInfo: string, messageType: number, timeout?: Duration) {
        const message = await this.anyNextMessage(expectedMessageInfo, { timeout });
        const {
            payloadHeader: { messageType: receivedMessageType },
        } = message;
        if (receivedMessageType !== messageType) {
            if (receivedMessageType === MessageType.StatusResponse) {
                const statusCode = TlvStatusResponse.decode(message.payload).status;
                throw new ReceivedStatusResponseError(`Received status response ${statusCode}`, statusCode);
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
    async *readDataReports() {
        while (true) {
            const dataReportMessage = await this.waitFor("DataReport", MessageType.ReportData);
            const report = TlvDataReport.decode(dataReportMessage.payload);

            yield report;

            if (report.moreChunkedMessages) {
                await this.sendStatus(Status.Success, {
                    multipleMessageInteraction: true,
                    logContext: this.#logContextOf(report),
                });
            } else if (!report.suppressResponse) {
                // We received the last message and need to send a final success, but we do not need to wait for it and
                // also don't care if it fails
                this.sendStatus(Status.Success, {
                    multipleMessageInteraction: true,
                    logContext: this.#logContextOf(report),
                }).catch(error => logger.info("Error sending success after final data report chunk", error));
            }

            if (!report.moreChunkedMessages) {
                break;
            }
        }
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
    #exchangeProvider: ExchangeProvider;

    static async create(exchangeProvider: ExchangeProvider) {
        const exchange = await exchangeProvider.initiateExchange();
        return new this(exchange, exchangeProvider);
    }

    constructor(exchange: MessageExchange, exchangeProvider: ExchangeProvider) {
        super(exchange);
        this.#exchangeProvider = exchangeProvider;
    }

    /** Implements a send method with an automatic reconnection mechanism */
    override async send(messageType: number, payload: Bytes, options?: ExchangeSendOptions) {
        const now = Time.nowMs;
        try {
            if (this.exchange.channel.closed) {
                throw new SessionClosedError("The exchange channel is closed. Please connect the device first.");
            }

            return await this.exchange.send(messageType, payload, options);
        } catch (error) {
            if (
                this.#exchangeProvider.supportsReconnect &&
                (error instanceof RetransmissionLimitReachedError || error instanceof SessionClosedError) &&
                !options?.multipleMessageInteraction
            ) {
                // When retransmission failed (most likely due to a lost connection or invalid session),
                // try to reconnect if possible and resend the message one more time
                logger.debug(
                    `${error instanceof RetransmissionLimitReachedError ? "Retransmission limit reached" : "Channel not connected"}, trying to reconnect and resend the message.`,
                );
                await this.exchange.close();
                if (await this.#exchangeProvider.reconnectChannel({ asOf: now })) {
                    this.exchange = await this.#exchangeProvider.initiateExchange();
                    return await this.exchange.send(messageType, payload, options);
                }
            } else {
                throw error;
            }
        }
    }

    async sendReadRequest(readRequest: ReadRequest) {
        await this.send(MessageType.ReadRequest, this.#encodeReadingRequest(TlvReadRequest, readRequest));
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

    async sendSubscribeRequest(subscribeRequest: SubscribeRequest) {
        const request = this.#encodeReadingRequest(TlvSubscribeRequest, subscribeRequest);
        await this.send(MessageType.SubscribeRequest, request);
    }

    async sendInvokeCommand(invokeRequest: InvokeRequest, expectedProcessingTime?: Duration) {
        if (invokeRequest.suppressResponse) {
            await this.requestWithSuppressedResponse(
                MessageType.InvokeRequest,
                TlvInvokeRequest,
                invokeRequest,
                expectedProcessingTime,
            );
        } else {
            return await this.request(
                MessageType.InvokeRequest,
                TlvInvokeRequest,
                MessageType.InvokeResponse,
                TlvInvokeResponse,
                invokeRequest,
                expectedProcessingTime,
            );
        }
    }

    async sendWriteCommand(writeRequest: WriteRequest) {
        if (writeRequest.suppressResponse) {
            await this.requestWithSuppressedResponse(MessageType.WriteRequest, TlvWriteRequest, writeRequest);
        } else {
            return await this.request(
                MessageType.WriteRequest,
                TlvWriteRequest,
                MessageType.WriteResponse,
                TlvWriteResponse,
                writeRequest,
            );
        }
    }

    sendTimedRequest(timeout: Duration) {
        return this.request(MessageType.TimedRequest, TlvTimedRequest, MessageType.StatusResponse, TlvStatusResponse, {
            timeout,
            interactionModelRevision: Specification.INTERACTION_MODEL_REVISION,
        });
    }

    private async requestWithSuppressedResponse<RequestT>(
        requestMessageType: number,
        requestSchema: TlvSchema<RequestT>,
        request: RequestT,
        expectedProcessingTime?: Duration,
    ): Promise<void> {
        try {
            await this.send(requestMessageType, requestSchema.encode(request), {
                expectAckOnly: true,
                expectedProcessingTime: expectedProcessingTime,
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
        expectedProcessingTime?: Duration,
    ): Promise<ResponseT> {
        await this.send(requestMessageType, requestSchema.encode(request), {
            expectAckOnly: false,
            expectedProcessingTime,
        });
        const responseMessage = await this.nextMessage(
            responseMessageType,
            { expectedProcessingTime },
            MessageType[responseMessageType] ?? `Response-${Diagnostic.hex(responseMessageType)}`,
        );
        return responseSchema.decode(responseMessage.payload);
    }
}
