/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { isDeepEqual, NotImplementedError } from "@matter/general";
import { Conformance } from "../../aspects/index.js";
import { ClusterModel, FieldModel } from "../../models/index.js";
import { FeatureBitmap } from "./FeatureBitmap.js";

export type IllegalFeatureCombinations = FeatureBitmap[];

type Choices = {
    [name: string]: {
        exclusive: boolean;
        members: ChoiceMember[];
    };
};

type ChoiceMember = {
    feature: string;

    /**
     * The flags that remove the member from the choice set.  A member gated on a conformance expression only
     * participates while that expression holds.
     */
    gate: FeatureBitmap;

    provisional: boolean;
};

/**
 * The position of a conformance node within an enclosing "otherwise" list.
 */
type OtherwiseEntry = {
    /**
     * Where the list reaches the entry, as a disjunction of flag sets.
     */
    reachedWhen: IllegalFeatureCombinations;

    /**
     * True when a later entry governs the states this one does not, so the entry alone disallows nothing.
     */
    hasFallback: boolean;

    /**
     * True when the entries before this one require the feature wherever they govern, so a rule this entry contributes
     * holds vacuously in the states they cover.
     */
    mandatedBefore: boolean;

    /**
     * True when a provisional qualifier precedes this entry, leaving what follows a statement of intent.
     */
    provisionalBefore: boolean;
};

const STANDALONE: OtherwiseEntry = {
    reachedWhen: [FeatureBitmap()],
    hasFallback: false,
    mandatedBefore: true,
    provisionalBefore: false,
};

/**
 * Analyzes feature conformance to ascertain feature combinations that are unsupported.  Uses rules to match the
 * conformance AST.
 *
 * Rule matching is not exhaustive but supports a significant subset of the conformance dialect that is inclusive of all
 * feature conformances used by the 1.1 specifications.
 *
 * Throws an error if conformance does not adhere to supported rules.  This indicates the ruleset needs augmentation.
 */
export function IllegalFeatureCombinations(cluster: ClusterModel) {
    const illegal = [] as IllegalFeatureCombinations;
    const choices = {} as Choices;

    function add(flags: FeatureBitmap) {
        if (!illegal.some(e => isDeepEqual(e, flags))) {
            illegal.push(flags);
        }
    }

    for (const f of cluster.features) {
        addFeatureNode(f, f.conformance.ast, add, choices);
    }

    let requiresFeatures = false;

    for (const [name, choice] of Object.entries(choices)) {
        // If choices are mutually exclusive, reject any two flags in combination
        if (choice.exclusive) {
            for (const { feature: f1 } of choice.members) {
                for (const { feature: f2 } of choice.members) {
                    if (f1 !== f2) {
                        add({ [f1]: true, [f2]: true });
                    }
                }
            }
        }

        // Requiring a selection here would force adoption of conformance the specification has yet to settle
        if (choice.members.every(member => member.provisional)) {
            continue;
        }

        // At least one feature choice must be enabled, but only in states where the choice set has a member
        const flags = FeatureBitmap();
        for (const { feature } of choice.members) {
            flags[feature] = false;
        }

        const gate = sharedGate(choice.members.map(member => member.gate));
        if (gate === undefined) {
            throw new NotImplementedError(
                `New rule required to support ${cluster.path} choice "${name}" with dissimilar member gates`,
            );
        }
        for (const [gated, value] of Object.entries(gate)) {
            if (gated in flags) {
                throw new NotImplementedError(
                    `New rule required to support ${cluster.path} choice "${name}" gated on member ${gated}`,
                );
            }
            flags[gated] = !value;
        }

        add(flags);

        // A gate that no state satisfies leaves the selection unconstrained
        requiresFeatures ||= Object.values(flags).every(value => !value);
    }

    return { illegal, requiresFeatures };
}

function unsupportedConformance(feature: FieldModel): never {
    throw new NotImplementedError(`New rule required to support ${feature.path} conformance "${feature.conformance}"`);
}

