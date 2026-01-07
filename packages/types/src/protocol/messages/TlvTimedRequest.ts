/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { TypeFromSchema } from "#tlv/TlvSchema.js";
import { TlvUInt16, TlvUInt8 } from "../../tlv/TlvNumber.js";
import { TlvField, TlvObject } from "../../tlv/TlvObject.js";

/** @see {@link MatterSpecification.v13.Core}, section 10.7.8 */

export const TlvTimedRequest = TlvObject({
    /** An interval, in milliseconds, to expect a following action. */
    timeout: TlvField(0, TlvUInt16),
    interactionModelRevision: TlvField(0xff, TlvUInt8),
});

export type TimedRequest = TypeFromSchema<typeof TlvTimedRequest>;
