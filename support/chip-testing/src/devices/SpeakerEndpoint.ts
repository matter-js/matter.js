/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { Endpoint } from "@matter/main";
import { SpeakerDevice } from "@matter/main/devices/speaker";
import { EndpointNumber } from "@matter/main/types";
import { registerDeviceType } from "./DeviceTypeRegistry.js";
import { DimmableLevelControlServer, dimmableLevelControlState } from "./dimmable-load.js";

const Speaker = SpeakerDevice.with(DimmableLevelControlServer);

registerDeviceType({
    name: "speaker",
    async create(parent: Endpoint, endpoint: EndpointNumber) {
        const ep = new Endpoint(Speaker, {
            number: endpoint,
            onOff: { onOff: true },
            levelControl: dimmableLevelControlState(),
        });
        await parent.add(ep);
        return { endpoint: ep };
    },
});
