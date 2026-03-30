/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { InternalError } from "@matter/general";
import type { ValueModel } from "@matter/model";
import { Conformance } from "@matter/model";

const { Applicability, Flag, Operator, Special } = Conformance;

/**
 * Collects elements whose conformance references sibling element names rather than just features.
 *
 * Elements are sorted into two categories:
 *
 * - **conditionals**: No element name deps (e.g. comparison operators, `Desc`). Resolved immediately via fallback.
 * - **interdependents**: Has actual sibling element references, needs the full dependency graph resolution.
 */
export class NameDependentElements {
    /**
     * Elements whose conformance is runtime-conditional (e.g. comparisons, `Desc`) but doesn't reference sibling
     * elements.  Presence is based solely on whether the element is implemented since we can't evaluate the actual
     * condition at behavior construction time.  Also used as resolved deps by {@link interdependents}.
     */
    conditionals = new Map<string, NameDependentElements.Conditional>();

    /**
     * Elements with sibling element references — needs dependency graph resolution.
     */
    interdependents = new Map<string, NameDependentElements.Interdependent>();

    #featureContext: Conformance.FeatureContext;

    constructor(featureContext: Conformance.FeatureContext) {
        this.#featureContext = featureContext;
    }

    /**
     * Add an element whose conformance evaluated as {@link Conformance.Applicability.Conditional}.
     *
     * Extracts deps from the conformance AST and sorts the element into either `conditionals` (resolved immediately)
     * or `interdependents` (needs graph resolution).
     */
    add(model: ValueModel, elementType: "attribute" | "command" | "event", isImplemented: boolean) {
        const { deps, fallback } = extractDeps(model.effectiveConformance.ast, this.#featureContext);

        if (deps.length === 0) {
            // No element-name deps — resolve immediately via fallback
            let presence: boolean;
            switch (fallback) {
                case Applicability.Mandatory:
                    presence = true;
                    break;
                case Applicability.None:
                    presence = false;
                    break;
                case Applicability.Optional:
                    presence = isImplemented;
                    break;
            }
            this.conditionals.set(model.name, { model, elementType, isImplemented, presence });
        } else {
            this.interdependents.set(model.name, { model, elementType, isImplemented, dependencies: deps, fallback });
        }
    }
}

export namespace NameDependentElements {
    /**
     * Information about an element whose conformance depends on element names (not just features).
     */
    export interface Entry {
        model: ValueModel;
        elementType: "attribute" | "command" | "event";
        isImplemented: boolean;
    }

    /**
     * An element whose conformance is runtime-conditional but has no sibling element dependencies.  Presence is
     * determined directly from the implementation since the actual condition can't be evaluated statically.
     */
    export interface Conditional extends Entry {
        presence: boolean;
    }

    /**
     * An element with sibling element references that requires dependency graph resolution.
     */
    export interface Interdependent extends Entry {
        dependencies: string[];
        fallback: Fallback;
    }

