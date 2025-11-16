/**
 * @license
 * Copyright 2022-2025 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { Message, MessageCodec } from "#codec/MessageCodec.js";
import { Status, StatusResponseError } from "#types";
import { MatterError, NoResponseTimeoutError } from "@matter/general";

/**
 * Indicates MRP retries were exhausted without a response from the client.
 *
 * TODO - we use this error far too broadly and throw in places that do not involve MRP
 */
export class RetransmissionLimitReachedError extends NoResponseTimeoutError {}

/**
 * Thrown when we receive a message on an exchange that we did not expect.
 */
export class UnexpectedMessageError extends MatterError {
    public constructor(
        message: string,
        public readonly receivedMessage: Message,
    ) {
        super(`(${MessageCodec.messageDiagnostics(receivedMessage)}) ${message}`);
    }
}

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
