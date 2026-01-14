/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import type { Schema } from "#model";
import { Metatype } from "#model";
import type { RootSupervisor } from "../../../supervision/RootSupervisor.js";
import { ValueSupervisor } from "../../../supervision/ValueSupervisor.js";
import { BitmapManager } from "./BitmapManager.js";
import { ListManager } from "./ListManager.js";
import { PrimitiveManager } from "./PrimitiveManager.js";
import { StructManager } from "./StructManager.js";

/**
 * Obtain a {@link ValueSupervisor.Manage} implementation for the given schema.
 *
 * Used by {@link RootSupervisor} which acts as a cache.
 */
export function ValueManager(schema: Schema, owner: RootSupervisor): ValueSupervisor.Manage {
    switch (schema.effectiveMetatype) {
        case Metatype.object:
            return StructManager(owner, schema);

        case Metatype.bitmap:
            return BitmapManager(owner, schema);

        case Metatype.array:
            return ListManager(owner, schema);

        // TODO - for completeness we should either make ByteArray immutable in state or wrap here but meh

        default:
            return PrimitiveManager;
    }
}
