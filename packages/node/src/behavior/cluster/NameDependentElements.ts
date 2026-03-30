/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { InternalError } from "@matter/general";
import type { ValueModel } from "@matter/model";
import { Conformance, ElementTag } from "@matter/model";

const { Applicability, Flag, Operator, Special } = Conformance;

type Fallback = NameDependentElements.Fallback;

/**
 * Collects elements whose conformance references sibling element names rather than just features.
 *
 * Elements are sorted into two categories:
 *
 * - **conditionals**: No element name deps (e.g. comparison operators, `Desc`). Resolved immediately via fallback.
 * - **interdependents**: Has actual sibling element references, needs the full dependency graph resolution.
 *
 * Classification is a two-pass process:
 *
 * 1. {@link classify} recursively walks the AST to determine whether it contains any non-feature element name
 *    references.  If not, it returns a fallback directly.
 *
 * 2. {@link extractInterdependencies} pattern-matches the top-level AST against known simple forms from the Matter spec
 *    to extract dependency names.  Throws on unrecognized patterns.
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
     * Classifies the conformance AST and sorts the element into either `conditionals` (resolved immediately) or
     * `interdependents` (needs graph resolution).
     */
    add(model: ValueModel, elementType: "attribute" | "command" | "event", isImplemented: boolean) {
        const ast = model.effectiveConformance.ast;
        const result = classify(ast, this.#featureContext, model);

        if (result.kind === "conditional") {
            const presence =
                result.fallback === Applicability.Mandatory
                    ? true
                    : result.fallback === Applicability.None
                      ? false
                      : isImplemented;
            this.conditionals.set(model.name, { model, elementType, isImplemented, presence });
        } else {
            const { dependencies, fallback } = extractInterdependencies(ast, this.#featureContext, model);
            this.interdependents.set(model.name, { model, elementType, isImplemented, dependencies, fallback });
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

// --- Pass 1: Classification ---

type ClassifyResult = { kind: "conditional"; fallback: Fallback } | { kind: "interdependent" };

const CONDITIONAL_NONE: ClassifyResult = { kind: "conditional", fallback: Applicability.None };
const CONDITIONAL_OPTIONAL: ClassifyResult = { kind: "conditional", fallback: Applicability.Optional };
const CONDITIONAL_MANDATORY: ClassifyResult = { kind: "conditional", fallback: Applicability.Mandatory };
const INTERDEPENDENT: ClassifyResult = { kind: "interdependent" };

/**
 * Recursively walks a conformance AST and determines whether it contains any command/event name references.
 *
 * Attribute name references are treated as conditionals — their value-dependent semantics are handled by the normal
 * conformance evaluation path.  Only command/event name references produce interdependencies.
 *
 * If no command/event names are found, returns `{ kind: "conditional", fallback }` with the appropriate fallback.
 * If command/event names are present, returns `{ kind: "interdependent" }` to signal the AST needs pass 2.
 */
function classify(ast: Conformance.Ast, featureContext: Conformance.FeatureContext, model: ValueModel): ClassifyResult {
    switch (ast.type) {
        case Special.Name:
            if (featureContext.definedFeatures.has(ast.param)) {
                // Feature reference — already resolved, shouldn't contribute deps
                return CONDITIONAL_NONE;
            }
            if (!isCommandOrEventName(ast.param, model)) {
                // Attribute reference — handled by normal conformance evaluation
                return CONDITIONAL_OPTIONAL;
            }
            // Command/event name → interdependent
            return INTERDEPENDENT;

        case Special.Otherwise: {
            let highestFallback: Fallback = Applicability.None;
            for (const clause of ast.param) {
                const r = classify(clause, featureContext, model);
                if (r.kind === "interdependent") {
                    return INTERDEPENDENT;
                }
                highestFallback = higherFallback(highestFallback, r.fallback);
            }
            return conditionalResult(highestFallback);
        }

        case Operator.OR: {
            const left = classify(ast.param.lhs, featureContext, model);
            if (left.kind === "interdependent") return INTERDEPENDENT;
            const right = classify(ast.param.rhs, featureContext, model);
            if (right.kind === "interdependent") return INTERDEPENDENT;
            return conditionalResult(higherFallback(left.fallback, right.fallback));
        }

        case Operator.AND: {
            const left = classify(ast.param.lhs, featureContext, model);
            if (left.kind === "interdependent") return INTERDEPENDENT;
            const right = classify(ast.param.rhs, featureContext, model);
            if (right.kind === "interdependent") return INTERDEPENDENT;
            return CONDITIONAL_NONE;
        }

        case Special.OptionalIf: {
            const inner = classify(ast.param, featureContext, model);
            if (inner.kind === "interdependent") return INTERDEPENDENT;
            return inner.fallback === Applicability.None ? CONDITIONAL_OPTIONAL : inner;
        }

        case Special.Choice:
            return classify(ast.param.expr, featureContext, model);

        case Operator.NOT: {
            const inner = ast.param;
            if (inner.type === Special.Name && !featureContext.definedFeatures.has(inner.param)) {
                // !ElementName — too complex to model as a dependency; treat as impl-dependent
                return CONDITIONAL_OPTIONAL;
            }
            // Feature negation — already resolved
            return CONDITIONAL_NONE;
        }

        case Operator.EQ:
        case Operator.NE:
        case Operator.GT:
        case Operator.LT:
        case Operator.GTE:
        case Operator.LTE:
        case Special.Desc:
        case Special.Empty:
        case Special.Revision:
            return CONDITIONAL_OPTIONAL;

        case Flag.Mandatory:
            return CONDITIONAL_MANDATORY;

        case Flag.Optional:
            return CONDITIONAL_OPTIONAL;

        case Flag.Disallowed:
        case Flag.Deprecated:
        case Flag.Provisional:
            return CONDITIONAL_NONE;

        default:
            throw new InternalError(`Unsupported conformance AST type "${ast.type}" for element classification`);
    }
}

function conditionalResult(fallback: Fallback): ClassifyResult {
    switch (fallback) {
        case Applicability.None:
            return CONDITIONAL_NONE;
        case Applicability.Optional:
            return CONDITIONAL_OPTIONAL;
        case Applicability.Mandatory:
            return CONDITIONAL_MANDATORY;
    }
}

function higherFallback(a: Fallback, b: Fallback): Fallback {
    // Applicability enum is ordered None=0, Optional=1, Mandatory=3
    return a > b ? a : b;
}

// --- Pass 2: Interdependency extraction ---

/**
 * Pattern-matches the top-level AST against known interdependent forms from the Matter spec.
 *
 * Known patterns:
 *
 * - `Name` — single dep, fallback None
 * - `Otherwise([Name..., Flag])` — name clauses with trailing flag
 * - `OR(names...)` — flattened OR of names, fallback None
 * - `Otherwise([OR(names...), Flag])` — OR with fallback
 *
 * Throws on unrecognized patterns so new conformance forms are caught immediately.
 */
function extractInterdependencies(
    ast: Conformance.Ast,
    featureContext: Conformance.FeatureContext,
    model: ValueModel,
): { dependencies: string[]; fallback: Fallback } {
    switch (ast.type) {
        case Special.Name:
            return { dependencies: [ast.param], fallback: Applicability.None };

        case Operator.OR:
            return { dependencies: flattenOrNames(ast, featureContext, model), fallback: Applicability.None };

        case Special.Otherwise:
            return extractOtherwiseInterdependencies(ast.param, featureContext, model);

        case Special.OptionalIf: {
            const inner = extractInterdependencies(ast.param, featureContext, model);
            if (inner.fallback === Applicability.None) {
                inner.fallback = Applicability.Optional;
            }
            return inner;
        }

        case Special.Choice:
            return extractInterdependencies(ast.param.expr, featureContext, model);

        default:
            throw new InternalError(`Unsupported top-level interdependent conformance pattern "${ast.type}"`);
    }
}

function extractOtherwiseInterdependencies(
    clauses: Conformance.Ast[],
    featureContext: Conformance.FeatureContext,
    model: ValueModel,
): { dependencies: string[]; fallback: Fallback } {
    const dependencies: string[] = [];
    let fallback: Fallback = Applicability.None;

    for (const clause of clauses) {
        switch (clause.type) {
            case Special.Name:
                if (featureContext.definedFeatures.has(clause.param)) {
                    // Feature — skip (already resolved)
                } else {
                    dependencies.push(clause.param);
                }
                break;

            case Operator.OR:
                dependencies.push(...flattenOrNames(clause, featureContext, model));
                break;

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

            case Special.Choice: {
                const inner = extractInterdependencies(clause.param.expr, featureContext, model);
                dependencies.push(...inner.dependencies);
                break;
            }

            default:
                throw new InternalError(
                    `Unsupported otherwise clause type "${clause.type}" in interdependent conformance`,
                );
        }
    }

    return { dependencies, fallback };
}

/**
 * Flattens a binary OR tree into an array of element name strings.
 *
 * OR is binary in the AST, so `A | B | C` is `OR(OR(A, B), C)`.  Each leaf must be a `Special.Name` that isn't a
 * defined feature — anything else throws.
 */
function flattenOrNames(ast: Conformance.Ast, featureContext: Conformance.FeatureContext, model: ValueModel): string[] {
    const names: string[] = [];

    const stack: Conformance.Ast[] = [ast];
    while (stack.length > 0) {
        const node = stack.pop()!;
        if (node.type === Operator.OR) {
            stack.push(node.param.lhs, node.param.rhs);
        } else if (node.type === Special.Name) {
            if (!featureContext.definedFeatures.has(node.param) && isCommandOrEventName(node.param, model)) {
                names.push(node.param);
            }
            // Feature and attribute names are skipped
        } else {
            throw new InternalError(
                `Unexpected node type "${node.type}" in OR tree of interdependent conformance — expected element names`,
            );
        }
    }

    return names;
}

/**
 * Returns true if `name` resolves to a command or event in the element's parent (cluster) scope.
 *
 * Attribute references are excluded — their presence semantics are richer (value-dependent) and handled by the
 * normal conformance evaluation path rather than the binary interdependency graph.
 */
function isCommandOrEventName(name: string, model: ValueModel): boolean {
    return model.parent?.resolve(name, { tags: [ElementTag.Command, ElementTag.Event] }) !== undefined;
}
