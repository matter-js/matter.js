/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { Endpoint } from "@matter/main";
import { PressureSensorDevice } from "@matter/main/devices/pressure-sensor";
import { EndpointNumber } from "@matter/main/types";
import { registerDeviceType } from "./DeviceTypeRegistry.js";

registerDeviceType({
    name: "pressure-sensor",
    async create(parent: Endpoint, endpoint: EndpointNumber) {
        const ep = new Endpoint(PressureSensorDevice, {
            number: endpoint,
            pressureMeasurement: { measuredValue: 1000, minMeasuredValue: 0, maxMeasuredValue: 10000 },
        });
        await parent.add(ep);
        return { endpoint: ep };
    },
});
