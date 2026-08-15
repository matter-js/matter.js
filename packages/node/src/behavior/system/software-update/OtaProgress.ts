/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { Minutes } from "@matter/general";

/**
 * An update without a status change or BDX transfer activity for this duration is considered stalled. The provider and
 * the manager must expire an update at the same time or one retries while the other still tracks the transfer.
 *
 * Lives in a leaf module because both sides of an import cycle depend on it.
 */
export const OTA_PROGRESS_TIMEOUT = Minutes(15);
