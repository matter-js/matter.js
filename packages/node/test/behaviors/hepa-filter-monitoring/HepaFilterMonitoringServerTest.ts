/**
 * @license
 * Copyright 2022-2025 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { HepaFilterMonitoringServer } from "#behaviors/hepa-filter-monitoring";
import { FanControl } from "#clusters/fan-control";
import { ResourceMonitoring } from "#clusters/resource-monitoring";
import { AirPurifierDevice } from "#devices/air-purifier";
import { MockServerNode } from "../../node/mock-server-node.js";

describe("HepaFilterMonitoringServer", () => {
    it("instantiates", async () => {
        const node = await MockServerNode.create();
        const DeviceType = AirPurifierDevice.with(HepaFilterMonitoringServer);
        await node.add(DeviceType, {
            fanControl: {
                fanModeSequence: FanControl.FanModeSequence.OffHigh,
                percentCurrent: 50,
            },
            hepaFilterMonitoring: {
                changeIndication: ResourceMonitoring.ChangeIndication.Ok,
            },
        });
        await node.close();
    });

    it("instantiates with feature", async () => {
        const node = await MockServerNode.create();
        const Filter = HepaFilterMonitoringServer.with("Condition");
        const PurifierDevice = AirPurifierDevice.with(Filter);
        const purifier = await node.add(PurifierDevice, {
            fanControl: { fanModeSequence: FanControl.FanModeSequence.OffHigh, percentCurrent: 50 },
            hepaFilterMonitoring: {
                condition: 100,
                changeIndication: ResourceMonitoring.ChangeIndication.Ok,
                degradationDirection: ResourceMonitoring.DegradationDirection.Down,
            },
        });
        await purifier.setStateOf(Filter, { condition: 50 });
        expect(purifier.stateOf(Filter).condition).equals(50);
    });

    it("properly types state", async () => {
        const node = await MockServerNode.create();
        const Filter = HepaFilterMonitoringServer.with("Condition");
        const PurifierDevice = AirPurifierDevice.with(Filter);
        const purifier = await node.add(PurifierDevice, {
            fanControl: { fanModeSequence: FanControl.FanModeSequence.OffHigh, percentCurrent: 50 },
            hepaFilterMonitoring: {
                condition: 100,
                changeIndication: ResourceMonitoring.ChangeIndication.Ok,
                degradationDirection: ResourceMonitoring.DegradationDirection.Down,
            },
        });
        await purifier.act(agent => {
            agent.hepaFilterMonitoring.state.condition = 50;
        });
        expect(purifier.stateOf(Filter).condition).equals(50);
    });
});
