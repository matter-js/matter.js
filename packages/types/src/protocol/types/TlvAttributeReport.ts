/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { TypeFromSchema } from "#tlv/TlvSchema.js";
import { TlvObject, TlvOptionalField } from "../../tlv/TlvObject.js";
import { TlvAttributeReportData } from "./TlvAttributeReportData.js";
import { TlvAttributeStatus } from "./TlvAttributeStatus.js";

/** @see {@link MatterSpecification.v13.Core}, section 10.6.5 */

export const TlvAttributeReport = TlvObject({
    // AttributeReportIB
    attributeStatus: TlvOptionalField(0, TlvAttributeStatus),
    attributeData: TlvOptionalField(1, TlvAttributeReportData),
});

export type AttributeReport = TypeFromSchema<typeof TlvAttributeReport>;
