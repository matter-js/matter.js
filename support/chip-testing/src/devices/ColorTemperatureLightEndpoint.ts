/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { Endpoint, ServerNode } from "@matter/main";
import { ColorControl } from "@matter/main/clusters";
import { ColorTemperatureLightDevice } from "@matter/main/devices/color-temperature-light";
import { EndpointNumber } from "@matter/main/types";
import { colorLightState } from "./color-light.js";
import { registerDeviceType } from "./DeviceTypeRegistry.js";
import { dimmableLevelControlState } from "./dimmable-load.js";

registerDeviceType({
    name: "color-temperature-light",
    async create(serverNode: ServerNode, endpoint: EndpointNumber) {
        const ep = new Endpoint(ColorTemperatureLightDevice, {
            number: endpoint,
            levelControl: dimmableLevelControlState(),
            colorControl: colorLightState(
                ColorControl.ColorMode.ColorTemperatureMireds,
                ColorControl.EnhancedColorMode.ColorTemperatureMireds,
            ),
        });
        await serverNode.add(ep);
        return { endpoint: ep };
    },
});
