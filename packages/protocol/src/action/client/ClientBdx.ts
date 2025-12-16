/**
 * @license
 * Copyright 2022-2025 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { RequestContext } from "#action/index.js";
import { BdxMessenger } from "#bdx/index.js";
import { Duration, WorkSlot } from "#general";

export interface ClientBdxOptions {
    messageTimeout?: Duration;
    queued?: boolean;
}

export interface ClientBdxResponse {
    context: RequestContext<BdxMessenger>;
    slot?: WorkSlot;
}
