/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { MatterModel, RequirementElement, RequirementModel, RequirementResolver } from "#model";

/**
 * Name every feature element requirement of a device type by the code of the feature it requires.
 *
 * The specification's element requirement tables name a feature by its title ("LongIdleTimeSupport" for `LITS`),
 * while conformance and the cluster's feature map use codes. A name matches a feature by its code or by its title,
 * ignoring case and whitespace. This applies to local overrides as well. A name that matches no feature stays as
 * written, so model validation reports it.
 *
 * Runs on the assembled model because the feature codes come from the clusters.
 */
export function canonicalizeFeatureRequirements(matter: MatterModel) {
    for (const deviceType of matter.deviceTypes) {
        deviceType.visit(model => {
            if (model instanceof RequirementModel && model.element === RequirementElement.ElementType.Feature) {
                canonicalizeRequirement(model);
            }
        });
    }
}

function canonicalizeRequirement(requirement: RequirementModel) {
    const feature = RequirementResolver.featureMatching(requirement);
    if (feature !== undefined) {
        requirement.name = feature.name;
    }
}
