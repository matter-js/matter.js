/**
 * @license
 * Copyright 2022-2025 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { Message } from "#codec/MessageCodec.js";
import {
    Bytes,
    Diagnostic,
    Duration,
    ImplementationError,
    InternalError,
    Logger,
    Minutes,
    UnexpectedDataError,
} from "#general";
import { MessageExchange } from "#protocol/MessageExchange.js";
import { BdxMessageType, BdxStatusCode, GeneralStatusCode, SecureMessageType } from "#types";
import { BdxError, BdxStatusResponseError } from "./BdxError.js";
import { BdxReceiveAccept, BdxSendAccept } from "./schema/BdxAcceptMessagesSchema.js";
import {
    BdxBlock,
    BdxBlockAck,
    BdxBlockAckEof,
    BdxBlockEof,
    BdxBlockQuery,
    BdxBlockQueryWithSkip,
} from "./schema/BdxBlockMessagesSchema.js";
import { BdxInit } from "./schema/BdxInitMessagesSchema.js";
import { BdxMessage } from "./schema/BdxMessage.js";
import { BdxStatusMessage } from "./schema/BdxStatusMessageSchema.js";

const logger = Logger.get("BdxMessenger");

export const BDX_TRANSFER_IDLE_TIMEOUT = Minutes(5); // Minimum time according to Matter spec

/** Messenger class that contains all Bdx Messages */
export class BdxMessenger {
    #exchange: MessageExchange;
    #messageTimeout: Duration;

    /**
     * Creates a new BdxMessenger instance.
     * @param exchange Exchange to use for the messaging
     * @param messageTimeout Communication Timeout for the Bdx Messages, defaults to 5 minutes as defined for Matter OTA transfers
     */
    constructor(exchange: MessageExchange, messageTimeout = BDX_TRANSFER_IDLE_TIMEOUT) {
        if (!exchange.channel.isReliable) {
            throw new ImplementationError("Bdx Protocol requires a reliable channel for message exchange");
        }
        this.#messageTimeout = messageTimeout;
        this.#exchange = exchange;
    }

    get channel() {
        return this.#exchange.channel;
    }

    get exchange() {
        return this.#exchange;
    }

    get maxPayloadSize() {
        return this.#exchange.maxPayloadSize;
    }

    /**
     * Waits for the next message and returns it.
     * A List of allowed expected message types can be provided.
     * If the message type is not in the list, an error will be thrown.
     */
    async nextMessage(
        expectedMessageTypes: BdxMessageType[],
        timeout = this.#messageTimeout,
        expectedMessageInfo?: string,
    ): Promise<BdxMessage<any>> {
        logger.debug(
            `Waiting for Bdx ${expectedMessageTypes.map(t => BdxMessageType[t]).join("/")} message with timeout ${timeout}ms`,
        );

        const message = await this.exchange.nextMessage({ timeout });
        const messageType = message.payloadHeader.messageType as BdxMessageType;
        if (expectedMessageInfo === undefined) {
            expectedMessageInfo = expectedMessageTypes.map(t => `${t} (${BdxMessageType[t]})`).join(",");
        }
        this.throwIfErrorStatusReport(message, expectedMessageInfo);
        if (!expectedMessageTypes.includes(messageType))
            throw new UnexpectedDataError(
                `Received unexpected message type: ${BdxMessageType[messageType] ?? "unknown"}#${messageType}, expected: ${expectedMessageInfo}`,
            );

        logger.debug(
            `Received Bdx ${BdxMessageType[messageType]}${message.payload.byteLength > 0 ? ` with ${message.payload.byteLength}bytes` : ""}`,
            Diagnostic.dict(message),
        );
        return BdxMessage.decode(messageType, message.payload);
    }

    async send(bdxMessage: BdxMessage<any>) {
        const { kind: messageType, message } = bdxMessage;
        logger.debug(
            `Sending Bdx ${BdxMessageType[messageType]}${"data" in message && Bytes.isBytes(message.data) ? ` with ${message.data.byteLength}bytes` : ""}`,
            message,
        );
        await this.exchange.send(messageType, BdxMessage.encode(bdxMessage));
    }

