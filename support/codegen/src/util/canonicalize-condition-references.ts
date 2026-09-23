/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { ConditionModel, Conformance, MatterModel, RequirementModel, RequirementResolver } from "#model";

/**
 * Spell every condition a device type requirement's conformance references as the condition is declared.
 *
 * The specification spells a condition's declaration and its references in different cases ("SIT" against "Sit"), and
 * the scrape normalizes the declaration only.  Each name is decided by {@link RequirementResolver.resolve}, so the
 * generator and runtime validation agree on what a name means: a feature of the cluster in context stays as written,
 * and so does a name that resolves to nothing, so model validation sees the name as the specification wrote it.
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
    const canonicalized = canonicalizedAst(requirement.conformance.ast, name => {
        const resolved = RequirementResolver.resolve(requirement, name);
        return resolved instanceof ConditionModel ? resolved.name : undefined;
    });

    if (canonicalized !== undefined) {
        requirement.conformance = Conformance.serialize(canonicalized);
    }
}

/**
 * A copy of {@link ast} with every name the caller renames replaced, or undefined if it renames none.
 */
function canonicalizedAst(
    ast: Conformance.Ast,
    rename: (name: string) => string | undefined,
): Conformance.Ast | undefined {
    switch (ast.type) {
        case Conformance.Special.Name: {
            const name = rename(ast.param);
            return name === undefined || name === ast.param ? undefined : { type: ast.type, param: name };
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

        // The segments of a qualified name do not resolve on their own, so none is renamed
        case Conformance.Operator.DOT:
            return undefined;

        default:
            return undefined;
    }
}
