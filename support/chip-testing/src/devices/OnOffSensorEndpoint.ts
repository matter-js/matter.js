/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { Endpoint } from "@matter/main";
import { OnOffSensorDevice } from "@matter/main/devices/on-off-sensor";
import { EndpointNumber } from "@matter/main/types";
import { registerDeviceType } from "./DeviceTypeRegistry.js";

registerDeviceType({
    name: "on-off-sensor",
    async create(parent: Endpoint, endpoint: EndpointNumber) {
        const ep = new Endpoint(OnOffSensorDevice, { number: endpoint });
        await parent.add(ep);
        return { endpoint: ep };
    },
});
