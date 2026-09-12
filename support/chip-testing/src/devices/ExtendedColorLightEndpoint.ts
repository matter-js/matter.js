/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { Endpoint, ServerNode } from "@matter/main";
import { ColorControlServer } from "@matter/main/behaviors";
import { ColorControl } from "@matter/main/clusters";
import { ExtendedColorLightDevice } from "@matter/main/devices/extended-color-light";
import { EndpointNumber } from "@matter/main/types";
import { colorLightState } from "./color-light.js";
import { registerDeviceType } from "./DeviceTypeRegistry.js";
import { dimmableLevelControlState } from "./dimmable-load.js";

// HueSaturation, EnhancedHue and ColorLoop are optional for this device type, and advertised so the endpoint
// exercises every colour representation the cluster can be asked to convert between
const ExtendedColorControlServer = ColorControlServer.with(
    ColorControl.Feature.Xy,
    ColorControl.Feature.ColorTemperature,
    ColorControl.Feature.HueSaturation,
    ColorControl.Feature.EnhancedHue,
    ColorControl.Feature.ColorLoop,
);

registerDeviceType({
    name: "extended-color-light",
    async create(serverNode: ServerNode, endpoint: EndpointNumber) {
        const ep = new Endpoint(ExtendedColorLightDevice.with(ExtendedColorControlServer), {
            number: endpoint,
            levelControl: dimmableLevelControlState(),
            colorControl: colorLightState(
                ColorControl.ColorMode.CurrentXAndCurrentY,
                ColorControl.EnhancedColorMode.CurrentXAndCurrentY,
            ),
        });
        await serverNode.add(ep);
        return { endpoint: ep };
    },
});
