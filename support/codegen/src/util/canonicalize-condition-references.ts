/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { Conformance, MatterModel, RequirementModel, RequirementResolver } from "#model";

/**
 * Spell every condition a device type requirement's conformance references as the condition is declared.
 *
 * The scrape normalizes the case of a condition's declaration ("SIT" becomes "Sit") but not of its references, and
 * model validation rejects a reference spelled other than as declared. See
 * {@link RequirementResolver.declaredConformanceOf} for how each name is decided.
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
    const ast = RequirementResolver.declaredConformanceOf(requirement);
    if (ast !== undefined) {
        requirement.conformance = Conformance.serialize(ast);
    }
}
