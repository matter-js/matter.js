/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import type { Schema } from "#model";
import { Conformance, DataModelPath, SchemaErrorPath, SchemaImplementationError } from "#model";
import { Val } from "#protocol";
import { ValidationLocation } from "./location.js";

export class UnsupportedConformanceNodeError extends SchemaImplementationError {
    constructor(schema: Schema, compiledNode: DynamicNode) {
        super(
            DataModelPath(schema.path),
            `Unknown or unsupported top-level conformance node type ${compiledNode.code}`,
        );
    }
}

export enum Code {
    // Ignored in logical disjunctions (groups and "|" operator); equivalent to disallowed otherwise
    Nonconformant = "nonconformant",

    // Expression matches; may convert to optional inside [] but mandatory otherwise
    Conformant = "conformant",

    // Expression matches and value is optional
    Optional = "optional",

    // Value must be undefined
    Disallowed = "disallowed",

    // A value; used in an expression or else evaluates to mandatory iff the associated value is defined
    Value = "value",

    // Dynamic node must be evaluated at runtime to produce static node
    Evaluate = "evaluate",
}

export interface ValueNode {
    code: Code.Value;
    value: Val;
}

export type StaticNode =
    | {
          code: Code.Nonconformant | Code.Optional | Code.Conformant | Code.Disallowed;
      }
    | ValueNode;

export interface RuntimeNode {
    code: Code.Evaluate;
    evaluate: (value: Val, location: ValidationLocation) => StaticNode;
}

export type DynamicNode = StaticNode | RuntimeNode;

/**
 * Convert a static node to a dynamic node at runtime.
 */
export function evaluateNode(node: DynamicNode, value: Val, location: ValidationLocation): StaticNode {
    if (node.code === Code.Evaluate) {
        return node.evaluate(value, location);
    }
    return node;
}

/**
 * Cast value nodes to a conformance.
 *
 * A value node is conformant if the value is defined
 *
 * Non-value nodes are returned unchanged.
 */
export function asConformance<T extends DynamicNode>(node: T) {
    if (node.code === Code.Value) {
        return {
            code: node.value === undefined ? Code.Nonconformant : Code.Conformant,
        } as const;
    } else {
        return node;
    }
}

export function isStatic(node: DynamicNode): node is StaticNode {
    return node.code !== Code.Evaluate;
}

export function asBoolean(node: StaticNode) {
    node = asConformance(node);
    switch (node.code) {
        case Code.Conformant:
        case Code.Optional:
            return true;

        case Code.Value:
            return !!node.value;

        default:
            return false;
    }
}

/**
 * Throw an error if a node is not a value.
 *
 * We use this to ensure inputs to binary operators make sense.
 */
export function assertValue(location: SchemaErrorPath, node: DynamicNode, where: string): asserts node is ValueNode {
    if (node.code !== Code.Value) {
        throw new SchemaImplementationError(
            location,
            `Expected a value for ${where} but conformance node is "${node.code}"`,
        );
    }
}

export const ConformantNode = { code: Code.Conformant } as const;
export const NonconformantNode = { code: Code.Nonconformant } as const;

/**
 * Create a node that logically inverts the value of the input node.
 */
export function createLogicalInversion(node: DynamicNode): DynamicNode {
    const operand = asConformance(node);

    switch (operand.code) {
        case Code.Nonconformant:
            return ConformantNode;

        case Code.Evaluate:
            const evaluate = operand.evaluate;
            return {
                code: Code.Evaluate,

                evaluate: (value, options) => {
                    let staticOperand = evaluate(value, options);
                    staticOperand = asConformance(staticOperand);

                    if (staticOperand.code === Code.Nonconformant) {
                        return ConformantNode;
                    }
                    return NonconformantNode;
                },
            };

        default:
            return NonconformantNode;
    }
}

type BinaryOperator<T> = (lhs: T, rhs: T) => boolean;

/**
 * Create a node that evaluates a logical binary operator at runtime.
 */
export function createLogicalBinaryEvaluator(
    lhs: RuntimeNode,
    rhs: RuntimeNode,
    operator: BinaryOperator<boolean>,
): RuntimeNode {
    return {
        code: Code.Evaluate,

        evaluate: (value, options) => {
            const staticLhs = evaluateNode(lhs, value, options);
            const staticRhs = evaluateNode(rhs, value, options);
            return operator(asBoolean(staticLhs), asBoolean(staticRhs)) ? ConformantNode : NonconformantNode;
        },
    };
}

const ComparisonOperators: Record<string, BinaryOperator<{}>> = {
    [Conformance.Operator.EQ]: (a, b) => a === b,
    [Conformance.Operator.GT]: (a, b) => a > b,
    [Conformance.Operator.GTE]: (a, b) => a >= b,
    [Conformance.Operator.LT]: (a, b) => a < b,
    [Conformance.Operator.LTE]: (a, b) => a <= b,
};

function performComparison(
    operatorName: Conformance.Operator,
    lhs: StaticNode,
    rhs: StaticNode,
    schema: Schema,
    location: SchemaErrorPath,
): StaticNode {
    const operator = ComparisonOperators[operatorName];
    if (operator === undefined) {
        throw new SchemaImplementationError(DataModelPath(schema.path), `Unknown binary operator ${operatorName}`);
    }

    assertValue(location, lhs, `Left-hand side of "${operatorName}"`);
    assertValue(location, rhs, `Right-hand side of "${operatorName}"`);

    if (
        lhs.value !== undefined &&
        lhs.value !== null &&
        rhs.value !== undefined &&
        rhs.value !== null &&
        operator(lhs.value, rhs.value)
    ) {
        return ConformantNode;
    }

    return NonconformantNode;
}

/**
 * Create a node that evaluates a comparison operator.
 */
export function createComparison(
    operatorName: Conformance.Operator,
    lhs: DynamicNode,
    rhs: DynamicNode,
    schema: Schema,
): DynamicNode {
    // If both sides are static evaluate statically
    if (isStatic(lhs) && isStatic(rhs)) {
        return performComparison(operatorName, lhs, rhs, schema, DataModelPath(schema.path));
    }

    // Evaluate at runtime
    return {
        code: Code.Evaluate,

        evaluate: (value, location) =>
            performComparison(
                operatorName,
                evaluateNode(lhs, value, location),
                evaluateNode(rhs, value, location),
                schema,
                location,
            ),
    };
}

/**
 * Create a node that performs a runtime boolean test.
 */
export function createBooleanTest(node: DynamicNode): DynamicNode {
    if (isStatic(node)) {
        return node;
    }

    const { evaluate } = node;

    return {
        code: Code.Evaluate,

        evaluate: (value, location) => {
            const result = evaluate(value, location);
            return asConformance(result);
        },
    };
}

export type EnumMemberValidator = (location: ValidationLocation) => void;
