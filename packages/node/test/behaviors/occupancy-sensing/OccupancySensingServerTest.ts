/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { OccupancySensingServer } from "#behaviors/occupancy-sensing";
import { OccupancySensorDevice } from "#devices/occupancy-sensor";
import { MockServerNode } from "@matter/node/testing";
import { Val } from "@matter/protocol";
import { OccupancySensing } from "@matter/types/clusters/occupancy-sensing";
import { MockEndpoint } from "../../endpoint/mock-endpoint.js";

// Detector-type and OccupancyEvent features are selected explicitly.
const PirOccupancySensing = OccupancySensingServer.with("PassiveInfrared", "OccupancyEvent");
const PirOccupancySensor = OccupancySensorDevice.with(PirOccupancySensing);

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

    it("emits OccupancyChanged when occupancy changes and the OccupancyEvent feature is enabled", async () => {
        const node = await MockServerNode.createOnline();
        const ep = await node.add(PirOccupancySensor, {
            occupancySensing: {
                occupancySensorType: OccupancySensing.OccupancySensorType.Pir,
                occupancy: { occupied: false },
            },
        });

        const emitted = new Array<OccupancySensing.Occupancy>();
        const occupancyChanged = ep.eventsOf(PirOccupancySensing).occupancyChanged;
        expect(occupancyChanged).not.equals(undefined);
        occupancyChanged?.on(({ occupancy }) => {
            emitted.push(occupancy);
        });

        await ep.act("change", agent => {
            agent.get(PirOccupancySensing).state.occupancy = { occupied: true };
        });

        expect(emitted).deep.equals([{ occupied: true }]);
    });
});