    /** Sends a Bdx SendInit message and waits for the SendAccept message as a response and returns it decoded. */
    async sendSendInit(message: BdxInit): Promise<BdxSendAccept> {
        await this.send({ kind: BdxMessageType.SendInit, message });

        const response = await this.nextMessage([BdxMessageType.SendAccept]);
        BdxMessage.assert(response, BdxMessageType.SendAccept);
        return response.message;
    }

    /** Sends a ReceiveInit message and waits for the ReceiveAccept message as a response and returns it decoded. */
    async sendReceiveInit(message: BdxInit): Promise<BdxReceiveAccept> {
        await this.send({ kind: BdxMessageType.ReceiveInit, message });

        const response = await this.nextMessage([BdxMessageType.ReceiveAccept]);
        BdxMessage.assert(response, BdxMessageType.ReceiveAccept);
        return response.message;
    }

    /** Encodes and sends a Bdx SendAccept message. */
    async sendSendAccept(message: BdxSendAccept) {
        await this.send({ kind: BdxMessageType.SendAccept, message });
    }

    /** Encodes and sends a Bdx ReceiveAccept message. */
    async sendReceiveAccept(message: BdxReceiveAccept) {
        await this.send({ kind: BdxMessageType.ReceiveAccept, message });
    }

    /** Encodes and sends a Bdx Block message. */
    async sendBlock(message: BdxBlock) {
        await this.send({ kind: BdxMessageType.Block, message });
    }

    /** Encodes and sends a Bdx BlockQuery message. */
    async sendBlockQuery(message: BdxBlockQuery) {
        await this.send({ kind: BdxMessageType.BlockQuery, message });
    }

    /** Encodes and sends a Bdx BlockQueryWithSkip message. */
    async sendBlockQueryWithSkip(message: BdxBlockQueryWithSkip) {
        await this.send({ kind: BdxMessageType.BlockQueryWithSkip, message });
    }

    /** Encodes and sends a Bdx BlockEof message. */
    async sendBlockEof(message: BdxBlockEof) {
        await this.send({ kind: BdxMessageType.BlockEof, message });
    }

    /** Encodes and sends a Bdx BlockAck message. */
    async sendBlockAck(message: BdxBlockAck) {
        await this.send({ kind: BdxMessageType.BlockAck, message });
    }

    /** Encodes and sends a Bdx BlockAckEof message */
    async sendBlockAckEof(message: BdxBlockAckEof) {
        await this.send({ kind: BdxMessageType.BlockAckEof, message });
    }

    /** Read the next Block message, accepts Block and BlockEof messages. Returns the decoded message and it's type. */
    async readBlock(): Promise<BdxMessage<BdxMessageType.Block | BdxMessageType.BlockEof>> {
        const block = await this.nextMessage([BdxMessageType.Block, BdxMessageType.BlockEof]);
        if (BdxMessage.is(block, BdxMessageType.Block) && block.message.data.byteLength === 0) {
            // a Block message must not have empty data
            throw new BdxError("Received empty data in Block message", BdxStatusCode.BadMessageContent);
        }
        return block;
    }

