/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import type { Peer } from "#peer/Peer.js";
import { PeerTimingParameters } from "#peer/PeerTimingParameters.js";
import { Duration, Forever, Instant, Millis } from "@matter/general";

/**
 * Regression tests for the timeout semantics in {@link Peer.connect}.
 *
 * The method is integration-heavy, so these tests validate the isolated timeout-resolution expression it uses.  The
 * expression must always yield a bounded timeout unless the caller explicitly opts out with {@link Forever}; a previous
 * shape of `options?.connectionTimeout ?? (options?.abort ? undefined : timing.defaultConnectionTimeout)` silently
 * disabled the timeout whenever the caller passed an abort signal, which caused non-sustained invokes/reads to wait
 * forever on the shared `#connecting` promise (see PR #3644).
 */
function resolveTimeout(options: Peer.ConnectOptions | undefined, timing: PeerTimingParameters) {
    let timeout: Duration | undefined = options?.connectionTimeout ?? timing.defaultConnectionTimeout;
    if (timeout === Infinity) {
        timeout = undefined;
    } else if (timeout <= 0) {
        timeout = Instant;
    }
    return timeout;
}

describe("Peer.connect timeout semantics", () => {
    it("defaults.defaultConnectionTimeout is defined and positive", () => {
        const { defaultConnectionTimeout } = PeerTimingParameters.defaults;
        expect(defaultConnectionTimeout).not.equals(undefined);
        expect(defaultConnectionTimeout as number).greaterThan(0);
    });

    it("falls back to defaultConnectionTimeout when abort is provided without connectionTimeout", () => {
        const timing = PeerTimingParameters();
        const abort = new AbortController().signal;

        expect(resolveTimeout({ abort }, timing)).equals(timing.defaultConnectionTimeout);
    });

    it("uses caller's connectionTimeout when one is supplied alongside abort", () => {
        const timing = PeerTimingParameters();
        const abort = new AbortController().signal;

        expect(resolveTimeout({ abort, connectionTimeout: Millis(5_000) }, timing)).equals(Millis(5_000));
    });

    it("remains unbounded when caller explicitly passes Forever", () => {
        const timing = PeerTimingParameters();
        const abort = new AbortController().signal;

        expect(resolveTimeout({ abort, connectionTimeout: Forever }, timing)).equals(undefined);
    });

    it("normalizes non-positive timeouts to Instant", () => {
        const timing = PeerTimingParameters();

        expect(resolveTimeout({ connectionTimeout: Millis(0) }, timing)).equals(Instant);
        expect(resolveTimeout({ connectionTimeout: Millis(-1) }, timing)).equals(Instant);
    });
});
