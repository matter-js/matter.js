/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { TypeFromSchema } from "#tlv/TlvSchema.js";
import { TlvArray } from "../../tlv/TlvArray.js";
import { TlvBoolean } from "../../tlv/TlvBoolean.js";
import { TlvUInt8 } from "../../tlv/TlvNumber.js";
import { TlvField, TlvObject, TlvOptionalField } from "../../tlv/TlvObject.js";
import { TlvAttributePath } from "../types/TlvAttributePath.js";
import { TlvDataVersionFilter } from "../types/TlvDataVersionFilter.js";
import { TlvEventFilter } from "../types/TlvEventFilter.js";
import { TlvEventPath } from "../types/TlvEventPath.js";

/** @see {@link MatterSpecification.v13.Core}, section 10.7.2 */

export const TlvReadRequest = TlvObject({
    /** A list of zero or more request paths to cluster attribute data. */
    attributeRequests: TlvOptionalField(0, TlvArray(TlvAttributePath)),

    /** A list of zero or more request paths to cluster events. */
    eventRequests: TlvOptionalField(1, TlvArray(TlvEventPath)),

    /** A list of zero or more minimum event numbers per specific node. */
    eventFilters: TlvOptionalField(2, TlvArray(TlvEventFilter)),

    /** Limits the data read within fabric-scoped lists to the accessing fabric. */
    isFabricFiltered: TlvField(3, TlvBoolean),

    /** A list of zero or more cluster instance data versions. */
    dataVersionFilters: TlvOptionalField(4, TlvArray(TlvDataVersionFilter)),
    interactionModelRevision: TlvField(0xff, TlvUInt8),
});

export type ReadRequest = TypeFromSchema<typeof TlvReadRequest>;
