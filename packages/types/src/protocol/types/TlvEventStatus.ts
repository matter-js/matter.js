/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { TypeFromSchema } from "#tlv/TlvSchema.js";
import { TlvField, TlvObject } from "../../tlv/TlvObject.js";
import { TlvEventPath } from "./TlvEventPath.js";
import { TlvStatus } from "./TlvStatus.js";

/** @see {@link MatterSpecification.v13.Core}, section 10.6.15 */

export const TlvEventStatus = TlvObject({
    // EventStatusIB
    path: TlvField(0, TlvEventPath),
    status: TlvField(1, TlvStatus),
});

export type EventStatus = TypeFromSchema<typeof TlvEventStatus>;
