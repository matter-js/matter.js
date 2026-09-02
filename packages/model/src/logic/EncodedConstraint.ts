/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { camelize } from "@matter/general";
import { Constraint } from "../aspects/Constraint.js";
import { FieldValue } from "../common/FieldValue.js";
import { Metatype } from "../common/Metatype.js";
import type { ValueModel } from "../models/ValueModel.js";
import { EncodedValue } from "./EncodedValue.js";

/**
 * Restate the bounds of a constraint in the terms the value is encoded in.
 *
 * The specification writes a bound of a temperature or percentage with its unit, such as the "Min to 100.00%" of a
 * percent100ths field.  Values are encoded in the units of their type, so a bound that keeps its unit never constrains
 * anything.
 *
 * The entry constraint of a list bounds the entries, so it converts with the type of the entry rather than of the
 * list.
 *
 * A bound whose unit does not apply to the type that carries it is left as stated, and a comparison against it then
 * has no numeric meaning.
 *
 * A bound naming a value of an enumerated type states that value, so "add, modify" becomes "0, 2".
 *
 * @see {@link MatterSpecification.v16.Core} § 7.19.2
 */
export function EncodedConstraint(constraint: Constraint, model: ValueModel): Constraint {
    return new Constraint(convertAst(constraint, model));
}

export namespace EncodedConstraint {
    /**
     * One bound of a constraint, with the model whose units it is in.
     *
     * The bounds of a constraint do not all belong to the same type: the entry constraint of a list bounds the
     * entries, so its units and the values it can hold are those of the entry rather than of the list.
     */
    export interface Bound<T> {
        value: T;
        model: ValueModel;
    }

    /** What the bounds of a constraint amount to once restated in the units the value is encoded in */
    export interface Bounds {
        /**
         * Every bound stating a number outright, in encoding units.
         *
         * A bound the specification computes is absent, whether from another value or from constants.  Evaluating one
         * belongs to {@link Constraint}, which alone knows what an expression means.
         */
        encoded: Bound<number | bigint>[];

        /**
         * Bounds stating a unit no scale is known for, which therefore have none.
         *
         * Such a bound survives conversion unconverted, and comparing an encoded value against it has no numeric
         * meaning: as a range it admits every value, and as an exact value it admits none.
         */
        unscaled: Bound<FieldValue>[];
    }

    /**
     * Report which of a constraint's bounds state a number in encoding units, and which state a unit no scale is
     * known for and so state no number at all.
     *
     * @see {@link MatterSpecification.v16.Core} § 7.19.2
     */
    export function bounds(constraint: Constraint, model: ValueModel): Bounds {
        const bounds: Bounds = { encoded: [], unscaled: [] };
        convertAst(constraint, model, bounds);
        return bounds;
    }
}

function convertAst(ast: Constraint.Ast, model: ValueModel, bounds?: EncodedConstraint.Bounds): Constraint.Ast {
    const value = convertExpression(ast.value, model, bounds);
    const min = convertExpression(ast.min, model, bounds);
    const max = convertExpression(ast.max, model, bounds);
    const set = convertValue(ast.in, model, bounds);

    // Only what the constraint states as a bound in its own right.  An operand of an arithmetic bound is a scalar of
    // the expression, not a value the type must hold: "max Duration / 2" says nothing about holding 2
    if (bounds !== undefined) {
        for (const bound of [value, min, max, set]) {
            for (const member of Array.isArray(bound) ? bound : [bound]) {
                if (typeof member === "number" || typeof member === "bigint") {
                    bounds.encoded.push({ value: member, model });
                }
            }
        }
    }

    return {
        ...ast,
        value,
        min,
        max,
        in: set,
        entry: ast.entry === undefined ? undefined : convertAst(ast.entry, model.listEntry ?? model, bounds),
        parts: ast.parts?.map(part => convertAst(part, model, bounds)),
    };
}

function convertExpression(
    expression: Constraint.Expression,
    model: ValueModel,
    bounds?: EncodedConstraint.Bounds,
): Constraint.Expression;
function convertExpression(
    expression: Constraint.Expression | undefined,
    model: ValueModel,
    bounds?: EncodedConstraint.Bounds,
): Constraint.Expression | undefined;

function convertExpression(
    expression: Constraint.Expression | undefined,
    model: ValueModel,
    bounds?: EncodedConstraint.Bounds,
): Constraint.Expression | undefined {
    if (expression === undefined || typeof expression !== "object" || expression === null) {
        return expression;
    }

    if ("args" in expression) {
        return { ...expression, args: expression.args.map(arg => convertExpression(arg, model, bounds)) };
    }

    if ("lhs" in expression) {
        return {
            ...expression,
            lhs: convertExpression(expression.lhs, model, bounds),

            // The rhs of "." names a member of the lhs, so it is not a name this model's scope resolves
            rhs: expression.type === "." ? expression.rhs : convertExpression(expression.rhs, model, bounds),
        };
    }

    return convertValue(expression, model, bounds);
}

/**
 * The value of a member the constrained type defines, for a bound that names one.
 *
 * An enumerated type states a bound as the names of its own values, such as the "add, modify" of a door lock's
 * operation type.  Those names belong to the type rather than to the surrounding record, so no resolver reaches them
 * and the bound states a number only once the type has been consulted.
 *
 * A bitmap states the position of a flag in its constraint rather than as a member id, so a name it defines denotes a
 * mask this does not compute.  Such a name is left as stated, which model validation then reports.
 *
 * @see {@link MatterSpecification.v16.Core} § 7.18.3
 */
function memberValueOf(value: FieldValue | undefined, model: ValueModel) {
    const name = FieldValue.referenced(value);
    if (name === undefined) {
        return;
    }

    if (model.effectiveMetatype !== Metatype.enum) {
        return;
    }

    const propertyName = camelize(name);
    for (const member of model.members) {
        if (member.id !== undefined && member.propertyName === propertyName) {
            return member.id;
        }
    }
}

function convertValue(value: FieldValue, model: ValueModel, bounds?: EncodedConstraint.Bounds): FieldValue;
function convertValue(
    value: FieldValue | undefined,
    model: ValueModel,
    bounds?: EncodedConstraint.Bounds,
): FieldValue | undefined;

function convertValue(value: FieldValue | undefined, model: ValueModel, bounds?: EncodedConstraint.Bounds) {
    // A membership set states one bound per member
    if (Array.isArray(value)) {
        return value.map(member => convertValue(member, model, bounds));
    }

    const member = memberValueOf(value, model);
    if (member !== undefined) {
        return member;
    }

    if (
        value === undefined ||
        !(FieldValue.is(value, FieldValue.percent) || FieldValue.is(value, FieldValue.celsius))
    ) {
        return value;
    }

    const encoded = EncodedValue(model, value);
    if (encoded === undefined) {
        bounds?.unscaled.push({ value, model });
        return value;
    }

    return encoded;
}
