/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */
import { Logger } from "@matter/general";
import { IdentifyServer } from "@matter/main/behaviors/identify";
import { Identify } from "@matter/main/clusters/identify";

const logger = Logger.get("TestIdentifyServer");

export class TestIdentifyServer extends IdentifyServer {
    override triggerEffect(triggerEffectRequest: Identify.TriggerEffectRequest): void {
        const { effectIdentifier, effectVariant } = triggerEffectRequest;
        logger.info(`Triggering effect ${effectIdentifier} with variant ${effectVariant}`);
    }
}