    /**
     * Read the next BlockQuery message, accepts BlockQuery and BlockQueryWithSkip and BlockAck messages.
     * When a BlockAck is received, it will be validated and the next BlockQuery message will be read.
     * Returns the decoded message and it's type.
     */
    async readBlockQuery(): Promise<BdxMessage<BdxMessageType.BlockQuery | BdxMessageType.BlockQueryWithSkip>> {
        let response = await this.nextMessage([
            BdxMessageType.BlockQuery,
            BdxMessageType.BlockQueryWithSkip,
            BdxMessageType.BlockAck,
        ]);
        let expectedBlockMessageCounter: number | undefined = undefined;
        if (BdxMessage.is(response, BdxMessageType.BlockAck)) {
            expectedBlockMessageCounter = (response.message.blockCounter + 1) % 0x100000000; // wrap around at 2^32
            response = await this.nextMessage([BdxMessageType.BlockQuery, BdxMessageType.BlockQueryWithSkip]);
        }

        // Ensure that if we got an Ack Message that the blockCounter is as expected because this cannot be done outside
        if (
            expectedBlockMessageCounter !== undefined &&
            response.message.blockCounter !== expectedBlockMessageCounter
        ) {
            throw new BdxError(
                `Received BlockQuery with unexpected block counter: ${response.message.blockCounter}, expected: ${expectedBlockMessageCounter}`,
                BdxStatusCode.BadBlockCounter,
            );
        }

        return response;
    }

    /** Reads the next BlockAckEof message and returns the decoded message. */
    async readBlockAckEof(): Promise<BdxBlockAckEof> {
        const response = await this.nextMessage([BdxMessageType.BlockAckEof]);
        BdxMessage.assert(response, BdxMessageType.BlockAckEof);
        return response.message;
    }

    /** Reads the next BlockAck message and returns the decoded message. */
    async readBlockAck(): Promise<BdxBlockAck> {
        const response = await this.nextMessage([BdxMessageType.BlockAck]);
        BdxMessage.assert(response, BdxMessageType.BlockAck);
        return response.message;
    }

    /** Sends a Bdx Error StatusReport message with the given protocol status. */
    sendError(code: BdxStatusCode) {
        return this.#sendStatusReport(GeneralStatusCode.Failure, code);
    }

    /** Encodes and sends a Bdx StatusReport message with the given general and protocol status. */
    async #sendStatusReport(generalStatus: GeneralStatusCode, protocolStatus: BdxStatusCode, requiresAck?: boolean) {
        await this.#exchange.send(
            SecureMessageType.StatusReport,
            BdxStatusMessage.encode({
                generalStatus,
                protocolStatus,
            }),
            {
                requiresAck,
                logContext: {
                    generalStatus: GeneralStatusCode[generalStatus] ?? Diagnostic.hex(generalStatus),
                    protocolStatus: BdxStatusCode[protocolStatus] ?? Diagnostic.hex(protocolStatus),
                },
            },
        );
    }

    protected throwIfErrorStatusReport(message: Message, logHint?: string) {
        const {
            payloadHeader: { messageType },
            payload,
        } = message;
        if (messageType !== SecureMessageType.StatusReport) return;

        const { generalStatus, protocolId, protocolStatus } = BdxStatusMessage.decode(payload);
        if (generalStatus !== GeneralStatusCode.Success) {
            throw new BdxStatusResponseError(
                `Received general error status for protocol ${protocolId}${logHint ? ` (${logHint})` : ""}`,
                generalStatus,
                protocolStatus,
            );
        }
        if (protocolStatus !== BdxStatusCode.Success) {
            throw new BdxStatusResponseError(
                `Received general success status, but protocol status is not Success${logHint ? ` (${logHint})` : ""}`,
                generalStatus,
                protocolStatus,
            );
        }
    }

    close() {
        return this.#exchange.close();
    }

    /**
     * Ensure that the value is a safe JavaScript "number" type and that it is not too large. Matter spec allows also
     * 64bit values, but they make little sense for now, so make sure we handle them as too large. MAX_SAFE_INTEGER is
     * 2^53-1 and is enough for now.
     */
    static asSafeNumber(
        value: number | bigint | undefined,
        context = "",
        bdxErrorCode = BdxStatusCode.Unknown,
    ): number {
        if (typeof value !== "number" && typeof value !== "bigint") {
            throw new InternalError(`${context} ${value} is not a number`); // Should not happen
        }
        if (value > Number.MAX_SAFE_INTEGER) {
            throw new BdxError(`${context} ${value} exceeds maximum safe integer value`, bdxErrorCode);
        }
        return Number(value);
    }
}
