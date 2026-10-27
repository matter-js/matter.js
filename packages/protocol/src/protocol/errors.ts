/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { Message } from "#codec/MessageCodec.js";
import type { Session } from "#session/Session.js";
import { ImplementationError, MatterError, NoResponseTimeoutError } from "@matter/general";
import { Status, StatusResponseError } from "@matter/types";

/**
 * Indicates MRP retries were exhausted without a response from the client.
 *
 * @deprecated
 */
export class RetransmissionLimitReachedError extends NoResponseTimeoutError {}

/**
 * Thrown when we receive a message on an exchange that we did not expect.
 */
export class UnexpectedMessageError extends MatterError {
    public constructor(
        message: string,
        session: Session,
        public readonly receivedMessage: Message,
    ) {
        super(`(${Message.diagnosticsOf(session, receivedMessage)}) ${message}`);
    }
}

/**
 * Thrown when a message is larger than the channel may carry to the peer.  The sender must split it by the
 * exchange's `maxPayloadSize`; on TCP the peer would otherwise close the connection.
 *
 * @see {@link MatterSpecification.v161.Core} § 4.15.2.3
 */
export class MessageTooLargeError extends ImplementationError {}

/**
 * Thrown for communication attempts on closed sessions.
 */
export class SessionClosedError extends MatterError {}

/**
 * Thrown for operations that are illegal because a session is not associated with a fabric.
 */
export class NoAssociatedFabricError extends StatusResponseError {
    constructor(message: string) {
        super(message, Status.UnsupportedAccess);
    }
}
