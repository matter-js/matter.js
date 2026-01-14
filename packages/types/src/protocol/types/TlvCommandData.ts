/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { TypeFromSchema } from "#tlv/TlvSchema.js";
import { TlvAny } from "../../tlv/TlvAny.js";
import { TlvUInt16 } from "../../tlv/TlvNumber.js";
import { TlvField, TlvObject, TlvOptionalField } from "../../tlv/TlvObject.js";
import { TlvCommandPath } from "./TlvCommandPath.js";

/** @see {@link MatterSpecification.v13.Core}, section 10.6.12 */

export const TlvCommandData = TlvObject({
    // CommandDataIB
    commandPath: TlvField(0, TlvCommandPath),
    commandFields: TlvOptionalField(1, TlvAny),
    commandRef: TlvOptionalField(2, TlvUInt16),
});

export type CommandData = TypeFromSchema<typeof TlvCommandData>;
