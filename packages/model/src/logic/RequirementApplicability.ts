/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { Conformance } from "../aspects/index.js";
import { RequirementModel } from "../models/index.js";

/**
 * Evaluate a requirement's conformance against the names that are true for an endpoint.
 *
 * A device type's conformance expressions name conditions (e.g. `Sit`) and cluster features (e.g.
 * `TAGLIST`) the same way, so both travel here as features. Names match exactly, as the conformance
 * spells them. A name outside {@link knownNames} leaves the result
 * {@link Conformance.Applicability.Conditional}, because whether the name holds is unknown.
 *
 * @see {@link MatterSpecification.v16.Core} § 9.2.6
 */
export function requirementApplicability(
    requirement: RequirementModel,
    trueNames: Set<string>,
    knownNames: Set<string>,
): Conformance.Applicability {
    return requirement.conformance.applicabilityFor({
        definedFeatures: knownNames,
        supportedFeatures: trueNames,
    });
}
