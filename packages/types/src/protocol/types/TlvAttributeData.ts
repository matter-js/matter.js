/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { TlvAny } from "../../tlv/TlvAny.js";
import { TlvUInt32 } from "../../tlv/TlvNumber.js";
import { TlvField, TlvObject, TlvOptionalField } from "../../tlv/TlvObject.js";
import { TypeFromSchema } from "../../tlv/TlvSchema.js";
import { TlvAttributePath } from "./TlvAttributePath.js";

/** @see {@link MatterSpecification.v13.Core}, section 10.6.4 */

export const TlvAttributeData = TlvObject({
    // AttributeDataIB version for Non-Reports
    dataVersion: TlvOptionalField(0, TlvUInt32),
    path: TlvField(1, TlvAttributePath),
    data: TlvField(2, TlvAny),
});

export type AttributeData = TypeFromSchema<typeof TlvAttributeData>;
