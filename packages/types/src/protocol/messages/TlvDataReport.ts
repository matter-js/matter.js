/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { TypeFromSchema } from "#tlv/TlvSchema.js";
import { TlvArray } from "../../tlv/TlvArray.js";
import { TlvBoolean } from "../../tlv/TlvBoolean.js";
import { TlvUInt32, TlvUInt8 } from "../../tlv/TlvNumber.js";
import { TlvField, TlvObject, TlvOptionalField } from "../../tlv/TlvObject.js";
import { TlvAttributeReport } from "../types/TlvAttributeReport.js";
import { TlvEventReport } from "../types/TlvEventReport.js";

/** @see {@link MatterSpecification.v13.Core}, section 10.7.3 */

export const TlvDataReport = TlvObject({
    /** A SubscriptionId only used in a Subscribe interaction. */
    subscriptionId: TlvOptionalField(0, TlvUInt32),

    /** A list of zero or more attribute data reports, */
    attributeReports: TlvOptionalField(1, TlvArray(TlvAttributeReport)),

    /** A list of zero or more event reports. */
    eventReports: TlvOptionalField(2, TlvArray(TlvEventReport)),
    moreChunkedMessages: TlvOptionalField(3, TlvBoolean),

    /** Do not send a response to this action. */
    suppressResponse: TlvOptionalField(4, TlvBoolean),
    interactionModelRevision: TlvField(0xff, TlvUInt8),
});

export type DataReport = TypeFromSchema<typeof TlvDataReport>;
