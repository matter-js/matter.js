/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { Conformance } from "#model";

/**
 * What a device type's requirement actually says about an element of a cluster it requires.
 *
 * `Conformance.isMandatory` returning false carries three different meanings — the specification states optional, it
 * states a condition, or it states nothing at all — and a generator that keys on the boolean cannot tell them apart.
 * Reading a requirement that states only a constraint as "the device type relaxes this" is what made eight device
 * types declare a mandatory attribute optional.
 */
export enum RequirementDisposition {
    /** The device type requires the element */
    Mandate = "mandate",

    /** The device type permits an element its cluster requires */
    Relax = "relax",

    /** The device type states a condition this device type does not meet */
    Gated = "gated",

    /** The element is provisional, so it is available but never required */
    Provisional = "provisional",

    /** The device type permits the element, and its cluster does not require it either */
    Permit = "permit",

    /** The device type forbids the element */
    Disallow = "disallow",

    /** The requirement states no conformance; it says nothing about whether the element is required */
    Unstated = "unstated",
}

export interface DispositionContext {
    /** Whether the cluster's own definition requires the element */
    clusterMandates: boolean;

    /** The revision of the device type stating the requirement, for a "Rev >= vN" conformance */
    deviceRevision?: number;
}

/**
 * Resolve a `Rev >= vN` term against a known revision.
 *
 * The term is decidable at generation time because the revision is known, but it is never `Mandatory` in the abstract,
 * so nothing that asks {@link Conformance.isMandatory} can see it.
 */
function satisfiesRevision(ast: Conformance.Ast, deviceRevision?: number) {
    if (ast.type !== Conformance.Special.Revision) {
        return;
    }

    if (typeof deviceRevision !== "number") {
        return false;
    }

    return deviceRevision >= ast.param;
}

/**
 * Classify the terms left once every revision gate ahead of them proved unmet.
 *
 * Whole-conformance questions cannot answer this: `Rev >= v2, O` below its gate states plain optional, but asked as
 * one expression it is neither mandatory nor optional nor provisional.
 */
function dispositionOfTerms(terms: Conformance.Ast[], clusterMandates: boolean): RequirementDisposition {
    for (const term of terms) {
        switch (term.type) {
            case Conformance.Flag.Mandatory:
                return RequirementDisposition.Mandate;

            case Conformance.Flag.Provisional:
                return RequirementDisposition.Provisional;

            case Conformance.Flag.Disallowed:
                return RequirementDisposition.Disallow;

            case Conformance.Flag.Optional:
                return clusterMandates ? RequirementDisposition.Relax : RequirementDisposition.Permit;
        }

        break;
    }

    return clusterMandates ? RequirementDisposition.Gated : RequirementDisposition.Permit;
}

/**
 * Decide what a requirement states, once, so every consumer reads the same answer.
 */
export function dispositionOf(conformance: Conformance, context: DispositionContext): RequirementDisposition {
    const { clusterMandates, deviceRevision } = context;
    const { ast } = conformance;

    if (conformance.isEmpty) {
        return RequirementDisposition.Unstated;
    }

    if (conformance.isDisallowed) {
        return RequirementDisposition.Disallow;
    }

    // An otherwise-list applies its first applicable term. A revision gate that is met decides the whole expression;
    // one that is not met steps aside for the terms behind it, which is what "Rev >= v2, O" states below the gate.
    const terms = ast.type === Conformance.Special.Otherwise ? ast.param : [ast];
    let applicable = 0;
    while (applicable < terms.length) {
        const satisfied = satisfiesRevision(terms[applicable], deviceRevision);
        if (satisfied === undefined) {
            break;
        }
        if (satisfied) {
            return RequirementDisposition.Mandate;
        }
        applicable++;
    }

    if (applicable > 0) {
        return dispositionOfTerms(terms.slice(applicable), clusterMandates);
    }

    if (conformance.isMandatory) {
        return RequirementDisposition.Mandate;
    }

    if (conformance.isProvisional) {
        return RequirementDisposition.Provisional;
    }

    // Only a plain "O" states the element is optional here.  Anything else — a named condition, a choice, an
    // expression, "desc" — states a rule we cannot evaluate at generation time, and reading it as optional would
    // relax an element its cluster requires on the strength of a condition nobody checked.
    if (ast.type === Conformance.Flag.Optional) {
        return clusterMandates ? RequirementDisposition.Relax : RequirementDisposition.Permit;
    }

    return clusterMandates ? RequirementDisposition.Gated : RequirementDisposition.Permit;
}
