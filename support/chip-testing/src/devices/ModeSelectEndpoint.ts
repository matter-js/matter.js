/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { Endpoint, ServerNode } from "@matter/main";
import { ModeSelectDevice } from "@matter/main/devices/mode-select";
import { EndpointNumber } from "@matter/main/types";
import { registerDeviceType } from "./DeviceTypeRegistry.js";

// No OnOff feature and no StartUpMode, as CHIP's all-devices-app does
registerDeviceType({
    name: "mode-select",
    async create(serverNode: ServerNode, endpoint: EndpointNumber) {
        const ep = new Endpoint(ModeSelectDevice, {
            number: endpoint,
            modeSelect: {
                description: "Mode Select Simulated Device",
                standardNamespace: null,
                supportedModes: [
                    { label: "Black", mode: 0, semanticTags: [] },
                    { label: "White", mode: 1, semanticTags: [] },
                    { label: "Red", mode: 2, semanticTags: [] },
                ],
                currentMode: 0,
            },
        });
        await serverNode.add(ep);
        return { endpoint: ep };
    },
});
