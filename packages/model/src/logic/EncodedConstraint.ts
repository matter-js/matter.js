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

function convertAst(ast: Constraint.Ast, model: ValueModel): Constraint.Ast {
    return {
        ...ast,
        value: convertExpression(ast.value, model),
        min: convertExpression(ast.min, model),
        max: convertExpression(ast.max, model),
        in: convertValue(ast.in, model),
        entry: ast.entry === undefined ? undefined : convertAst(ast.entry, model.listEntry ?? model),
        parts: ast.parts?.map(part => convertAst(part, model)),
    };
}

function convertExpression(expression: Constraint.Expression, model: ValueModel): Constraint.Expression;
function convertExpression(
    expression: Constraint.Expression | undefined,
    model: ValueModel,
): Constraint.Expression | undefined;

function convertExpression(
    expression: Constraint.Expression | undefined,
    model: ValueModel,
): Constraint.Expression | undefined {
    if (expression === undefined || typeof expression !== "object" || expression === null) {
        return expression;
    }

    if ("args" in expression) {
        return { ...expression, args: expression.args.map(arg => convertExpression(arg, model)) };
    }

    if ("lhs" in expression) {
        return {
            ...expression,
            lhs: convertExpression(expression.lhs, model),
            rhs: convertExpression(expression.rhs, model),
        };
    }

    return convertValue(expression, model);
}

function convertValue(value: FieldValue, model: ValueModel): FieldValue;
function convertValue(value: FieldValue | undefined, model: ValueModel): FieldValue | undefined;

function convertValue(value: FieldValue | undefined, model: ValueModel) {
    if (!(FieldValue.is(value, FieldValue.percent) || FieldValue.is(value, FieldValue.celsius))) {
        return value;
    }

    return EncodedValue(model, value) ?? value;
}
