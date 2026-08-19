/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { Endpoint, ServerNode } from "@matter/main";
import { SpeakerDevice } from "@matter/main/devices/speaker";
import { EndpointNumber } from "@matter/main/types";
import { TestLevelControlServer } from "../cluster/TestLevelControlServer.js";
import { registerDeviceType } from "./DeviceTypeRegistry.js";

// The LevelControl tests read the Lighting attributes, which the Speaker device type does not require.  Chip's
// all-devices-app enables them on its speaker for the same reason.
const Speaker = SpeakerDevice.with(TestLevelControlServer.with("OnOff", "Lighting"));

registerDeviceType({
    name: "speaker",
    async create(serverNode: ServerNode, endpoint: EndpointNumber) {
        const ep = new Endpoint(Speaker, {
            number: endpoint,
            onOff: { onOff: true },
            levelControl: {
                currentLevel: 100,
                minLevel: 1,
                maxLevel: 0xfe,
                options: {},
                onLevel: 0x50,
                onOffTransitionTime: 0,
                onTransitionTime: 0,
                offTransitionTime: 0,
                defaultMoveRate: null,
                remainingTime: 0,
                startUpCurrentLevel: null,
                managedTransitionTimeHandling: true,
            },
        });
        await serverNode.add(ep);
        return { endpoint: ep };
    },
});
