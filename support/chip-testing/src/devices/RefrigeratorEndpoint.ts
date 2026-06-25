/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { Endpoint, ServerNode } from "@matter/main";
import { IdentifyServer } from "@matter/main/behaviors/identify";
import { TemperatureControlServer } from "@matter/main/behaviors/temperature-control";
import { RefrigeratorDevice } from "@matter/main/devices/refrigerator";
import { TemperatureControlledCabinetDevice } from "@matter/main/devices/temperature-controlled-cabinet";
import { EndpointNumber } from "@matter/main/types";
import { registerDeviceType } from "./DeviceTypeRegistry.js";

// TemperatureControl values are in 0.01 °C (4 °C setpoint, 1–7 °C range).
const Cabinet = TemperatureControlledCabinetDevice.with(
    IdentifyServer,
    TemperatureControlServer.with("TemperatureNumber"),
);

registerDeviceType({
    name: "refrigerator",
    async create(serverNode: ServerNode, endpoint: EndpointNumber) {
        const ep = new Endpoint(RefrigeratorDevice, { number: endpoint });
        await serverNode.add(ep);

        await ep.add(
            new Endpoint(Cabinet, {
                id: "cabinet",
                temperatureControl: { temperatureSetpoint: 400, minTemperature: 100, maxTemperature: 700 },
            }),
        );

        return { endpoint: ep };
    },
});
