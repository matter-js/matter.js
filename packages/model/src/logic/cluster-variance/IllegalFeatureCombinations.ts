/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { isDeepEqual, NotImplementedError } from "@matter/general";
import { Conformance } from "../../aspects/index.js";
import { ClusterModel, FieldModel } from "../../models/index.js";
import { FeatureBitmap } from "./FeatureBitmap.js";

/**
 * A disjunction of flag sets, describing the states in which some condition holds.  An empty disjunction describes no
 * state at all and a single empty flag set describes every state.
 */
type States = FeatureBitmap[];

/**
 * Feature combinations a cluster disallows.  A selection matching every flag of any one set violates conformance.
 *
 * @see {@link MatterSpecification.v16.Core} § 7.3
 */
export type IllegalFeatureCombinations = States;

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

    /**
     * True when the specification has yet to settle the member's conformance, so the set cannot require it.
     */
    provisional: boolean;
};

/**
 * What an enclosing "otherwise" list establishes about one of its entries.  Conformance is a list of alternatives of
 * which the first applicable governs, so an entry's meaning depends on the entries around it.
 */
type EntryContext = {
    /**
     * The states in which the list reaches the entry.
     */
    reachedWhen: States;

    /**
     * True when a later entry governs the states this one does not.  The entry then disallows nothing on its own, as
     * the later entry states what applies instead.
     */
    hasFallback: boolean;

    /**
     * True when each earlier entry requires the feature wherever it governs, so a rule this entry contributes holds
     * vacuously in the states they cover.
     */
    mandatedBefore: boolean;

    /**
     * True when a provisional qualifier precedes the entry, so a choice set this entry joins cannot require its
     * members.
     */
    provisionalBefore: boolean;
};

/**
 * A conformance that is not an "otherwise" list is the sole alternative, reached in every state.
 */
const STANDALONE: EntryContext = {
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
 * feature conformances the specifications use.
 *
 * Throws {@link NotImplementedError} if conformance does not adhere to supported rules.  This indicates the ruleset
 * needs augmentation.
 *
 * @see {@link MatterSpecification.v16.Core} § 7.3
 */
export function IllegalFeatureCombinations(cluster: ClusterModel) {
    const illegal = new Array<FeatureBitmap>();
    const choices: Choices = {};

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
        const subject = `${cluster.path} choice "${name}"`;

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
            notImplemented(subject, "members leave the set under differing conditions");
        }
        for (const [gated, value] of Object.entries(gate)) {
            if (gated in flags) {
                notImplemented(subject, `the set is gated on its own member ${gated}`);
            }
            flags[gated] = !value;
        }

        add(flags);

        // The empty selection violating the requirement is what makes a selection compulsory
        requiresFeatures ||= Object.values(flags).every(value => !value);
    }

    return { illegal, requiresFeatures };
}

function notImplemented(subject: string, detail: string): never {
    throw new NotImplementedError(`New rule required to support ${subject}: ${detail}`);
}

function unsupportedConformance(feature: FieldModel, detail: string): never {
    notImplemented(`${feature.path} conformance "${feature.conformance}"`, detail);
}

/**
 * Distribute conjunction over two disjunctions of flag sets.  Flag sets that contradict describe an unreachable state
 * and drop out.
 */
function conjoin(lhs: States, rhs: States) {
    const result = new Array<FeatureBitmap>();

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
 * Express the states in which a feature expression holds.
 */
function whenTrue(feature: FieldModel, node: Conformance.Ast): States {
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
            unsupportedConformance(feature, `the expression "${Conformance.serialize(node)}" is not a feature test`);
    }
}

/**
 * Express the states in which a feature expression does not hold.
 */
function whenFalse(feature: FieldModel, node: Conformance.Ast): States {
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
            unsupportedConformance(feature, `the expression "${Conformance.serialize(node)}" is not a feature test`);
    }
}

/**
 * The combinations that violate a feature the expression makes mandatory.
 */
function requiredWhen(feature: FieldModel, node: Conformance.Ast) {
    return conjoin(whenTrue(feature, node), [{ [feature.name]: false }]);
}

/**
 * The combinations that violate a feature the expression makes available.  Outside those states the feature has no
 * conformance to draw on and is disallowed.
 */
