/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { Endpoint, ServerNode } from "@matter/main";
import { SwitchServer } from "@matter/main/behaviors/switch";
import { GenericSwitchDevice } from "@matter/main/devices/generic-switch";
import { EndpointNumber } from "@matter/main/types";
import { registerDeviceType } from "./DeviceTypeRegistry.js";

// LatchingSwitch and the MomentarySwitch features are mutually exclusive; CHIP's all-devices-app
// configures this device type as a latching switch.
const GenericSwitch = GenericSwitchDevice.with(SwitchServer.with("LatchingSwitch"));

registerDeviceType({
    name: "generic-switch",
    async create(serverNode: ServerNode, endpoint: EndpointNumber) {
        const ep = new Endpoint(GenericSwitch, { number: endpoint });
        await serverNode.add(ep);
        return { endpoint: ep };
    },
});
