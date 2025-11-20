/**
 * @license
 * Copyright 2022-2025 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { Diagnostic, Duration, MatterError, Seconds, UnexpectedDataError } from "#general";
import { GeneralStatusCode, SecureChannelStatusCode, SecureMessageType, TlvSchema } from "#types";
import { Message } from "../codec/MessageCodec.js";
import { ExchangeSendOptions, MessageExchange } from "../protocol/MessageExchange.js";
import { SecureChannelStatusMessage } from "./SecureChannelStatusMessageSchema.js";

/** Error base Class for all errors related to the status response messages. */
export class ChannelStatusResponseError extends MatterError {
    public constructor(
        message: string,
        public readonly generalStatusCode: GeneralStatusCode,
        public readonly protocolStatusCode: SecureChannelStatusCode,
    ) {
        super(
            `(${GeneralStatusCode[generalStatusCode]} (${generalStatusCode}) / ${SecureChannelStatusCode[protocolStatusCode]} (${protocolStatusCode})) ${message}`,
        );
    }
}

/** This value is used by chip SDK when performance wise heavy crypto operations are expected. */
export const EXPECTED_CRYPTO_PROCESSING_TIME = Seconds(30);

/** This value is used by chip SDK when normal processing time is expected. */
export const DEFAULT_NORMAL_PROCESSING_TIME = Seconds(2);

export class SecureChannelMessenger {
    #defaultExpectedProcessingTime: Duration;

    constructor(
        protected readonly exchange: MessageExchange,
        defaultExpectedProcessingTime = EXPECTED_CRYPTO_PROCESSING_TIME,
    ) {
        this.#defaultExpectedProcessingTime = defaultExpectedProcessingTime;
    }

    get channel() {
        return this.exchange.channel;
    }

    async nextMessage(
        expectedMessageType: number,
        expectedProcessingTimeMs = this.#defaultExpectedProcessingTime,
        expectedMessageInfo?: string,
    ) {
        return this.#nextMessage(expectedMessageType, expectedProcessingTimeMs, expectedMessageInfo);
    }

    async anyNextMessage(expectedMessageInfo: string, expectedProcessingTime = this.#defaultExpectedProcessingTime) {
        return this.#nextMessage(undefined, expectedProcessingTime, expectedMessageInfo);
    }

    /**
     * Waits for the next message and returns it.
     *
     * When no expectedProcessingTimeMs is provided, the default value of EXPECTED_CRYPTO_PROCESSING_TIME_MS is used.
     */
    async #nextMessage(
        expectedMessageType?: number,
        expectedProcessingTime = this.#defaultExpectedProcessingTime,
        expectedMessageInfo?: string,
    ) {
        const message = await this.exchange.nextMessage({ expectedProcessingTime });
        const messageType = message.payloadHeader.messageType;
        if (expectedMessageType !== undefined && expectedMessageInfo === undefined) {
            expectedMessageInfo = SecureMessageType[expectedMessageType];
        }
        this.throwIfErrorStatusReport(message, expectedMessageInfo);
        if (expectedMessageType !== undefined && messageType !== expectedMessageType)
            throw new UnexpectedDataError(
                `Received unexpected message type: ${messageType}, expected: ${expectedMessageType} (${expectedMessageInfo})`,
            );
        return message;
    }

    /**
     * Waits for the next message and decodes it.
     *
     * When no expectedProcessingTimeMs is provided, the default value of EXPECTED_CRYPTO_PROCESSING_TIME_MS is used.
     */
    async nextMessageDecoded<T>(
        expectedMessageType: number,
        schema: TlvSchema<T>,
        expectedProcessingTime = this.#defaultExpectedProcessingTime,
    ) {
        return schema.decode((await this.nextMessage(expectedMessageType, expectedProcessingTime)).payload);
    }

    /**
     * Waits for the next message and returns it.
     *
     * When no expectedProcessingTimeMs is provided, the default value of EXPECTED_CRYPTO_PROCESSING_TIME_MS is used.
     */
    async waitForSuccess(expectedMessageInfo: string, expectedProcessingTime = this.#defaultExpectedProcessingTime) {
        // If the status is not Success, this would throw an Error.
        await this.nextMessage(SecureMessageType.StatusReport, expectedProcessingTime, expectedMessageInfo);
    }

    /**
     * Sends a message of the given type with the given payload.
     *
     * If no ExchangeSendOptions are provided, the expectedProcessingTimeMs will be set to
     * EXPECTED_CRYPTO_PROCESSING_TIME_MS.
     */
    async send<T>(message: T, type: number, schema: TlvSchema<T>, options?: ExchangeSendOptions) {
        options = {
            ...options,
            expectedProcessingTime: options?.expectedProcessingTime ?? this.#defaultExpectedProcessingTime,
        };
        const payload = schema.encode(message);
        await this.exchange.send(type, payload, options);
        return payload;
    }

    sendError(code: SecureChannelStatusCode) {
        return this.#sendStatusReport(GeneralStatusCode.Failure, code);
    }

    sendSuccess() {
        return this.#sendStatusReport(GeneralStatusCode.Success, SecureChannelStatusCode.Success);
    }

    sendCloseSession() {
        return this.#sendStatusReport(GeneralStatusCode.Success, SecureChannelStatusCode.CloseSession, false);
    }

    get channelName() {
        return this.exchange.channel.channel.name;
    }

    [Symbol.asyncDispose]() {
        return this.close();
    }

    async close() {
        await this.exchange.close();
    }

    async #sendStatusReport(
        generalStatus: GeneralStatusCode,
        protocolStatus: SecureChannelStatusCode,
        requiresAck?: boolean,
    ) {
        await this.exchange.send(
            SecureMessageType.StatusReport,
            SecureChannelStatusMessage.encode({
                generalStatus,
                protocolStatus,
            }),
            {
                requiresAck,
                logContext: {
                    generalStatus: GeneralStatusCode[generalStatus] ?? Diagnostic.hex(generalStatus),
                    protocolStatus: SecureChannelStatusCode[protocolStatus] ?? Diagnostic.hex(protocolStatus),
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

        const { generalStatus, protocolId, protocolStatus } = SecureChannelStatusMessage.decode(payload);
        if (generalStatus !== GeneralStatusCode.Success) {
            throw new ChannelStatusResponseError(
                `Received general error status for protocol ${protocolId}${logHint ? ` (${logHint})` : ""}`,
                generalStatus,
                protocolStatus,
            );
        }
        if (protocolStatus !== SecureChannelStatusCode.Success) {
            throw new ChannelStatusResponseError(
                `Received general success status, but protocol status is not Success${logHint ? ` (${logHint})` : ""}`,
                generalStatus,
                protocolStatus,
            );
        }
    }
}
