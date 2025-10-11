/**
 * @license
 * Copyright 2022-2025 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { isObject } from "#general";
import { StateStream } from "#node/integration/StateStream.js";
import { StatusResponse } from "#types";

/**
 * An RPC request.
 */
export type RemoteRequest =
    | RemoteRequest.Read
    | RemoteRequest.Write
    | RemoteRequest.Add
    | RemoteRequest.Delete
    | RemoteRequest.Invoke
    | RemoteRequest.Subscribe;

/**
 * Validate and return request object.
 */
export function RemoteRequest(request: unknown) {
    if (!isObject(request)) {
        throw new StatusResponse.InvalidActionError("Request is not an object");
    }

    const { target, method } = request;
    if (typeof method !== "string") {
        throw new StatusResponse.InvalidActionError('Request does not specify opcode in "method" property');
    }

    switch (method) {
        case "read":
        case "write":
        case "add":
        case "delete":
        case "invoke":
        case "subscribe":
            break;

        default:
            throw new StatusResponse.InvalidActionError(`Unsupported request method "${method}"`);
    }

    if (typeof target !== "string") {
        throw new StatusResponse.InvalidActionError('Request does not specify resource in "target" property');
    }

    return request as unknown as RemoteRequest;
}

export namespace RemoteRequest {
    export interface Base {
        target: string;
        id?: string;
    }

    export interface Read extends Base {
        method: "read";
    }

    export interface Write extends Base {
        method: "write";
        value: unknown;
    }

    export interface Add extends Base {
        method: "add";
        value: unknown;
    }

    export interface Delete extends Base {
        method: "delete";
    }

    export interface Invoke extends Base {
        method: "invoke";
        target: string;
        parameters?: unknown;
    }

    export interface Subscribe extends Base, StateStream.Options {
        method: "subscribe";
    }
}
