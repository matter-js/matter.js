/**
 * @license
 * Copyright 2022-2025 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { camelize } from "#general";
import { ModelTraversal } from "#logic/ModelTraversal.js";
import { Access, Aspect, Conformance, Constraint, Quality } from "../../aspects/index.js";
import { DefinitionError, FieldValue, Metatype } from "../../common/index.js";
import { ClusterModel, Globals, ValueModel } from "../../models/index.js";
import { ModelValidator } from "./ModelValidator.js";
import { ValidationExceptions } from "./ValidationExceptions.js";

/**
 * Validates models that extend DataModel.
 */
export class ValueValidator<T extends ValueModel> extends ModelValidator<T> {
    override validate() {
        this.validateProperty({ name: "type", type: "string" });
        this.validateProperty({ name: "byteSize", type: "number" });
        this.validateProperty({ name: "constraint", type: Constraint });
        this.validateProperty({ name: "conformance", type: Conformance });
        this.validateProperty({ name: "access", type: Access });
        this.validateProperty({ name: "quality", type: Quality });
        this.validateProperty({ name: "metatype", type: Metatype });

        this.#validateAspect("conformance");
        this.model.conformance.validateReferences(this, name => {
            // Features are all caps, other names are field references
            if (name.match(/^[A-Z0-9_$]+$/)) {
                // Feature lookup
                const cluster = this.model.owner(ClusterModel);
                return cluster?.features.find(f => f.name === name);
            }

            // Field lookup
            name = camelize(name, true);
            for (let model = this.model.parent; model; model = model.parent) {
                const member = model.member(name);
                if (member) {
                    return member;
                }
            }
        });
        this.model.conformance.validateComputation(this, this.model.owner(ClusterModel)?.featureNames);

        this.#validateAspect("constraint");
        this.#validateAspect("access");
        this.#validateAspect("quality");

        this.#validateType();
        this.#validateEntries();

        super.validate();
    }