function disallowedUnless(feature: FieldModel, node: Conformance.Ast) {
    return conjoin([{ [feature.name]: true }], whenFalse(feature, node));
}

/**
 * Determine when an "otherwise" entry does not govern.  An empty disjunction means the entry always governs, leaving
 * the entries that follow it unreachable.
 */
function inapplicable(feature: FieldModel, node: Conformance.Ast): States {
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
 * Determine the flags that exclude a feature from a choice set.
 *
 * The specification allows a choice set member only optional conformance.  Anything else states that the member is
 * required, which a set of alternatives cannot mean, so it is refused rather than read with its sense reversed.
 *
 * @see {@link MatterSpecification.v16.Core} § 7.3.14
 */
function choiceGate(feature: FieldModel, node: Conformance.Ast) {
    switch (node.type) {
        case Conformance.Flag.Optional:
            return FeatureBitmap();

        case Conformance.Special.OptionalIf: {
            if (node.param.type === Conformance.Special.Revision) {
                return FeatureBitmap();
            }

            const gate = whenFalse(feature, node.param);

            // The set requires a member wherever a gate fails, and negating a gate of several flags yields alternatives
            // that one flag set cannot hold
            if (gate.length !== 1 || Object.keys(gate[0]).length > 1) {
                unsupportedConformance(feature, "the choice set member leaves the set under a compound condition");
            }

            return gate[0];
        }

        default:
            unsupportedConformance(feature, "the choice set member does not take optional conformance");
    }
}

/**
 * Enroll a feature in a choice set.
 */
function addChoiceMember(
    feature: FieldModel,
    choice: Conformance.Ast.Choice,
    add: (flags: FeatureBitmap) => void,
    choices: Choices,
    entry: EntryContext,
) {
    if (choice.num > 1) {
        unsupportedConformance(feature, `a choice set requiring ${choice.num} members`);
    }

    // The AST reduces a range to its lower bound with "orLess", so an upper bound cannot be modeled faithfully
    if (choice.orLess) {
        unsupportedConformance(feature, "a choice set bounded from above");
    }

    const gate = choiceGate(feature, choice.expr);
    const reachedAlways = entry.reachedWhen.length === 1 && !Object.keys(entry.reachedWhen[0]).length;

    // Membership would otherwise depend on the enclosing conformance too, which a single flag set per member cannot
    // express.  An entry the earlier ones already made mandatory adds nothing where they govern, so its membership does
    // hold throughout
    if (!reachedAlways && (Object.keys(gate).length || !entry.mandatedBefore)) {
        unsupportedConformance(feature, "an earlier alternative conditions the choice set membership");
    }

    if (Object.keys(gate).length && !entry.hasFallback) {
        add({ [feature.name]: true, ...gate });
    }

    const member: ChoiceMember = { feature: feature.name, gate, provisional: entry.provisionalBefore };

    const existing = choices[choice.name];
    if (existing) {
        existing.members.push(member);
    } else {
        choices[choice.name] = { exclusive: !choice.orMore, members: [member] };
    }
}

/**
 * Apply the entries of an "otherwise" list.  The first applicable entry governs, so an entry's rules hold only where
 * every earlier entry is inapplicable.
 */
function addOtherwiseRules(
    feature: FieldModel,
    rules: Conformance.Ast[],
    add: (flags: FeatureBitmap) => void,
    choices: Choices,
) {
    let governs: States = [FeatureBitmap()];
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

        // An entry contributing no rule at all requires nothing
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

        // Revision gates presence on the cluster revision rather than on features
        case Conformance.Special.Revision:
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

        case Conformance.Special.Choice:
            addChoiceMember(feature, node.param, add, choices, entry);
            break;

        case Conformance.Special.OptionalIf:
            // Where the expression fails the fallback governs, so this entry alone disallows nothing
            if (!entry.hasFallback && node.param.type !== Conformance.Special.Revision) {
                disallowedUnless(feature, node.param).forEach(add);
            }
            break;

        case Conformance.Special.Name:
        case Conformance.Operator.AND:
        case Conformance.Operator.OR:
            requiredWhen(feature, node).forEach(add);
            break;

        default:
            unsupportedConformance(feature, `conformance of type "${node.type}" has no rule`);
    }
}
