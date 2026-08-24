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

/**
 * Bounds of a constraint that state a unit no scale is known for.
 *
 * Such a bound survives {@link EncodedConstraint} unconverted, and comparing an encoded value against it has no
 * numeric meaning: as a range it admits every value, and as an exact value it admits none.
 *
 * This reports temperatures only.  A percentage falls back to the number the specification prints, which is right for
 * `percent` and wrong by a factor of 100 for anything encoded as `percent100ths` under another name, and nothing here
 * can tell the two apart.
 *
 * @see {@link MatterSpecification.v16.Core} § 7.19.2
 */
export function UnscaledConstraintBounds(constraint: Constraint, model: ValueModel) {
    const unscaled = new Array<FieldValue>();
    convertAst(constraint, model, unscaled);
    return unscaled;
}

function convertAst(ast: Constraint.Ast, model: ValueModel, unscaled?: FieldValue[]): Constraint.Ast {
    return {
        ...ast,
        value: convertExpression(ast.value, model, unscaled),
        min: convertExpression(ast.min, model, unscaled),
        max: convertExpression(ast.max, model, unscaled),
        in: convertValue(ast.in, model, unscaled),
        entry: ast.entry === undefined ? undefined : convertAst(ast.entry, model.listEntry ?? model, unscaled),
        parts: ast.parts?.map(part => convertAst(part, model, unscaled)),
    };
}

function convertExpression(
    expression: Constraint.Expression,
    model: ValueModel,
    unscaled?: FieldValue[],
): Constraint.Expression;
function convertExpression(
    expression: Constraint.Expression | undefined,
    model: ValueModel,
    unscaled?: FieldValue[],
): Constraint.Expression | undefined;

function convertExpression(
    expression: Constraint.Expression | undefined,
    model: ValueModel,
    unscaled?: FieldValue[],
): Constraint.Expression | undefined {
    if (expression === undefined || typeof expression !== "object" || expression === null) {
        return expression;
    }

    if ("args" in expression) {
        return { ...expression, args: expression.args.map(arg => convertExpression(arg, model, unscaled)) };
    }

    if ("lhs" in expression) {
        return {
            ...expression,
            lhs: convertExpression(expression.lhs, model, unscaled),
            rhs: convertExpression(expression.rhs, model, unscaled),
        };
    }

    return convertValue(expression, model, unscaled);
}

function convertValue(value: FieldValue, model: ValueModel, unscaled?: FieldValue[]): FieldValue;
function convertValue(
    value: FieldValue | undefined,
    model: ValueModel,
    unscaled?: FieldValue[],
): FieldValue | undefined;

function convertValue(value: FieldValue | undefined, model: ValueModel, unscaled?: FieldValue[]) {
    if (
        value === undefined ||
        !(FieldValue.is(value, FieldValue.percent) || FieldValue.is(value, FieldValue.celsius))
    ) {
        return value;
    }

    const encoded = EncodedValue(model, value);
    if (encoded === undefined) {
        unscaled?.push(value);
        return value;
    }

    return encoded;
}
