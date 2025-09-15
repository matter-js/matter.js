/**
 * @license
 * Copyright 2022-2025 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { BdxMessage } from "#bdx/schema/index.js";
import { Message } from "#codec/MessageCodec.js";
import { Bytes, Diagnostic, Duration, InternalError, Logger, Minutes, UnexpectedDataError } from "#general";
import { MessageExchange } from "#protocol/MessageExchange.js";
import { BdxMessageTypes, BdxStatusCode, GeneralStatusCode, SecureMessageType } from "#types";
import { ImplementationError } from "@matter/general";
import { BdxError, BdxStatusResponseError } from "./BdxError.js";
import {
    BdxReceiveAccept,
    BdxReceiveAcceptMessage,
    BdxSendAccept,
    BdxSendAcceptMessage,
} from "./schema/BdxAcceptMessagesSchema.js";
import {
    BdxBlock,
    BdxBlockAck,
    BdxBlockAckEof,
    BdxBlockAckEofMessage,
    BdxBlockAckMessage,
    BdxBlockEof,
    BdxBlockEofMessage,
    BdxBlockMessage,
    BdxBlockQuery,
    BdxBlockQueryMessage,
    BdxBlockQueryWithSkip,
    BdxBlockQueryWithSkipMessage,
} from "./schema/BdxBlockMessagesSchema.js";
import { BdxInit, BdxInitMessageSchema } from "./schema/BdxInitMessagesSchema.js";
import { BdxStatusMessage } from "./schema/BdxStatusMessageSchema.js";

const logger = Logger.get("BdxMessenger");

export type BdxMessageWithType<M> = M & {
    messageType: BdxMessageTypes;
};

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
        expectedMessageTypes: number[],
        timeout = this.#messageTimeout,
        expectedMessageInfo?: string,
    ): Promise<BdxMessageWithType<BdxMessage>> {
        logger.debug(`Waiting for Bdx ${expectedMessageTypes.join("/")} message with timeout ${timeout}ms`);

        const message = await this.exchange.nextMessage({ timeout });
        const messageType = message.payloadHeader.messageType;
        if (expectedMessageInfo === undefined) {
            expectedMessageInfo = expectedMessageTypes.map(t => `${t} (${BdxMessageTypes[t]})`).join(",");
        }
        this.throwIfErrorStatusReport(message, expectedMessageInfo);
        if (!expectedMessageTypes.includes(messageType))
            throw new UnexpectedDataError(
                `Received unexpected message type: ${messageType}, expected: ${expectedMessageInfo}`,
            );

        logger.debug(
            `Received Bdx ${BdxMessageTypes[messageType]}${message.payload.byteLength > 0 ? ` with ${message.payload.byteLength}bytes` : ""}`,
            message,
        );
        let decodedMessage: BdxMessage;
        switch (messageType) {
            case BdxMessageTypes.SendAccept:
                decodedMessage = BdxSendAcceptMessage.decode(message.payload);
                break;
            case BdxMessageTypes.ReceiveAccept:
                decodedMessage = BdxReceiveAcceptMessage.decode(message.payload);
                break;
            case BdxMessageTypes.Block:
                decodedMessage = BdxBlockMessage.decode(message.payload);
                break;
            case BdxMessageTypes.BlockQuery:
                decodedMessage = BdxBlockQueryMessage.decode(message.payload);
                break;
            case BdxMessageTypes.BlockQueryWithSkip:
                decodedMessage = BdxBlockQueryWithSkipMessage.decode(message.payload);
                break;
            case BdxMessageTypes.BlockEof:
                decodedMessage = BdxBlockEofMessage.decode(message.payload);
                break;
            case BdxMessageTypes.BlockAck:
                decodedMessage = BdxBlockAckMessage.decode(message.payload);
                break;
            case BdxMessageTypes.BlockAckEof:
                decodedMessage = BdxBlockAckEofMessage.decode(message.payload);
                break;
            default:
                // Should not happen because of the check above
                throw new ImplementationError(`Unsupported Bdx message type: ${messageType}`);
        }
        return { ...decodedMessage, messageType };
    }

    async send(messageType: BdxMessageTypes, message: BdxMessage) {
        logger.debug(
            `Sending Bdx ${BdxMessageTypes[messageType]}${"data" in message && Bytes.isBytes(message.data) ? ` with ${message.data.byteLength}bytes` : ""}`,
            message,
        );
        let payload: Bytes;
        switch (messageType) {
            case BdxMessageTypes.SendInit:
            case BdxMessageTypes.ReceiveInit:
                payload = new BdxInitMessageSchema().encode(message as BdxInit);
                break;
            case BdxMessageTypes.SendAccept:
                payload = BdxSendAcceptMessage.encode(message as BdxSendAccept);
                break;
            case BdxMessageTypes.ReceiveAccept:
                payload = BdxReceiveAcceptMessage.encode(message as BdxReceiveAccept);
                break;
            case BdxMessageTypes.Block:
                payload = BdxBlockMessage.encode(message as BdxBlock);
                break;
            case BdxMessageTypes.BlockQuery:
                payload = BdxBlockQueryMessage.encode(message as BdxBlockQuery);
                break;
            case BdxMessageTypes.BlockQueryWithSkip:
                payload = BdxBlockQueryWithSkipMessage.encode(message as BdxBlockQueryWithSkip);
                break;
            case BdxMessageTypes.BlockEof:
                payload = BdxBlockEofMessage.encode(message as BdxBlockEof);
                break;
            case BdxMessageTypes.BlockAck:
                payload = BdxBlockAckMessage.encode(message as BdxBlockAck);
                break;
            case BdxMessageTypes.BlockAckEof:
                payload = BdxBlockAckEofMessage.encode(message as BdxBlockAckEof);
                break;
            default:
                throw new ImplementationError(`Unsupported Bdx message type: ${messageType}`);
        }
        await this.exchange.send(messageType, payload);
    }

    /** Sends a Bdx SendInit message and waits for the SendAccept message as a response and returns it decoded. */
    async sendSendInit(message: BdxInit) {
        await this.send(BdxMessageTypes.SendInit, message);

        return (await this.nextMessage([BdxMessageTypes.SendAccept])) as unknown as BdxMessageWithType<BdxSendAccept>;
    }

    /** Sends a ReceiveInit message and waits for the ReceiveAccept message as a response and returns it decoded. */
    async sendReceiveInit(message: BdxInit) {
        await this.send(BdxMessageTypes.ReceiveInit, message);

        return (await this.nextMessage([
            BdxMessageTypes.ReceiveAccept,
        ])) as unknown as BdxMessageWithType<BdxReceiveAccept>;
    }

    /** Encodes and sends a Bdx SendAccept message. */
    async sendSendAccept(message: BdxSendAccept) {
        await this.send(BdxMessageTypes.SendAccept, message);
    }

    /** Encodes and sends a Bdx ReceiveAccept message. */
    async sendReceiveAccept(message: BdxReceiveAccept) {
        await this.send(BdxMessageTypes.ReceiveAccept, message);
    }

    /** Encodes and sends a Bdx Block message. */
    async sendBlock(message: BdxBlock) {
        await this.send(BdxMessageTypes.Block, message);
    }

    /** Encodes and sends a Bdx BlockQuery message. */
    async sendBlockQuery(message: BdxBlockQuery) {
        await this.send(BdxMessageTypes.BlockQuery, message);
    }

    /** Encodes and sends a Bdx BlockQueryWithSkip message. */
    async sendBlockQueryWithSkip(message: BdxBlockQueryWithSkip) {
        await this.send(BdxMessageTypes.BlockQueryWithSkip, message);
    }

    /** Encodes and sends a Bdx BlockEof message. */
    async sendBlockEof(message: BdxBlockEof) {
        await this.send(BdxMessageTypes.BlockEof, message);
    }

    /** Encodes and sends a Bdx BlockAck message. */
    async sendBlockAck(message: BdxBlockAck) {
        await this.send(BdxMessageTypes.BlockAck, message);
    }

    /** Encodes and sends a Bdx BlockAckEof message */
    async sendBlockAckEof(message: BdxBlockAckEof) {
        await this.send(BdxMessageTypes.BlockAckEof, message);
    }

    /** Read the next Block message, accepts Block and BlockEof messages. Returns the decoded message and it's type. */
    async readBlock(): Promise<BdxMessageWithType<BdxBlock>> {
        const block = (await this.nextMessage([
            BdxMessageTypes.Block,
            BdxMessageTypes.BlockEof,
        ])) as unknown as BdxMessageWithType<BdxBlock | BdxBlockEof>;
        if (block.messageType !== BdxMessageTypes.BlockEof && block.data.byteLength === 0) {
            // empty block only allowed in BlockAckEof
            throw new BdxError("Received empty data in Block message", BdxStatusCode.BadMessageContent);
        }
        return block;
    }

    /**
     * Read the next BlockQuery message, accepts BlockQuery and BlockQueryWithSkip and BlockAck messages.
     * When a BlockAck is received, it will be validated and the next BlockQuery message will be read.
     * Returns the decoded message and it's type.
     */
    async readBlockQuery(): Promise<BdxMessageWithType<BdxBlockQuery | BdxBlockQueryWithSkip>> {
        let message = (await this.nextMessage([
            BdxMessageTypes.BlockQuery,
            BdxMessageTypes.BlockQueryWithSkip,
            BdxMessageTypes.BlockAck,
        ])) as unknown as BdxMessageWithType<BdxBlockQuery | BdxBlockQueryWithSkip | BdxBlockAck>;
        let expectedBlockMessageCounter: number | undefined = undefined;
        if (message.messageType === BdxMessageTypes.BlockAck) {
            expectedBlockMessageCounter = (message.blockCounter + 1) % 0x100000000; // wrap around at 2^32
            message = (await this.nextMessage([
                BdxMessageTypes.BlockQuery,
                BdxMessageTypes.BlockQueryWithSkip,
            ])) as unknown as BdxMessageWithType<BdxBlockQuery | BdxBlockQueryWithSkip>;
        }

        // Ensure that if we got an Ack Message that the blockCounter is as expected because this cannot be done outside
        if (expectedBlockMessageCounter !== undefined && message.blockCounter !== expectedBlockMessageCounter) {
            throw new BdxError(
                `Received BlockQuery with unexpected block counter: ${message.blockCounter}, expected: ${expectedBlockMessageCounter}`,
                BdxStatusCode.BadBlockCounter,
            );
        }

        return message;
    }

    /** Reads the next BlockAckEof message and returns the decoded message. */
    async readBlockAckEof() {
        return (await this.nextMessage([BdxMessageTypes.BlockAckEof])) as unknown as BdxMessageWithType<BdxBlockAckEof>;
    }

    /** Reads the next BlockAck message and returns the decoded message. */
    async readBlockAck() {
        return (await this.nextMessage([BdxMessageTypes.BlockAck])) as unknown as BdxMessageWithType<BdxBlockAck>;
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
     * Ensure that the value is a number and that it is not too large. Matter spec allows also 64bit values, but they
     * make little sense for now, so make sure we handle them as too large. MAX_SAFE_INTEGER is 2^53-1 and is
     * enough for now.
     */
    asNumber(value: number | bigint | undefined, context = "", bdxErrorCode = BdxStatusCode.Unknown): number {
        if (typeof value !== "number" && typeof value !== "bigint") {
            throw new InternalError(`${context} ${value} is not a number`); // Should not happen
        }
        if (value > Number.MAX_SAFE_INTEGER) {
            throw new BdxError(`${context} ${value} exceeds maximum safe integer value`, bdxErrorCode);
        }
        return Number(value);
    }
}
