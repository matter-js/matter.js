/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { Endpoint, ServerNode } from "@matter/main";
import { OccupancySensingServer } from "@matter/main/behaviors";
import { OccupancySensing } from "@matter/main/clusters";
import { OccupancySensorDevice } from "@matter/main/devices/occupancy-sensor";
import { EndpointNumber } from "@matter/main/types";
import { registerDeviceType } from "./DeviceTypeRegistry.js";

registerDeviceType({
    name: "occupancy-sensor",
    async create(serverNode: ServerNode, endpoint: EndpointNumber) {
        const ep = new Endpoint(
            OccupancySensorDevice.with(OccupancySensingServer.with(OccupancySensing.Feature.PassiveInfrared)),
            {
                number: endpoint,
                occupancySensing: { occupancy: { occupied: false } },
            },
        );
        await serverNode.add(ep);
        return { endpoint: ep };
    },
});
