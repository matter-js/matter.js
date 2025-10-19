/**
 * @license
 * Copyright 2022-2025 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { FabricManager } from "#fabric/FabricManager.js";
import { AsyncObservable, Environment, Environmental, Logger, MatterFlowError } from "#general";
import { ExchangeManager } from "#protocol/ExchangeManager.js";
import { SessionManager } from "#session/SessionManager.js";
import {
    GeneralStatusCode,
    SECURE_CHANNEL_PROTOCOL_ID,
    SecureChannelStatusCode,
    SecureMessageType,
    StatusCode,
    StatusResponseError,
} from "#types";
import { Message } from "../codec/MessageCodec.js";
import { MessageExchange } from "../protocol/MessageExchange.js";
import { ProtocolHandler } from "../protocol/ProtocolHandler.js";
import { SecureSession } from "../session/SecureSession.js";
import { CaseServer } from "../session/case/CaseServer.js";
import { MaximumPasePairingErrorsReachedError, PaseServer } from "../session/pase/PaseServer.js";
import { ChannelStatusResponseError, SecureChannelMessenger } from "./SecureChannelMessenger.js";
import { SecureChannelStatusMessage } from "./SecureChannelStatusMessageSchema.js";

const logger = Logger.get("SecureChannelProtocol");

export class StatusReportOnlySecureChannelProtocol implements ProtocolHandler {
    readonly id = SECURE_CHANNEL_PROTOCOL_ID;

    // We need to check the message details to decide if ok or not, so we take them all
    readonly requiresSecureSession = undefined;

    async onNewExchange(exchange: MessageExchange, message: Message) {
        const messageType = message.payloadHeader.messageType;

        switch (messageType) {
            case SecureMessageType.StatusReport:
                await this.handleInitialStatusReport(exchange, message);
                break;
            default:
                // We silently ignore incoming Standalone Ack messages that we do not expect here
                if (messageType !== SecureMessageType.StandaloneAck) {
                    throw new StatusResponseError(
                        `Unexpected initial message on secure channel protocol: ${messageType.toString(16)}`,
                        StatusCode.InvalidAction,
                    );
                }
        }
    }

    async handleInitialStatusReport(exchange: MessageExchange, message: Message) {
        const {
            payloadHeader: { messageType },
            payload,
        } = message;
        if (messageType !== SecureMessageType.StatusReport) {
            throw new MatterFlowError(
                `Unexpected message type on secure channel protocol, expected StatusReport: ${messageType.toString(
                    16,
                )}`,
            );
        }

        const { generalStatus, protocolId, protocolStatus } = SecureChannelStatusMessage.decode(payload);
        if (generalStatus !== GeneralStatusCode.Success) {
            throw new ChannelStatusResponseError(
                `Received general error status (${protocolId})`,
                generalStatus,
                protocolStatus,
            );
        }

        // CloseSession is the only case where a StatusReport comes as initial message
        if (protocolStatus !== SecureChannelStatusCode.CloseSession) {
            throw new ChannelStatusResponseError(
                `Received general success status, but protocol status is not CloseSession`,
                generalStatus,
                protocolStatus,
            );
        }

        const { session } = exchange;
        SecureSession.assert(session);
        logger.debug(`Peer requested to close session ${session.name}. Remove session now.`);
        // TODO: and do more - see Core Specs 5.5
        await session.destroy(false, false);
    }

    async close() {
        // Nothing to do
    }
}

export class SecureChannelProtocol extends StatusReportOnlySecureChannelProtocol {
    #paseCommissioner: PaseServer | undefined;
    readonly #caseCommissioner: CaseServer;
    readonly #tooManyPaseErrors = AsyncObservable<[]>();

    constructor(sessions: SessionManager, fabrics: FabricManager) {
        super();
        this.#caseCommissioner = new CaseServer(sessions, fabrics);
    }

    static [Environmental.create](env: Environment) {
        const instance = new SecureChannelProtocol(env.get(SessionManager), env.get(FabricManager));
        env.get(ExchangeManager).addProtocolHandler(instance);
        env.set(SecureChannelProtocol, instance);
        return instance;
    }

    /**
     * Emitted when the active PASE session hits the maximum error threshold.
     */
    get tooManyPaseErrors() {
        return this.#tooManyPaseErrors;
    }

    setPaseCommissioner(paseServer: PaseServer) {
        this.#paseCommissioner = paseServer;
    }

    removePaseCommissioner() {
        this.#paseCommissioner = undefined;
    }

    override async onNewExchange(exchange: MessageExchange, message: Message) {
        const messageType = message.payloadHeader.messageType;

        switch (messageType) {
            case SecureMessageType.PbkdfParamRequest:
                if (this.#paseCommissioner === undefined) {
                    // Cleaner to return an error (ok for chip-tool as it seems)?
                    // Formally we should not respond at all which leads to retries and such
                    const messenger = new SecureChannelMessenger(exchange);
                    await messenger.sendError(SecureChannelStatusCode.InvalidParam);
                    await messenger.close(); // also closes exchange
                    return;
                }
                try {
                    await this.#paseCommissioner.onNewExchange(exchange);
                } catch (error) {
                    MaximumPasePairingErrorsReachedError.accept(error);

                    await this.#tooManyPaseErrors.emit();
                }
                break;
            case SecureMessageType.Sigma1:
                await this.#caseCommissioner.onNewExchange(exchange);
                break;
            default:
                await super.onNewExchange(exchange, message);
        }
    }
}
