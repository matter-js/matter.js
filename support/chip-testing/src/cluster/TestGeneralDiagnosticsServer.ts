/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */
import { Logger } from "@matter/general";
import { GeneralDiagnosticsServer } from "@matter/main/behaviors/general-diagnostics";
import { StatusResponseError } from "@matter/main/types";
import { Status } from "@matter/types";

const logger = Logger.get("TestGeneralDiagnosticServer");

export class TestGeneralDiagnosticsServer extends GeneralDiagnosticsServer {
    override triggerTestEvent(testEvent: number | bigint): void {
        logger.info("Test event triggered: ", testEvent);
        if (testEvent === BigInt("0xfffffffffff10000")) {
            this.triggerTestEvent(0x0000000000000003);
        } else if (testEvent !== 0x0000000000000003) {
            throw new StatusResponseError("Wrong test event", Status.InvalidCommand);
        }
    }
}
