/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { HepaFilterMonitoringServer } from "#behaviors/hepa-filter-monitoring";
import { AirPurifierDevice } from "#devices/air-purifier";
import { MatterAggregateError } from "@matter/general";
import { ConstraintError } from "@matter/protocol";
import { FanControl } from "@matter/types/clusters/fan-control";
import { ResourceMonitoring } from "@matter/types/clusters/resource-monitoring";
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

describe("HepaFilterMonitoringServer condition", () => {
    async function purifierWithCondition(condition: number) {
        const node = await MockServerNode.create();
        try {
            await node.add(AirPurifierDevice.with(HepaFilterMonitoringServer.with("Condition")), {
                fanControl: { fanModeSequence: FanControl.FanModeSequence.OffHigh, percentCurrent: 50 },
                hepaFilterMonitoring: {
                    condition,
                    changeIndication: ResourceMonitoring.ChangeIndication.Ok,
                    degradationDirection: ResourceMonitoring.DegradationDirection.Down,
                },
            });
        } finally {
            await node.close();
        }
    }

    // Condition is a percent and restates no range of its own
    it("rejects a condition above 100 percent", async () => {
        const error = await purifierWithCondition(101).then(
            () => undefined,
            (e: unknown) => e,
        );

        expect(error).instanceof(MatterAggregateError);
        const cause = error instanceof MatterAggregateError ? error.errors[0]?.cause : undefined;
        expect(cause).instanceof(ConstraintError);
    });
});
