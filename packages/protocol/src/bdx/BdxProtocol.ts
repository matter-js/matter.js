/**
 * @license
 * Copyright 2022-2025 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { Logger, MatterError, StorageContext } from "#general";
import { MessageExchange } from "#protocol/MessageExchange.js";
import { ProtocolHandler } from "#protocol/ProtocolHandler.js";
import { BDX_PROTOCOL_ID, BdxMessageType, BdxStatusCode } from "#types";
import { Message } from "../codec/MessageCodec.js";
import { BdxMessenger } from "./BdxMessenger.js";
import { BdxSession } from "./BdxSession.js";
import { BdxSessionConfiguration } from "./BdxSessionConfiguration.js";
import { BdxInitMessageSchema } from "./schema/BdxInitMessagesSchema.js";

const logger = Logger.get("BdxProtocol");

/** BDX protocol handler. */
export class BdxProtocol implements ProtocolHandler {
    readonly id = BDX_PROTOCOL_ID;
    readonly requiresSecureSession = true;
    readonly #activeBdxSessions = new Map<MessageExchange, BdxSession>();
    #storage: StorageContext;
    #bdxLimits?: BdxSessionConfiguration.Config;

    /**
     * Create a new BDX protocol handler.
     * @param storage StorageContext to read or write files from/to.
     * @param options BDX options/limits to use for this session. us this to control how the transfer should behave.
     */
    constructor(storage: StorageContext, options?: BdxSessionConfiguration.Config) {
        this.#storage = storage;
        this.#bdxLimits = options;
    }

    async onNewExchange(exchange: MessageExchange, message: Message) {
        const initMessageType = message.payloadHeader.messageType;
        const messenger = new BdxMessenger(exchange);

        switch (initMessageType) {
            case BdxMessageType.SendInit:
            case BdxMessageType.ReceiveInit:
                logger.debug(
                    `Initialize Session for ${BdxMessageType[initMessageType]} message on BDX protocol for exchange ${exchange.id}`,
                );
                const { payload } = message;
                const bdxSession = BdxSession.fromMessage(this.#storage, messenger, {
                    initMessageType,
                    initMessage: new BdxInitMessageSchema().decode(payload),
                    ...this.#bdxLimits,
                });
                await this.#registerSession(messenger, bdxSession);

                try {
                    await bdxSession.processTransfer();
                } catch (error) {
                    logger.error(`Error processing BDX transfer:`, error);
                }

                break;
            default:
                logger.warn(
                    `Unexpected BDX message type ${BdxMessageType[initMessageType]} on new exchange ${exchange.id}`,
                );
                await messenger.sendError(BdxStatusCode.UnexpectedMessage);
        }
    }

    /** Make sure only one BDX session can be active per exchange and that the exchange is closed with the BDX session. */
    async #registerSession(messenger: BdxMessenger, bdxSession: BdxSession) {
        const exchange = messenger.exchange;
        if (this.#activeBdxSessions.has(exchange)) {
            logger.warn(`BDX session for exchange ${exchange.id} already exists, sending error`);
            await messenger.sendError(BdxStatusCode.UnexpectedMessage);
            return;
        }
        this.#activeBdxSessions.set(exchange, bdxSession);
        bdxSession.closed.on(async () => {
            logger.debug(`BDX session for exchange ${exchange.id} closed`);
            this.#activeBdxSessions.delete(exchange);
            await exchange.close();
        });
    }

    async close() {
        logger.debug(`Closing BDX protocol handler with ${this.#activeBdxSessions.size} active sessions`);
        for (const session of this.#activeBdxSessions.values()) {
            await session.close(new MatterError("BDX protocol handler closed"));
        }
        this.#activeBdxSessions.clear();
    }
}
