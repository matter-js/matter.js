/**
 * @license
 * Copyright 2022-2025 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { RootSupervisor } from "#behavior/supervision/RootSupervisor.js";
import { camelize } from "#general";
import type { Schema } from "#model";
import { Conformance, DataModelPath, FeatureSet, FieldValue, Metatype, ValueModel } from "#model";
import { AccessControl, ConformanceError, SchemaImplementationError, Val } from "#protocol";
import { EnumValueConformanceError, UnknownEnumValueError } from "@matter/protocol";
import { ValueSupervisor } from "../../supervision/ValueSupervisor.js";
import { NameResolver } from "../managed/NameResolver.js";
import {
    Code,
    ConformantNode,
    DynamicNode,
    EnumMemberValidator,
    NonconformantNode,
    StaticNode,
    UnsupportedConformanceNodeError,
    asBoolean,
    asConformance,
    createBooleanTest,
    createComparison,
    createLogicalBinaryEvaluator,
    createLogicalInversion,
    evaluateNode,
    isStatic,
    type RuntimeNode,
} from "./conformance-util.js";
import { ValidationLocation } from "./location.js";

/** A no-op function used for valid enum values that have no specific conformance requirements. */
const enumValueOk: EnumMemberValidator = () => {};

/**
 * Generates JS function equivalent of a conformance expression.
 *
 * We generate a function for each node in the AST.  In addition to the function, we track whether the function
 * evaluates pure-feature conformance (vs. an expression).
 *
 * In general the conformance AST jumbles set logic with expression evaluation so we need to track two types of state to
 * implement properly.
 *
 * Many of the comments reference "static" vs "runtime" evaluation.  This is an important distinction that we use to
 * heavily optimize the generated function:
 *
 *   - "static" means conformance is known at compile time and runtime evaluation is thus minimal.  These result in a
 *     {@link StaticNode}.
 *
 *   - "runtime" means conformance depends on sibling fields in an object. These result in a {@link RuntimeNode} with
 *     additional logic that applies to operational state.
 */
