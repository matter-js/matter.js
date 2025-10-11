/**
 * @license
 * Copyright 2022-2025 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { camelize } from "#general";
import type { Schema } from "#model";
import { ClusterModel, DataModelPath, Metatype, UnsupportedCastError, ValueModel } from "#model";
import { SchemaImplementationError, Val } from "#protocol";
import { RootSupervisor } from "../../../supervision/RootSupervisor.js";
import { ValueSupervisor } from "../../../supervision/ValueSupervisor.js";

/**
 * Obtain a {@link ValueSupervisor.Cast} function for the given schema.
 */
export function ValueCaster(schema: Schema, owner: RootSupervisor): ValueSupervisor.Cast {
    const metatype = schema.effectiveMetatype ?? Metatype.any;

    let cast: ValueSupervisor.Cast;
    switch (metatype) {
        case Metatype.object:
            cast = StructCaster(schema, owner);
            break;

        case Metatype.array:
            cast = ListCaster(schema as ValueModel, owner);
            break;

        default:
            cast = Metatype.cast[metatype];
            break;
    }

    if (schema.quality.nullable) {
        return value => {
            if (value === null) {
                return value;
            }

            return cast(value);
        };
    }

    return cast;
}

function StructCaster(schema: ValueModel | ClusterModel, owner: RootSupervisor) {
    const memberConfigs = {} as Record<string, { name: string; cast: ValueSupervisor.Cast }>;
    for (const member of owner.membersOf(schema)) {
        const config = { name: camelize(member.name), cast: owner.get(member).cast };

        // Correct case has priority
        memberConfigs[config.name] = config;

        // We also support case-insensitive match.  There are no collisions if names are case-insensitive in standard
        // Matter models but we differentiate anyway just for completeness
        const lowerName = member.name.toLowerCase();
        if (!memberConfigs[lowerName]) {
            memberConfigs[lowerName] = config;
        }
    }

    const castToObject = Metatype.cast.object;

    return (value: any) => {
        const input = castToObject(value);
        const output = {} as Val.Struct;

        for (const key in input) {
            let config = memberConfigs[key];
            if (config === undefined) {
                config = memberConfigs[key.toLowerCase()];
            }

            if (config === undefined) {
                throw new UnsupportedCastError(`Property "${key}" is unsupported`);
            }

            output[config.name] = config.cast(input[key]);
        }

        return output;
    };
}

function ListCaster(schema: ValueModel, owner: RootSupervisor) {
    const entry = schema.listEntry;
    if (entry === undefined) {
        throw new SchemaImplementationError(DataModelPath(schema.path), "List schema has no entry definition");
    }

    const castToArray = Metatype.cast.array;
    const castEntry = owner.get(entry).cast;

    return (value: any) => castToArray(value)?.map(castEntry);
}
