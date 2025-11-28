/**
 * @license
 * Copyright 2022-2025 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { camelize, InternalError } from "#general";
import type { Schema } from "#model";
import { AttributeModel, ClusterModel, DataModelPath, FeatureMap, Metatype, ValueModel } from "#model";
import { ConformanceError, DatatypeError, SchemaImplementationError, Val } from "#protocol";
import { Status } from "#types";
import { RootSupervisor } from "../../supervision/RootSupervisor.js";
import type { ValueSupervisor } from "../../supervision/ValueSupervisor.js";
import { Internal } from "../managed/Internal.js";
import {
    assertArray,
    assertBoolean,
    assertBytes,
    assertInt,
    assertNumber,
    assertNumeric,
    assertObject,
    assertString,
} from "./assertions.js";
import { createConformanceValidator } from "./conformance.js";
import { createConstraintValidator } from "./constraint.js";
import { ValidationLocation } from "./location.js";

/**
 * Generate a function that performs data validation.
 *
 * @param schema the schema against which we validate
 * @param supervisor used to retrieve validators for sub-properties
 */
export function ValueValidator(schema: Schema, supervisor: RootSupervisor): ValueSupervisor.Validate | undefined {
    if (schema instanceof ClusterModel) {
        return createStructValidator(schema, supervisor);
    }

    let validator: ValueSupervisor.Validate | undefined;
    const metabase = schema.metabase;
    switch (metabase?.metatype) {
        case Metatype.enum:
            validator = createEnumValidator(schema, supervisor);
            break;

        case Metatype.bitmap:
            validator = createBitmapValidator(schema, supervisor);
            break;

        case Metatype.integer:
            validator = createIntegerValidator(schema, supervisor, metabase.name);
            break;

        case Metatype.float:
            validator = createSimpleValidator(schema, supervisor, assertNumeric);
            break;

        case Metatype.boolean:
            validator = createSimpleValidator(schema, supervisor, assertBoolean);
            break;

        case Metatype.string:
            validator = createSimpleValidator(schema, supervisor, assertString);
            break;

        case Metatype.bytes:
            validator = createSimpleValidator(schema, supervisor, assertBytes);
            break;

        case Metatype.object:
            validator = createStructValidator(schema, supervisor);
            break;

        case Metatype.array:
            validator = createListValidator(schema, supervisor);
            break;

        case Metatype.date:
        case Metatype.duration:
        case Metatype.any:
            break;

        case undefined:
            const type = schema.effectiveType;
            if (type === undefined) {
                if (schema.isDisallowed || (schema.isDeprecated && !schema.type)) {
                    // We do not need to validate types for disallowed members and the specification may not include
                    // them
                    break;
                }
                throw new SchemaImplementationError(DataModelPath(schema.path), `No type defined`);
            }
            throw new SchemaImplementationError(
                DataModelPath(schema.path),
                `Cannot determine metatype for type "${type}"`,
            );

        default:
            throw new SchemaImplementationError(
                DataModelPath((schema as unknown as Schema).path),
                `Unsupported validation metatype ${metabase?.metatype}`,
            );
    }

    validator = createNullValidator(schema, validator);

    validator = createConformanceValidator(schema, supervisor, validator);

    return validator;
}

function createNullValidator(
    schema: ValueModel,
    nextValidator?: ValueSupervisor.Validate,
): ValueSupervisor.Validate | undefined {
    if (schema.effectiveQuality.nullable === true) {
        return (value, options, location) => {
            if (value !== null) {
                nextValidator?.(value, options, location);
            }
        };
    }

    // If the field is not nullable, let the datatype check handle validation
    return nextValidator;
}

function createEnumValidator(schema: ValueModel, supervisor: RootSupervisor): ValueSupervisor.Validate | undefined {
    const valid = new Set(
        supervisor
            .membersOf(schema)
            .map(member => member.id)
            .filter(e => e !== undefined),
    );

    const constraint = schema.effectiveConstraint;
    const constraintValidator = constraint.in
        ? createConstraintValidator(schema.effectiveConstraint, schema, supervisor)
        : undefined;

    return (value, session, location) => {
        assertNumber(value, location);
        if (!valid.has(value)) {
            throw new DatatypeError(location, "defined in enum", value, Status.ConstraintError);
        }

        constraintValidator?.(value, session, location);
    };
}

