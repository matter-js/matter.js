/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { describeList, InternalError, Logger } from "@matter/general";
import { ClusterModel } from "../../models/ClusterModel.js";
import { FeatureBitmap } from "./FeatureBitmap.js";
import { IllegalFeatureCombinations } from "./IllegalFeatureCombinations.js";

const logger = Logger.get("FeatureSelectionErrors");

/**
 * Assess a cluster's supported features against the combinations its FeatureMap conformance disallows.
 *
 * Feature selection is the application's, so these constraints are only knowable once a selection is made.  We report
 * against {@link IllegalFeatureCombinations} so this assessment cannot diverge from the one codegen uses to decide
 * whether an application must select features itself.
 *
 * @param cluster the cluster whose {@link ClusterModel.supportedFeatures} to assess
 * @returns one message per violated combination, empty if the selection conforms
 */
export function FeatureSelectionErrors(cluster: ClusterModel): string[] {
    let illegal;
    try {
        ({ illegal } = IllegalFeatureCombinations(cluster));
    } catch (error) {
        // Our ruleset does not cover every conformance the grammar allows.  A shape we cannot analyze leaves the
        // selection unassessed rather than preventing the cluster from operating
        if (!(error instanceof InternalError)) {
            throw error;
        }
        logger.warn(`Cannot assess feature selection for ${cluster.name}: ${error.message}`);
        return [];
    }

    if (!illegal.length) {
        return [];
    }

    const supported = cluster.supportedFeatures;
    const titles = new Map(cluster.features.map(feature => [feature.name, feature.title ?? feature.name]));
    const titleOf = (name: string) => titles.get(name) ?? name;

    const errors = new Set<string>();

    for (const combination of illegal) {
        const names = Object.keys(combination);
        if (names.some(name => supported.has(name) !== combination[name])) {
            continue;
        }

        errors.add(describe(combination, names, titleOf));
    }

    return [...errors];
}

function describe(combination: FeatureBitmap, names: string[], titleOf: (name: string) => string) {
    const required = names.filter(name => !combination[name]).map(titleOf);
    const forbidden = names.filter(name => combination[name]).map(titleOf);

    if (!required.length) {
        return forbidden.length > 1
            ? `features ${describeList("and", ...forbidden)} cannot be selected together`
            : `feature ${forbidden[0]} is not allowed`;
    }

    // Several required features satisfy the combination individually, so the requirement is disjunctive
    const requirement =
        required.length > 1
            ? `select at least one of ${describeList("or", ...required)}`
            : `feature ${required[0]} is mandatory`;

    if (!forbidden.length) {
        return requirement;
    }

    return `${requirement} when ${describeList("and", ...forbidden)} ${forbidden.length > 1 ? "are" : "is"} selected`;
}
