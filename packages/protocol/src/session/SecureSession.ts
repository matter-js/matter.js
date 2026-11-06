/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import type { Subject } from "#action/server/Subject.js";
import type { Message } from "#codec/MessageCodec.js";
import type { Fabric } from "#fabric/Fabric.js";
import type { PeerAddress } from "#peer/PeerAddress.js";
import {
    Bytes,
    CRYPTO_AEAD_MAX_AAD_LENGTH_BYTES,
    CRYPTO_AEAD_MAX_CIPHERTEXT_LENGTH_BYTES,
    CRYPTO_AEAD_MIC_LENGTH_BYTES,
    MatterFlowError,
} from "@matter/general";
import { Session } from "./Session.js";

export abstract class SecureSession extends Session {
    readonly isSecure = true;
    abstract fabric: Fabric | undefined;
    abstract peerAddress: PeerAddress;
    abstract subjectFor(message?: Message): Subject;
}

export namespace SecureSession {
    /**
     * Why a received payload cannot be decrypted within the AES-CCM limits of `@matter/general`, or `undefined` when it
     * can.  A session checks this before it decrypts, so a peer cannot cause the `CryptoInputError` that
     * `Crypto.decrypt` throws for input outside those limits.
     */
    export function undecryptablePayloadReason(payload: Bytes, aad: Bytes): string | undefined {
        if (payload.byteLength < CRYPTO_AEAD_MIC_LENGTH_BYTES) {
            return `payload of ${payload.byteLength} bytes is shorter than the MIC`;
        }
        if (payload.byteLength > CRYPTO_AEAD_MAX_CIPHERTEXT_LENGTH_BYTES) {
            return `payload of ${payload.byteLength} bytes exceeds the AES-CCM limit`;
        }
        if (aad.byteLength > CRYPTO_AEAD_MAX_AAD_LENGTH_BYTES) {
            return `header of ${aad.byteLength} bytes exceeds the AES-CCM limit`;
        }
    }

    export function assert(session?: Session, errorText?: string): asserts session is SecureSession {
        if (!session?.isSecure) {
            throw new MatterFlowError(errorText ?? "Unsecured session in secure context");
        }
    }
}
