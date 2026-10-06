/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { Endpoint, ServerNode } from "@matter/main";
import { SmokeCoAlarmServer } from "@matter/main/behaviors/smoke-co-alarm";
import { SmokeCoAlarmDevice } from "@matter/main/devices/smoke-co-alarm";
import { EndpointNumber } from "@matter/main/types";
import { registerDeviceType } from "./DeviceTypeRegistry.js";

// The device type leaves out the mandatory SmokeCoAlarm cluster because its features must be chosen. This device
// selects both features, as CHIP's all-devices-app does
const SmokeCoAlarm = SmokeCoAlarmDevice.with(SmokeCoAlarmServer.with("SmokeAlarm", "CoAlarm"));

registerDeviceType({
    name: "smoke-co-alarm",
    async create(serverNode: ServerNode, endpoint: EndpointNumber) {
        const ep = new Endpoint(SmokeCoAlarm, { number: endpoint });
        await serverNode.add(ep);
        return { endpoint: ep };
    },
});
