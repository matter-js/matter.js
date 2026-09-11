/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { RootSupervisor } from "#behavior/supervision/RootSupervisor.js";
import { camelize, InternalError } from "@matter/general";
import { Constraint, EncodedConstraint, FeatureMap, FieldValue, Metatype, ValueModel } from "@matter/model";
import { ConstraintError, Val } from "@matter/protocol";
import { ValueSupervisor } from "../../supervision/ValueSupervisor.js";
import { NameResolver } from "../managed/NameResolver.js";
import { assertArray, assertBoolean, assertNumeric, assertSequence, assertString } from "./assertions.js";
import { ValidationLocation } from "./location.js";

interface NameResolverFactory {
    (location: ValidationLocation): (name: string) => Val;
}

/**
 * Creates a function that validates values based on the constraint in the schema.
 */
/**
 * The number the flags of a bitmap value encode to, which is what a constraint on a bitmap bounds.
 *
 * A value of a bitmap is held as the record of its flags, so the magnitude the specification bounds is not the value
 * itself.  A flag beyond the reach of a 32 bit shift states a magnitude this does not compute, and the bound is then
 * left unjudged rather than judged against a number that wrapped.
 *
 * @see {@link MatterSpecification.v16.Core} § 7.19.2
 */
export function bitmapMagnitudeOf(schema: ValueModel, supervisor: RootSupervisor) {
    const bits = {} as Record<string, number>;

    for (const field of supervisor.membersOf(schema)) {
        const constraint = field.effectiveConstraint;
        const bit = typeof constraint.value === "number" ? constraint.value : constraint.min;
        const highest = typeof constraint.max === "number" ? constraint.max : bit;
        if (typeof bit !== "number" || typeof highest !== "number" || bit < 0 || highest > 31) {
            return undefined;
        }
        bits[field.parent?.id === FeatureMap.id ? camelize(field.title ?? field.name) : field.propertyName] = bit;
    }

    return (value: Val) => {
        let magnitude = 0;
        for (const key in value as Record<string, unknown>) {
            const bit = bits[key];
            const flags = (value as Record<string, unknown>)[key];
            if (bit === undefined || !flags) {
                continue;
            }
            magnitude |= (typeof flags === "number" ? flags : 1) << bit;
        }
        return magnitude >>> 0;
    };
}

export function createConstraintValidator(
    constraint: Constraint,
    schema: ValueModel,
    supervisor: RootSupervisor,
): ValueSupervisor.Validate | undefined {
    let nameResolvers: undefined | Record<string, undefined | ((val: Val) => Val)>;

    const nameResolverFactory: NameResolverFactory = (location: ValidationLocation) => {
        return (name: string) => {
            if (nameResolvers === undefined) {
                nameResolvers = {};
            }

            if (name in nameResolvers) {
                return nameResolvers[name]?.(location.siblings) ?? location.outerResolve?.(name);
            }

            const resolver = NameResolver(supervisor, schema.parent, name);
            nameResolvers[name] = resolver;
            return resolver?.(location.siblings) ?? location.outerResolve?.(name);
        };
    };

    const inner = create(EncodedConstraint(constraint, schema), schema, nameResolverFactory, supervisor);
    if (!inner) {
        return undefined;
    }

    return (value, session, location) => {
        const cfg = location.config?.supervision;
        if (cfg?.validate === false || cfg?.constraint === false) {
            return;
        }
        inner(value, session, location);
    };
}

