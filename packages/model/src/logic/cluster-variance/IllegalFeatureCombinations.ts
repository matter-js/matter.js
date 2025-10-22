/**
 * @license
 * Copyright 2022-2025 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { InternalError, isDeepEqual } from "#general";
import { Conformance } from "../../aspects/index.js";
import { ClusterModel, FieldModel } from "../../models/index.js";
import { FeatureBitmap } from "./FeatureBitmap.js";

export type IllegalFeatureCombinations = FeatureBitmap[];

type Choices = {
    [name: string]: {
        exclusive: boolean;
        features: string[];
    };
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

    for (const choice of Object.values(choices)) {
        // If choices are mutually exclusive, reject any two flags in combination
        if (choice.exclusive) {
            for (const f1 of choice.features) {
                for (const f2 of choice.features) {
                    if (f1 !== f2) {
                        add({ [f1]: true, [f2]: true });
                    }
                }
            }
        }

        // At least one feature choice must be enabled
        const flags = FeatureBitmap();
        for (const f of choice.features) {
            flags[f] = false;
        }
        add(flags);
        requiresFeatures = true;
    }

    return { illegal, requiresFeatures };
}

function addFeatureNode(
    feature: FieldModel,
    node: Conformance.Ast,
    add: (flags: FeatureBitmap) => void,
    choices: Choices,
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
            const rules = node.param;

            // Temporary storage for exclusions used in algorithm below
            const entryExclusions = Array<IllegalFeatureCombinations>();

            // Location of an "optional if" segment, which will require special handling
            let optionalIfIndex: number | undefined;

            // Collect exclusions for each entry.  If there is an "optional if" entry, we need to ensure that it only
            // applies if the other entries *don't* apply
            for (let i = 0; i < rules.length; i++) {
                if (rules[i].type === Conformance.Special.OptionalIf) {
                    if (optionalIfIndex !== undefined) {
                        // Currently we only support one "optional if" which is likely all we'll ever need
                        unsupported();
                    }
                    optionalIfIndex = i;
                }

                const thisEntryExclusions: IllegalFeatureCombinations = [];
                entryExclusions.push(thisEntryExclusions);
                addFeatureNode(feature, rules[i], flags => thisEntryExclusions.push(flags), choices);
            }

            // Now if there's an "optional if", add flags that will negate the rule if other rules make the element
            // mandatory
            if (optionalIfIndex !== undefined) {
                const negations: FeatureBitmap = {};

                for (let i = 0; i < rules.length; i++) {
                    if (i === optionalIfIndex) {
                        continue;
                    }

                    for (const entry of entryExclusions[i]) {
                        for (const name in entry) {
                            if (negations[name] !== undefined) {
                                // Hopefully will never need to support subrules that address the same features
                                unsupported();
                            }
                            negations[name] = !entry[name];
                        }
                    }
                }

                entryExclusions[optionalIfIndex] = entryExclusions[optionalIfIndex].map(exclusions => ({
                    ...negations,
                    ...exclusions,
                }));
            }

            // Now add the exclusions
            for (const ee of entryExclusions) {
                ee.forEach(add);
            }

            break;

        case Conformance.Special.Choice:
            if (node.param.num > 1) {
                unsupported();
            }
            const choice = choices[node.param.name];
            if (choice) {
                choice.features.push(feature.name);
            } else {
                choices[node.param.name] = choices[node.param.name] = {
                    exclusive: !node.param.orMore,
                    features: [feature.name],
                };
            }
            break;

        case Conformance.Special.Name:
            add({ [node.param]: true, [feature.name]: false });
            break;

        case Conformance.Special.OptionalIf:
            switch (node.param.type) {
                case Conformance.AND:
                case Conformance.Special.Name:
                    addDependencyRequirement(feature.name, node.param);
                    break;

                case Conformance.OR: {
                    const flags = FeatureBitmap({ [feature.name]: true });
                    addExclusivityRequirement(flags, node.param);
                    add(flags);
                    break;
                }

                case Conformance.Operator.NOT: {
                    add({ [feature.name]: true, [extractName(node.param.param)]: true });
                    break;
                }

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
                    feature: false,
                    [lhsFeature]: lhsFeatures[lhsFeature],
                    ...rhsFeature,
                });
            }
            break;
        }

        case Conformance.Operator.OR: {
            const features = extractDisjunctFeatures(node);
            add(Object.fromEntries(Object.entries(features).map((k, v) => [k, !v])));
            break;
        }

        default:
            unsupported();
    }

    function unsupported(): never {
        throw new InternalError(`New rule required to support ${feature.path} conformance "${feature.conformance}"`);
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
     * Extends a flag set with flag values that are disallowed given the base feature set.
     */
    function addExclusivityRequirement(flags: FeatureBitmap, node: Conformance.Ast) {
        switch (node.type) {
            case Conformance.OR:
                addExclusivityRequirement(flags, node.param.lhs);
                addExclusivityRequirement(flags, node.param.rhs);
                break;

            default:
                Object.assign(flags, extractFeatureFlag(node));
                break;
        }
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

            case Conformance.OR:
                if (
                    node.param.lhs.type === Conformance.Special.Name &&
                    node.param.rhs.type === Conformance.Special.Name
                ) {
                    add({ [feature]: true, [node.param.lhs.param]: false, [node.param.rhs.param]: false });
                }
                break;

            case Conformance.Operator.NOT:
                if (node.param.type === Conformance.Special.Name) {
                    add({ [feature]: true, [node.param.param]: true });
                }
                break;

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
