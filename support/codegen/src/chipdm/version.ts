/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

/** The earliest version whose differences we have reviewed and explained */
export const CALIBRATED_FOR = "1.6.0";

/** Order two data model versions numerically rather than lexically */
export function compareVersions(a: string, b: string) {
    const left = a.split(".").map(Number);
    const right = b.split(".").map(Number);

    for (let i = 0; i < Math.max(left.length, right.length); i++) {
        const difference = (left[i] ?? 0) - (right[i] ?? 0);
        if (difference) {
            return difference;
        }
    }

    return 0;
}
