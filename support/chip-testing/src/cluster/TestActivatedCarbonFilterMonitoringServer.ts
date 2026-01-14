/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */
import { ActivatedCarbonFilterMonitoringServer } from "@matter/main/behaviors/activated-carbon-filter-monitoring";
import { ResourceMonitoring } from "@matter/main/clusters/resource-monitoring";

const TestActivatedCarbonFilterMonitoringServerBase = ActivatedCarbonFilterMonitoringServer.with(
    ResourceMonitoring.Feature.Condition,
    // "Warning", // Do not use here to test both cases, the Activated Carbon Filter test will include it
    ResourceMonitoring.Feature.ReplacementProductList,
);

export class TestActivatedCarbonFilterMonitoringServer extends TestActivatedCarbonFilterMonitoringServerBase {
    override resetCondition(): void {
        this.state.condition = 100;
        this.state.changeIndication = ResourceMonitoring.ChangeIndication.Ok;
    }
}
