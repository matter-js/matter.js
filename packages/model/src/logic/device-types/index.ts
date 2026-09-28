/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

export { NodeCondition } from "./ConditionAssertions.js";
export { DeviceTypeConformance } from "./DeviceTypeConformance.js";
export * from "./DeviceTypeFacts.js";
export * from "./DeviceTypeValidationPass.js";
export * from "./DeviceTypeViolation.js";

// @internal: for @matter/node's scope index and the tests of its conformance service only, not API
export { ConditionAssertions } from "./ConditionAssertions.js";
export type { DeviceTypeScopeIndex } from "./DeviceTypeScopeIndex.js";
export { ReachingEndpoints } from "./ReachingEndpoints.js";
export { ResolvedEndpoint } from "./ResolvedEndpoint.js";
