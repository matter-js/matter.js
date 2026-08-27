/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { EncodedConstraint } from "#logic/EncodedConstraint.js";
import { EncodedValue } from "#logic/EncodedValue.js";
import { ModelTraversal } from "#logic/ModelTraversal.js";
import { camelize, FLOAT32_MAX, FLOAT32_MIN, FLOAT64_MAX, FLOAT64_MIN, toNumber } from "@matter/general";
import { Access, Aspect, Conformance, Constraint, Quality } from "../../aspects/index.js";
import { DefinitionError, FieldValue, Metatype } from "../../common/index.js";
import { CommandElement } from "../../elements/index.js";
import { ClusterModel, CommandModel, Globals, Model, ValueModel } from "../../models/index.js";
import { ModelValidator } from "./ModelValidator.js";
import { ValidationExceptions } from "./ValidationExceptions.js";

const INTEGER_TYPE = /^u?int(8|16|24|32|40|48|56|64)$/;
const UNSIGNED_TYPE = /^uint(8|16|24|32|40|48|56|64)$/;

function list(values: FieldValue[]) {
    return values.map(value => FieldValue.serialize(value)).join(" and ");
}

/** The values a primitive integer type holds, in the units the type is encoded in */
function rangeOf(primitive: string) {
    const width = primitive.match(INTEGER_TYPE)?.[1];
    if (width === undefined) {
        return;
    }

    const bits = BigInt(width);
    if (UNSIGNED_TYPE.test(primitive)) {
        return { min: 0n, max: 2n ** bits - 1n };
    }

    return { min: -(2n ** (bits - 1n)), max: 2n ** (bits - 1n) - 1n };
}

/**
 * The magnitudes a primitive float type holds.
 *
 * A magnitude beyond the range is not the magnitude the encoding keeps: it becomes the type's own maximum or
 * infinity, so a bound stating one bounds nothing and a default stating one states a different value.  Precision
 * within the range is not judged, since rounding a fraction to the nearest magnitude the type states is what a float
 * is for.
 */
function floatRangeOf(primitive: string) {
    switch (primitive) {
        case "single":
            return { min: FLOAT32_MIN, max: FLOAT32_MAX };

        case "double":
            return { min: FLOAT64_MIN, max: FLOAT64_MAX };
    }
}

/** Group bounds by the type that decides what they may state, which for a list entry is not the type of the list */
function groupBy<T>(bounds: EncodedConstraint.Bound<T>[], keyOf: (model: ValueModel) => string | undefined) {
    const groups = new Map<string, T[]>();

    for (const { value, model } of bounds) {
        const key = keyOf(model);
        if (key === undefined) {
            continue;
        }

        const group = groups.get(key);
        if (group === undefined) {
            groups.set(key, [value]);
        } else {
            group.push(value);
        }
    }

    return groups;
}

/**
 * Validates models that extend DataModel.
 */
export class ValueValidator<T extends ValueModel> extends ModelValidator<T> {
    #normalizedDefault?: { value: FieldValue | undefined };

    override validate() {
        this.validateProperty({ name: "type", type: "string" });
        this.validateProperty({ name: "byteSize", type: "number" });
        this.validateProperty({ name: "constraint", type: Constraint });
        this.validateProperty({ name: "conformance", type: Conformance });
        this.validateProperty({ name: "access", type: Access });
        this.validateProperty({ name: "quality", type: Quality });
        this.validateProperty({ name: "metatype", type: Metatype });

        this.#validateAspect("conformance");
        this.model.conformance.validateReferences(this, name => this.resolveReference(name));
        this.model.conformance.validateComputation(this, this.model.owner(ClusterModel)?.definedFeatures);

        this.#validateAspect("constraint");
        this.#validateAspect("access");
        this.#validateAspect("quality");

        // After the type is validated, which is where a default stated as text becomes the value it denotes.  A unit
        // in particular is only a unit once cast; judging the text would see its digits and not its scale.  The cast
        // discards what it cannot represent, so what was stated is kept to notice that
        const stated = this.model.default;
        this.#validateType();
        this.#validateNumericValues(stated, this.#effectiveDefault);
        this.#validateEntries();

        super.validate();
    }

