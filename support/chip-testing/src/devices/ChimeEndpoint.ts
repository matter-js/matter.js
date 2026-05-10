/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { Endpoint, ServerNode } from "@matter/main";
import { ChimeDevice } from "@matter/main/devices/chime";
import { EndpointNumber } from "@matter/main/types";
import { registerDeviceType } from "./DeviceTypeRegistry.js";

registerDeviceType({
    name: "chime",
    async create(serverNode: ServerNode, endpoint: EndpointNumber) {
        const ep = new Endpoint(ChimeDevice, {
            number: endpoint,
            chime: {
                installedChimeSounds: [{ chimeId: 0, name: "Default" }],
                selectedChime: 0,
                enabled: true,
            },
        });
        await serverNode.add(ep);
        return { endpoint: ep };
    },
});
