/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { Endpoint } from "@matter/main";
import { HumiditySensorDevice } from "@matter/main/devices/humidity-sensor";
import { EndpointNumber } from "@matter/main/types";
import { registerDeviceType } from "./DeviceTypeRegistry.js";

registerDeviceType({
    name: "humidity-sensor",
    async create(parent: Endpoint, endpoint: EndpointNumber) {
        const ep = new Endpoint(HumiditySensorDevice, {
            number: endpoint,
            relativeHumidityMeasurement: {
                measuredValue: 5000,
                minMeasuredValue: 0,
                maxMeasuredValue: 10000,
                tolerance: 0,
            },
        });
        await parent.add(ep);
        return { endpoint: ep };
    },
});
