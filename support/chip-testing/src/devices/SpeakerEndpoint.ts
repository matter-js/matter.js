/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { Endpoint, ServerNode } from "@matter/main";
import { SpeakerDevice } from "@matter/main/devices/speaker";
import { EndpointNumber } from "@matter/main/types";
import { registerDeviceType } from "./DeviceTypeRegistry.js";

registerDeviceType({
    name: "speaker",
    async create(serverNode: ServerNode, endpoint: EndpointNumber) {
        const ep = new Endpoint(SpeakerDevice, { number: endpoint });
        await serverNode.add(ep);
        return { endpoint: ep };
    },
});
