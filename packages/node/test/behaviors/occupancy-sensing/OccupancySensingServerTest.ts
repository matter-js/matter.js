/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { OccupancySensingServer } from "#behaviors/occupancy-sensing";
import { OccupancySensing } from "#clusters/occupancy-sensing";
import { Val } from "@matter/protocol";
import { MockEndpoint } from "../../endpoint/mock-endpoint.js";

describe("OccupancySensingServer", () => {
    it("instantiates", async () => {
        await MockEndpoint.createWith(
            OccupancySensingServer.with("Radar").set({ occupancySensorType: OccupancySensing.OccupancySensorType.Pir }),
        );
    });

    it("chooses correct defaults", async () => {
        const endpoint = await MockEndpoint.createWith(
            OccupancySensingServer.with("Radar").set({ occupancySensorType: OccupancySensing.OccupancySensorType.Pir }),
        );

        expect((endpoint.state.occupancySensing as Val.Struct).pirUnoccupiedToOccupiedThreshold).undefined;
    });
});
