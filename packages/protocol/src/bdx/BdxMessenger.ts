/**
 * @license
 * Copyright 2022-2025 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { Message } from "#codec/MessageCodec.js";
import { Diagnostic, Duration, InternalError, Logger, Minutes, UnexpectedDataError } from "#general";
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
    async nextMessage(expectedMessageTypes: number[], timeout = this.#messageTimeout, expectedMessageInfo?: string) {
        const message = await this.exchange.nextMessage({ timeout });
        const messageType = message.payloadHeader.messageType;
        if (expectedMessageTypes !== undefined && expectedMessageInfo === undefined) {
            expectedMessageInfo = expectedMessageTypes.map(t => `${t} (${BdxMessageTypes[t]})`).join(",");
        }
        this.throwIfErrorStatusReport(message, expectedMessageInfo);
        if (expectedMessageTypes !== undefined && !expectedMessageTypes.includes(messageType))
            throw new UnexpectedDataError(
                `Received unexpected message type: ${messageType}, expected: ${expectedMessageInfo}`,
            );
        return message;
    }

    /** Sends a Bdx SendInit message and waits for the SendAccept message as a response and returns it decoded. */
    async sendSendInit(message: BdxInit) {
        logger.debug(`Sending Bdx SendInit`, message);
        await this.exchange.send(BdxMessageTypes.SendInit, new BdxInitMessageSchema().encode(message));

        const acceptMessage = await this.nextMessage([BdxMessageTypes.SendAccept]);
        const result = BdxSendAcceptMessage.decode(acceptMessage.payload);
        logger.debug(`Received Bdx SendAccept`, result);
        return result;
    }

    /** Sends a ReceiveInit message and waits for the ReceiveAccept message as a response and returns it decoded. */
    async sendReceiveInit(message: BdxInit) {
        logger.debug("Sending Bdx ReceiveInit", message);
        await this.exchange.send(BdxMessageTypes.ReceiveInit, new BdxInitMessageSchema().encode(message));

        const acceptMessage = await this.nextMessage([BdxMessageTypes.ReceiveAccept]);
        const result = BdxReceiveAcceptMessage.decode(acceptMessage.payload);
        logger.debug("Received Bdx ReceiveAccept", result);
        return result;
    }

    /** Encodes and sends a Bdx SendAccept message. */
    async sendSendAccept(message: BdxSendAccept) {
        logger.debug("Sending Bdx SendAccept", message);
        await this.exchange.send(BdxMessageTypes.SendAccept, BdxSendAcceptMessage.encode(message));
    }

    /** Encodes and sends a Bdx ReceiveAccept message. */
    async sendReceiveAccept(message: BdxReceiveAccept) {
        logger.debug("Sending Bdx ReceiveAccept", message);
        await this.exchange.send(BdxMessageTypes.ReceiveAccept, BdxReceiveAcceptMessage.encode(message));
    }

    /** Encodes and sends a Bdx Block message. */
    async sendBlock(message: BdxBlock) {
        logger.debug(`Sending Bdx Block with ${message.data.byteLength}bytes`, message);
        await this.exchange.send(BdxMessageTypes.Block, BdxBlockMessage.encode(message));
    }

    /** Encodes and sends a Bdx BlockQuery message. */
    async sendBlockQuery(message: BdxBlockQuery) {
        logger.debug("Sending Bdx BlockQuery", message);
        await this.exchange.send(BdxMessageTypes.BlockQuery, BdxBlockQueryMessage.encode(message));
    }

    /** Encodes and sends a Bdx BlockQueryWithSkip message. */
    async sendBlockQueryWithSkip(message: BdxBlockQueryWithSkip) {
        logger.debug("Sending Bdx BlockQueryWithSkip", message);
        await this.exchange.send(BdxMessageTypes.BlockQueryWithSkip, BdxBlockQueryWithSkipMessage.encode(message));
    }

    /** Encodes and sends a Bdx BlockEof message. */
    async sendBlockEof(message: BdxBlockEof) {
        logger.debug(`Sending Bdx BlockEof with ${message.data.byteLength}bytes`, message);
        await this.exchange.send(BdxMessageTypes.BlockEof, BdxBlockEofMessage.encode(message));
    }

    /** Encodes and sends a Bdx BlockAck message. */
    async sendBlockAck(message: BdxBlockAck) {
        logger.debug("Sending Bdx BlockAck", message);
        await this.exchange.send(BdxMessageTypes.BlockAck, BdxBlockAckMessage.encode(message));
    }

    /** Encodes and sends a Bdx BlockAckEof message */
    async sendBlockAckEof(message: BdxBlockAckEof) {
        logger.debug("Sending Bdx BlockAckEof", message);
        await this.exchange.send(BdxMessageTypes.BlockAckEof, BdxBlockAckEofMessage.encode(message));
    }

    /** Read the next Block message, accepts Block and BlockEof messages. Returns the decoded message and it's type. */
    async readBlock(): Promise<BdxMessageWithType<BdxBlock>> {
        logger.debug("Waiting for Bdx Block");
        const message = await this.nextMessage([BdxMessageTypes.Block, BdxMessageTypes.BlockEof]);
        const messageType = message.payloadHeader.messageType;
        const block = BdxBlockMessage.decode(message.payload);
        if (messageType !== BdxMessageTypes.BlockEof && block.data.byteLength === 0) {
            // empty block only allowed in BlockAckEof
            throw new BdxError("Received empty data in Block message", BdxStatusCode.BadMessageContent);
        }
        logger.debug(`Received Bdx Block with ${block.data.byteLength}bytes`, block);
        return { ...block, messageType };
    }

    /**
     * Read the next BlockQuery message, accepts BlockQuery and BlockQueryWithSkip and BlockAck messages.
     * When a BlockAck is received, it will be validated and the next BlockQuery message will be read.
     * Returns the decoded message and it's type.
     */
    async readBlockQuery(): Promise<BdxMessageWithType<BdxBlockQuery | BdxBlockQueryWithSkip>> {
        logger.debug("Waiting for Bdx BlockQuery");
        let message = await this.nextMessage([
            BdxMessageTypes.BlockQuery,
            BdxMessageTypes.BlockQueryWithSkip,
            BdxMessageTypes.BlockAck,
        ]);
        let expectedBlockMessageCounter: number | undefined = undefined;
        if (message.payloadHeader.messageType === BdxMessageTypes.BlockAck) {
            const ack = BdxBlockAckMessage.decode(message.payload);
            expectedBlockMessageCounter = (ack.blockCounter + 1) % 0x100000000; // wrap around at 2^32
            message = await this.nextMessage([BdxMessageTypes.BlockQuery, BdxMessageTypes.BlockQueryWithSkip]);
        }
        const messageType = message.payloadHeader.messageType;
        const query =
            messageType === BdxMessageTypes.BlockQuery
                ? BdxBlockQueryMessage.decode(message.payload)
                : BdxBlockQueryWithSkipMessage.decode(message.payload);

        // Ensure that if we got an Ack Message that the blockCounter is as expected because this cannot be done outside
        if (expectedBlockMessageCounter !== undefined && query.blockCounter !== expectedBlockMessageCounter) {
            throw new BdxError(
                `Received BlockQuery with unexpected block counter: ${query.blockCounter}, expected: ${expectedBlockMessageCounter}`,
                BdxStatusCode.BadBlockCounter,
            );
        }
        logger.debug(
            `Received Bdx BlockQuery${messageType === BdxMessageTypes.BlockQueryWithSkip ? "WithSkip" : ""}`,
            query,
        );
        return { ...query, messageType };
    }

    /** Reads the next BlockAckEof message and returns the decoded message. */
    async readBlockAckEof() {
        logger.debug("Waiting for Bdx BlockAckEof");
        const message = await this.nextMessage([BdxMessageTypes.BlockAckEof]);
        const result = BdxBlockAckEofMessage.decode(message.payload);
        logger.debug("Received Bdx BlockAckEof", result);
        return result;
    }

    /** Reads the next BlockAck message and returns the decoded message. */
    async readBlockAck() {
        logger.debug("Waiting for Bdx BlockAck");
        const message = await this.nextMessage([BdxMessageTypes.BlockAck]);
        const result = BdxBlockAckMessage.decode(message.payload);
        logger.debug("Received Bdx BlockAck", result);
        return result;
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
