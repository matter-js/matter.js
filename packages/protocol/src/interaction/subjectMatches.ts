/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { CaseAuthenticatedTag, NodeId, SubjectId } from "@matter/types";

/**
 * The Access-Control subject-matching function: true when `candidate` satisfies `target`. Exact match, else both must
 * be CASE Authenticated Tags with the same identifier and `candidate` version >= `target` version.
 *
 * Shared by the Access Control privilege-granting algorithm and ICD Check-In suppression (the MonitoredSubject of a
 * registration is matched against active subscription subjects with this same function).
 *
 * @see {@link MatterSpecification.v16.Core} § 9.10
 */
export function subjectMatches(target: SubjectId, candidate: SubjectId): boolean {
    if (BigInt(target) === BigInt(candidate)) {
        return true;
    }
    if (!NodeId.isCaseAuthenticatedTag(target) || !NodeId.isCaseAuthenticatedTag(candidate)) {
        return false;
    }
    const targetCat = NodeId.extractAsCaseAuthenticatedTag(target);
    const candidateCat = NodeId.extractAsCaseAuthenticatedTag(candidate);
    return (
        CaseAuthenticatedTag.getIdentifyValue(targetCat) === CaseAuthenticatedTag.getIdentifyValue(candidateCat) &&
        CaseAuthenticatedTag.getVersion(candidateCat) >= CaseAuthenticatedTag.getVersion(targetCat)
    );
}
