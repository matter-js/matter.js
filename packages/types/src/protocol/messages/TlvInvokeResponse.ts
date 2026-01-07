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
import { TlvInvokeResponseData } from "../types/TlvInvokeResponseData.js";

/** @see {@link MatterSpecification.v13.Core}, section 10.7.10 */

export const TlvInvokeResponse = TlvObject({
    /** Deprecated and ignored by client, but required for backward compatibility reasons. */
    suppressResponse: TlvField(0, TlvBoolean),

    /** Command response or status. */
    invokeResponses: TlvField(1, TlvArray(TlvInvokeResponseData)),
    moreChunkedMessages: TlvOptionalField(2, TlvBoolean),
    interactionModelRevision: TlvField(0xff, TlvUInt8),
});

export type InvokeResponse = TypeFromSchema<typeof TlvInvokeResponse>;
