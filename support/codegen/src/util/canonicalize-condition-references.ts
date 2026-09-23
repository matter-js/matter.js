/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import {
    collectDotSegments,
    ConditionModel,
    Conformance,
    MatterModel,
    RequirementModel,
    RequirementResolver,
} from "#model";

/**
 * Spell every condition a device type requirement's conformance references as the condition is declared.
 *
 * The scrape normalizes the case of a condition's declaration ("SIT" becomes "Sit") but not of its references, and
 * model validation rejects a reference spelled other than as declared. Each name is decided by
 * {@link RequirementResolver.resolve}, so the generator and model validation agree on what a name means: a feature of
 * the cluster in context stays as written, and so does a name that resolves to nothing, so model validation sees the
 * name as the specification wrote it. A qualified name (`Declarer.Condition`) takes the spelling of both the declaring
 * device type and the condition.
 *
 * Runs on the assembled model because deciding a name needs the universal conditions of the Base device type and the
 * feature codes of each cluster.
 */
export function canonicalizeConditionReferences(matter: MatterModel) {
    for (const deviceType of matter.deviceTypes) {
        deviceType.visit(model => {
            if (model instanceof RequirementModel) {
                canonicalizeRequirement(model);
            }
        });
    }
}

function canonicalizeRequirement(requirement: RequirementModel) {
    const canonicalized = canonicalizedAst(requirement.conformance.ast, segments => {
        const resolved = RequirementResolver.resolve(requirement, segments);
        if (!(resolved instanceof ConditionModel)) {
            return undefined;
        }
        return segments.length === 1 ? [resolved.name] : [resolved.parent?.name ?? segments[0], resolved.name];
    });

    if (canonicalized !== undefined) {
        requirement.conformance = Conformance.serialize(canonicalized);
    }
}

/**
 * A copy of {@link ast} with every name the caller renames replaced, or undefined if it renames none.
 *
 * A name arrives as its segments, one for a plain name and several for a qualified one, and is renamed segment for
 * segment.
 */
function canonicalizedAst(
    ast: Conformance.Ast,
    rename: (segments: string[]) => string[] | undefined,
): Conformance.Ast | undefined {
    switch (ast.type) {
        case Conformance.Special.Name:
        case Conformance.Operator.DOT: {
            const segments = collectDotSegments(ast);
            if (segments === undefined) {
                return undefined;
            }
            const renamed = rename(segments);
            if (renamed === undefined || renamed.join(".") === segments.join(".")) {
                return undefined;
            }
            return qualifiedName(renamed);
        }

        case Conformance.Operator.AND:
        case Conformance.Operator.OR:
        case Conformance.Operator.XOR:
        case Conformance.Operator.EQ:
        case Conformance.Operator.NE:
        case Conformance.Operator.GT:
        case Conformance.Operator.LT:
        case Conformance.Operator.GTE:
        case Conformance.Operator.LTE: {
            const lhs = canonicalizedAst(ast.param.lhs, rename);
            const rhs = canonicalizedAst(ast.param.rhs, rename);
            if (lhs === undefined && rhs === undefined) {
                return undefined;
            }
            return { type: ast.type, param: { lhs: lhs ?? ast.param.lhs, rhs: rhs ?? ast.param.rhs } };
        }

        case Conformance.Operator.NOT: {
            const param = canonicalizedAst(ast.param, rename);
            return param === undefined ? undefined : { type: ast.type, param };
        }

        case Conformance.Special.OptionalIf: {
            const param = canonicalizedAst(ast.param, rename);
            return param === undefined ? undefined : { type: ast.type, param };
        }

        case Conformance.Special.Choice: {
            const expr = canonicalizedAst(ast.param.expr, rename);
            return expr === undefined ? undefined : { type: ast.type, param: { ...ast.param, expr } };
        }

        case Conformance.Special.Otherwise: {
            let changed = false;
            const param = ast.param.map(entry => {
                const canonicalized = canonicalizedAst(entry, rename);
                if (canonicalized === undefined) {
                    return entry;
                }
                changed = true;
                return canonicalized;
            });
            return changed ? { type: ast.type, param } : undefined;
        }

        default:
            return undefined;
    }
}

function qualifiedName([first, ...rest]: string[]): Conformance.Ast {
    let ast: Conformance.Ast = { type: Conformance.Special.Name, param: first };
    for (const segment of rest) {
        ast = {
            type: Conformance.Operator.DOT,
            param: { lhs: ast, rhs: { type: Conformance.Special.Name, param: segment } },
        };
    }
    return ast;
}
