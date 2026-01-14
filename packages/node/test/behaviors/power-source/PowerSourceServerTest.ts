/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { PowerSourceServer } from "#behaviors/power-source";
import { PowerSource } from "#clusters/power-source";
import { HumiditySensorDevice } from "#devices/humidity-sensor";
import { PowerSourceDt } from "#model";
import { MockEndpoint } from "../../endpoint/mock-endpoint.js";
import { MockServerNode } from "../../node/mock-server-node.js";

describe("PowerSourceServer", () => {
    it("successfully augments descriptor", async () => {
        const node = new MockServerNode();
        const sensor = new MockEndpoint(
            HumiditySensorDevice.with(
                PowerSourceServer.with(PowerSource.Feature.Battery, PowerSource.Feature.Replaceable).set({
                    status: PowerSource.PowerSourceStatus.Active,
                    order: 1,
                    description: "aa batteries",
                    batChargeLevel: PowerSource.BatChargeLevel.Ok,
                    batReplacementNeeded: false,
                    batReplaceability: PowerSource.BatReplaceability.UserReplaceable,
                    batReplacementDescription: "open, replace",
                    batQuantity: 2,
                }),
            ),
            { owner: node },
        );
        await node.add(sensor);
        expect(sensor.state.descriptor.deviceTypeList).deep.equals([
            { deviceType: HumiditySensorDevice.deviceType, revision: HumiditySensorDevice.deviceRevision },
            { deviceType: PowerSourceDt.id, revision: PowerSourceDt.revision },
        ]);
    });
});