    #validateAspect(name: string) {
        const aspect = (this.model as any)[name] as Aspect;
        if (aspect?.errors) {
            aspect.errors.forEach((e: DefinitionError) => this.model.error(e.code, `${e.source}: ${e.message}`));
        }
    }

    #validateType() {
        if (this.model.effectiveType === undefined) {
            if (this.model.metatype) {
                // Not a derivative type
                return;
            }

            // Spec does not always provide type information for deprecated fields
            if (this.model.isDeprecated || this.model.isDisallowed) {
                return;
            }

            // If the type is supposed to have a shadow but we didn't find it due to a case mismatch, we correct that
            // now.  Otherwise this is an error
            if (!this.#correctCaseFromShadow()) {
                // Non-global types must specify a base type
                this.error("NO_TYPE", "No type information");
                return;
            }
        }

        const base = this.model.base;
        if (base === undefined) {
            // Error is reported as ModelValidator TYPE_UNKNOWN
            return;
        }

        const metabase = this.model.metabase;
        if (metabase === undefined) {
            this.error("METATYPE_UNKNOWN", `No metatype for ${this.model.name}`);
            return;
        }
        const metatype = metabase.metatype;
        if (metatype === undefined) {
            // This shouldn't happen because the presence of the metatype is what makes it a metabase.  But eslint
            // doesn't know that
            this.error("METATYPE_MISSING", `Metabase ${metabase.name} has no metatype`);
            return;
        }

        let defaultValue = this.model.default;
        if (defaultValue === undefined) {
            return;
        }

        if (this.#validateSpecialDefault(metatype, defaultValue)) {
            return;
        }

        // Special case for string "empty"
        if (metatype === Metatype.string && defaultValue === "empty") {
            // Metatype doesn't handle this case because otherwise you'd never be able to have a string called "empty".
            // In this case though the data likely comes from the spec so we're going to take a flyer and say you can
            // never have "empty" as a default value
            delete this.model.default;
            return;
        }

        // Attempt to cast to correct value
        const cast = FieldValue.cast(metatype, defaultValue);

        // Special case for field names
        if (typeof defaultValue === "string") {
            // Here we are converting any exact match of a default value to a field name to be a dynamic default
            // referencing the named field.  If we ever have a default value that is the same as a field name then this
            // will be incorrect but likely we never will as string defaults are uncommon
            let referenced = this.model?.member(defaultValue);
            if (referenced === undefined) {
                referenced = this.model.owner(ClusterModel)?.member(defaultValue);
            }
            if (referenced instanceof ValueModel && referenced.effectiveType === this.model.effectiveType) {
                this.model.default = FieldValue.Reference(referenced.name);
                return;
            }
        }

        if (cast === FieldValue.Invalid) {
            this.error("INVALID_VALUE", `Value "${defaultValue}" is not a ${metatype}`);
            return;
        }
        defaultValue = cast;

        // For enums convert string name to numeric ID
        if (metatype === Metatype.enum) {
            if (typeof defaultValue === "string") {
                let member = this.model.member(defaultValue);

                // If the name didn't match, try case-insensitive search
                if (!member) {
                    member = this.model.member(
                        model => model.name.toLowerCase() === (defaultValue as string).toLowerCase(),
                    );
                }

                if (member && member.effectiveId !== undefined) {
                    defaultValue = member.effectiveId;
                } else {
                    this.error("INVALID_ENTRY", `"${defaultValue}" is not in ${metatype} ${this.model.type}`);
                }
            }
        }

        this.model.default = defaultValue;
    }

    #validateEntries() {
        // Note - these checks only apply for first-order derived types, so use direct metatype
        const metatype =
            this.model.type === undefined
                ? undefined
                : (Globals as unknown as Record<string, ValueModel>)[this.model.type]?.metatype;
        switch (metatype) {
            case Metatype.object:
                if (!this.model.children.length) {
                    this.error("CHILDLESS_STRUCT", `struct element with no children`);
                }
                break;

            case Metatype.enum:
            case Metatype.bitmap:
                // Only validate models that inherit directly from base enum types
                const base = this.model.base;
                if (!base || !base.isSeed || !base.name.startsWith("enum") || this.model.parent?.name === "semtag") {
                    break;
                }

                // Model must have members unless there is an explicit exception
                if (!this.model.members.length && !ValidationExceptions.AllowedEmptyEnums.has(this.model.path)) {
                    this.error(`CHILDLESS_${metatype.toUpperCase()}`, `${this.model.type} with no children`);
                }

                if (metatype === Metatype.enum) {
                    this.#validateEnumKeys();
                } else {
                    this.#validateBitFields();
                }
                break;

            case Metatype.array:
                if (!this.model.children.length) {
                    this.error("UNTYPED_ARRAY", `array element with no entry type`);
                } else if (this.model.children.length > 1) {
                    this.error("OVERLY_TYPED_ARRAY", `array element with multiple entry types`);
                }
                break;
        }
    }

    #validateEnumKeys() {
        const ids = new Set<number>();
        const names = new Set<string>();
        for (const c of this.model.children) {
            if (c.id) {
                if (ids.has(c.id)) {
                    this.error(
                        "DUPLICATE_ENUM_ID",
                        `${this.model.type} ID 0x${c.id.toString(16)} appears more than once`,
                    );
                } else {
                    ids.add(c.id);
                }
            }
            if (names.has(c.name)) {
                this.error("DUPLICATE_ENUM_NAME", `${this.model.type} name "${c.name}" appears more than once`);
            }
        }
    }

    #validateBitFields() {
        const ranges = Array<{ name: string; min: number; max: number }>();
        for (const c of this.model.children) {
            let min, max;

            if (typeof c.constraint.value === "number") {
                min = c.constraint.value;
                max = c.constraint.value + 1;
            } else {
                min = c.constraint.min;
                max = c.constraint.max;
                if (typeof min !== "number" || typeof max !== "number" || min < 0 || min > max) {
                    this.error(
                        "UNCONSTRAINED_BIT_RANGE",
                        `${this.model.type} bit field "${c.name}" is not properly constrained`,
                    );
                    continue;
                }
            }

            for (const r of ranges) {
                if (min < r.max && max > r.min) {
                    this.error(
                        "OVERLAPPING_BIT_RANGE",
                        `${this.model.type} bit fields "${r.name}" and "${c.name}" overlap`,
                    );
                }
            }

            ranges.push({ name: c.name, min, max });
        }
    }

    #validateSpecialDefault(metatype: Metatype, def: any) {
        // Special "reference" object referencing another field by name
        if (typeof def === "object" && FieldValue.is(def, FieldValue.reference)) {
            const reference = (def as FieldValue.Reference).name;

            // See if the referenced name is a sibling
            const parent = this.model.parent;
            let other = parent?.member(reference);

            if (!other) {
                // We also allow names to reference cluster attributes
                const cluster = parent?.owner(ClusterModel);
                other = cluster?.member(reference);

                if (other === undefined) {
                    this.error("MEMBER_UNKNOWN", `Default value references unknown property ${reference}`);
                }
            }
            return true;
        }

        // If the default value is a string referencing another field, convert to a reference object
        if (typeof def === "string") {
            const other = this.model.parent?.member(def);
            if (other) {
                this.model.default = FieldValue.Reference(other.name);
                return true;
            }
        }

        // If the default value for bitmaps is an array, treat as a set of flag names or IDs; validate as such
        if (metatype === Metatype.bitmap && Array.isArray(def)) {
            for (const value of def) {
                if (typeof value !== "string" && typeof value !== "number") {
                    this.error("INVALID_BIT_FLAG", `Default bit flag ${def} is not a string or number`);
                    continue;
                }
                if (!this.model.member(value)) {
                    this.error("UNRESOLVED_BIT_FLAG", `Default bit flag ${def} is not a valid bit value`);
                }
            }
            return true;
        }
    }

    #correctCaseFromShadow() {
        const tag = this.model.tag;
        const name = this.model.name.toLowerCase();
        return (
            false ===
            new ModelTraversal().visitInheritance(this.model.parent?.base, owner => {
                for (const child of owner.children) {
                    if (child.tag === tag && child.name.toLowerCase() === name) {
                        this.model.name = child.name;
                        return false;
                    }
                }
            })
        );
    }
}
