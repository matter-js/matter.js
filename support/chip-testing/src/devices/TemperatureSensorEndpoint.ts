/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { Endpoint, ServerNode } from "@matter/main";
import { TemperatureSensorDevice } from "@matter/main/devices/temperature-sensor";
import { EndpointNumber } from "@matter/main/types";
import { registerDeviceType } from "./DeviceTypeRegistry.js";

registerDeviceType({
    name: "temperature-sensor",
    async create(serverNode: ServerNode, endpoint: EndpointNumber) {
        const ep = new Endpoint(TemperatureSensorDevice, {
            number: endpoint,
            temperatureMeasurement: { measuredValue: 2500 },
        });
        await serverNode.add(ep);
        return { endpoint: ep };
    },
});