    /**
     * The conformance to apply when no element-name dependencies are present.  Maps to the otherwise clause in
     * conformance chains like `"Resume, O"` — here the fallback is {@link Conformance.Applicability.Optional}.
     */
    export type Fallback =
        | Conformance.Applicability.None
        | Conformance.Applicability.Optional
        | Conformance.Applicability.Mandatory;
}

/**
 * Extract dependency names and fallback from a conformance AST.
 */
function extractDeps(
    ast: Conformance.Ast,
    featureContext: Conformance.FeatureContext,
): { deps: string[]; fallback: NameDependentElements.Fallback } {
    switch (ast.type) {
        case Special.Name:
            if (featureContext.definedFeatures.has(ast.param)) {
                // It's a feature — already evaluated in step 1, shouldn't be here
                // But if it is, treat as no deps
                return { deps: [], fallback: Applicability.None };
            }
            return { deps: [ast.param], fallback: Applicability.None };

        case Operator.OR:
            return extractOrDeps(ast.param, featureContext);

        case Special.Otherwise:
            return extractOtherwiseDeps(ast.param, featureContext);

        case Special.OptionalIf: {
            const inner = extractDeps(ast.param, featureContext);
            if (inner.fallback === Applicability.None) {
                inner.fallback = Applicability.Optional;
            }
            return inner;
        }

        case Special.Choice: {
            return extractDeps(ast.param.expr, featureContext);
        }

        case Operator.AND: {
            // Both sides must be true — collect deps from both
            const left = extractDeps(ast.param.lhs, featureContext);
            const right = extractDeps(ast.param.rhs, featureContext);
            return { deps: [...left.deps, ...right.deps], fallback: Applicability.None };
        }

        case Operator.NOT: {
            // Negation — if inner is a feature, it was already resolved. If an element, invert presence.
            // For simplicity, collect deps but invert is too complex — treat as no deps with conditional fallback.
            const inner = ast.param;
            if (inner.type === Special.Name && !featureContext.definedFeatures.has(inner.param)) {
                // !ElementName — present when element is absent, absent when present
                // This is uncommon and hard to express in our model; treat as impl-dependent
                return { deps: [], fallback: Applicability.Optional };
            }
            // Feature negation should have been resolved in step 1
            return { deps: [], fallback: Applicability.None };
        }

        case Operator.EQ:
        case Operator.NE:
        case Operator.GT:
        case Operator.LT:
        case Operator.GTE:
        case Operator.LTE:
            // Comparison expressions — these reference field values, not element presence.
            // Treat as impl-dependent since we can't evaluate field values here.
            return { deps: [], fallback: Applicability.Optional };

        case Special.Desc:
        case Special.Empty:
            // Desc conformance and empty — treat as optional
            return { deps: [], fallback: Applicability.Optional };

        case Flag.Mandatory:
            return { deps: [], fallback: Applicability.Mandatory };

        case Flag.Optional:
            return { deps: [], fallback: Applicability.Optional };

        case Flag.Disallowed:
        case Flag.Deprecated:
        case Flag.Provisional:
            return { deps: [], fallback: Applicability.None };

        case Special.Revision:
            // Revision-gated conformance — no name dependencies, treat as conditional
            return { deps: [], fallback: Applicability.Optional };

        default:
            throw new InternalError(`Unsupported conformance AST type "${ast.type}" for element dependency extraction`);
    }
}

function extractOrDeps(
    operands: Conformance.Ast.BinaryOperands,
    featureContext: Conformance.FeatureContext,
): { deps: string[]; fallback: NameDependentElements.Fallback } {
    const deps: string[] = [];

    function collectOr(node: Conformance.Ast) {
        if (node.type === Operator.OR) {
            collectOr(node.param.lhs);
            collectOr(node.param.rhs);
        } else if (node.type === Special.Name) {
            if (featureContext.definedFeatures.has(node.param)) {
                // Feature reference — if supported it short-circuits, if not just skip
                if (featureContext.supportedFeatures.has(node.param)) {
                    // Should have resolved in step 1 but handle gracefully
                }
            } else {
                deps.push(node.param);
            }
        } else {
            // For complex sub-expressions in OR (AND, NOT, comparisons), just extract what we can
            const sub = extractDeps(node, featureContext);
            deps.push(...sub.deps);
        }
    }

    collectOr({ type: Operator.OR, param: operands });
    return { deps, fallback: Applicability.None };
}

function extractOtherwiseDeps(
    clauses: Conformance.Ast[],
    featureContext: Conformance.FeatureContext,
): { deps: string[]; fallback: NameDependentElements.Fallback } {
    const deps: string[] = [];
    let fallback: NameDependentElements.Fallback = Applicability.None;

    for (const clause of clauses) {
        switch (clause.type) {
            case Special.Name:
                if (featureContext.definedFeatures.has(clause.param)) {
                    if (featureContext.supportedFeatures.has(clause.param)) {
                        // Feature is supported — this makes the element mandatory, should have been caught in step 1
                        return { deps: [], fallback: Applicability.Mandatory };
                    }
                    // Feature not supported — skip this clause
                } else {
                    deps.push(clause.param);
                }
                break;

            case Operator.OR: {
                const orResult = extractOrDeps(clause.param, featureContext);
                deps.push(...orResult.deps);
                break;
            }

            case Flag.Optional:
            case Special.OptionalIf:
                fallback = Applicability.Optional;
                break;

            case Flag.Mandatory:
                fallback = Applicability.Mandatory;
                break;

            case Flag.Disallowed:
            case Flag.Deprecated:
            case Flag.Provisional:
                fallback = Applicability.None;
                break;

            case Special.Choice:
                // Choice wraps an inner expression — extract from it
                {
                    const inner = extractDeps(clause.param.expr, featureContext);
                    deps.push(...inner.deps);
                }
                break;

            default: {
                // For any other AST node (AND, NOT, comparisons, etc.), extract deps generically
                const sub = extractDeps(clause, featureContext);
                deps.push(...sub.deps);
                break;
            }
        }
    }

    return { deps, fallback };
}
