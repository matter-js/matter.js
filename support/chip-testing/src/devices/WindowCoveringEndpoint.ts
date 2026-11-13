/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { Endpoint } from "@matter/main";
import { WindowCovering } from "@matter/main/clusters/window-covering";
import { WindowCoveringDevice } from "@matter/main/devices/window-covering";
import { EndpointNumber } from "@matter/main/types";
import { TestWindowCoveringServer } from "../cluster/TestWindowCoveringServer.js";
import { registerDeviceType } from "./DeviceTypeRegistry.js";

registerDeviceType({
    name: "window-covering",
    async create(parent: Endpoint, endpoint: EndpointNumber) {
        const ep = new Endpoint(WindowCoveringDevice.with(TestWindowCoveringServer), {
            number: endpoint,
            windowCovering: {
                type: WindowCovering.WindowCoveringType.TiltBlindLift,
                endProductType: WindowCovering.EndProductType.InteriorVenetianBlind,
                currentPositionLiftPercent100ths: 0,
                currentPositionTiltPercent100ths: 0,
                safetyStatus: {},
                numberOfActuationsLift: 0,
                numberOfActuationsTilt: 0,
                currentPositionLiftPercentage: 0,
                currentPositionTiltPercentage: 0,
            },
        });
        await parent.add(ep);
        return { endpoint: ep };
    },
});
