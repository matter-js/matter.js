/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { NetworkError } from "../Network.js";

/** Peer rejected a command with an error response; `code` is the wire error code. */
export class WsProxyCommandError extends NetworkError {
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
export class WsProxyConnectionClosedError extends NetworkError {}

export interface WsProxyHelloMessage {
    type: "hello";
    version: number;

    /** Optional additive extension: declared role of the dialing peer. v1 peers omit it. */
    role?: string;

    /** Optional additive extension: feature flags. v1 peers omit it. */
    features?: string[];
}

export interface WsProxyHelloResponseMessage {
    type: "hello_response";
    version: number;
    error?: string;
    message?: string;
}

export interface WsProxyCommandMessage {
    id: number;
    command: string;
    args?: Record<string, unknown>;
}

export interface WsProxySuccessResponse {
    id: number;
    success: true;
    result?: Record<string, unknown>;
}

export interface WsProxyErrorResponse {
    id: number;
    success: false;
    error: string;
    message: string;
}

export type WsProxyResponseMessage = WsProxySuccessResponse | WsProxyErrorResponse;

export interface WsProxyEventMessage {
    event: string;
    data: Record<string, unknown>;
}
