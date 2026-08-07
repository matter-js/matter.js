/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { NetworkError } from "../Network.js";

/** WS-proxy protocol violation (bad handshake, malformed envelope). */
export class ProxyProtocolError extends NetworkError {}

/** Peer rejected a command with an error response; `code` is the wire error code. */
export class ProxyCommandError extends NetworkError {
    /** The description as it appears in the wire `message` field, without the {@link code} prefix. */
    readonly detail: string;

    constructor(
        readonly code: string,
        message: string,
        options?: ErrorOptions,
    ) {
        super(`${code}: ${message}`, options);
        this.detail = message;
    }
}

/** Connection closed while commands were pending or before use. */
export class ProxyConnectionClosedError extends NetworkError {}

export interface ProxyHelloMessage {
    type: "hello";
    version: number;

    /** Optional additive extension: declared role of the dialing peer. v1 peers omit it. */
    role?: string;

    /** Optional additive extension: feature flags. v1 peers omit it. */
    features?: string[];
}

export interface ProxyHelloResponseMessage {
    type: "hello_response";
    version: number;
    error?: string;
    message?: string;
}

export interface ProxyCommandMessage {
    id: number;
    command: string;
    args?: Record<string, unknown>;
}

export interface ProxySuccessResponse {
    id: number;
    success: true;
    result?: Record<string, unknown>;
}

export interface ProxyErrorResponse {
    id: number;
    success: false;
    error: string;
    message: string;
}

export type ProxyResponseMessage = ProxySuccessResponse | ProxyErrorResponse;

export interface ProxyEventMessage {
    event: string;
    data: Record<string, unknown>;
}

/** Constraint for protocol-specific typed command maps: command name → args/result types. */
export type ProxyCommandMap = Record<string, { args: unknown; result: unknown }>;
