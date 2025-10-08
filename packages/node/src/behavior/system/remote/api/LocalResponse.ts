/**
 * @license
 * Copyright 2022-2025 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { Envelope } from "./Envelope.js";
import { RemoteResponse } from "./RemoteResponse.js";

/**
 * The intermediate version of a {@link RemoteResponse}, transformed before transmission.
 */
export type LocalResponse =
    | RemoteResponse.OK
    | RemoteResponse.Change
    | LocalResponse.Value
    | LocalResponse.Subscription
    | LocalResponse.Error;

export namespace LocalResponse {
    export interface Value extends RemoteResponse.Base {
        kind: "value";
        value: Envelope;
    }

    export interface Subscription extends RemoteResponse.Base {
        kind: "subscription";
        stream: Stream;
    }

    export interface Error extends RemoteResponse.Base {
        kind: "error";
        error: globalThis.Error;
    }

    export interface Stream extends AsyncIterableIterator<Envelope<LocalResponse>, void, void> {}
}
