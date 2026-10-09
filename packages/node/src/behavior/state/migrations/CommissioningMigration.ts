/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { isObject, Millis } from "@matter/general";
import { SessionIntervals } from "@matter/protocol";
import { Migration } from "./Migration.js";

/**
 * Older versions of CommissioningClient stored a peer's session parameters under `sessionParameters`: the full
 * effective set once a session existed, otherwise only the DNS-SD intervals.  The first becomes the reported set, the
 * second the advertised intervals.
 *
 * The store is not rewritten, so this runs on every load; values under the new keys win.  Only CommissioningClient state
 * ever had `sessionParameters`; CommissioningServer shares the behavior id.
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

    values.advertisedIntervals ??= SessionIntervals.advertisable({
        idleInterval: duration(idleInterval),
        activeInterval: duration(activeInterval),
        activeThreshold: duration(activeThreshold),
    });
});

function duration(value: unknown) {
    return typeof value === "number" ? Millis(value) : undefined;
}
