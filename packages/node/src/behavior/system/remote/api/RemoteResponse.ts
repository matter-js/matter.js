/**
 * @license
 * Copyright 2022-2025 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { InternalError, MatterError } from "#general";
import type { StateStream } from "#node/integration/StateStream.js";
import { StatusResponseError } from "#types";
import type { LocalResponse } from "./LocalResponse.js";

/**
 * An RPC response.
 *
 * This is the serializable object delivered over the wire.
 */
export type RemoteResponse = RemoteResponse.OK | RemoteResponse.Value | RemoteResponse.Error | RemoteResponse.Change;

/**
 * Create a {@link RemoteResponse} from a {@link LocalResponse}.
 */
export function RemoteResponse(local: LocalResponse): RemoteResponse {
    switch (local.kind) {
        case "ok":
        case "update":
        case "delete":
            return local;

        case "value":
            return {
                ...local,
                value: local.value.js,
            };

        case "error":
            return {
                kind: "error",
                id: local.id,
                code: MatterError.idFor(local.error.constructor),
                message: (local.error as StatusResponseError).bareMessage ?? local.error.message,
            };

        default:
            throw new InternalError(`Cannot convert local response kind "${local.kind}" to remote response`);
    }
}

export namespace RemoteResponse {
    export interface Base {
        id?: string;
    }

    export interface OK extends Base {
        kind: "ok";
        requestId?: string;
    }

    export interface Value extends Base {
        kind: "value";
        value: unknown;
    }

    export interface Error extends Base {
        kind: "error";
        message: string;
        code: string;
    }

    export type Change = Base & StateStream.WireChange;
}
