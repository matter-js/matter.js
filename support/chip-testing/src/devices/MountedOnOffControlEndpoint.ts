/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { Endpoint, ServerNode } from "@matter/main";
import { MountedOnOffControlDevice } from "@matter/main/devices/mounted-on-off-control";
import { EndpointNumber } from "@matter/main/types";
import { registerDeviceType } from "./DeviceTypeRegistry.js";

registerDeviceType({
    name: "mounted-on-off-control",
    async create(serverNode: ServerNode, endpoint: EndpointNumber) {
        const ep = new Endpoint(MountedOnOffControlDevice, { number: endpoint });
        await serverNode.add(ep);
        return { endpoint: ep };
    },
});
