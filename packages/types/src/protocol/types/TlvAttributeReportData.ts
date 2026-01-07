/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { TypeFromSchema } from "#tlv/TlvSchema.js";
import { TlvAny } from "../../tlv/TlvAny.js";
import { TlvUInt32 } from "../../tlv/TlvNumber.js";
import { TlvField, TlvObject, TlvOptionalField } from "../../tlv/TlvObject.js";
import { TlvAttributePath } from "./TlvAttributePath.js";

export const TlvAttributeReportData = TlvObject({
    // AttributeDataIB version for Reports
    dataVersion: TlvOptionalField(0, TlvUInt32),
    path: TlvField(1, TlvAttributePath),
    data: TlvField(2, TlvAny),
});

export type AttributeReportData = TypeFromSchema<typeof TlvAttributeReportData>;
