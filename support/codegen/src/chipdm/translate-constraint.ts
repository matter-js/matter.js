/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { Constraint, FieldValue } from "#model";
import { DataModelSyntaxError } from "./errors.js";
import { translateValue } from "./values.js";
import { child, children, num, str, value } from "./xml.js";

const OPERATIONS: Record<string, Constraint.BinaryOperator["type"]> = {
    add: "+",
    subtract: "-",
    multiply: "*",
    divide: "/",
};

/**
 * Translate the constraint of a CHIP data model element.
 *
 * CHIP constrains value, list count and string length with distinct elements where we use a single min/max pair
 * qualified by the element's type.  The entry constraint of a list is a nested element for CHIP and part of the
 * parent's constraint for us.
 */
export function translateConstraint(node: Element) {
    const definitions = children(node, "constraint");
    const entry = child(node, "entry");
    const entryDefinition = entry === undefined ? undefined : child(entry, "constraint");

    if (!definitions.length && entryDefinition === undefined) {
        return;
    }

    // CHIP states in sibling constraint elements what we hold in one, either as additional bounds or as alternatives
    const parts = definitions.map(astOf);
    const ast: Constraint.Ast = parts.reduce(combine, {});

    if (entryDefinition !== undefined) {
        ast.entry = astOf(entryDefinition);
    }

    return new Constraint(ast);
}

/**
 * Fold a constraint into those preceding it.
 *
 * Sibling constraints that bound different aspects of the same value combine into one constraint; sibling constraints
 * that bound the same aspect are alternatives.
 */
function combine(ast: Constraint.Ast, addition: Constraint.Ast): Constraint.Ast {
    if (ast.parts !== undefined) {
        return { parts: [...ast.parts, addition] };
    }

    const conflicts = Object.keys(addition).some(key => ast[key as keyof Constraint.Ast] !== undefined);
    if (!conflicts) {
        return { ...ast, ...addition };
    }

    return { parts: [ast, addition] };
}

function astOf(node: Element) {
    const ast: Constraint.Ast = {};

    for (const bound of children(node)) {
        switch (bound.tagName) {
            case "desc":
                ast.desc = true;
                break;

            case "allowed":
                ast.value = boundOf(bound);
                break;

            case "between":
            case "countBetween":
            case "lengthBetween": {
                const from = child(bound, "from");
                const to = child(bound, "to");

                if (from !== undefined && to !== undefined) {
                    ast.min = boundOf(from);
                    ast.max = boundOf(to);
                    break;
                }

                // Older data models omit the from and to wrappers, stating a literal lower bound as an attribute of
                // the range itself
                const operands = children(bound);
                const lower = str(bound, "value");

                if (lower !== undefined && operands.length === 1) {
                    ast.min = translateValue(lower);
                    ast.max = expressionOf(operands[0]);
                } else if (operands.length === 2) {
                    ast.min = expressionOf(operands[0]);
                    ast.max = expressionOf(operands[1]);
                } else {
                    throw new DataModelSyntaxError(`<${bound.tagName}> has ${operands.length} bounds`);
                }
                break;
            }

            case "min":
            case "minCount":
            case "minLength":
                ast.min = boundOf(bound);
                break;

            case "max":
            case "maxCount":
            case "maxLength":
                ast.max = boundOf(bound);
                break;

            case "maxCodePoints":
                ast.cpMax = num(bound, "value");
                break;

            default:
                throw new DataModelSyntaxError(`Unsupported constraint element <${bound.tagName}>`);
        }
    }

    return ast;
}

function requiredChild(node: Element, name: string) {
    const result = child(node, name);
    if (result === undefined) {
        throw new DataModelSyntaxError(`<${node.tagName}> has no <${name}>`);
    }
    return result;
}

/** A bound is either a value attribute or a nested expression */
function boundOf(node: Element): Constraint.Expression {
    const literal = str(node, "value");
    if (literal !== undefined) {
        return translateValue(literal);
    }

    const expressions = children(node);
    if (expressions.length !== 1) {
        throw new DataModelSyntaxError(`<${node.tagName}> has ${expressions.length} operands`);
    }

    return expressionOf(expressions[0]);
}

function expressionOf(node: Element): Constraint.Expression {
    switch (node.tagName) {
        case "attribute":
        case "field":
        case "feature":
        case "constant": {
            // A nested element addresses a field of the referenced value
            const path = [nameOf(node), ...children(node).map(nameOf)];
            return FieldValue.Reference(path.join("."));
        }

        case "literal":
        case "number":
        case "value":
        case "enum":
        case "bitmap":
        case "status": {
            const text = value(node);
            if (text === undefined) {
                throw new DataModelSyntaxError(`<${node.tagName}> in constraint has no value`);
            }
            return translateValue(text);
        }

        case "compute": {
            const operation = child(node, "operation")?.textContent?.trim();
            const type = operation === undefined ? undefined : OPERATIONS[operation];
            if (type === undefined) {
                throw new DataModelSyntaxError(`Unsupported constraint operation "${operation}"`);
            }
            return {
                type,
                lhs: boundOf(requiredChild(node, "left")),
                rhs: boundOf(requiredChild(node, "right")),
            };
        }

        case "maxOf":
        case "minOf":
            return {
                type: node.tagName,
                args: children(node).map(expressionOf),
            };

        default:
            throw new DataModelSyntaxError(`Unsupported constraint expression element <${node.tagName}>`);
    }
}

function nameOf(node: Element) {
    const name = str(node, "name") ?? str(node, "code");
    if (name === undefined) {
        throw new DataModelSyntaxError(`<${node.tagName}> in constraint has no name`);
    }
    return name;
}
