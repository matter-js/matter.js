/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { TlvUInt16 } from "../../tlv/TlvNumber.js";
import { TlvField, TlvObject, TlvOptionalField } from "../../tlv/TlvObject.js";
import { TlvCommandPath } from "./TlvCommandPath.js";
import { TlvStatus } from "./TlvStatus.js";

/** @see {@link MatterSpecification.v13.Core}, section 10.6.14 */

export const TlvCommandStatus = TlvObject({
    // CommandStatusIB
    commandPath: TlvField(0, TlvCommandPath),
    status: TlvField(1, TlvStatus),
    commandRef: TlvOptionalField(2, TlvUInt16),
});
