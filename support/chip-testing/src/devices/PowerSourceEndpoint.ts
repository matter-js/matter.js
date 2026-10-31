/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { Endpoint, ServerNode } from "@matter/main";
import { PowerSourceServer } from "@matter/main/behaviors/power-source";
import { PowerSource } from "@matter/main/clusters/power-source";
import { PowerSourceEndpoint } from "@matter/main/endpoints/power-source";
import { EndpointNumber } from "@matter/main/types";
import { registerDeviceType } from "./DeviceTypeRegistry.js";

// A non-rechargeable battery with the optional BatPercentRemaining and BatVoltage, as CHIP's all-devices-app does
const BatteryPowerSource = PowerSourceEndpoint.with(PowerSourceServer.with(PowerSource.Feature.Battery));

registerDeviceType({
    name: "power-source",
    async create(serverNode: ServerNode, endpoint: EndpointNumber) {
        const ep = new Endpoint(BatteryPowerSource, {
            number: endpoint,
            powerSource: {
                status: PowerSource.PowerSourceStatus.Active,
                order: 0,
                description: "Battery Power Source",
                endpointList: [endpoint],
                batReplaceability: PowerSource.BatReplaceability.NotReplaceable,
                batChargeLevel: PowerSource.BatChargeLevel.Ok,
                batReplacementNeeded: false,
                batPercentRemaining: 200,
                batVoltage: 3000,
            },
        });
        await serverNode.add(ep);
        return { endpoint: ep };
    },
});