/**
 * Distribute conjunction over two disjunctions of flag sets.  Flag sets that contradict describe an unreachable state
 * and drop out.
 */
function conjoin(lhs: IllegalFeatureCombinations, rhs: IllegalFeatureCombinations) {
    const result: IllegalFeatureCombinations = [];

    for (const l of lhs) {
        for (const r of rhs) {
            if (Object.keys(l).some(name => name in r && r[name] !== l[name])) {
                continue;
            }
            result.push({ ...l, ...r });
        }
    }

    return result;
}

/**
 * Reduce per-feature choice set gates to the flags that remove every member at once, the only states in which the set
 * has nothing to select.  Members closed by differing conditions coincide in a way a single flag set cannot express.
 */
function sharedGate(gates: FeatureBitmap[]) {
    const [first, ...rest] = gates;

    if (!Object.keys(first).length) {
        return FeatureBitmap();
    }

    for (const gate of rest) {
        if (!Object.keys(gate).length) {
            return FeatureBitmap();
        }
        if (!isDeepEqual(gate, first)) {
            return undefined;
        }
    }

    return { ...first };
}

/**
 * Determine when an "otherwise" entry does not govern, as a disjunction of flag sets.  An empty disjunction means
 * the entry always governs, leaving the entries that follow it unreachable.
 */
function inapplicable(feature: FieldModel, node: Conformance.Ast): IllegalFeatureCombinations {
    switch (node.type) {
        case Conformance.Flag.Mandatory:
        case Conformance.Flag.Optional:
        case Conformance.Flag.Deprecated:
        case Conformance.Flag.Disallowed:
        case Conformance.Special.Desc:
            return [];

        // A qualifier rather than an alternative, so it never displaces the entries that follow
        case Conformance.Flag.Provisional:
        case Conformance.Special.Empty:
        case Conformance.Special.Revision:
            return [FeatureBitmap()];

        case Conformance.Special.Choice:
            return inapplicable(feature, node.param.expr);

        case Conformance.Special.OptionalIf:
            return node.param.type === Conformance.Special.Revision
                ? [FeatureBitmap()]
                : whenFalse(feature, node.param);

        default:
            return whenFalse(feature, node);
    }
}

/**
 * Express the states in which a feature expression does not hold, as a disjunction of flag sets.
 */
function whenFalse(feature: FieldModel, node: Conformance.Ast): IllegalFeatureCombinations {
    switch (node.type) {
        case Conformance.Special.Name:
            return [{ [node.param]: false }];

        case Conformance.Operator.NOT:
            return whenTrue(feature, node.param);

        case Conformance.Operator.OR:
            return conjoin(whenFalse(feature, node.param.lhs), whenFalse(feature, node.param.rhs));

        case Conformance.Operator.AND:
            return [...whenFalse(feature, node.param.lhs), ...whenFalse(feature, node.param.rhs)];

        default:
            unsupportedConformance(feature);
    }
}

/**
 * Express the states in which a feature expression holds, as a disjunction of flag sets.
 */
function whenTrue(feature: FieldModel, node: Conformance.Ast): IllegalFeatureCombinations {
    switch (node.type) {
        case Conformance.Special.Name:
            return [{ [node.param]: true }];

        case Conformance.Operator.NOT:
            return whenFalse(feature, node.param);

        case Conformance.Operator.OR:
            return [...whenTrue(feature, node.param.lhs), ...whenTrue(feature, node.param.rhs)];

        case Conformance.Operator.AND:
            return conjoin(whenTrue(feature, node.param.lhs), whenTrue(feature, node.param.rhs));

        default:
            unsupportedConformance(feature);
    }
}

/**
 * Apply the entries of an "otherwise" list.  The first applicable entry governs, so an entry's exclusions hold only
 * where every earlier entry is inapplicable.
 */
