/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { Endpoint, ServerNode } from "@matter/main";
import { IdentifyServer } from "@matter/main/behaviors/identify";
import { FanControl } from "@matter/main/clusters";
import { ExtractorHoodDevice } from "@matter/main/devices/extractor-hood";
import { EndpointNumber } from "@matter/main/types";
import { registerDeviceType } from "./DeviceTypeRegistry.js";

const ExtractorHood = ExtractorHoodDevice.with(IdentifyServer);

registerDeviceType({
    name: "extractor-hood",
    async create(serverNode: ServerNode, endpoint: EndpointNumber) {
        // FanModeSequence has no default in the base FanControl server, so seed the mandatory attribute.
        const ep = new Endpoint(ExtractorHood, {
            number: endpoint,
            fanControl: { fanModeSequence: FanControl.FanModeSequence.OffLowMedHigh },
        });
        await serverNode.add(ep);
        return { endpoint: ep };
    },
});
