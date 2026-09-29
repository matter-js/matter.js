/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { TypeFromSchema } from "#tlv/TlvSchema.js";
import { TlvUInt16 } from "../../tlv/TlvNumber.js";
import { TlvField, TlvObject } from "../../tlv/TlvObject.js";

/**
 * DelayReportDataIB: asks a server to hold off the next Report Data of the subscriptions on the endpoints an invoke
 * targets.
 *
 * A field missing on receive decodes as 0, as the CHIP SDK does; encoding always writes both.
 */
export const TlvDelayReportData = TlvObject({
    /** Minimum delay in milliseconds. */
    delayMinMs: TlvField(0, TlvUInt16, 0),

    /** Window in milliseconds from which a random jitter is added to {@link delayMinMs}. */
    delayJitterWindowMs: TlvField(1, TlvUInt16, 0),
});

export type DelayReportData = TypeFromSchema<typeof TlvDelayReportData>;
