/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { CommonPositionTag, Endpoint, ServerNode } from "@matter/main";
import { DescriptorServer } from "@matter/main/behaviors/descriptor";
import { IdentifyServer } from "@matter/main/behaviors/identify";
import { OnOffServer } from "@matter/main/behaviors/on-off";
import { CookSurfaceDevice } from "@matter/main/devices/cook-surface";
import { CooktopDevice } from "@matter/main/devices/cooktop";
import { EndpointNumber } from "@matter/main/types";
import { registerDeviceType } from "./DeviceTypeRegistry.js";

// Two Cook Surface children share one parent and device type, so each carries a distinct
// position semantic tag (Left/Right) to disambiguate them per the device spec.
const CookSurface = CookSurfaceDevice.with(IdentifyServer, OnOffServer, DescriptorServer.with("TagList"));

registerDeviceType({
    name: "cooktop",
    async create(serverNode: ServerNode, endpoint: EndpointNumber) {
        const ep = new Endpoint(CooktopDevice, { number: endpoint });
        await serverNode.add(ep);

        await ep.add(new Endpoint(CookSurface, { id: "surface-1", descriptor: { tagList: [CommonPositionTag.Left] } }));
        await ep.add(
            new Endpoint(CookSurface, { id: "surface-2", descriptor: { tagList: [CommonPositionTag.Right] } }),
        );

        return { endpoint: ep };
    },
});
