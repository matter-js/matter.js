/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { Endpoint } from "@matter/main";
import { MountedDimmableLoadControlDevice } from "@matter/main/devices/mounted-dimmable-load-control";
import { EndpointNumber } from "@matter/main/types";
import { TEST_SCENE_TABLE_SIZE } from "../cluster/scene-table.js";
import { registerDeviceType } from "./DeviceTypeRegistry.js";
import { DimmableLevelControlServer, dimmableLevelControlState } from "./dimmable-load.js";

registerDeviceType({
    name: "mounted-dimmable-load-control",
    async create(parent: Endpoint, endpoint: EndpointNumber) {
        const ep = new Endpoint(MountedDimmableLoadControlDevice.with(DimmableLevelControlServer), {
            number: endpoint,
            scenesManagement: { sceneTableSize: TEST_SCENE_TABLE_SIZE },
            levelControl: dimmableLevelControlState(),
        });
        await parent.add(ep);
        return { endpoint: ep };
    },
});
