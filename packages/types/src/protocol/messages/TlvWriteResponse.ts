/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { TypeFromSchema } from "#tlv/TlvSchema.js";
import { TlvArray } from "../../tlv/TlvArray.js";
import { TlvUInt8 } from "../../tlv/TlvNumber.js";
import { TlvField, TlvObject } from "../../tlv/TlvObject.js";
import { TlvAttributeStatus } from "../types/TlvAttributeStatus.js";

/** @see {@link MatterSpecification.v13.Core}, section 10.7.7 */

export const TlvWriteResponse = TlvObject({
    /** A list of zero or more concrete paths indicating errors or successes. */
    writeResponses: TlvField(0, TlvArray(TlvAttributeStatus)),
    interactionModelRevision: TlvField(0xff, TlvUInt8),
});

export type WriteResponse = TypeFromSchema<typeof TlvWriteResponse>;
