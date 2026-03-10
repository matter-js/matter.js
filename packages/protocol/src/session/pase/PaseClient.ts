/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { Mark } from "#common/Mark.js";
import { SessionManager } from "#session/SessionManager.js";
import { SessionParameters } from "#session/SessionParameters.js";
import {
    Abort,
    Bytes,
    causedBy,
    Channel,
    Crypto,
    InternalError,
    Logger,
    MatterError,
    NetworkError,
    PbkdfParameters,
    Spake2p,
    UnexpectedDataError,
} from "@matter/general";
import { CommissioningOptions, NodeId, SecureChannelStatusCode } from "@matter/types";
import { TransientPeerCommunicationError } from "../../peer/PeerCommunicationError.js";
import { MessageExchange } from "../../protocol/MessageExchange.js";
import { RetransmissionLimitReachedError } from "../../protocol/errors.js";
import { DEFAULT_PASSCODE_ID, PaseClientMessenger, SPAKE_CONTEXT } from "./PaseMessenger.js";

const logger = Logger.get("PaseClient");

const MAX_PASSCODE_GENERATION_ATTEMPTS = 100;

export class PaseClient {
    #sessions: SessionManager;

    constructor(sessions: SessionManager) {
        this.#sessions = sessions;
    }

    static async generatePakePasscodeVerifier(crypto: Crypto, setupPinCode: number, pbkdfParameters: PbkdfParameters) {
        const { w0, L } = await Spake2p.computeW0L(crypto, pbkdfParameters, setupPinCode);
        return Bytes.concat(Bytes.fromBigInt(w0, 32), L);
    }

    static generateRandomPasscode(crypto: Crypto) {
        // Generate 27-bit random candidates and reject invalid values to avoid modulo bias.
        for (let i = 0; i < MAX_PASSCODE_GENERATION_ATTEMPTS; i++) {
            const passcode = crypto.randomUint32 & 0x07ff_ffff;
            if (
                passcode >= 1 &&
                passcode <= 99_999_998 &&
                !CommissioningOptions.FORBIDDEN_PASSCODES.includes(passcode)
            ) {
                return passcode;
            }
        }

        throw new InternalError(
            `Unable to generate valid passcode in ${MAX_PASSCODE_GENERATION_ATTEMPTS} tries; entropy source is broken`,
        );
    }

    static generateRandomDiscriminator(crypto: Crypto) {
        return crypto.randomUint16 % 4096;
    }

    async pair(
        initiatorSessionParams: SessionParameters,
        exchange: MessageExchange,
        channel: Channel<Bytes>,
        setupPin: number,
        options?: PaseClient.PairOptions,
    ) {
        const messenger = new PaseClientMessenger(exchange);
        const abort = new Abort({ abort: options?.abort });

        try {
            return await this.#doPair(initiatorSessionParams, messenger, exchange, channel, setupPin, abort);
        } catch (error) {
            // Unlike CASE, for PASE we send InvalidParam even on abort. This signals the device to reset its
            // pairing state immediately, preventing a 60-second lockdown when cancelling parallel commissioning.
            if (!causedBy(error, NetworkError, TransientPeerCommunicationError, RetransmissionLimitReachedError)) {
                try {
                    // Intentionally not passing the abort signal: we WANT to send InvalidParam even when
                    // aborting to signal the device to reset its pairing state immediately.  Passing an
                    // already-aborted signal would cause the send to fail instantly without notifying the
                    // device, leaving it in a 60-second lockdown.  The enclosing try/catch absorbs failures.
                    await messenger.sendError(SecureChannelStatusCode.InvalidParam);
                } catch (e) {
                    MatterError.accept(e);
                    logger.debug("Failed to send InvalidParam on PASE error:", e);
                }
            }
            throw error;
        } finally {
            abort.close();
            try {
                await messenger.close();
            } catch (e) {
                logger.error("Unhandled error closing PASE messenger:", e);
            }
        }
    }

    async #doPair(
        initiatorSessionParams: SessionParameters,
        messenger: PaseClientMessenger,
        exchange: MessageExchange,
        channel: Channel<Bytes>,
        setupPin: number,
        abort: Abort,
    ) {
        const { crypto } = this.#sessions;
        const initiatorRandom = crypto.randomBytes(32);
        const initiatorSessionId = await abort.attempt(this.#sessions.getNextAvailableSessionId());

        // Send pbkdfRequest and read pbkdfResponse
        const requestPayload = await abort.attempt(
            messenger.sendPbkdfParamRequest(
                {
                    initiatorRandom,
                    initiatorSessionId,
                    passcodeId: DEFAULT_PASSCODE_ID,
                    hasPbkdfParameters: false,
                    initiatorSessionParams,
                },
                { abort: abort.signal },
            ),
        );
        const {
            responsePayload,
            response: { pbkdfParameters, responderSessionId, responderSessionParams },
        } = await messenger.readPbkdfParamResponse({ abort: abort.signal });

        if (pbkdfParameters === undefined) {
            throw new UnexpectedDataError("Missing requested PbkdfParameters in the response. Commissioning failed.");
        }

        // Update the session timing parameters with the just received ones to optimize the session establishment
        if (responderSessionParams !== undefined) {
            exchange.session.timingParameters = responderSessionParams;
        }

        // This includes the Fallbacks for the session parameters overridden by what was sent by the device in PbkdfResponse
        const peerSessionParameters = {
            ...exchange.session.parameters,
            ...(responderSessionParams ?? {}),
        };

        // Compute pake1 and read pake2
        const { w0, w1 } = await abort.attempt(Spake2p.computeW0W1(crypto, pbkdfParameters, setupPin));
        const spake2p = Spake2p.create(
            crypto,
            await abort.attempt(crypto.computeHash([SPAKE_CONTEXT, requestPayload, responsePayload])),
            w0,
        );
        const X = spake2p.computeX();
        await abort.attempt(messenger.sendPasePake1({ x: X }, { abort: abort.signal }));

        // Process pake2 and send pake3
        const { y: Y, verifier } = await messenger.readPasePake2({ abort: abort.signal });
        const { Ke, hAY, hBX } = await abort.attempt(spake2p.computeSecretAndVerifiersFromY(w1, X, Y));
        if (!Bytes.areEqual(verifier, hBX)) {
            throw new UnexpectedDataError(
                "Received incorrect key confirmation from the receiver. Commissioning failed.",
            );
        }
        await abort.attempt(messenger.sendPasePake3({ verifier: hAY }, { abort: abort.signal }));

        // All good! Creating the secure session
        await abort.attempt(messenger.waitForSuccess({ abort: abort.signal, description: "PasePake3-Success" }));
        const secureSession = await abort.attempt(
            this.#sessions.createSecureSession({
                channel,
                id: initiatorSessionId,
                fabric: undefined,
                peerNodeId: NodeId.UNSPECIFIED_NODE_ID,
                peerSessionId: responderSessionId,
                sharedSecret: Ke,
                salt: new Uint8Array(0),
                isInitiator: true,
                isResumption: false,
                peerSessionParameters,
            }),
        );
        logger.info("Paired successfully", Mark.OUTBOUND, messenger.channelName, exchange.diagnostics);

        return secureSession;
    }
}

export namespace PaseClient {
    export interface PairOptions {
        abort?: AbortSignal;
    }
}
