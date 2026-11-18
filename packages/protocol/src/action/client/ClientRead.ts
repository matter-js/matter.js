/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { Read } from "#action/request/Read.js";
import type { MessageExchange } from "#protocol/MessageExchange.js";
import { ClientRequest } from "./ClientRequest.js";

export interface ClientRead extends Read, ClientRequest {
    /**
     * Set to true to skip the automatic data version injection, so the response also includes clusters whose data
     * version the client already knows.
     */
    includeKnownVersions?: boolean;

    /**
     * Suppress peer-loss reporting for this read's request send and report receive. Defaults to `false`.
     * Use for diagnostic reads whose failure should not close shared sessions or subscriptions.
     * The read still rejects on failure. This does not change other interactions on the session.
     *
     * @see {@link MessageExchange.Options.suppressPeerLoss}
     */
    suppressPeerLoss?: boolean;
}
