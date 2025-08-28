/**
 * @license
 * Copyright 2022-2025 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { Bytes, Crypto, ec, Logger, PbkdfParameters, Spake2p, UnexpectedDataError } from "#general";
import { SessionManager } from "#session/SessionManager.js";
import { CommissioningOptions, NodeId, SecureChannelStatusCode } from "#types";
import { MessageExchange } from "../../protocol/MessageExchange.js";
import { SessionParameters } from "../Session.js";
import { DEFAULT_PASSCODE_ID, PaseClientMessenger, SPAKE_CONTEXT } from "./PaseMessenger.js";

const { numberToBytesBE } = ec;

const logger = Logger.get("PaseClient");

export class PaseClient {
    #sessions: SessionManager;

    constructor(sessions: SessionManager) {
        this.#sessions = sessions;
    }

    static async generatePakePasscodeVerifier(crypto: Crypto, setupPinCode: number, pbkdfParameters: PbkdfParameters) {
        const { w0, L } = await Spake2p.computeW0L(crypto, pbkdfParameters, setupPinCode);
        return Bytes.concat(numberToBytesBE(w0, 32), L);
    }

    static generateRandomPasscode(crypto: Crypto) {
        let passcode: number;
        passcode = (crypto.randomUint32 % 99999998) + 1; // prevents 00000000 and 99999999
        if (CommissioningOptions.FORBIDDEN_PASSCODES.includes(passcode)) {
            passcode += 1; // With current forbidden passcode list can never collide
        }
        return passcode;
    }

    static generateRandomDiscriminator(crypto: Crypto) {
        return crypto.randomUint16 % 4096;
    }

    async pair(initiatorSessionParams: SessionParameters, exchange: MessageExchange, setupPin: number) {
        const messenger = new PaseClientMessenger(exchange);
        const { crypto } = this.#sessions;
        const initiatorRandom = crypto.randomBytes(32);
        const initiatorSessionId = await this.#sessions.getNextAvailableSessionId(); // Initiator Session Id

        // Send pbkdfRequest and Read pbkdfResponse
        const requestPayload = await messenger.sendPbkdfParamRequest({
            initiatorRandom,
            initiatorSessionId,
            passcodeId: DEFAULT_PASSCODE_ID,
            hasPbkdfParameters: false,
            initiatorSessionParams,
        });
        const {
            responsePayload,
            response: { pbkdfParameters, responderSessionId, responderSessionParams },
        } = await messenger.readPbkdfParamResponse();
        if (pbkdfParameters === undefined) {
            // Sending this error is not defined in the specs and should normally never happen, but better inform the device
            // that we cancel the pairing
            await messenger.sendError(SecureChannelStatusCode.InvalidParam);
            throw new UnexpectedDataError("Missing requested PbkdfParameters in the response. Commissioning failed.");
        }

        // This includes the Fallbacks for the session parameters overridden by what was sent by the device in PbkdfResponse
        const peerSessionParameters = {
            ...exchange.session.parameters,
            ...(responderSessionParams ?? {}),
        };

        // Compute pake1 and read pake2
        const { w0, w1 } = await Spake2p.computeW0W1(crypto, pbkdfParameters, setupPin);
        const spake2p = Spake2p.create(
            crypto,
            await crypto.computeSha256([SPAKE_CONTEXT, requestPayload, responsePayload]),
            w0,
        );
        const X = spake2p.computeX();
        await messenger.sendPasePake1({ x: X });

        // Process pack2 and send pake3
        const { y: Y, verifier } = await messenger.readPasePake2();
        const { Ke, hAY, hBX } = await spake2p.computeSecretAndVerifiersFromY(w1, X, Y);
        if (!Bytes.areEqual(verifier, hBX)) {
            await messenger.sendError(SecureChannelStatusCode.InvalidParam);
            throw new UnexpectedDataError(
                "Received incorrect key confirmation from the receiver. Commissioning failed.",
            );
        }
        await messenger.sendPasePake3({ verifier: hAY });

        // All good! Creating the secure session
        await messenger.waitForSuccess("PasePake3-Success");
        const secureSession = await this.#sessions.createSecureSession({
            sessionId: initiatorSessionId,
            fabric: undefined,
            peerNodeId: NodeId.UNSPECIFIED_NODE_ID,
            peerSessionId: responderSessionId,
            sharedSecret: Ke,
            salt: new Uint8Array(0),
            isInitiator: true,
            isResumption: false,
            peerSessionParameters,
        });
        await messenger.close();
        logger.info(`Pase client: Paired successfully with ${messenger.channelName}.`);

        return secureSession;
    }
}
