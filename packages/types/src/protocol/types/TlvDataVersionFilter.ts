/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { TypeFromSchema } from "#tlv/TlvSchema.js";
import { TlvUInt32 } from "../../tlv/TlvNumber.js";
import { TlvField, TlvObject } from "../../tlv/TlvObject.js";
import { TlvClusterPath } from "./TlvClusterPath.js";

/** @see {@link MatterSpecification.v13.Core}, section 10.6.3 */

export const TlvDataVersionFilter = TlvObject({
    // DataVersionFilterIB
    path: TlvField(0, TlvClusterPath),
    dataVersion: TlvField(1, TlvUInt32),
});

export type DataVersionFilter = TypeFromSchema<typeof TlvDataVersionFilter>;
