/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { Endpoint } from "@matter/main";
import { ColorControl } from "@matter/main/clusters";
import { ColorTemperatureLightDevice } from "@matter/main/devices/color-temperature-light";
import { EndpointNumber } from "@matter/main/types";
import { TEST_SCENE_TABLE_SIZE } from "../cluster/scene-table.js";
import { colorLightState } from "./color-light.js";
import { registerDeviceType } from "./DeviceTypeRegistry.js";
import { dimmableLevelControlState } from "./dimmable-load.js";

registerDeviceType({
    name: "color-temperature-light",
    async create(parent: Endpoint, endpoint: EndpointNumber) {
        const ep = new Endpoint(ColorTemperatureLightDevice, {
            number: endpoint,
            scenesManagement: { sceneTableSize: TEST_SCENE_TABLE_SIZE },
            levelControl: dimmableLevelControlState(),
            colorControl: colorLightState(
                ColorControl.ColorMode.ColorTemperatureMireds,
                ColorControl.EnhancedColorMode.ColorTemperatureMireds,
            ),
        });
        await parent.add(ep);
        return { endpoint: ep };
    },
});
