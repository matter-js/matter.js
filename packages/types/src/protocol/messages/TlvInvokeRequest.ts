/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { TypeFromSchema } from "#tlv/TlvSchema.js";
import { TlvArray } from "../../tlv/TlvArray.js";
import { TlvBoolean } from "../../tlv/TlvBoolean.js";
import { TlvUInt8 } from "../../tlv/TlvNumber.js";
import { TlvField, TlvObject } from "../../tlv/TlvObject.js";
import { TlvCommandData } from "../types/TlvCommandData.js";

/** @see {@link MatterSpecification.v13.Core}, section 10.7.9 */

export const TlvInvokeRequest = TlvObject({
    /** Do not send a response to this action. */
    suppressResponse: TlvField(0, TlvBoolean),

    /** Flag action as part of a timed invoke transaction. */
    timedRequest: TlvField(1, TlvBoolean),

    /** Cluster command(s) to invoke. */
    invokeRequests: TlvField(2, TlvArray(TlvCommandData)),
    interactionModelRevision: TlvField(0xff, TlvUInt8),
});

export type InvokeRequest = TypeFromSchema<typeof TlvInvokeRequest>;
