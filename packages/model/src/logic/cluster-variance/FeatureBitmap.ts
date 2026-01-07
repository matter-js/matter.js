/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { camelize } from "#general";
import { ClusterModel, FieldModel } from "../../models/index.js";

export type FeatureFlags = string[];
export type FeatureBitmap = { [name: string]: boolean };
export type FeatureNames = { [key: string]: string };

export function FeatureBitmap(bitmap: FeatureBitmap | FeatureFlags = {}): FeatureBitmap {
    if (Array.isArray(bitmap)) {
        return Object.fromEntries(bitmap.map(name => [name, true]));
    }
    return bitmap;
}

/**
 * Map the names in a feature bitmap to different names.  Used to convert from
 * a feature code bitmap to a feature name bitmap.
 *
 * E.g. { F: true } -> { foo: true }
 *
 * If a name isn't present leaves the feature code intact.
 */
export function translateBitmap(bitmap: FeatureBitmap, cluster: ClusterModel) {
    return Object.fromEntries(
        Object.entries(bitmap).map(([k, v]) => {
            const feature = cluster.featureMap.get(FieldModel, k);
            return [camelize(feature?.title ?? k), v];
        }),
    );
}
