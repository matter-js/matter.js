/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { StatusCode } from "../../common/StatusCode.js";
import { TlvEnum } from "../../tlv/TlvNumber.js";
import { TlvField, TlvObject, TlvOptionalField } from "../../tlv/TlvObject.js";

/** @see {@link MatterSpecification.v13.Core}, section 10.6.17 */

export const TlvStatus = TlvObject({
    // StatusIB
    status: TlvField(0, TlvEnum<StatusCode>()), // 8Bit
    clusterStatus: TlvOptionalField(1, TlvEnum<StatusCode>()),
});
