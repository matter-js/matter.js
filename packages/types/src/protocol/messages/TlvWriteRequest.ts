/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { TypeFromSchema } from "#tlv/TlvSchema.js";
import { TlvArray } from "../../tlv/TlvArray.js";
import { TlvBoolean } from "../../tlv/TlvBoolean.js";
import { TlvUInt8 } from "../../tlv/TlvNumber.js";
import { TlvField, TlvObject, TlvOptionalField } from "../../tlv/TlvObject.js";
import { TlvAttributeData } from "../types/TlvAttributeData.js";

/** @see {@link MatterSpecification.v13.Core}, section 10.7.6 */

export const TlvWriteRequest = TlvObject({
    /** Do not send a response to this action. */
    suppressResponse: TlvOptionalField(0, TlvBoolean),

    /** Flag action as part of a timed write transaction. */
    timedRequest: TlvField(1, TlvBoolean),

    /** A list of one or more path and data tuples. */
    writeRequests: TlvField(2, TlvArray(TlvAttributeData)),
    moreChunkedMessages: TlvOptionalField(3, TlvBoolean),
    interactionModelRevision: TlvField(0xff, TlvUInt8),
});

export type WriteRequest = TypeFromSchema<typeof TlvWriteRequest>;
