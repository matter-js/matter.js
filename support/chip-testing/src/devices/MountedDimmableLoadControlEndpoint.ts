/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { Endpoint, ServerNode } from "@matter/main";
import { MountedDimmableLoadControlDevice } from "@matter/main/devices/mounted-dimmable-load-control";
import { EndpointNumber } from "@matter/main/types";
import { registerDeviceType } from "./DeviceTypeRegistry.js";
import { DimmableLevelControlServer, dimmableLevelControlState } from "./dimmable-load.js";

registerDeviceType({
    name: "mounted-dimmable-load-control",
    async create(serverNode: ServerNode, endpoint: EndpointNumber) {
        const ep = new Endpoint(MountedDimmableLoadControlDevice.with(DimmableLevelControlServer), {
            number: endpoint,
            levelControl: dimmableLevelControlState(),
        });
        await serverNode.add(ep);
        return { endpoint: ep };
    },
});
