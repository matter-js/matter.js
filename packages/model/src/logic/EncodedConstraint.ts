/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { Constraint } from "../aspects/Constraint.js";
import { FieldValue } from "../common/FieldValue.js";
import type { ValueModel } from "../models/ValueModel.js";
import { EncodedValue } from "./EncodedValue.js";

/**
 * Restate the bounds of a constraint in the units the value is encoded in.
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
 * @see {@link MatterSpecification.v16.Core} § 7.19.2
 */
export function EncodedConstraint(constraint: Constraint, model: ValueModel): Constraint {
    return new Constraint(convertAst(constraint, model));
}

export namespace EncodedConstraint {
    /** What the bounds of a constraint amount to once restated in the units the value is encoded in */
    export interface Bounds {
        /** Every bound with a numeric form, in encoding units */
        encoded: (number | bigint)[];

        /**
         * Bounds stating a unit no scale is known for, which therefore have none.
         *
         * Such a bound survives conversion unconverted, and comparing an encoded value against it has no numeric
         * meaning: as a range it admits every value, and as an exact value it admits none.
         */
        unscaled: FieldValue[];
    }

    /**
     * Reduce the bounds of a constraint to the numbers they state in encoding units.
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
    return {
        ...ast,
        value: convertExpression(ast.value, model, bounds),
        min: convertExpression(ast.min, model, bounds),
        max: convertExpression(ast.max, model, bounds),
        in: convertValue(ast.in, model, bounds),
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
        if (typeof expression === "number" || typeof expression === "bigint") {
            bounds?.encoded.push(expression);
        }
        return expression;
    }

    if ("args" in expression) {
        return { ...expression, args: expression.args.map(arg => convertExpression(arg, model, bounds)) };
    }

    if ("lhs" in expression) {
        return {
            ...expression,
            lhs: convertExpression(expression.lhs, model, bounds),
            rhs: convertExpression(expression.rhs, model, bounds),
        };
    }

    return convertValue(expression, model, bounds);
}

function convertValue(value: FieldValue, model: ValueModel, bounds?: EncodedConstraint.Bounds): FieldValue;
function convertValue(
    value: FieldValue | undefined,
    model: ValueModel,
    bounds?: EncodedConstraint.Bounds,
): FieldValue | undefined;

function convertValue(value: FieldValue | undefined, model: ValueModel, bounds?: EncodedConstraint.Bounds) {
    if (
        value === undefined ||
        !(FieldValue.is(value, FieldValue.percent) || FieldValue.is(value, FieldValue.celsius))
    ) {
        if (typeof value === "number" || typeof value === "bigint") {
            bounds?.encoded.push(value);
        }
        return value;
    }

    const encoded = EncodedValue(model, value);
    if (encoded === undefined) {
        bounds?.unscaled.push(value);
        return value;
    }

    bounds?.encoded.push(encoded);
    return encoded;
}
