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

// The device type omits the mandatory SmokeCoAlarm cluster by default since features must be chosen.
// SmokeCoAlarmServer's default enables both SmokeAlarm and CoAlarm, matching CHIP's all-devices-app.
const SmokeCoAlarm = SmokeCoAlarmDevice.with(SmokeCoAlarmServer);

registerDeviceType({
    name: "smoke-co-alarm",
    async create(serverNode: ServerNode, endpoint: EndpointNumber) {
        const ep = new Endpoint(SmokeCoAlarm, { number: endpoint });
        await serverNode.add(ep);
        return { endpoint: ep };
    },
});
