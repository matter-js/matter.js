/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */
import { Logger } from "@matter/main";
import { LowPowerServer } from "@matter/main/behaviors/low-power";

const logger = Logger.get("TestLowPowerServer");

export class TestLowPowerServer extends LowPowerServer {
    override initialize() {
        this.events.enterLowPowerMode.on(() => {
            logger.info(`Sleep triggered`);
        });
    }
}
