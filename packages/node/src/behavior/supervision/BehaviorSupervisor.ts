/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { camelize } from "#general";
import { Access, FieldModel, Schema, Scope } from "#model";
import type { Val } from "#protocol";
import type { Behavior } from "../Behavior.js";
import type { StateType } from "../state/StateType.js";
import { RootSupervisor } from "./RootSupervisor.js";

/**
 * Create a {@link RootSupervisor} for a {@link Behavior}.
 *
 * {@link Behavior} uses this internally for its {@link Behavior.supervisor}.
 *
 * BehaviorSupervisor derives operational schema from a "logical" schema.  If the {@link Behavior} implementation has a
 * static schema property this defines the logical schema.  Otherwise the logical schema is {@link Schema.empty}.
 *
 * This function loads the logical schema and mutates as required.  This includes addition of fields for any
 * programmatic extensions of state.  This allows schema-driven logic to process state fields added in pure JS.
 *
 * The {@link RootSupervisor} is then constructed from the mutated logical schema.
 */
export function BehaviorSupervisor(options: BehaviorSupervisor.Options): RootSupervisor {
    const logical = options.schema ?? Schema.empty;

    // Add fields for programmatic extensions
    const schema = addExtensionFields(logical, new options.State());

    return RootSupervisor.for(schema);
}

export namespace BehaviorSupervisor {
    export interface Options {
        id: string;
        schema?: Schema;
        State: StateType;
    }
}

const extendedSchemaCache = new Map<Schema, Record<string, Schema>>();

/**
 * Adds a field for every property in state that isn't defined in the schema.
 *
 * Note 1: We skip all attributes, not just those that are applicable given the supported features.
 *
 * Note 2: Finding fields isn't as simple as just using "for ... in" because ES6 class accessors are non-enumerable.  So
 * we instead search the prototype chain for read/write descriptors.
 *
 * Note 3: We can't do anything with types either.  This means e.g. writing to subfields won't behave as expected.
 * Really to do things correctly behavior authors should hand-craft schema.  Once we can configure with decorators this
 * will be more straightforward.
 *
 * Note 4: We cache the combination of schema + extension fields.  This is a small win but primarily to enable caching
 * of other tiers that use the schema as a cache key.
 */
function addExtensionFields(schema: Schema, defaultState: Val.Struct) {
    const props = new Set<string>();
    const scope = Scope(schema, { forceOwner: true });
    for (const field of scope.membersOf(schema, { conformance: "deconflicted" })) {
        props.add(camelize(field.name));
    }

    let newProperties: Record<string, boolean> | undefined;

    function addProperties(object: null | Val.Struct) {
        if (!object || object === Object.prototype) {
            return;
        }

        const descriptors = Object.getOwnPropertyDescriptors(object);

        for (const name in descriptors) {
            if (props.has(name) || name === "constructor") {
                continue;
            }

            if (!props.has(name)) {
                props.add(name);

                const descriptor = descriptors[name];
                const fixed = !descriptor.writable && !descriptor.set;

                if (newProperties === undefined) {
                    newProperties = {};
                }
                newProperties[name] = fixed;
            }
        }

        addProperties(Object.getPrototypeOf(object));
    }

    addProperties(defaultState);

    if (newProperties === undefined) {
        return schema;
    }

    // The secondary cache key is formed from the fields we are adding
    const cacheKey = Object.entries(newProperties)
        .map(([name, fixed]) => `${name}/${fixed}`)
        .join(",");
    let cacheBucket = extendedSchemaCache.get(schema);
    if (cacheBucket === undefined) {
        extendedSchemaCache.set(schema, (cacheBucket = {}));
    } else if (cacheKey in cacheBucket) {
        return cacheBucket[cacheKey];
    }

    // Create the extension
    schema = schema.extend();

    for (const name in newProperties) {
        const field = new FieldModel({
            name,
            type: "any",

            access: new Access({
                readPriv: Access.Privilege.View,
                writePriv: Access.Privilege.Operate,
            }),
        });

        if (newProperties[name]) {
            field.quality = "F";
        }

        schema.children.push(field);
    }

    cacheBucket[cacheKey] = schema;

    return schema;
}
