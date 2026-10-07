/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { FieldModel, Model } from "#model";

/**
 * Whether `member` is an enum member that stands for a range of values, such as a manufacturer-specific range, instead
 * of one named value.
 */
export function isEnumRange(member: Model) {
    return member instanceof FieldModel && member.isEnumRange;
}
