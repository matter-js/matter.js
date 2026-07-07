/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { Status } from "../../globals/Status.js";
import { TlvEnum, TlvUInt8 } from "../../tlv/TlvNumber.js";
import { TlvField, TlvObject, TlvOptionalField } from "../../tlv/TlvObject.js";

/** @see {@link MatterSpecification.v16.Core}, section 10.7.1 */

export const TlvStatusResponse = TlvObject({
    /** A status code (@see Status Codes {@link MatterSpecification.v16.Core} section 7.10.7) */
    status: TlvField(0, TlvEnum<Status>()),
    interactionModelRevision: TlvOptionalField(0xff, TlvUInt8),
});
