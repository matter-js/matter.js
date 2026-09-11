/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { RootSupervisor } from "#behavior/supervision/RootSupervisor.js";
import { Constraint, EncodedConstraint, FieldValue, Metatype, ValueModel } from "@matter/model";
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
export function createConstraintValidator(
    constraint: Constraint,
    schema: ValueModel,
    supervisor: RootSupervisor,
    magnitudeOf?: (value: Val) => number | undefined,
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

    const encoded = EncodedConstraint(constraint, schema);

    // A value stating its bound in the number it encodes to rather than in itself, as a bitmap does, is judged by
    // that number.  The bound still resolves names and honors supervision as any other does
    const inner = magnitudeOf
        ? constraint.isEmpty || constraint.desc || constraint.none
            ? undefined
            : (value: Val, _session: ValueSupervisor.Session, location: ValidationLocation) => {
                  const magnitude = magnitudeOf(value);
                  if (magnitude === undefined) {
                      return;
                  }

                  if (!encoded.test(magnitude, nameResolverFactory(location))) {
                      throw new ConstraintError(
                          schema,
                          location,
                          `Value ${magnitude} is not within bounds defined by constraint`,
                      );
                  }
              }
        : create(encoded, schema, nameResolverFactory);
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
): ValueSupervisor.Validate | undefined {
    if (constraint.isEmpty) {
        return;
    }

    const metatype = schema.effectiveMetatype;
    if (metatype === Metatype.array) {
        return createArrayConstraintValidator(constraint, schema, nameResolverFactory);
    }

    // A bound the specification states is enforceable only where the value is held as something it compares against.
    // A bitmap is held as the record of its flags and a date as a Date, so neither a bound nor a membership set
    // states anything this could check
    // A flag of a bitmap states its bit position in its constraint rather than a bound, whatever type the flag takes.
    // Such a member reaches its own validator today rather than this one, so this keeps that a choice rather than an
    // accident
    if (schema.parent instanceof ValueModel && schema.parent.effectiveMetatype === Metatype.bitmap) {
        return;
    }

    const boundKind = Metatype.boundKind(metatype);
    if (
        !Metatype.holdsNumber(metatype) &&
        boundKind !== Metatype.BoundKind.length &&
        boundKind !== Metatype.BoundKind.value
    ) {
        return;
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
            return;
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
): ValueSupervisor.Validate {
    let validateEntryConstraint: ValueSupervisor.Validate | undefined;
    if (constraint.entry) {
        const entrySchema = schema.listEntry;
        if (entrySchema) {
            validateEntryConstraint = create(constraint.entry, entrySchema, nameResolver);
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
