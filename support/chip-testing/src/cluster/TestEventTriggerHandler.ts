/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { Behavior } from "@matter/main";

/**
 * Handles the test event triggers for the device on its endpoint, as a handler that a CHIP device registers with the
 * TestEventTriggerDelegate does.  {@link TestGeneralDiagnosticsServer} offers each trigger it does not handle itself
 * to the handler of every endpoint.  An endpoint has at most one handler, a subclass of this behavior.
 */
export class TestEventTriggerHandler extends Behavior {
    static override readonly id = "testEventTriggerHandler";

    /**
     * Runs in the transaction of the TestEventTrigger command.  Work the handler starts for later runs in its own
     * transactions.
     *
     * @param eventTrigger the full trigger code, with the endpoint CHIP encodes in bits 32 to 47
     * @returns true if this handler accepted the trigger, so no other handler sees it
     */
    handleTestEventTrigger(_eventTrigger: bigint): boolean {
        return false;
    }
}
