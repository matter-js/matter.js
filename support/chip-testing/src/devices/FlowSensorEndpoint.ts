/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { Endpoint, ServerNode } from "@matter/main";
import { FlowSensorDevice } from "@matter/main/devices/flow-sensor";
import { EndpointNumber } from "@matter/main/types";
import { registerDeviceType } from "./DeviceTypeRegistry.js";

registerDeviceType({
    name: "flow-sensor",
    async create(serverNode: ServerNode, endpoint: EndpointNumber) {
        const ep = new Endpoint(FlowSensorDevice, {
            number: endpoint,
            flowMeasurement: { measuredValue: 100, minMeasuredValue: 0, maxMeasuredValue: 65534 },
        });
        await serverNode.add(ep);
        return { endpoint: ep };
    },
});
