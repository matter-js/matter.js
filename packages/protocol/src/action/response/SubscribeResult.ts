/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { MaybePromise } from "@matter/general";
import { SubscribeResponse } from "@matter/types";

export type SubscribeResult = Promise<ActiveSubscription>;

export interface ActiveSubscription extends SubscribeResponse {
    close(): MaybePromise<void>;
}
