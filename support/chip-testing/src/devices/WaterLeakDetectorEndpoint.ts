/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { Endpoint, ServerNode } from "@matter/main";
import { BooleanStateServer } from "@matter/main/behaviors";
import { WaterLeakDetectorDevice } from "@matter/main/devices/water-leak-detector";
import { EndpointNumber } from "@matter/main/types";
import { BackchannelCommand } from "@matter/testing";
import { registerDeviceType } from "./DeviceTypeRegistry.js";

registerDeviceType({
    name: "water-leak-detector",
    async create(serverNode: ServerNode, endpoint: EndpointNumber) {
        const ep = new Endpoint(WaterLeakDetectorDevice, {
            number: endpoint,
            booleanState: { stateValue: false },
        });
        await serverNode.add(ep);
        return {
            endpoint: ep,
            async handleBackchannel(command: BackchannelCommand) {
                if (command.name !== "setBooleanState") return;
                if ("endpointId" in command && command.endpointId !== endpoint) return;
                await ep.setStateOf(BooleanStateServer, { stateValue: !!command.newState });
                return true;
            },
        };
    },
});
