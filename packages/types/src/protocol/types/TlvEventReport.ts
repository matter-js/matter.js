/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { TypeFromSchema } from "#tlv/TlvSchema.js";
import { TlvObject, TlvOptionalField } from "../../tlv/TlvObject.js";
import { TlvEventData } from "./TlvEventData.js";
import { TlvEventStatus } from "./TlvEventStatus.js";

/** @see {@link MatterSpecification.v13.Core}, section 10.6.10 */

export const TlvEventReport = TlvObject({
    // EventReportIB
    eventStatus: TlvOptionalField(0, TlvEventStatus),
    eventData: TlvOptionalField(1, TlvEventData),
});

export type EventReport = TypeFromSchema<typeof TlvEventReport>;
