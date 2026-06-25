/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { Endpoint, ServerNode } from "@matter/main";
import { OnOffPlugInUnitDevice } from "@matter/main/devices/on-off-plug-in-unit";
import { EndpointNumber } from "@matter/main/types";
import { registerDeviceType } from "./DeviceTypeRegistry.js";

registerDeviceType({
    name: "on-off-plug-in-unit",
    async create(serverNode: ServerNode, endpoint: EndpointNumber) {
        const ep = new Endpoint(OnOffPlugInUnitDevice, { number: endpoint });
        await serverNode.add(ep);
        return { endpoint: ep };
    },
});
