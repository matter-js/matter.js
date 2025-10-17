/**
 * @license
 * Copyright 2022-2025 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { Message } from "../codec/MessageCodec.js";
import { MessageExchange } from "./MessageExchange.js";

export interface ProtocolHandler {
    /** Protocol ID that this handler implements */
    readonly id: number;

    /**
     * Indicates whether this protocol requires a secure session to be established before it can be used.
     * When `true`, the protocol can only be used over secure sessions.
     * When `false`, the protocol can only be used without a secure session.
     * When `undefined`, the protocol can be used with or without a secure session and it is up to the handler to check
     */
    readonly requiresSecureSession: boolean | undefined;

    /** Called on a new exchange that uses this protocol. The message is the first message of the exchange. */
    onNewExchange(exchange: MessageExchange, message: Message): Promise<void>;

    /** Called when the protocol handler is no longer needed and can clean up resources. */
    close(): Promise<void>;
}
