/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { type Duration, Time, type Timer } from "@matter/general";
import type { OtbrRestClient } from "./OtbrRestClient.js";
import { OtbrRestError } from "./OtbrRestError.js";

/** Terminal states a collection-API action can settle into. */
export type ActionTerminalStatus = "completed" | "stopped" | "failed";

function isTerminal(status: string): status is ActionTerminalStatus {
    return status === "completed" || status === "stopped" || status === "failed";
}

/**
 * Poll a collection-API action to a terminal state.
 *
 * The OTBR REST collection API runs `getNetworkDiagnosticTask` / `updateDeviceCollectionTask`
 * asynchronously: the initial POST returns immediately with `pending`, and the caller polls the
 * action resource until it settles. Returns the terminal status and, for a completed diagnostic
 * task, the result-collection id from `relationships.result.data.id`.
 *
 * Uses the injectable matter.js {@link Time} so tests drive it under MockTime.
 *
 * `timeout` bounds polling, not the result: a terminal status observed on a poll is always honored
 * (a result seen on the same poll the deadline elapses is returned, not discarded — the work is
 * already done). The throw fires only when a poll after the deadline is still non-terminal.
 *
 * @throws {@link OtbrRestError} `"rest_protocol"` if a poll after `timeout` still finds the action
 *   non-terminal.
 */
export async function runActionToCompletion(
    client: Pick<OtbrRestClient, "getAction">,
    id: string,
    opts: { pollInterval: Duration; timeout: Duration },
): Promise<{ status: ActionTerminalStatus; resultId?: string }> {
    let timedOut = false;
    const timer: Timer = Time.getTimer("otbr-action-poll-timeout", opts.timeout, () => {
        timedOut = true;
    }).start();
    try {
        for (;;) {
            const { status, resultId } = await client.getAction(id);
            if (isTerminal(status)) {
                return { status, resultId };
            }
            if (timedOut) {
                throw new OtbrRestError(
                    "rest_protocol",
                    `OTBR action ${id} did not complete within timeout (last status: ${status})`,
                );
            }
            await Time.sleep("otbr-action-poll", opts.pollInterval);
        }
    } finally {
        timer.stop();
    }
}
