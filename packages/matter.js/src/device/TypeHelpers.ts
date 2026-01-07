/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { ClusterServerObj } from "#cluster/server/ClusterServerTypes.js";
import { ClusterClientObj, ClusterClientObjInternal } from "#protocol";
import { ClusterType } from "#types";

export function isClusterClient<const T extends ClusterType>(
    obj: ClusterClientObj<T> | ClusterServerObj<T>,
): obj is ClusterClientObj<T> {
    return obj._type === "ClusterClient";
}

export function isClusterClientInternal<const T extends ClusterType>(
    obj: ClusterClientObj<T> | ClusterServerObj<T>,
): obj is ClusterClientObjInternal<T> {
    return obj._type === "ClusterClient";
}

export function asClusterClientInternal<const T extends ClusterType>(
    obj: ClusterClientObj<T>,
): ClusterClientObjInternal<T> {
    if (!isClusterClientInternal(obj)) {
        throw new Error("Object is not a ClusterClientObj instance.");
    }
    return obj;
}
