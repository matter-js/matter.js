/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { ClusterClientObj, ClusterClientObjInternal } from "@matter/protocol";

export function asClusterClientInternal(obj: ClusterClientObj): ClusterClientObjInternal {
    if (obj._type !== "ClusterClient") {
        throw new Error("Object is not a ClusterClientObj instance.");
    }
    return obj as ClusterClientObjInternal;
}
