/**
 * @license
 * Copyright 2022-2025 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { TypeFromSchema } from "#tlv/TlvSchema.js";
import { TlvArray } from "../../tlv/TlvArray.js";
import { TlvBoolean } from "../../tlv/TlvBoolean.js";
import { TlvUInt16, TlvUInt8 } from "../../tlv/TlvNumber.js";
import { TlvField, TlvObject, TlvOptionalField } from "../../tlv/TlvObject.js";
import { TlvAttributePath } from "../types/TlvAttributePath.js";
import { TlvDataVersionFilter } from "../types/TlvDataVersionFilter.js";
import { TlvEventFilter } from "../types/TlvEventFilter.js";
import { TlvEventPath } from "../types/TlvEventPath.js";

/** @see {@link MatterSpecification.v13.Core}, section 10.7.4 */

export const TlvSubscribeRequest = TlvObject({
    /** False to terminate existing subscriptions from initiator. */
    keepSubscriptions: TlvField(0, TlvBoolean),

    /** The requested minimum interval boundary floor in seconds. */
    minIntervalFloor: TlvField(1, TlvUInt16),

    /** The requested maximum interval boundary ceiling in seconds. */
    maxIntervalCeiling: TlvField(2, TlvUInt16),

    /** A list of zero or more request paths to cluster attribute data. */
    attributeRequests: TlvOptionalField(3, TlvArray(TlvAttributePath)),

    /** A list of zero or more request paths to cluster events. */
    eventRequests: TlvOptionalField(4, TlvArray(TlvEventPath)),

    /** A list of zero or more minimum event numbers per specific node. */
    eventFilters: TlvOptionalField(5, TlvArray(TlvEventFilter)),

    /** Limits the data read within fabric-scoped lists to the accessing fabric. */
    isFabricFiltered: TlvField(7, TlvBoolean),

    /** A list of zero or more cluster instance data versions. */
    dataVersionFilters: TlvOptionalField(8, TlvArray(TlvDataVersionFilter)),
    interactionModelRevision: TlvField(0xff, TlvUInt8),
});

export type SubscribeRequest = TypeFromSchema<typeof TlvSubscribeRequest>;
