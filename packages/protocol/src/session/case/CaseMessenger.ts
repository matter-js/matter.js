/**
 * @license
 * Copyright 2022-2025 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { MatterFlowError } from "#general";
import { SecureMessageType, TypeFromSchema } from "#types";
import { SecureChannelMessenger } from "../../securechannel/SecureChannelMessenger.js";
import {
    CaseSigma1,
    CaseSigma2,
    CaseSigma2Resume,
    TlvCaseSigma1,
    TlvCaseSigma2,
    TlvCaseSigma2Resume,
    TlvCaseSigma3,
} from "./CaseMessages.js";

export class CaseServerMessenger extends SecureChannelMessenger {
    async readSigma1() {
        const { payload } = await this.nextMessage(SecureMessageType.Sigma1);
        return { sigma1Bytes: payload, sigma1: TlvCaseSigma1.decode(payload) as CaseSigma1 };
    }

    sendSigma2(sigma2: TypeFromSchema<typeof TlvCaseSigma2>) {
        return this.send(sigma2, SecureMessageType.Sigma2, TlvCaseSigma2);
    }

    sendSigma2Resume(sigma2Resume: TypeFromSchema<typeof TlvCaseSigma2Resume>) {
        return this.send(sigma2Resume, SecureMessageType.Sigma2Resume, TlvCaseSigma2Resume);
    }

    async readSigma3() {
        const { payload } = await this.nextMessage(SecureMessageType.Sigma3);
        return { sigma3Bytes: payload, sigma3: TlvCaseSigma3.decode(payload) };
    }
}

export class CaseClientMessenger extends SecureChannelMessenger {
    sendSigma1(sigma1: TypeFromSchema<typeof TlvCaseSigma1>) {
        return this.send(sigma1, SecureMessageType.Sigma1, TlvCaseSigma1);
    }

    async readSigma2() {
        const {
            payload,
            payloadHeader: { messageType },
        } = await this.anyNextMessage("Sigma2(Resume)");

        // TODO Add support for BUSY response and resend the message after waiting time
        switch (messageType) {
            case SecureMessageType.Sigma2:
                return { sigma2Bytes: payload, sigma2: TlvCaseSigma2.decode(payload) as CaseSigma2 };
            case SecureMessageType.Sigma2Resume:
                return { sigma2Resume: TlvCaseSigma2Resume.decode(payload) as CaseSigma2Resume };
            default:
                throw new MatterFlowError(
                    `Received unexpected message type while expecting CASE Sigma2(Resume): ${messageType}, expected: ${SecureMessageType.Sigma2} or ${SecureMessageType.Sigma2Resume}`,
                );
        }
    }

    sendSigma3(sigma3: TypeFromSchema<typeof TlvCaseSigma3>) {
        return this.send(sigma3, SecureMessageType.Sigma3, TlvCaseSigma3);
    }
}
