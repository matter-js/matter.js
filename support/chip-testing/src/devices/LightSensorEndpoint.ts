/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { Endpoint, ServerNode } from "@matter/main";
import { LightSensorDevice } from "@matter/main/devices/light-sensor";
import { EndpointNumber } from "@matter/main/types";
import { registerDeviceType } from "./DeviceTypeRegistry.js";

registerDeviceType({
    name: "light-sensor",
    async create(serverNode: ServerNode, endpoint: EndpointNumber) {
        const ep = new Endpoint(LightSensorDevice, {
            number: endpoint,
            illuminanceMeasurement: { measuredValue: 1000 },
        });
        await serverNode.add(ep);
        return { endpoint: ep };
    },
});
