/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { TlvAny } from "../../tlv/TlvAny.js";
import { TlvArray } from "../../tlv/TlvArray.js";
import { TlvBoolean } from "../../tlv/TlvBoolean.js";
import { TlvUInt8 } from "../../tlv/TlvNumber.js";
import { TlvField, TlvObject, TlvOptionalField } from "../../tlv/TlvObject.js";

export const TlvInvokeResponseForSend = TlvObject({
    suppressResponse: TlvField(0, TlvBoolean),
    invokeResponses: TlvField(1, TlvArray(TlvAny)),
    moreChunkedMessages: TlvOptionalField(2, TlvBoolean),
    interactionModelRevision: TlvField(0xff, TlvUInt8),
});
