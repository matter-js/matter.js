/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { Endpoint, ServerNode } from "@matter/main";
import { ValveConfigurationAndControl } from "@matter/main/clusters/valve-configuration-and-control";
import { WaterValveDevice } from "@matter/main/devices/water-valve";
import { EndpointNumber } from "@matter/main/types";
import { TestValveConfigurationAndControlServer } from "../cluster/TestValveConfigurationAndControlServer.js";
import { registerDeviceType } from "./DeviceTypeRegistry.js";

// Level feature without optional attributes, as CHIP's all-devices-app does
const WaterValve = WaterValveDevice.with(TestValveConfigurationAndControlServer);

registerDeviceType({
    name: "water-valve",
    async create(serverNode: ServerNode, endpoint: EndpointNumber) {
        const ep = new Endpoint(WaterValve, {
            number: endpoint,
            valveConfigurationAndControl: {
                currentState: ValveConfigurationAndControl.ValveState.Closed,
                currentLevel: 0,
            },
        });
        await serverNode.add(ep);
        return { endpoint: ep };
    },
});
