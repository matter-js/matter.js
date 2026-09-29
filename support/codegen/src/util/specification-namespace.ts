/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { Specification } from "#model";

/**
 * The `MatterSpecification` namespace in `packages/model/src/dts/Specifications.d.ts` for a specification revision:
 * `1.6` and `1.6.0` map to `v16`, `1.6.1` to `v161`.
 */
export function specificationNamespace(revision: Specification.Revision) {
    const [major, minor, patch = "0"] = revision.split(".");
    return `MatterSpecification.v${major}${minor}${patch === "0" ? "" : patch}`;
}

/**
 * The namespace generated `@see` links name.
 */
export const SPECIFICATION_NAMESPACE = specificationNamespace(Specification.REVISION);
