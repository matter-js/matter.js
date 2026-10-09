/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { isObject } from "@matter/general";
import { SessionIntervals } from "@matter/protocol";
import { Migration } from "./Migration.js";

/**
 * Older versions of CommissioningClient stored a peer's session parameters under `sessionParameters`: the full
 * effective set once a session existed, otherwise only the DNS-SD intervals.  The first becomes the reported set, the
 * second the advertised intervals.  Values already stored under the new keys are newer and win.
 *
 * Only CommissioningClient state ever had `sessionParameters`; CommissioningServer shares the behavior id.
 */
Migration("commissioning", values => {
    const { sessionParameters } = values;
    if (sessionParameters === undefined) {
        return;
    }
    delete values.sessionParameters;
    if (!isObject(sessionParameters)) {
        return;
    }

    const { idleInterval, activeInterval, activeThreshold, ...rest } = sessionParameters;
    if (Object.keys(rest).length) {
        values.reportedSessionParameters ??= sessionParameters;
        return;
    }

    values.advertisedIntervals ??= {
        idleInterval: advertisable(idleInterval, SessionIntervals.maxAdvertisedInterval),
        activeInterval: advertisable(activeInterval, SessionIntervals.maxAdvertisedInterval),
        activeThreshold: advertisable(activeThreshold, SessionIntervals.maxActiveThreshold),
    };
});

function advertisable(value: unknown, max: number) {
    return typeof value === "number" && value <= max ? value : undefined;
}
