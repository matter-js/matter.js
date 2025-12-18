/**
 * @license
 * Copyright 2022-2025 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { BdxError } from "#bdx/BdxError.js";
import { FileDesignator } from "#bdx/FileDesignator.js";
import { PersistedFileDesignator } from "#bdx/PersistedFileDesignator.js";
import { ScopedStorage } from "#bdx/ScopedStorage.js";
import { Duration, Environment, Environmental, isDeepEqual, Logger, MatterError, Observable } from "#general";
import { PeerAddress } from "#peer/PeerAddress.js";
import { ExchangeManager } from "#protocol/ExchangeManager.js";
import { MessageExchange } from "#protocol/MessageExchange.js";
import { ProtocolHandler } from "#protocol/ProtocolHandler.js";
import { SecureSession } from "#session/SecureSession.js";
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
    readonly #activeBdxSessions = new Map<MessageExchange, { session: BdxSession; scope: string }>();
    #peerScopes = new Map<string, { peer: PeerAddress; storage: ScopedStorage; config?: BdxProtocol.Config }>();
    #sessionStarted = Observable<[session: BdxSession, scope: string]>();
    #sessionClosed = Observable<[session: BdxSession, scope: string]>();

    static [Environmental.create](env: Environment) {
        const instance = new BdxProtocol();
        env.get(ExchangeManager).addProtocolHandler(instance);
        env.set(BdxProtocol, instance);
        return instance;
    }

    get sessionStarted() {
        return this.#sessionStarted;
    }

    get sessionClosed() {
        return this.#sessionClosed;
    }

    #peerScopeKey(peer: PeerAddress, scope?: string) {
        if (scope === undefined) {
            throw new MatterError("StorageContext must have a defined scope to be used with enableScope");
        }
        return `${peer.toString()}-${scope}`;
    }

    enablePeerForScope(peer: PeerAddress, storage: ScopedStorage, config?: BdxProtocol.Config) {
        const peerScopeStr = this.#peerScopeKey(peer, storage.scope);
        const peerDetails = this.#peerScopes.get(peerScopeStr);
        if (peerDetails !== undefined) {
            const { storage: existingStorage, config: existingConfig } = peerDetails;
            logger.warn(config, "vs", existingConfig);
            if (existingStorage !== storage || isDeepEqual(config, existingConfig)) {
                return false;
            }
        } else {
            this.#peerScopes.set(peerScopeStr, { peer, storage, config });
        }
        return true;
    }

    async disablePeerForScope(peer: PeerAddress, storage: ScopedStorage, force = false) {
        if (this.#activeBdxSessions.size > 0) {
            for (const { session, scope } of this.#activeBdxSessions.values()) {
                if (storage.scope === scope && PeerAddress.is(peer, session.peerAddress)) {
                    if (force) {
                        await session.close(new MatterError("BDX protocol scope disabled"));
                        break;
                    }
                    throw new MatterError(
                        `Cannot disable BDX for peer "${peer}" (scope: ${scope}) because there are active BDX sessions using it`,
                    );
                }
            }
        }
        this.#peerScopes.delete(this.#peerScopeKey(peer, storage.scope));
    }

    async onNewExchange(exchange: MessageExchange, message: Message) {
        const initMessageType = message.payloadHeader.messageType;
        SecureSession.assert(exchange.session);

        switch (initMessageType) {
            case BdxMessageType.SendInit:
            case BdxMessageType.ReceiveInit:
                logger.debug(
                    `Initialize Session for ${BdxMessageType[initMessageType]} message on BDX protocol for exchange ${exchange.id}`,
                );
                await exchange.nextMessage(); // Read the message we just know

                const { payload } = message;

                const initMessage = new BdxInitMessageSchema().decode(payload);
                const { fileDesignator: messageFileDesignator } = initMessage;
                const fd = new FileDesignator(messageFileDesignator);
                const [storageScope, fileDesignator] = fd.text.split("/");
                const { storage, config } =
                    this.#peerScopes.get(this.#peerScopeKey(exchange.session.peerAddress, storageScope)) ?? {};
                if (storage === undefined || fileDesignator === undefined) {
                    throw new BdxError(
                        `No storage context found for BDX file designator "${fd.text}"`,
                        BdxStatusCode.FileDesignatorUnknown,
                    );
                }

                const messenger = new BdxMessenger(exchange, config?.messageTimeout);

                const bdxSession = BdxSession.fromMessage(messenger, {
                    initMessageType,
                    initMessage,
                    fileDesignator: new PersistedFileDesignator(fileDesignator, storage),
                    ...config,
                });
                await this.#registerSession(messenger, bdxSession, storageScope);

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
                await new BdxMessenger(exchange).sendError(BdxStatusCode.UnexpectedMessage);
        }
    }

    /** Make sure only one BDX session can be active per exchange and that the exchange is closed with the BDX session. */
    async #registerSession(messenger: BdxMessenger, bdxSession: BdxSession, scope: string) {
        const exchange = messenger.exchange;
        if (this.#activeBdxSessions.has(exchange)) {
            logger.warn(`BDX session for exchange ${exchange.id} already exists, sending error`);
            await messenger.sendError(BdxStatusCode.UnexpectedMessage);
            return;
        }
        this.#activeBdxSessions.set(exchange, { session: bdxSession, scope });

        this.#sessionStarted.emit(bdxSession, scope);

        bdxSession.closed.on(async () => {
            logger.debug(`BDX session for exchange ${exchange.id} closed`);
            this.#activeBdxSessions.delete(exchange);
            await exchange.close();

            this.#sessionClosed.emit(bdxSession, scope);
        });
    }

    async close() {
        logger.debug(`Closing BDX protocol handler with ${this.#activeBdxSessions.size} active sessions`);
        for (const { session } of this.#activeBdxSessions.values()) {
            await session.close(new MatterError("BDX protocol handler closed"));
        }
        this.#activeBdxSessions.clear();
    }
}

export namespace BdxProtocol {
    export interface Config extends BdxSessionConfiguration.Config {
        messageTimeout?: Duration;
    }
}
