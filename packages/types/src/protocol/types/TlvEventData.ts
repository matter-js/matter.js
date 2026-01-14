/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { Priority } from "#globals/Priority.js";
import { TypeFromSchema } from "#tlv/TlvSchema.js";
import { TlvEventNumber } from "../../datatype/EventNumber.js";
import { TlvAny } from "../../tlv/TlvAny.js";
import { TlvEnum, TlvPosixMs, TlvSysTimeMS } from "../../tlv/TlvNumber.js";
import { TlvField, TlvObject, TlvOptionalField } from "../../tlv/TlvObject.js";
import { TlvEventPath } from "./TlvEventPath.js";

/** @see {@link MatterSpecification.v13.Core}, section 10.6.9 */

export const TlvEventData = TlvObject({
    // EventDataIB
    path: TlvField(0, TlvEventPath),
    eventNumber: TlvField(1, TlvEventNumber),
    priority: TlvField(2, TlvEnum<Priority>()),
    epochTimestamp: TlvOptionalField(3, TlvPosixMs),
    systemTimestamp: TlvOptionalField(4, TlvSysTimeMS),
    deltaEpochTimestamp: TlvOptionalField(5, TlvPosixMs),
    deltaSystemTimestamp: TlvOptionalField(6, TlvSysTimeMS),
    data: TlvOptionalField(7, TlvAny),
});

export type EventData = TypeFromSchema<typeof TlvEventData>;
