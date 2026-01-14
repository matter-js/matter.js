/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */
import { HepaFilterMonitoringServer } from "@matter/main/behaviors/hepa-filter-monitoring";
import { ResourceMonitoring } from "@matter/main/clusters/resource-monitoring";

const TestHepaFilterMonitoringServerBase = HepaFilterMonitoringServer.with(
    ResourceMonitoring.Feature.Condition,
    ResourceMonitoring.Feature.Warning,
    ResourceMonitoring.Feature.ReplacementProductList,
);

export class TestHepaFilterMonitoringServer extends TestHepaFilterMonitoringServerBase {
    override resetCondition(): void {
        this.state.condition = 100;
        this.state.changeIndication = ResourceMonitoring.ChangeIndication.Ok;
    }
}
