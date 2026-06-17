/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { Endpoint, ServerNode } from "@matter/main";
import { HumiditySensorDevice } from "@matter/main/devices/humidity-sensor";
import { EndpointNumber } from "@matter/main/types";
import { registerDeviceType } from "./DeviceTypeRegistry.js";

registerDeviceType({
    name: "humidity-sensor",
    async create(serverNode: ServerNode, endpoint: EndpointNumber) {
        const ep = new Endpoint(HumiditySensorDevice, {
            number: endpoint,
            relativeHumidityMeasurement: { measuredValue: 5000 },
        });
        await serverNode.add(ep);
        return { endpoint: ep };
    },
});