function createBitmapValidator(schema: ValueModel, supervisor: RootSupervisor): ValueSupervisor.Validate | undefined {
    const fields = {} as Record<string, { schema: ValueModel; max: number }>;

    for (const field of supervisor.membersOf(schema)) {
        const constraint = field.effectiveConstraint;
        let max;
        if (typeof constraint.min === "number" && typeof constraint.max === "number") {
            max = Math.pow(2, constraint.max - constraint.min + 1) - 1; // e.g bits 0..2 -> 2^3 - 1 = 7 aka 111b
        } else {
            max = 1;
        }
        let name;
        if (field?.parent?.id === FeatureMap.id) {
            name = camelize(field.title ?? field.name);
        } else {
            name = camelize(field.name);
        }
        fields[name] = {
            schema: field,
            max,
        };
    }

    return (value, _session, location) => {
        assertObject(value, location);

        for (const key in value) {
            const field = fields[key];
            const subpath = location.path.at(key);

            if (field === undefined) {
                throw new DatatypeError(subpath, "defined in bitmap", key);
            }

            const fieldValue = value[key];
            if (fieldValue === undefined) {
                continue;
            }

            if (field.max === 1) {
                assertBoolean(fieldValue, subpath);
            } else {
                assertNumber(fieldValue, subpath);

                if (fieldValue > field.max) {
                    throw new DatatypeError(subpath, "in range of bit field", fieldValue);
                }
            }
        }
    };
}

function createSimpleValidator(
    schema: ValueModel,
    supervisor: RootSupervisor,
    validateType: (value: Val, location: ValidationLocation) => void,
): ValueSupervisor.Validate {
    const validateConstraint = createConstraintValidator(schema.effectiveConstraint, schema, supervisor);

    return (value, session, location) => {
        // If undefined, only conformance tests apply
        if (value === undefined) {
            return;
        }

        validateType(value, location);

        validateConstraint?.(value, session, location);
    };
}

function createIntegerValidator(schema: ValueModel, supervisor: RootSupervisor, name: string) {
    const nullable = schema.effectiveQuality.nullable;
    let assertion;
    // Let's check schema type specific assertations first
    // TODO maybe introduce a date type and then optimize this here later
    if (schema.type === "epoch-s" || schema.type === "epoch-us") {
        if (nullable) {
            assertion = assertInt.nullable[schema.type];
        } else {
            assertion = assertInt.notNullable[schema.type];
        }
    }
    if (assertion === undefined) {
        if (nullable) {
            assertion = assertInt.nullable[name];
        } else {
            assertion = assertInt.notNullable[name];
        }
    }

    if (assertion === undefined) {
        throw new InternalError(`No integer assertion implemented for integer type ${name}`);
    }

    return createSimpleValidator(schema, supervisor, assertion);
}

function createStructValidator(schema: Schema, supervisor: RootSupervisor): ValueSupervisor.Validate {
    const validators = {} as Record<string, ValueSupervisor.Validate>;

    for (const field of supervisor.membersOf(schema)) {
        // Skip deprecated, and global attributes we currently handle in lower levels
        if (AttributeModel.isGlobal(field) || (field.isDeprecated && !field.type)) {
            continue;
        }
        const validate = supervisor.get(field).validate;
        if (validate) {
            validators[camelize(field.name)] = validate;
        }
    }

    const validateStruct: ValueSupervisor.Validate = (struct, session, location) => {
        assertObject(struct, location);
        const sublocation = {
            path: location.path.at(""),
            siblings: struct,
            choices: {},
        } as ValidationLocation;

        for (const name in validators) {
            let value;

            if ((struct as Val.Dynamic)[Val.properties]) {
                const rootOwner = (struct as unknown as Internal.Collection)[Internal.reference];
                const properties = (struct as Val.Dynamic)[Val.properties](rootOwner, session);
                if (name in properties) {
                    value = properties[name];
                } else {
                    value = struct[name];
                }
            } else {
                value = struct[name];
            }

            sublocation.path.id = name;
            validators[name](value, session, sublocation);
        }

        for (const name in sublocation.choices) {
            const choice = sublocation.choices[name];

            if (choice.count < choice.target && !choice.orLess) {
                throw new ConformanceError(
                    schema,
                    location,
                    `Too few fields present (${choice.count} of min ${choice.target})`,
                    name,
                );
            }

            if (choice.count > choice.target && !choice.orMore) {
                throw new ConformanceError(
                    schema,
                    location,
                    `Too many fields present (${choice.count} of max ${choice.target})`,
                    name,
                );
            }
        }
    };

    return validateStruct;
}

function createListValidator(schema: ValueModel, supervisor: RootSupervisor): ValueSupervisor.Validate | undefined {
    const entry = schema.listEntry;
    let validateEntries: undefined | ValueSupervisor.Validate;
    if (entry) {
        const entryValidator = supervisor.get(entry).validate;

        if (entryValidator) {
            validateEntries = (list: Val, session: ValueSupervisor.Session, location: ValidationLocation) => {
                if (!list || typeof (list as Iterable<unknown>)[Symbol.iterator] !== "function") {
                    throw new DatatypeError(location, "a list", list);
                }

                let index = 0;
                const sublocation = {
                    path: location.path.at(""),
                };
                for (const e of list as Iterable<unknown>) {
                    if (e === undefined || e === null) {
                        // Accept nullish
                        continue;
                    }

                    sublocation.path.id = index;
                    entryValidator(e, session, sublocation);

                    index++;
                }
            };
        }
    }

    const validateConstraint = createConstraintValidator(schema.constraint, schema, supervisor);

    return (value, session, location) => {
        assertArray(value, location);
        validateConstraint?.(value, session, location);
        validateEntries?.(value, session, location);
    };
}