export function astToFunction(schema: ValueModel, supervisor: RootSupervisor): ValueSupervisor.Validate | undefined {
    const ast = schema.conformance.ast;
    const { featuresAvailable, featuresSupported } = FeatureSet.normalize(
        supervisor.featureMap,
        supervisor.supportedFeatures,
    );

    // Create a node for the given name.
    //
    // Name resolution scope may change as we visit the AST; the base version creates a name reference if the the name
    // is visible in scope.  Other nodes may temporarily override this though
    let createNameReference = (name: string): DynamicNode => {
        const resolver = NameResolver(supervisor, schema.parent, camelize(name));
        if (resolver) {
            return {
                code: Code.Evaluate,

                evaluate: (_value, options) => {
                    return {
                        code: Code.Value,
                        value: resolver(options?.siblings),
                    };
                },
            };
        }

        // Unresolved names are always undefined
        return { code: Code.Value, value: undefined };
    };

    // Compile the AST
    const isNullable = schema.quality.nullable;
    const compiledNode = compile(ast);

    let validator: ValueSupervisor.Validate | undefined;

    // The compiled AST is a DynamicNode describing how to test a field for conformance.  Convert this into a validation
    // function
    switch (compiledNode.code) {
        case Code.Conformant:
            if (isNullable) {
                // We map undefined to null so no validation required
                break;
            }

            // Passes validation if the field is present
            validator = requireValue;
            break;

        case Code.Nonconformant:
        case Code.Disallowed:
            // Passes validation if the field is not present
            validator = disallowValue;
            break;

        case Code.Value:
            // Passes validation if the field is defined
            validator = compiledNode.value === undefined ? disallowValue : isNullable ? undefined : requireValue;
            break;

        case Code.Optional:
            // No conformance validation required
            break;

        case Code.Evaluate:
            // We must perform runtime evaluation to determine whether the field is conformant
            const { evaluate } = compiledNode;

            validator = (value, session, location) => {
                const staticNode = evaluate(value, location);

                switch (staticNode.code) {
                    case Code.Conformant:
                        if (!isNullable) {
                            requireValue(value, session, location);
                        }
                        break;

                    case Code.Nonconformant:
                    case Code.Disallowed:
                        disallowValue(value, session, location);
                        break;

                    case Code.Optional:
                        break;

                    case Code.Value:
                        if (staticNode.value === undefined) {
                            disallowValue(value, session, location);
                        } else if (!isNullable) {
                            requireValue(value, session, location);
                        }
                        break;

                    default:
                        throw new UnsupportedConformanceNodeError(schema, compiledNode);
                }
            };
            break;

        default:
            throw new UnsupportedConformanceNodeError(schema, compiledNode);
    }

    if (validator !== disallowValue && schema.effectiveMetatype === Metatype.enum) {
        validator = addEnumMemberValidation(validator);
    }

    return validator;

    /**
     * Convert an AST node into a DynamicNode.
     *
     * If the node requires runtime evaluation it will be a RuntimeNode, which is a proxy that creates a StaticNode for
     * a specific record.
     *
     * Runtime evaluation is required if the conformance expression has a choice or cross-references other properties of
     * the same object.
     *
     * Otherwise the node is a StaticNode.
     */
    function compile(ast: Conformance.Ast): DynamicNode {
        switch (ast?.type) {
            case Conformance.Special.Empty:
            case Conformance.Special.Desc:
            case Conformance.Flag.Provisional:
            case Conformance.Flag.Deprecated:
            case Conformance.Flag.Optional:
                // Alone these all effectively map to "optional" and thus result in no test as all values are acceptable
                return { code: Code.Optional };

            case Conformance.Special.Choice:
                return createChoice(ast.param);

            case Conformance.Special.Otherwise:
                return createGroup(ast.param);

            case Conformance.Special.Name:
                return createName(ast.param);

            case Conformance.Special.OptionalIf:
                return createOptionalIf(ast.param);

            case Conformance.Special.Value:
                return createValue(ast.param);

            case Conformance.Flag.Disallowed:
                return createDisallowed();

            case Conformance.Flag.Mandatory:
                return createMandatory();

            case Conformance.Operator.AND:
            case Conformance.Operator.OR:
            case Conformance.Operator.XOR:
                return createLogicalBinaryOp(ast.type, ast.param);

            case Conformance.Operator.EQ:
            case Conformance.Operator.NE:
            case Conformance.Operator.GT:
            case Conformance.Operator.LT:
            case Conformance.Operator.GTE:
            case Conformance.Operator.LTE:
                return createComparisonOp(ast.type, ast.param);

            case Conformance.Operator.NOT:
                return createNotOp(ast.param);

            default:
                // Fail at compile time if list is not exhaustive
                ast satisfies never;

                // Throw at runtime
                throw new SchemaImplementationError(
                    DataModelPath(schema.path),
                    `Unsupported conformance AST node type ${(ast as any).type}`,
                );
        }
    }

    /**
     * A "choice" is an AST node such as "O.a".
     *
     * Choice conformance is only relevant when validating multiple properties on the same cluster or struct.
     *
     * Compiling a choice always results in a RuntimeNode that updates the count in options.choice.  If a property is
     * validated individually then choice is irrelevant and the node does not affect conformance.
     */
    function createChoice(param: Conformance.Ast.Choice): DynamicNode {
        const compiled = compile(param.expr);

        const name = param.name;
        const template: ValidationLocation.Choice = {
            count: 0,
            target: param.num,
            orMore: !!param.orMore,
            orLess: !!param.orLess,
        };

        return {
            code: Code.Evaluate,

            evaluate: (value, options) => {
                // Update choice definitions.  This is supplied by the struct validator.  If we're only validating a
                // single field then choices aren't available so the choice is ignored
                const choices = options?.choices;
                let choice;
                if (choices) {
                    choice = choices[name];
                    if (!choice) {
                        choice = choices[name] = { ...template };
                    }
                    if (value !== undefined) {
                        choice.count++;
                    }
                }

                // The status of the subexpression is not relevant for the choice.  If conformance fails then it doesn't
                // matter if we count the choice or not
                return evaluateNode(compiled, value, options);
            },
        };
    }

    /**
     * A "group" node is a list or the entries in an optional ([ ... ]) clause. The resulting node is the value of the
     * first list member that does not report as Code.Nonconformant.
     */
    function createGroup(param: Conformance.Ast.Otherwise): DynamicNode {
        if (!Array.isArray(param)) {
            throw new SchemaImplementationError(
                DataModelPath(schema.path),
                "Conformance AST group parameter is not an array",
            );
        }

        // A "group" is a list of conformances; any success passes the entire group and subsequent tests are not
        // evaluated
        if (param[param.length - 1]?.type === Conformance.Flag.Deprecated) {
            param = param.slice(0, param.length - 1);
        }
        const members = param.map(test => compile(test));

        // Reduce tests that must be evaluated at runtime vs. compile time
        const reduced = Array<DynamicNode>();
        for (const member of members) {
            // Nonconformant - ignore
            if (member.code === Code.Nonconformant) {
                continue;
            }

            // Optional & required - no need to evaluate subsequent nodes
            if (member.code === Code.Optional || member.code === Code.Conformant) {
                // Runtime evaluation; this will be the final result
                if (reduced.length) {
                    reduced.push(member);
                    break;
                }

                // No need to runtime evaluation
                return member;
            }

            // Evaluate - remains in list and requires evaluation at runtime
            reduced.push(member);
        }

        // We must further reduce at runtime
        return {
            code: Code.Evaluate,

            evaluate: (value, options) => {
                for (const member of reduced) {
                    const node = evaluateNode(member, value, options);
                    if (node.code !== Code.Nonconformant) {
                        return node;
                    }
                }
                return NonconformantNode;
            },
        };
    }

    /**
     * A name references a feature or the name of a sibling property on the containing object.  We treat the name as a
     * feature if the name is present in featuresAvailable.
     *
     * For features, conformance is known at compile time so the resuling node is a StaticNode.
     *
     * For property names, we need to load the corresponding value at runtime. This results in a RuntimeNode that
     * retrieves the value from options.siblings.
     */
    function createName(param: string): DynamicNode {
        if (featuresAvailable.has(param)) {
            // Name references a feature.  We know whether features are supported by a cluster at compile time so this
            // results in a static node that is conformant iff the feature is supported
            if (featuresSupported.has(param)) {
                return ConformantNode;
            }
            return NonconformantNode;
        }

        // Name references another value.  This results in a value node but must be evaluated at runtime against a
        // specific struct
        return createNameReference(param);
    }

    /**
     * Compile an "optional if" node.  This converts conformant nodes into optional nodes and otherwise leaves the node
     * unchanged.
     *
     * This represents a conformance expression surrounded by brackets such as [ FOO, BAR ].  We first evaluate the
     * internal expression which may happen statically or at runtime.  Then we convert conformant nodes to optional.
     */
    function createOptionalIf(param: Conformance.Ast): DynamicNode {
        let node = compile(param) ?? {};
        node = asConformance(node);

        switch (node.code) {
            case Code.Conformant:
                return { code: Code.Optional };

            case Code.Evaluate:
                const evaluate = node.evaluate;
                return {
                    code: Code.Evaluate,

                    evaluate: (value, options) => {
                        let staticNode = evaluate(value, options);
                        staticNode = asConformance(staticNode);

                        if (staticNode.code === Code.Conformant) {
                            return { code: Code.Optional };
                        }

                        return staticNode;
                    },
                };

            default:
                return node;
        }
    }

    /**
     * A value node represents is static literal value.  This is how we encode numeric literals used in expressions.
     */
    function createValue(param: FieldValue): DynamicNode {
        return {
            code: Code.Value,
            value: param,
        };
    }

    /**
     * "Disallowed" represents "X" in a conformance expression which explicitly disallows the property.
     */
    function createDisallowed(): StaticNode {
        return {
            code: Code.Disallowed,
        };
    }

    /**
     * "Mandatory" is a conformance "M" and maps explicitly to conformant.
     *
     * This means that we will convert [ M ] to optional but that's a pretty silly construct that the spec doesn't use.
     * Otherwise the field will be required.
     */
    function createMandatory(): DynamicNode {
        return ConformantNode;
    }

    /**
     * A logical binary operator is an expression that compares two values using a logical operator.  So e.g. "LF | TL".
     *
     * These operators work on conformance values.  Effectively casts non-binary field values to booleans where
     * undefined = false/nonconformant and defined = true/conformant.
     *
     * This code is rather long because we unroll each operator by hand depending on whether the operators may be
     * evaluated statically or not. This makes sense because we can avoid most runtime computations for common cases
     * such as the "LF | TL" example.
     */
    function createLogicalBinaryOp(
        operator: Conformance.Operator,
        { lhs, rhs }: Conformance.Ast.BinaryOperands,
    ): DynamicNode {
        const compiledLhs = createBooleanTest(compile(lhs));
        const compiledRhs = createBooleanTest(compile(rhs));

        switch (operator) {
            case Conformance.Operator.AND:
                // Static LHS
                if (isStatic(compiledLhs)) {
                    if (asBoolean(compiledLhs)) {
                        return asNonvalue(compiledRhs);
                    } else {
                        return NonconformantNode;
                    }
                }

                // Dynamic LHS, static RHS
                if (isStatic(compiledRhs)) {
                    if (asBoolean(compiledRhs)) {
                        return asNonvalue(compiledLhs);
                    } else {
                        return NonconformantNode;
                    }
                }

                // Both sides dynamic
                return createLogicalBinaryEvaluator(compiledLhs, compiledRhs, (lhs, rhs) => lhs && rhs);

            case Conformance.Operator.OR:
                // Static LHS
                if (isStatic(compiledLhs)) {
                    if (asBoolean(compiledLhs)) {
                        return ConformantNode;
                    } else {
                        return asNonvalue(compiledRhs);
                    }
                }

                // Dynamic LHS, static RHS
                if (isStatic(compiledRhs)) {
                    if (asBoolean(compiledRhs)) {
                        return ConformantNode;
                    } else {
                        return asNonvalue(compiledLhs);
                    }
                }

                // Both sides dynamic
                return createLogicalBinaryEvaluator(compiledLhs, compiledRhs, (lhs, rhs) => lhs || rhs);

            case Conformance.Operator.XOR:
                // Static LHS
                if (isStatic(compiledLhs)) {
                    if (asBoolean(compiledLhs)) {
                        return createLogicalInversion(compiledRhs);
                    } else {
                        return asNonvalue(compiledRhs);
                    }
                }

                // Dynamic LHS, static RHS
                if (isStatic(compiledRhs)) {
                    if (asBoolean(compiledRhs)) {
                        return createLogicalInversion(compiledLhs);
                    } else {
                        return asNonvalue(compiledLhs);
                    }
                }

                // Both sides dynamic
                return createLogicalBinaryEvaluator(compiledLhs, compiledRhs, (lhs, rhs) => (lhs ? !rhs : rhs));

            default:
                throw new SchemaImplementationError(
                    DataModelPath(schema.path),
                    `Unknown logical binary operator ${operator}`,
                );
        }
    }

    /**
     * A comparison operator compares two values.  So e.g. "FieldName > 4".
     *
     * Throws an error if the input AST nodes are not values.  We could convert conformance to a binary 0 or 1 but this
     * does not have real-world applicability and would only occur for malformed conformance.
     */
    function createComparisonOp(
        operator: Conformance.Operator,
        { lhs, rhs }: Conformance.Ast.BinaryOperands,
    ): DynamicNode {
        const originalCreateNameReference = createNameReference;
        try {
            // Special case for binary operators where LHS references an enum - the RHS may reference a member of the
            // enum by name.  This feature is used in exactly one place as of 1.4, in
            // ModeBase.ChangeToModeResponse.StatusText.  And it's not formally specified as legal. But we support for
            // completeness
            if (lhs.type === Conformance.Special.Name) {
                const name = camelize(lhs.param, false);
                const field = supervisor.membersOf(schema).find(model => camelize(model.name, false) === name);
                if (field?.effectiveMetatype === Metatype.enum) {
                    let enumValues: undefined | Record<string, number | undefined>;
                    createNameReference = (name: string) => {
                        if (enumValues === undefined) {
                            enumValues = {};
                            for (const member of supervisor.membersOf(field)) {
                                enumValues[camelize(member.name, true)] = member.id;
                            }
                        }
                        const id = enumValues[camelize(name, true)];
                        if (id !== undefined) {
                            return {
                                code: Code.Value,
                                value: id,
                            };
                        }
                        return originalCreateNameReference(name);
                    };
                }
            }

            return createComparison(operator, compile(lhs), compile(rhs), schema);
        } finally {
            createNameReference = originalCreateNameReference;
        }
    }

    /**
     * Inverts the meaning of conformance.  A conformant node becomes non-conformant and vice-versa.
     */
    function createNotOp(param: Conformance.Ast): DynamicNode {
        const operand = compile(param);
        return createLogicalInversion(operand);
    }

    function requireValue(value: Val, _session: AccessControl.Session, location: ValidationLocation) {
        if (value === undefined) {
            throw new ConformanceError(schema, location, "Matter requires you to set this attribute");
        }
    }

    function disallowValue(value: Val, _session: AccessControl.Session, location: ValidationLocation) {
        if (value !== undefined) {
            throw new ConformanceError(schema, location, "Matter does not allow you to set this attribute");
        }
    }

    function disallowEnumValue(schema: Schema): EnumMemberValidator {
        return location => {
            throw new EnumValueConformanceError(
                schema,
                location,
                `Matter does not allow enum value ${schema.name} (ID ${schema.effectiveId}) here`,
            );
        };
    }

    /**
     * Convert a node to boolean result if it is a value.
     */
    function asNonvalue(node: DynamicNode) {
        if (node.code === Code.Value) {
            return asBoolean(node) ? ConformantNode : NonconformantNode;
        }
        return node;
    }

    /**
     * Extends the "main" validator (conformance on the field itself) with member validation (validation of specific
     * values).
     */
    function addEnumMemberValidation(
        mainValidator: ValueSupervisor.Validate | undefined,
    ): ValueSupervisor.Validate | undefined {
        // If there are no members we can't enforce anything
        const members = supervisor.membersOf(schema);
        if (!members.length) {
            return mainValidator;
        }

        // Create a validator for each member with conformance.  If the member is not constrained then we perform no
        // special validation for it
        let memberValidators: undefined | Record<number, EnumMemberValidator>;
        for (const member of members) {
            // If there's no ID the schema is invalid so just skip
            const id = member.effectiveId;
            if (id === undefined) {
                continue;
            }

            const compiledNode = compile(member.conformance.ast);

            let memberValidator: undefined | EnumMemberValidator;
            switch (compiledNode.code) {
                case Code.Conformant:
                case Code.Optional:
                    // There's nothing to enforce here
                    memberValidator = enumValueOk;
                    break;

                case Code.Nonconformant:
                case Code.Disallowed:
                    // If this member is selected it's an error
                    memberValidator = disallowEnumValue(member);
                    break;

                case Code.Evaluate:
                    // Requires runtime evaluation
                    const { evaluate } = compiledNode;

                    const disallow = disallowEnumValue(member);

                    memberValidator = location => {
                        // Note that we don't need the value here as it is constant so just use "true" indicating the
                        // value is present
                        const staticNode = evaluate(true, location);

                        switch (staticNode.code) {
                            case Code.Conformant:
                            case Code.Optional:
                                // Acceptable
                                break;

                            case Code.Nonconformant:
                            case Code.Disallowed:
                                // Unacceptable; throw an error
                                disallow(location);
                                break;

                            default:
                                throw new UnsupportedConformanceNodeError(member, compiledNode);
                        }
                    };
                    break;

                default:
                    throw new UnsupportedConformanceNodeError(member, compiledNode);
            }

            if (!memberValidators) {
                memberValidators = {};
            }

            memberValidators[id] = memberValidator;
        }

        // If we did not find members with conformance that requires enforcement then just return the main validator
        if (memberValidators === undefined) {
            return mainValidator;
        }

        // Extend the main validator with member validation
        return (value, session, location) => {
            mainValidator?.(value, session, location);

            if (typeof value === "number") {
                if (!memberValidators[value]) {
                    throw new UnknownEnumValueError(
                        location,
                        `Matter does not define the enum value ${value} for ${schema.name}`,
                    );
                }
                // Invoke the member validator if one exists for the selected value
                memberValidators[value](location);
            }
        };
    }
}
