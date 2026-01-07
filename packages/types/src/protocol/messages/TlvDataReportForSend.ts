/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { TlvAny } from "../../tlv/TlvAny.js";
import { TlvArray } from "../../tlv/TlvArray.js";
import { TlvBoolean } from "../../tlv/TlvBoolean.js";
import { TlvUInt32, TlvUInt8 } from "../../tlv/TlvNumber.js";
import { TlvField, TlvObject, TlvOptionalField } from "../../tlv/TlvObject.js";

/** Special version of the DataReport Message with pre-encoded report entries used by Send logic */

export const TlvDataReportForSend = TlvObject({
    /** A SubscriptionId only used in a Subscribe interaction. */
    subscriptionId: TlvOptionalField(0, TlvUInt32),

    /** A list of zero or more attribute data reports, */
    attributeReports: TlvOptionalField(1, TlvArray(TlvAny)),

    /** A list of zero or more event reports. */
    eventReports: TlvOptionalField(2, TlvArray(TlvAny)),
    moreChunkedMessages: TlvOptionalField(3, TlvBoolean),

    /** Do not send a response to this action. */
    suppressResponse: TlvOptionalField(4, TlvBoolean),
    interactionModelRevision: TlvField(0xff, TlvUInt8),
});
