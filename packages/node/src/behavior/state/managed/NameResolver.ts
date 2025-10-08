/**
 * @license
 * Copyright 2022-2025 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { RootSupervisor } from "#behavior/supervision/RootSupervisor.js";
import { camelize } from "#general";
import type { Schema } from "#model";
import { ClusterModel, Model, ValueModel, type FieldValue } from "#model";
import { Val } from "#protocol";
import { Internal } from "./Internal.js";

/**
 * Obtain a function that returns a visible property by name from the ownership hierarchy of a managed value.
 *
 * This supports named lookup of a {@link FieldValue.Reference}.
 */
export function NameResolver(
    supervisor: RootSupervisor,
    model: Model | undefined,
    name: string,
): ((val: Val) => Val) | undefined {
    if (model === undefined) {
        return;
    }

    // Optimization for root schema
    if (
        model === supervisor.schema ||
        (model.id !== undefined && supervisor.schema.tag === model.tag && supervisor.schema.id === model.id)
    ) {
        if (!supervisor.memberNames.has(name)) {
            return;
        }
        return createDirectResolver();
    }

    // Only structs may provide named properties
    if (!(model instanceof ValueModel) || model.effectiveMetatype !== "object") {
        return createIndirectResolver();
    }

    // Read directly if the named property is supported by this schema.  This is not indexed which is fine because:
    //   1. The spec uses this very lightly as of 1.4, and
    //   2. We only do this once and only for schema that utilizes this feature
    if (supervisor.membersOf(model as Schema).find(model => camelize(model.name, false) === name)) {
        return createDirectResolver();
    }

    // Delegate to parent
    return createIndirectResolver();

    /**
     * Create a reader that reads from this value.
     */
    function createDirectResolver() {
        return (val: Val) => (val as Val.Struct)?.[name];
    }

    /**
     * Create a reader that reads from parent.
     */
    function createIndirectResolver() {
        const parentSchema = model!.parent;
        if (!(parentSchema instanceof ValueModel) && !(parentSchema instanceof ClusterModel)) {
            return;
        }

        const parentReader = NameResolver(supervisor, parentSchema, name);
        if (!parentReader) {
            return;
        }

        return (val: Val) => {
            const parent = (val as Internal.Collection)?.[Internal.reference]?.parent?.owner;
            if (parent) {
                return parentReader(parent as Val.Collection);
            }
        };
    }
}
