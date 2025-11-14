/**
 * @license
 * Copyright 2022-2025 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import {
    Bytes,
    Crypto,
    Diagnostic,
    ec,
    Logger,
    MatterFlowError,
    PbkdfParameters,
    Seconds,
    Spake2p,
    Time,
    Timer,
    UnexpectedDataError,
} from "#general";
import { SessionManager } from "#session/SessionManager.js";
import { NodeId, SECURE_CHANNEL_PROTOCOL_ID, SecureChannelStatusCode } from "#types";
import { MessageExchange } from "../../protocol/MessageExchange.js";
import { ProtocolHandler } from "../../protocol/ProtocolHandler.js";
import { ChannelStatusResponseError } from "../../securechannel/SecureChannelMessenger.js";
import { DEFAULT_PASSCODE_ID, PaseServerMessenger, SPAKE_CONTEXT } from "./PaseMessenger.js";

const { bytesToNumberBE } = ec;

const logger = Logger.get("PaseServer");

const PASE_PAIRING_TIMEOUT_MS = Seconds(60);
const PASE_COMMISSIONING_MAX_ERRORS = 20;

export class MaximumPasePairingErrorsReachedError extends MatterFlowError {}

export class PaseServer implements ProtocolHandler {
    readonly id = SECURE_CHANNEL_PROTOCOL_ID;
    readonly requiresSecureSession = false;

    #pairingTimer?: Timer;
    #pairingMessenger?: PaseServerMessenger;
    #pairingErrors = 0;
    #closed = false;

    static async fromPin(sessions: SessionManager, setupPinCode: number, pbkdfParameters: PbkdfParameters) {
        const { w0, L } = await Spake2p.computeW0L(sessions.crypto, pbkdfParameters, setupPinCode);
        return new PaseServer(sessions, w0, L, pbkdfParameters);
    }

    static fromVerificationValue(
        sessions: SessionManager,
        verificationValue: Bytes,
        pbkdfParameters?: PbkdfParameters,
    ) {
        const verificationData = Bytes.of(verificationValue);
        const w0 = bytesToNumberBE(verificationData.slice(0, 32));
        const L = verificationData.slice(32, 32 + 65);
        return new PaseServer(sessions, w0, L, pbkdfParameters);
    }

    constructor(
        private sessions: SessionManager,
        private readonly w0: bigint,
        private readonly L: Bytes,
        private readonly pbkdfParameters?: PbkdfParameters,
    ) {}

    async onNewExchange(exchange: MessageExchange) {
        if (this.#closed) {
            logger.warn("Pase server: Received new exchange but server is closed, ignoring exchange.");
            return;
        }

        // When a Commissioner is either in the process of establishing a PASE session with the Commissionee or has
        // successfully established a session, the Commissionee SHALL NOT accept any more requests for new PASE
        // sessions until session establishment fails or the successfully established PASE session is terminated on
        // the commissioning channel.
        const paseSession = this.sessions.getPaseSession();
        if (paseSession !== undefined && !paseSession.isClosing) {
            logger.info("Pase server: Pairing already in progress (PASE session exists), ignoring new exchange.");
        } else if (this.#pairingTimer?.isRunning) {
            logger.info(
                "Pase server: Pairing already in progress (PASE establishment Timer running), ignoring new exchange.",
            );
        } else if (this.#pairingMessenger !== undefined) {
            logger.info("Already handling a pairing request, ignoring new exchange.");
        } else {
            const messenger = new PaseServerMessenger(exchange);
            // All checks done, we handle the pairing request
            try {
                this.#pairingMessenger = messenger;
                // Ok new pairing try, handle it
                await this.handlePairingRequest(this.sessions.crypto);
            } catch (error) {
                this.#pairingErrors++;
                logger.error(
                    `An error occurred during the PASE commissioning (${this.#pairingErrors}/${PASE_COMMISSIONING_MAX_ERRORS}):`,
                    error,
                );

                // If we received a ChannelStatusResponseError we do not need to send one back, so just cancel pairing
                const sendError = !(error instanceof ChannelStatusResponseError);
                await this.cancelPairing(messenger, sendError);

                if (this.#pairingErrors >= PASE_COMMISSIONING_MAX_ERRORS) {
                    throw new MaximumPasePairingErrorsReachedError(
                        `Pase server: Too many errors during PASE commissioning, aborting commissioning window`,
                    );
                }
            } finally {
                this.#pairingMessenger = undefined;
                // Destroy the unsecure session used to establish the Pase session
                await exchange.session.destroy();
            }
        }
    }

    private async handlePairingRequest(crypto: Crypto) {
        const messenger = this.#pairingMessenger!;

        logger.info("Received pairing request «", Diagnostic.via(messenger.channelName));

        this.#pairingTimer = Time.getTimer("PASE pairing timeout", PASE_PAIRING_TIMEOUT_MS, () =>
            this.cancelPairing(messenger),
        ).start();

        // Read pbkdfRequest and send pbkdfResponse
        const {
            requestPayload,
            request: {
                initiatorRandom,
                initiatorSessionParams,
                passcodeId,
                hasPbkdfParameters,
                initiatorSessionId: peerSessionId,
            },
        } = await messenger.readPbkdfParamRequest();
        if (passcodeId !== DEFAULT_PASSCODE_ID) {
            throw new UnexpectedDataError(`Unsupported passcode ID ${passcodeId}.`);
        }

        const responderSessionId = await this.sessions.getNextAvailableSessionId(); // Responder Session Id
        const responderRandom = crypto.randomBytes(32);

        const responderSessionParams = this.sessions.sessionParameters;

        const responsePayload = await messenger.sendPbkdfParamResponse({
            initiatorRandom,
            responderRandom,
            responderSessionId,
            pbkdfParameters: hasPbkdfParameters ? undefined : this.pbkdfParameters,
            responderSessionParams,
        });

        // Process pake1 and send pake2
        const spake2p = Spake2p.create(
            crypto,
            await crypto.computeSha256([SPAKE_CONTEXT, requestPayload, responsePayload]),
            this.w0,
        );
        const { x: X } = await messenger.readPasePake1();
        const Y = spake2p.computeY();
        const { Ke, hAY, hBX } = await spake2p.computeSecretAndVerifiersFromX(this.L, X, Y);
        await messenger.sendPasePake2({ y: Y, verifier: hBX });

        // Read and process pake3
        const { verifier } = await messenger.readPasePake3();
        if (!Bytes.areEqual(verifier, hAY)) {
            throw new UnexpectedDataError("Received incorrect key confirmation from the initiator.");
        }

        // All good! Creating the secure PASE session
        await this.sessions.createSecureSession({
            sessionId: responderSessionId,
            fabric: undefined,
            peerNodeId: NodeId.UNSPECIFIED_NODE_ID,
            peerSessionId,
            sharedSecret: Ke,
            salt: new Uint8Array(0),
            isInitiator: false,
            isResumption: false,
            peerSessionParameters: initiatorSessionParams,
        });
        logger.info(Diagnostic.strong(`Session ${responderSessionId} created`), "with", messenger.channelName);

        await messenger.sendSuccess();
        await messenger.close();

        this.#pairingTimer?.stop();
        this.#pairingTimer = undefined;
    }

    async cancelPairing(messenger: PaseServerMessenger, sendError = true) {
        this.#pairingTimer?.stop();
        this.#pairingTimer = undefined;

        if (sendError) {
            await messenger.sendError(SecureChannelStatusCode.InvalidParam);
        }
        await messenger.close();
    }

    async close() {
        this.#closed = true;
        await this.#pairingMessenger?.close();
    }
}
