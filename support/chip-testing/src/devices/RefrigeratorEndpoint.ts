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
import type { EndpointNumberAllocator } from "./EndpointNumberAllocator.js";

// TemperatureControl values are in 0.01 °C (4 °C setpoint, 1–7 °C range).
const Cabinet = TemperatureControlledCabinetDevice.with(
    IdentifyServer,
    TemperatureControlServer.with("TemperatureNumber"),
);

registerDeviceType({
    name: "refrigerator",
    async create(serverNode: ServerNode, endpoint: EndpointNumber, numbers: EndpointNumberAllocator) {
        // Children come with their parent, so the parent's composition is judged complete at construction
        const ep = new Endpoint(RefrigeratorDevice, {
            number: endpoint,
            parts: [
                new Endpoint(Cabinet, {
                    number: numbers.next(),
                    id: "cabinet",
                    temperatureControl: { temperatureSetpoint: 400, minTemperature: 100, maxTemperature: 700 },
                }),
            ],
        });
        await serverNode.add(ep);

        return { endpoint: ep };
    },
});