function create(
    constraint: Constraint,
    schema: ValueModel,
    nameResolverFactory: NameResolverFactory,
    supervisor: RootSupervisor,
): ValueSupervisor.Validate | undefined {
    if (constraint.isEmpty) {
        return;
    }

    const metatype = schema.effectiveMetatype;
    if (metatype === Metatype.array) {
        return createArrayConstraintValidator(constraint, schema, nameResolverFactory, supervisor);
    }

    // A value with neither a magnitude nor a length states no bound, and a date is held as a Date, which no bound
    // this builds compares against
    if (
        Metatype.boundKind(metatype) === Metatype.BoundKind.none ||
        metatype === Metatype.date ||
        metatype === undefined
    ) {
        return;
    }

    // A flag of a bitmap states its bit position in its constraint rather than a bound, whatever type the flag
    // takes.  A bitmap judges its flags itself rather than building a validator for each, so nothing reaches here
    // today; this keeps that a choice rather than an accident
    if (schema.parent instanceof ValueModel && schema.parent.effectiveMetatype === Metatype.bitmap) {
        return;
    }

    // A bitmap states its bound in the number its flags encode to rather than in the record they are held as
    if (metatype === Metatype.bitmap) {
        const magnitudeOf = bitmapMagnitudeOf(schema, supervisor);
        if (magnitudeOf === undefined) {
            return;
        }

        return (value, _session, location) => {
            const magnitude = magnitudeOf(value);
            if (!constraint.test(magnitude, nameResolverFactory(location))) {
                throw new ConstraintError(
                    schema,
                    location,
                    `Value ${magnitude} is not within bounds defined by constraint`,
                );
            }
        };
    }

    if (constraint.in) {
        return (value, _session, location) => {
            if (!constraint.test(value as FieldValue, nameResolverFactory(location))) {
                throw new ConstraintError(
                    schema,
                    location,
                    `Value ${value} is not one of the values allowed by "in" constraint`,
                );
            }
        };
    }

    switch (metatype) {
        case Metatype.integer:
        case Metatype.float:
        case Metatype.duration:
            return (value, _session, location) => {
                assertNumeric(value, location);
                if (!constraint.test(value, nameResolverFactory(location))) {
                    throw new ConstraintError(
                        schema,
                        location,
                        `Value ${value} is not within bounds defined by constraint`,
                    );
                }
            };

        // An enumerated value is a number, and a constraint on one states the values it may take rather than a range
        case Metatype.enum:
            return (value, _session, location) => {
                assertNumeric(value, location);
                if (!constraint.test(value, nameResolverFactory(location))) {
                    throw new ConstraintError(schema, location, `Value ${value} is not allowed by constraint`);
                }
            };

        case Metatype.boolean:
            return (value, _session, location) => {
                assertBoolean(value, location);
                if (!constraint.test(value, nameResolverFactory(location))) {
                    throw new ConstraintError(schema, location, `Value ${value} is disallowed by constraint`);
                }
            };

        case Metatype.string: {
            const validateLength: ValueSupervisor.Validate = (value: Val, _session, location) => {
                assertSequence(value, location);
                const length = typeof value === "string" ? value.length : value.byteLength;
                if (!constraint.test(length, nameResolverFactory(location))) {
                    throw new ConstraintError(
                        schema,
                        location,
                        `String length of ${length} is not within bounds defined by constraint`,
                    );
                }
            };

            const { cpMax } = constraint;
            if (cpMax === undefined) {
                return validateLength;
            }

            return (value: Val, _session, location) => {
                validateLength(value, _session, location);
                assertString(value, location);

                const codepointCount = [...value].length;
                if (codepointCount > cpMax) {
                    throw new ConstraintError(
                        schema,
                        location,
                        `Codepoint count of ${codepointCount} is not within bounds defined by constraint`,
                    );
                }
            };
        }

        case Metatype.bytes:
            return (value: Val, _session, location) => {
                assertSequence(value, location);
                const length = typeof value === "string" ? value.length : value.byteLength;
                if (!constraint.test(length, nameResolverFactory(location))) {
                    throw new ConstraintError(
                        schema,
                        location,
                        `Byte length of ${length} is not within bounds defined by constraint`,
                    );
                }
            };

        default:
            throw new InternalError(`Cannot define constraint for unsupported metatype ${metatype}`);
    }
}

/**
 * Validate array constraints specifically.
 *
 * Array constraints behave like other sequence constraints in that they apply
 * to the length.  They are special however as they may have sub-constraints
 * that apply to data elements.
 */
function createArrayConstraintValidator(
    constraint: Constraint,
    schema: ValueModel,
    nameResolver: NameResolverFactory,
    supervisor: RootSupervisor,
): ValueSupervisor.Validate {
    let validateEntryConstraint: ValueSupervisor.Validate | undefined;
    if (constraint.entry) {
        const entrySchema = schema.listEntry;
        if (entrySchema) {
            validateEntryConstraint = create(constraint.entry, entrySchema, nameResolver, supervisor);
        }
    }

    return (value, session, location) => {
        assertArray(value, location);

        if (!constraint.test(value.length, nameResolver(location))) {
            throw new ConstraintError(
                schema,
                location,
                `Array length ${value.length} is not within bounds defined by constraint`,
            );
        }

        if (validateEntryConstraint) {
            const sublocation = {
                ...location,
                path: location.path.at(""),
            };

            let pos = 0;
            for (const e of value) {
                if (e !== undefined && e !== null) {
                    sublocation.path.id = pos;
                    validateEntryConstraint(e, session, sublocation);
                }

                pos++;
            }
        }
    };
}
