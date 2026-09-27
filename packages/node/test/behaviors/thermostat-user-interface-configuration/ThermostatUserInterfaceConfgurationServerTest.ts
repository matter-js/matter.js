/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { RoomAirConditionerDevice } from "#devices/room-air-conditioner";
import { MockServerNode } from "@matter/node/testing";

describe("ThermostatUserInterfaceConfigurationServer", () => {
    it("instantiates", async () => {
        await MockServerNode.create({ parts: [RoomAirConditionerDevice] });
    });
});
