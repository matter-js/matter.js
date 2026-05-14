/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { ChimeClient } from "#behaviors/chime";
import { OccupancySensingClient } from "#behaviors/occupancy-sensing";
import { DimmerSwitchDevice } from "#devices/dimmer-switch";
import { DoorbellDevice } from "#devices/doorbell";
import { OnOffLightDevice } from "#devices/on-off-light";
import { TemperatureSensorDevice } from "#devices/temperature-sensor";
import { Identify } from "@matter/types/clusters/identify";
import { MockEndpoint } from "../../endpoint/mock-endpoint.js";

describe("DescriptorServer clientList", () => {
    it("is empty when no client clusters declared", async () => {
        const device = await MockEndpoint.create(TemperatureSensorDevice);
        expect(device.state.descriptor.clientList).deep.equals([]);
    });

    it("includes explicit .with(<Client>) entries", async () => {
        const device = await MockEndpoint.create(OnOffLightDevice.with(OccupancySensingClient));
        expect(device.state.descriptor.clientList).contains(OccupancySensingClient.cluster.id);
    });

    it("includes auto-merged mandatory client clusters (Doorbell -> Chime)", async () => {
        const device = await MockEndpoint.create(DoorbellDevice);
        expect(device.state.descriptor.clientList).contains(ChimeClient.cluster.id);
    });

    it("lists same cluster id in both serverList and clientList (dimmer-switch / Identify)", async () => {
        const device = await MockEndpoint.create(DimmerSwitchDevice);
        expect(device.state.descriptor.serverList).contains(Identify.id);
        expect(device.state.descriptor.clientList).contains(Identify.id);
    });
});
