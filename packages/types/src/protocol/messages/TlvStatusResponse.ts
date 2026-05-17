/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { StatusCode } from "../../common/StatusCode.js";
import { TlvEnum, TlvUInt8 } from "../../tlv/TlvNumber.js";
import { TlvField, TlvObject, TlvOptionalField } from "../../tlv/TlvObject.js";

/** @see {@link MatterSpecification.v13.Core}, section 10.7.1 */

export const TlvStatusResponse = TlvObject({
    /** A status code (@see Status Codes {@link MatterSpecification.v13.Core} section 7.10.7) */
    status: TlvField(0, TlvEnum<StatusCode>()),
    interactionModelRevision: TlvOptionalField(0xff, TlvUInt8),
});