    /**
     * The default the model carries once validation has normalized it, which is the value the remaining checks judge.
     *
     * A final model is frozen so normalization cannot write to it; the value it would have written is recorded here so
     * validating a final model reports exactly what validating the same model unfrozen does.
     */
    get #effectiveDefault() {
        return this.#normalizedDefault === undefined ? this.model.default : this.#normalizedDefault.value;
    }

    #normalizeDefault(value: FieldValue | undefined) {
        this.#normalizedDefault = { value };
        if (!this.model.isFinal) {
            this.model.default = value;
        }
    }

    /**
     * Every number a value states — the bounds of its constraint and its default — must mean something for the type
     * that carries it.
     *
     * A bound the specification writes with a unit, such as the "0 to 12.7°C" of a `SignedTemperature`, only
     * constrains once restated in the units the value is encoded in.  A unit left in place does not fail closed: as a
     * range it admits every value, and as an exact value it admits none.  Nor can an integer hold a fraction or an
     * unsigned integer a negative, so a specification that states either is describing something the encoding cannot
     * represent.
     *
     * This reads what the model states rather than what it inherits, so one bad definition is reported once instead
     * of once per model deriving from it.
     */
    #validateNumericValues(stated: FieldValue | undefined, effective: FieldValue | undefined) {
        const encoded = new Array<EncodedConstraint.Bound<number | bigint>>();
        const unscaled = new Array<EncodedConstraint.Bound<FieldValue>>();

        const constraint = this.model.constraint;
        if (!constraint.isEmpty) {
            const bounds = EncodedConstraint.bounds(constraint, this.model);
            encoded.push(...bounds.encoded);
            unscaled.push(...bounds.unscaled);
        }

        // A number states itself; only a unit needs converting.  Asking for the encoded form of every default would
        // lose one too large to be a number, which is where the values of a 64 bit type live
        let reportedUnit = false;
        if (typeof effective === "number" || typeof effective === "bigint") {
            encoded.push({ value: effective, model: this.model });
        } else if (effective !== undefined) {
            const value = EncodedValue(this.model, effective);
            if (value !== undefined) {
                encoded.push({ value, model: this.model });
            } else if (FieldValue.is(effective, FieldValue.percent) || FieldValue.is(effective, FieldValue.celsius)) {
                unscaled.push({ value: effective, model: this.model });
                reportedUnit = true;
            }
        }

        // The cast erases a unit it cannot place, whether by dropping the default or by rendering it as the type it
        // could not scale to — a percentage on a string leaves "[object Object]" behind
        if (
            !reportedUnit &&
            stated !== undefined &&
            (FieldValue.is(stated, FieldValue.percent) || FieldValue.is(stated, FieldValue.celsius)) &&
            EncodedValue(this.model, stated) === undefined
        ) {
            unscaled.push({ value: stated, model: this.model });
        }

        for (const [type, values] of groupBy(unscaled, model => model.effectiveType)) {
            this.error(
                "UNIT_WITHOUT_SCALE",
                `${list(values)} state${values.length === 1 ? "s" : ""} a unit that type ${type} gives no scale ` +
                    `for, so the value has no numeric meaning`,
            );
        }

        for (const [primitive, values] of groupBy(encoded, model => model.primitiveBase?.name)) {
            if (INTEGER_TYPE.test(primitive)) {
                // Casting one of these to an integer throws, so the guard in #validateType leaves it alone; without a
                // word here it would pass silently
                const unrepresentable = values.filter(value => typeof value === "number" && !Number.isFinite(value));
                if (unrepresentable.length) {
                    this.error("INVALID_VALUE", `${list(unrepresentable)} is not a number ${primitive} can hold`);
                }

                const fractional = values.filter(
                    value => typeof value === "number" && Number.isFinite(value) && !Number.isInteger(value),
                );
                if (fractional.length) {
                    this.error("FRACTION_ON_INTEGER_TYPE", `${list(fractional)} cannot be held by ${primitive}`);
                }
            }

            if (UNSIGNED_TYPE.test(primitive)) {
                // A value that is no number at all is reported above; reporting it again as negative says nothing
                const negative = values.filter(
                    value => (typeof value === "bigint" || Number.isFinite(value)) && value < 0,
                );
                if (negative.length) {
                    this.error("NEGATIVE_ON_UNSIGNED_TYPE", `${list(negative)} cannot be held by ${primitive}`);
                }
            }

            const floats = floatRangeOf(primitive);
            if (floats !== undefined) {
                const exceeding = values.filter(value => {
                    // A number that states no magnitude is reported by the cast that refused it; reporting it again
                    // as out of range says nothing, and says it wrongly, as a value outside no range
                    if (typeof value === "number" && !Number.isFinite(value)) {
                        return false;
                    }

                    const magnitude = toNumber(value);
                    return !(magnitude >= floats.min && magnitude <= floats.max);
                });

                if (exceeding.length) {
                    this.error(
                        "VALUE_EXCEEDS_TYPE",
                        `${list(exceeding)} ${exceeding.length === 1 ? "is" : "are"} outside the range ` +
                            `${floats.min} to ${floats.max} of ${primitive}`,
                    );
                }
            }

            const range = rangeOf(primitive);
            if (range !== undefined) {
                const exceeding = values.filter(value => {
                    // A fraction and a negative on an unsigned type are reported above, and a value that is no number
                    // at all has no magnitude to judge
                    if (typeof value === "number" && !Number.isInteger(value)) {
                        return false;
                    }
                    if (value < 0 && UNSIGNED_TYPE.test(primitive)) {
                        return false;
                    }

                    if (typeof value === "bigint") {
                        return value > range.max || value < range.min;
                    }

                    if (Number.isSafeInteger(value)) {
                        return value > range.max || value < range.min;
                    }

                    // A magnitude this large states itself only as the number it rounded to, so it is judged against
                    // the bound rounded the same way: the widest uint64 and the value above it are one number, and
                    // only a magnitude no rounding explains is refused
                    return value > Number(range.max) || value < Number(range.min);
                });

                if (exceeding.length) {
                    this.error(
                        "VALUE_EXCEEDS_TYPE",
                        `${list(exceeding)} ${exceeding.length === 1 ? "is" : "are"} outside the range ` +
                            `${range.min} to ${range.max} of ${primitive}`,
                    );
                }
            }
        }
    }

    /**
     * Resolve a conformance reference.  Features (all-caps strings) resolve against the cluster's feature map.  Field
     * references resolve via {@link Model.resolve}.  Qualified names arrive as `string[]` segments from DOT AST nodes.
     */
    resolveReference(name: string | string[]): Model | undefined {
        // Simple string — check for feature (all-caps) or single-segment field
        if (typeof name === "string") {
            if (name.match(/^[A-Z0-9_$]+$/)) {
                const cluster = this.model.owner(ClusterModel);
                return cluster?.features.find(f => f.name === name);
            }
            name = [name];
        }

        // Field reference — camelize each segment to normalize case (e.g. "OperationalStateID" → "OperationalStateId")
        const path = name.map(s => camelize(s, true));
        return this.model.parent?.resolve(path, this.resolveOptions());
    }

    /**
     * Options for {@link Model.resolve} during reference validation.
     *
     * Provides an {@link Model.ResolveOptions.outerResolve} that extends resolution beyond the normal scope boundary.
     * Currently this enables response command fields to reference request command fields via qualified names (e.g.,
     * "Foo.Bar" referencing field Bar in request command Foo).
     */
    protected resolveOptions(): Model.ResolveOptions | undefined {
        return {
            outerResolve: (path: string[], boundaryScope: Model | undefined) => {
                const command = this.model.owner(CommandModel);
                if (command?.direction !== CommandElement.Direction.Response) {
                    return undefined;
                }

                const cluster = boundaryScope instanceof ClusterModel ? boundaryScope : undefined;
                const request = cluster?.commands.find(c => c.effectiveResponse === command.name);
                if (!request || camelize(path[0]) !== camelize(request.name)) {
                    return undefined;
                }

                if (path.length < 2) {
                    return request;
                }
                return request.resolve(path.slice(1));
            },
        };
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
            this.#normalizeDefault(undefined);
            return;
        }

        // A fraction has no integer form, and the cast refuses it rather than saying what is wrong.  The numeric
        // validation above has already reported it, so leave the default as stated.  An enum and a bitmap state the
        // integers of the type behind them, so this holds for them too
        if (
            typeof defaultValue === "number" &&
            !Number.isInteger(defaultValue) &&
            (metatype === Metatype.integer || metatype === Metatype.enum || metatype === Metatype.bitmap)
        ) {
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
                this.#normalizeDefault(FieldValue.Reference(referenced.name));
                return;
            }
        }

        if (cast === FieldValue.Invalid) {
            this.error(
                "INVALID_VALUE",
                `Default value "${FieldValue.serialize(defaultValue)}" is not a valid ${metatype} for type ${this.model.effectiveType}`,
            );
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

        this.#normalizeDefault(defaultValue);
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
                this.#normalizeDefault(FieldValue.Reference(other.name));
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
        // The correction is a write, which a final model cannot take.  Claiming it succeeded would suppress the error
        // that says the type does not resolve, so a final model reports rather than repairs
        if (this.model.isFinal) {
            return false;
        }

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
