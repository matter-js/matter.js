/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { Conformance } from "../aspects/Conformance.js";
import { ClusterModel } from "../models/ClusterModel.js";
import { FieldModel } from "../models/FieldModel.js";

interface Choice {
    target: number;
    orMore?: boolean;
    orLess?: boolean;
    members: string[];
    count: number;
}

/**
 * Assess a cluster's supported features against the conformance of its FeatureMap.
 *
 * The Matter specification constrains feature selection in three ways: a feature may be mandatory given other features,
 * disallowed given other features, or a member of a choice group with a required cardinality.  Applications select
 * features so these constraints are only knowable once a selection is made.
 *
 * Conformance we cannot evaluate yields no error.  This is advisory validation of an application's choices, so a
 * conformance form we do not understand must not prevent the cluster from operating.
 *
 * @param cluster the cluster whose {@link ClusterModel.supportedFeatures} to assess
 * @returns one message per violation, empty if the selection conforms
 */
export function FeatureSelectionErrors(cluster: ClusterModel): string[] {
    const features = cluster.features;
    if (!features.length) {
        return [];
    }

    const context = { definedFeatures: cluster.definedFeatures, supportedFeatures: cluster.supportedFeatures };

    const errors = Array<string>();
    const choices = {} as Record<string, Choice>;

    for (const feature of features) {
        const isSupported = context.supportedFeatures.has(feature.name);
        const conformance = feature.effectiveConformance;

        // Provisional and deprecated elements assess as inapplicable but remain selectable, as elsewhere in conformance
        // handling
        if (!isProvisionalOrDeprecated(conformance.ast)) {
            switch (applicabilityOf(conformance, context)) {
                case Conformance.Applicability.Mandatory:
                    if (!isSupported) {
                        errors.push(
                            `feature ${titleOf(feature)} is mandatory for the selected features but is not selected`,
                        );
                    }
                    break;

                case Conformance.Applicability.None:
                    if (isSupported) {
                        errors.push(`feature ${titleOf(feature)} is not allowed with the selected features`);
                    }
                    break;
            }
        }

        collectChoices(feature, conformance.ast, context, choices, isSupported);
    }

    for (const name in choices) {
        const { target, orMore, orLess, members, count } = choices[name];

        if ((count < target && !orLess) || (count > target && !orMore)) {
            errors.push(
                `select ${describeCardinality(target, orMore, orLess)} of ${members.join(", ")} (${count} selected)`,
            );
        }
    }

    return errors;
}

function titleOf(feature: FieldModel) {
    return feature.title ?? feature.name;
}

function describeCardinality(target: number, orMore?: boolean, orLess?: boolean) {
    if (orMore) {
        return `at least ${target}`;
    }
    if (orLess) {
        return `at most ${target}`;
    }
    return `exactly ${target}`;
}

function isProvisionalOrDeprecated(ast: Conformance.Ast) {
    return ast.type === Conformance.Flag.Provisional || ast.type === Conformance.Flag.Deprecated;
}

/**
 * Conformance rejects some legal expressions it cannot assess statically, such as a choice nested in an optional group.
 */
function applicabilityOf(conformance: Conformance, context: Conformance.FeatureContext) {
    try {
        return conformance.applicabilityFor(context);
    } catch {
        return Conformance.Applicability.Conditional;
    }
}

/**
 * Register the choice groups a feature participates in.
 *
 * A feature only joins a group when its gating expression applies; otherwise it neither counts toward the group nor
 * constrains it.  For the same reason only the first applicable branch of an "otherwise" list contributes, as later
 * branches do not govern the feature.
 */
function collectChoices(
    feature: FieldModel,
    ast: Conformance.Ast,
    context: Conformance.FeatureContext,
    choices: Record<string, Choice>,
    isSupported: boolean,
) {
    switch (ast.type) {
        case Conformance.Special.Otherwise:
            for (const node of ast.param) {
                if (applicabilityOf(new Conformance({ ast: node }), context) !== Conformance.Applicability.None) {
                    collectChoices(feature, node, context, choices, isSupported);
                    return;
                }
            }
            return;

        case Conformance.Special.Choice:
            break;

        default:
            return;
    }

    const { name, num, orMore, orLess, expr } = ast.param;

    if (applicabilityOf(new Conformance({ ast: expr }), context) === Conformance.Applicability.None) {
        return;
    }

    const choice = (choices[name] ??= { target: num, members: [], count: 0 });

    // Members of one group should agree on cardinality.  If they do not we take the most permissive reading rather than
    // rejecting a selection based on declaration order
    choice.target = Math.max(choice.target, num);
    choice.orMore ||= orMore;
    choice.orLess ||= orLess;

    choice.members.push(titleOf(feature));
    if (isSupported) {
        choice.count++;
    }
}
