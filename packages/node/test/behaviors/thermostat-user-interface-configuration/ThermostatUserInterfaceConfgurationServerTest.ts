/**
 * @license
 * Copyright 2022-2025 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { RoomAirConditionerDevice } from "#devices/room-air-conditioner";
import { MockServerNode } from "../../node/mock-server-node.js";

describe("ThermostatUserInterfaceConfigurationServer", () => {
    it("instantiates", async () => {
        await MockServerNode.create({ parts: [RoomAirConditionerDevice] });
    });
});
