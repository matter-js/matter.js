/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { ClusterModel } from "../../models/index.js";
import { FeatureBitmap, translateBitmap } from "./FeatureBitmap.js";

/**
 * The condition for supported patterns of complex variance on Cluster Attributes, Commands and Events.
 */
export type VarianceCondition = {
    anyOf?: string[];
    allOf?: string[];
    not?: string;
};

/**
 * Convert a VarianceCondition to an array of FeatureBitmaps.
 */
export function conditionToBitmaps(condition: VarianceCondition, cluster: ClusterModel): FeatureBitmap[] {
    const bitmap = {} as FeatureBitmap;
    if (condition.allOf) {
        for (const name of condition.allOf) {
            bitmap[name] = true;
        }
    }
    if (condition.not) {
        bitmap[condition.not] = false;
    }

    if (!condition.anyOf) {
        return [translateBitmap(bitmap, cluster)];
    }

    const bitmaps = Array<typeof bitmap>();
    for (const name of condition.anyOf) {
        bitmaps.push(translateBitmap({ ...bitmap, [name]: true }, cluster));
    }

    return bitmaps;
}
