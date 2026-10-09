/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { isObject } from "@matter/general";
import { Migration } from "./Migration.js";

/**
 * Older versions stored the DNS-SD session intervals of a peer in `sessionParameters`.  A session always reports the
 * interaction model revision, so a stored set without one holds only advertised intervals and moves to
 * `advertisedIntervals`.
 */
Migration("commissioning", values => {
    const { sessionParameters } = values;
    if (!isObject(sessionParameters) || sessionParameters.interactionModelRevision !== undefined) {
        return;
    }

    const { idleInterval, activeInterval, activeThreshold } = sessionParameters;
    values.advertisedIntervals ??= { idleInterval, activeInterval, activeThreshold };
    delete values.sessionParameters;
});
