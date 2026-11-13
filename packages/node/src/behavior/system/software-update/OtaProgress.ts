/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { Minutes } from "@matter/general";

/**
 * An update without a status change or BDX transfer activity for this duration is considered stalled.
 *
 * Lives in a leaf module because both sides of an import cycle depend on it.
 */
export const OTA_PROGRESS_TIMEOUT = Minutes(15);

export enum OtaUpdateStatus {
    Unknown,
    WaitForConsent,
    Querying,
    Downloading,
    WaitForApply,
    Applying,
    Done,
    Cancelled,
}
