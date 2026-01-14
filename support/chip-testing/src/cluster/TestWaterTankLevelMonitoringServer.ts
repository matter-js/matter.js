/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */
import { WaterTankLevelMonitoringServer } from "@matter/main/behaviors/water-tank-level-monitoring";
import { ResourceMonitoring } from "@matter/main/clusters/resource-monitoring";

const TestWaterTankLevelMonitoringServerBase = WaterTankLevelMonitoringServer.with(
    ResourceMonitoring.Feature.Condition,
    // "Warning", // Do not use here to test both cases, the Activated Carbon Filter test will include it
    ResourceMonitoring.Feature.ReplacementProductList,
);

export class TestWaterTankLevelMonitoringServer extends TestWaterTankLevelMonitoringServerBase {
    override resetCondition(): void {
        this.state.condition = 100;
        this.state.changeIndication = ResourceMonitoring.ChangeIndication.Ok;
    }
}
