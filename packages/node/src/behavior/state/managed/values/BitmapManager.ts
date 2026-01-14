/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { camelize, GeneratedClass, isObject } from "#general";
import type { FieldModel, Schema } from "#model";
import { DataModelPath, FeatureMap, ValueModel } from "#model";
import { ConstraintError, PhantomReferenceError, SchemaImplementationError, Val } from "#protocol";
import { RootSupervisor } from "../../../supervision/RootSupervisor.js";
import { ValueSupervisor } from "../../../supervision/ValueSupervisor.js";
import { assertBoolean, assertNumber } from "../../validation/assertions.js";
import { Instrumentation } from "../Instrumentation.js";
import { Internal } from "../Internal.js";

const SESSION = Symbol("options");

interface Wrapper extends Val.Struct, Internal.Collection {
    /**
     * A reference to the raw value.
     */
    [Internal.reference]: Val.Reference<Val.Struct>;

    /**
     * Information regarding the current user session.
     */
    [SESSION]: ValueSupervisor.Session;
}

/**
 * For bitmaps we generate a class with accessors for each bitmap value or range.
 */
export function BitmapManager(owner: RootSupervisor, schema: Schema): ValueSupervisor.Manage {
    const instanceDescriptors = {} as PropertyDescriptorMap;

    const byteSize = (schema as ValueModel).metabase?.byteSize;
    if (byteSize === undefined) {
        throw new SchemaImplementationError(DataModelPath(schema.path), `Base bitmap type has no byteSize defined`);
    }
    const maxBit = byteSize * 8;

    for (const member of owner.membersOf(schema)) {
        let name;
        if (schema.id === FeatureMap.id) {
            // We require special casing for feature maps because the spec code uses "feature" field from spec as name
            // and model uses "code".  The model should probably be inverted but we just special case for now
            name = camelize((member as FieldModel).title ?? member.name);
        } else {
            name = camelize(member.name);
        }

        const descriptor = configureProperty(name, maxBit, member);

        instanceDescriptors[name] = descriptor;
    }

    const Wrapper = GeneratedClass({
        name: schema.name,

        initialize(this: Wrapper, ref: Val.Reference<Val.Struct>, session: ValueSupervisor.Session) {
            // Only objects are acceptable
            if (!isObject(ref.value)) {
                throw new SchemaImplementationError(
                    ref.location,
                    `Cannot manage ${typeof ref.value} because it is not a bitmap object`,
                );
            }

            Object.defineProperties(this, {
                [Internal.reference]: {
                    value: ref,
                },
                [SESSION]: {
                    value: session,
                },
            });

            Object.defineProperties(this, instanceDescriptors);
        },
    });

    Instrumentation.instrumentStruct(Wrapper);

    return (reference, session) => {
        reference.owner = new Wrapper(reference, session);
        return reference.owner;
    };
}

function configureProperty(name: string, maxBit: number, schema: ValueModel) {
    const constraint = schema.effectiveConstraint;

    let startBit: number, stopBit: number;
    if (typeof constraint.value === "number") {
        startBit = constraint.value;
        stopBit = startBit + 1;
    } else if (typeof constraint.min === "number" && typeof constraint.max === "number") {
        startBit = constraint.min;
        stopBit = constraint.max + 1;

        if (startBit > stopBit) {
            const temp = startBit;
            startBit = stopBit;
            stopBit = temp;
        }
    } else {
        throw new SchemaImplementationError(DataModelPath(schema.path), `Bitfield is not properly constrained`);
    }

    if (stopBit > maxBit) {
        throw new SchemaImplementationError(
            DataModelPath(schema.path),
            `Bitfield range end ${stopBit} is too large for a ${maxBit}-bit bitmap`,
        );
    }

    const max = 1 << (stopBit - startBit);

    if (max === 2) {
        return {
            enumerable: true,

            get(this: Wrapper) {
                const bits = this[Internal.reference].value;
                if (bits === undefined) {
                    throw new PhantomReferenceError(this[Internal.reference].location);
                }
                return !!bits[name];
            },

            set(this: Wrapper, value: Val) {
                const ref = this[Internal.reference];

                if (value !== undefined) {
                    assertBoolean(value, ref.location.path);
                }

                ref.change(() => {
                    const bits = ref.value;
                    if (bits === undefined) {
                        throw new PhantomReferenceError(this[Internal.reference].location);
                    }
                    bits[name] = !!value;
                });
            },
        };
    }

    return {
        enumerable: true,

        get(this: Wrapper) {
            const bits = this[Internal.reference].value;
            if (bits === undefined) {
                throw new PhantomReferenceError(this[Internal.reference].location);
            }
            return bits[name];
        },

        set(this: Wrapper, value: Val) {
            const ref = this[Internal.reference];

            if (value !== undefined) {
                assertNumber(value, ref.location.path);

                if (value >= max) {
                    throw new ConstraintError(
                        schema,
                        this[Internal.reference].location,
                        `Value ${value} is too large for bitfield`,
                    );
                } else if (value < 0) {
                    throw new ConstraintError(
                        schema,
                        this[Internal.reference].location,
                        `Illegal negative value ${value} for bitfield`,
                    );
                }
            }

            ref.change(() => {
                const bits = ref.value;
                if (bits === undefined) {
                    throw new PhantomReferenceError(this[Internal.reference].location);
                }
                bits[name] = value ? value : 0;
            });
        },
    };
}
