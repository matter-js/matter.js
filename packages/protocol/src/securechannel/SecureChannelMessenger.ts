/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { Diagnostic, Duration, Seconds, UnexpectedDataError } from "#general";
import { PeerCommunicationError } from "#peer/PeerCommunicationError.js";
import { GeneralStatusCode, SecureChannelStatusCode, SecureMessageType, TlvSchema } from "#types";
import { Message } from "../codec/MessageCodec.js";
import { ExchangeSendOptions, MessageExchange } from "../protocol/MessageExchange.js";
import { SecureChannelStatusMessage } from "./SecureChannelStatusMessageSchema.js";

/** Error base Class for all errors related to the status response messages. */
export class ChannelStatusResponseError extends PeerCommunicationError {
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
        readonly exchange: MessageExchange,
        defaultExpectedProcessingTime = EXPECTED_CRYPTO_PROCESSING_TIME,
    ) {
        this.#defaultExpectedProcessingTime = defaultExpectedProcessingTime;
    }

    get channel() {
        return this.exchange.channel;
    }

    get via() {
        return this.exchange.via;
    }

    /**
     * Waits for the next message and returns it.
     *
     * {@link expectedProcessingTime} defaults to {@link EXPECTED_CRYPTO_PROCESSING_TIME}.
     */
    async nextMessage({ type, expectedProcessingTime, description, abort }: SecureChannelMessenger.ReadOptions = {}) {
        const message = await this.exchange.nextMessage({ expectedProcessingTime, abort });
        const messageType = message.payloadHeader.messageType;
        if (type !== undefined && description === undefined) {
            description = SecureMessageType[type];
        }
        this.throwIfErrorStatusReport(message, description);
        if (type !== undefined && messageType !== type)
            throw new UnexpectedDataError(
                `Received unexpected message type: ${messageType}, expected: ${type} (${description})`,
            );
        return message;
    }

    /**
     * Waits for the next message and decodes it.
     *
     * When no expectedProcessingTimeMs is provided, the default value of EXPECTED_CRYPTO_PROCESSING_TIME_MS is used.
     */
    async nextMessageDecoded<T>(schema: TlvSchema<T>, options?: SecureChannelMessenger.ReadOptions) {
        return schema.decode((await this.nextMessage(options)).payload);
    }

    /**
     * Waits for the next message and returns it.
     *
     * When no expectedProcessingTimeMs is provided, the default value of EXPECTED_CRYPTO_PROCESSING_TIME_MS is used.
     */
    async waitForSuccess(options?: Omit<SecureChannelMessenger.ReadOptions, "type">) {
        // If the status is not Success, this would throw an Error.
        await this.nextMessage({
            ...options,
            type: SecureMessageType.StatusReport,
        });
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

    sendError(code: SecureChannelStatusCode, abort?: AbortSignal) {
        return this.#sendStatusReport(GeneralStatusCode.Failure, code, abort);
    }

    sendSuccess(abort?: AbortSignal) {
        return this.#sendStatusReport(GeneralStatusCode.Success, SecureChannelStatusCode.Success, abort);
    }

    sendCloseSession(abort?: AbortSignal) {
        return this.#sendStatusReport(GeneralStatusCode.Success, SecureChannelStatusCode.CloseSession, abort);
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
        abort?: AbortSignal,
    ) {
        await this.exchange.send(
            SecureMessageType.StatusReport,
            SecureChannelStatusMessage.encode({
                generalStatus,
                protocolStatus,
            }),
            {
                logContext: {
                    generalStatus: GeneralStatusCode[generalStatus] ?? Diagnostic.hex(generalStatus),
                    protocolStatus: SecureChannelStatusCode[protocolStatus] ?? Diagnostic.hex(protocolStatus),
                },
                abort,
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

export namespace SecureChannelMessenger {
    /**
     * Controls message read.
     */
    export interface ReadOptions {
        /**
         * The expected type of the message.
         *
         * The messenger throws an error if a message arrives that is not of this type.
         */
        type?: SecureMessageType;

        /**
         * Processing time used as input to timeout algorithms.
         */
        expectedProcessingTime?: Duration;

        /**
         * Description of read operation used in diagnostic messages.
         */
        description?: string;

        /**
         * Aborts the read.
         */
        abort?: AbortSignal;
    }
}
