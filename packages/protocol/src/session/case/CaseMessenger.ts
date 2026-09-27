/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { ExchangeSendOptions } from "#protocol/MessageExchange.js";
import { MatterFlowError } from "@matter/general";
import { SecureMessageType, TypeFromSchema } from "@matter/types";
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
        const message = await this.nextMessage({ type: SecureMessageType.Sigma1 });
        return { sigma1Bytes: message.payload, sigma1: this.decode(TlvCaseSigma1, message) as CaseSigma1 };
    }

    sendSigma2(sigma2: TypeFromSchema<typeof TlvCaseSigma2>) {
        return this.send(sigma2, SecureMessageType.Sigma2, TlvCaseSigma2);
    }

    sendSigma2Resume(sigma2Resume: TypeFromSchema<typeof TlvCaseSigma2Resume>) {
        return this.send(sigma2Resume, SecureMessageType.Sigma2Resume, TlvCaseSigma2Resume);
    }

    async readSigma3() {
        const message = await this.nextMessage({ type: SecureMessageType.Sigma3 });
        return { sigma3Bytes: message.payload, sigma3: this.decode(TlvCaseSigma3, message) };
    }
}

export class CaseClientMessenger extends SecureChannelMessenger {
    async sendSigma1(sigma1: TypeFromSchema<typeof TlvCaseSigma1>, options?: ExchangeSendOptions) {
        return await this.send(sigma1, SecureMessageType.Sigma1, TlvCaseSigma1, options);
    }

    async readSigma2(abort?: AbortSignal) {
        const message = await this.nextMessage({ description: "Sigma2(Resume)", abort });
        const { messageType } = message.payloadHeader;

        switch (messageType) {
            case SecureMessageType.Sigma2:
                return { sigma2Bytes: message.payload, sigma2: this.decode(TlvCaseSigma2, message) as CaseSigma2 };
            case SecureMessageType.Sigma2Resume:
                return { sigma2Resume: this.decode(TlvCaseSigma2Resume, message) as CaseSigma2Resume };
            default:
                throw new MatterFlowError(
                    `Received unexpected message type while expecting CASE Sigma2(Resume): ${messageType}, expected: ${SecureMessageType.Sigma2} or ${SecureMessageType.Sigma2Resume}`,
                );
        }
    }

    async sendSigma3(sigma3: TypeFromSchema<typeof TlvCaseSigma3>, options?: ExchangeSendOptions) {
        return await this.send(sigma3, SecureMessageType.Sigma3, TlvCaseSigma3, options);
    }
}
