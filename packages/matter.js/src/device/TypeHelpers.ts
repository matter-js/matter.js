/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { ClusterClientObj, ClusterClientObjInternal } from "#cluster/client/ClusterClientTypes.js";
import { ImplementationError } from "@matter/general";

/**
 * @deprecated Scheduled for removal in 0.19.  Part of the legacy controller API superseded by `ClientNode` in `@matter/node`.
 */
export function asClusterClientInternal(obj: ClusterClientObj): ClusterClientObjInternal {
    if (obj._type !== "ClusterClient") {
        throw new ImplementationError("Object is not a ClusterClientObj instance.");
    }
    return obj as ClusterClientObjInternal;
}