function addOtherwiseRules(
    feature: FieldModel,
    rules: Conformance.Ast[],
    add: (flags: FeatureBitmap) => void,
    choices: Choices,
) {
    let governs: IllegalFeatureCombinations = [FeatureBitmap()];
    let mandated = true;
    let provisional = false;

    for (let i = 0; i < rules.length && governs.length; i++) {
        const exclusions = new Array<FeatureBitmap>();
        addFeatureNode(feature, rules[i], flags => exclusions.push(flags), choices, {
            reachedWhen: governs,
            hasFallback: i < rules.length - 1,
            mandatedBefore: mandated,
            provisionalBefore: provisional,
        });

        provisional ||= rules[i].type === Conformance.Flag.Provisional;

        conjoin(governs, exclusions).forEach(add);

        mandated &&= exclusions.some(exclusion => exclusion[feature.name] === false);
        governs = conjoin(governs, inapplicable(feature, rules[i]));
    }

    // Where no entry governs the feature is not applicable at all.  A list of entries that carry no feature condition
    // is exhausted only in the sense that none of them ever applied, which says nothing about the feature
    if (governs.some(condition => Object.keys(condition).length)) {
        conjoin(governs, [{ [feature.name]: true }]).forEach(add);
    }
}

function addFeatureNode(
    feature: FieldModel,
    node: Conformance.Ast,
    add: (flags: FeatureBitmap) => void,
    choices: Choices,
    entry = STANDALONE,
) {
    switch (node.type) {
        case Conformance.Special.Desc:
        case Conformance.Special.Empty:
        case Conformance.Flag.Optional:
        case Conformance.Flag.Provisional:
            break;

        case Conformance.Flag.Mandatory:
            add({ [feature.name]: false });
            break;

        case Conformance.Flag.Deprecated:
        case Conformance.Flag.Disallowed:
            add({ [feature.name]: true });
            break;

        case Conformance.Special.Otherwise:
            addOtherwiseRules(feature, node.param, add, choices);
            break;

        case Conformance.Special.Choice: {
            if (node.param.num > 1) {
                unsupported();
            }
            const gate = participationGate(node.param.expr);
            const reachedAlways = entry.reachedWhen.length === 1 && !Object.keys(entry.reachedWhen[0]).length;

            // Membership would otherwise depend on the enclosing conformance too, which a single flag set per member
            // cannot express.  An entry the earlier ones already made mandatory adds nothing where they govern, so its
            // membership does hold throughout
            if (!reachedAlways && (Object.keys(gate).length || !entry.mandatedBefore)) {
                unsupported();
            }

            if (Object.keys(gate).length && !entry.hasFallback) {
                add({ [feature.name]: true, ...gate });
            }

            const member: ChoiceMember = {
                feature: feature.name,
                gate,
                provisional: entry.provisionalBefore,
            };

            const choice = choices[node.param.name];
            if (choice) {
                choice.members.push(member);
            } else {
                choices[node.param.name] = { exclusive: !node.param.orMore, members: [member] };
            }
            break;
        }

        case Conformance.Special.Name:
            add({ [node.param]: true, [feature.name]: false });
            break;

        case Conformance.Special.OptionalIf:
            switch (node.param.type) {
                case Conformance.AND:
                case Conformance.OR:
                case Conformance.Operator.NOT:
                case Conformance.Special.Name:
                    // Where the expression fails the fallback governs, so this entry alone disallows nothing
                    if (!entry.hasFallback) {
                        addDependencyRequirement(feature.name, node.param);
                    }
                    break;

                case Conformance.Special.Revision:
                    // Revision-gated optional feature — no feature variance implications
                    break;

                default:
                    unsupported();
            }
            break;

        case Conformance.Operator.AND: {
            // Handles simple conjunctions like "FOO & BAR" and "(STA|PAU|FA|CON) & !SFR"
            const lhsFeatures = extractDisjunctFeatures(node.param.lhs);
            const rhsFeature = extractFeatureFlag(node.param.rhs);

            for (const lhsFeature in lhsFeatures) {
                add({
                    [feature.name]: false,
                    [lhsFeature]: lhsFeatures[lhsFeature],
                    ...rhsFeature,
                });
            }
            break;
        }

        case Conformance.Operator.OR: {
            // The feature is mandatory when any disjunct holds, so each disjunct without it is illegal
            const features = extractDisjunctFeatures(node);
            for (const name in features) {
                add({ [name]: features[name], [feature.name]: false });
            }
            break;
        }

        case Conformance.Special.Revision:
            // Revision-gated feature — no feature variance implications
            break;

        default:
            unsupported();
    }

    function unsupported(): never {
        unsupportedConformance(feature);
    }

    /**
     * Extract a feature name.
     */
    function extractName(node: Conformance.Ast): string {
        if (node.type === Conformance.Special.Name) {
            return node.param;
        }
        unsupported();
    }

    /**
     * Extract a flag for a single feature.  Fails unless the AST is for NAME or !NAME.
     */
    function extractFeatureFlag(node: Conformance.Ast) {
        switch (node.type) {
            case Conformance.Special.Name:
                return { [node.param]: true };

            case Conformance.Operator.NOT:
                return { [extractName(node.param)]: false };

            default:
                unsupported();
        }
    }

    /**
     * Determine the flags that exclude a feature from a choice set.  The specification allows a choice set member only
     * optional conformance, so the flags that disallow the feature are the flags that remove it from the set.  An
     * expression that instead requires the feature states the opposite of what a gate means and is refused.
     *
     * @see {@link MatterSpecification.v16.Core} § 7.3.14
     */
    function participationGate(node: Conformance.Ast) {
        const exclusions = new Array<FeatureBitmap>();
        const nested: Choices = {};
        addFeatureNode(feature, node, flags => exclusions.push(flags), nested);

        // A choice of a choice would register a member the caller then registers again under its own set
        if (Object.keys(nested).length) {
            unsupported();
        }

        if (!exclusions.length) {
            return FeatureBitmap();
        }
        if (exclusions.length > 1 || exclusions[0][feature.name] !== true) {
            unsupported();
        }

        const gate = { ...exclusions[0] };
        delete gate[feature.name];
        return gate;
    }

    /**
     * Add illegal feature sets for features that must be enabled based on the state of other features.
     */
    function addDependencyRequirement(feature: string, node: Conformance.Ast) {
        switch (node.type) {
            case Conformance.Special.Name:
                add({ [feature]: true, [node.param]: false });
                break;

            case Conformance.AND:
                addDependencyRequirement(feature, node.param.lhs);
                addDependencyRequirement(feature, node.param.rhs);
                break;

            case Conformance.OR: {
                // A disjunction is satisfied by any single disjunct, so the feature is only illegal when every disjunct
                // fails
                const flags = FeatureBitmap({ [feature]: true });
                const disjuncts = extractDisjunctFeatures(node);
                for (const name in disjuncts) {
                    flags[name] = !disjuncts[name];
                }
                add(flags);
                break;
            }

            case Conformance.Operator.NOT: {
                // Each disjunct of a negated group independently makes the feature illegal
                const disjuncts = extractDisjunctFeatures(node.param);
                for (const name in disjuncts) {
                    add({ [feature]: true, [name]: disjuncts[name] });
                }
                break;
            }

            default:
                unsupported();
        }
    }

    /**
     * Extract a feature flag disjunction.  Supports | and !.
     */
    function extractDisjunctFeatures(node: Conformance.Ast) {
        const result = {} as FeatureBitmap;

        function extract(node: Conformance.Ast, invert = false) {
            switch (node.type) {
                case Conformance.Special.Name:
                    result[node.param] = !invert;
                    break;

                case Conformance.Operator.OR:
                    extract(node.param.lhs, invert);
                    extract(node.param.rhs, invert);
                    break;

                case Conformance.Operator.NOT:
                    extract(node.param, !invert);
                    break;

                default:
                    unsupported();
            }
        }

        extract(node);

        return result;
    }
}
