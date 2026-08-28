/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { Endpoint, ServerNode } from "@matter/main";
import { IdentifyServer } from "@matter/main/behaviors/identify";
import { OnOffServer } from "@matter/main/behaviors/on-off";
import { OvenModeServer } from "@matter/main/behaviors/oven-mode";
import { TemperatureControlServer } from "@matter/main/behaviors/temperature-control";
import { OvenMode } from "@matter/main/clusters";
import { CookSurfaceDevice } from "@matter/main/devices/cook-surface";
import { OvenDevice } from "@matter/main/devices/oven";
import { TemperatureControlledCabinetDevice } from "@matter/main/devices/temperature-controlled-cabinet";
import { EndpointNumber } from "@matter/main/types";
import { registerDeviceType } from "./DeviceTypeRegistry.js";

// TemperatureControl values are in 0.01 °C (180 °C setpoint, 50–250 °C range).
const Cavity = TemperatureControlledCabinetDevice.with(
    IdentifyServer,
    TemperatureControlServer.with("TemperatureNumber"),
    OvenModeServer,
);
const Surface = CookSurfaceDevice.with(IdentifyServer, OnOffServer);

registerDeviceType({
    name: "oven",
    async create(serverNode: ServerNode, endpoint: EndpointNumber) {
        const ep = new Endpoint(OvenDevice, { number: endpoint });
        await serverNode.add(ep);

        await ep.add(
            new Endpoint(Cavity, {
                id: "cavity",
                temperatureControl: { temperatureSetpoint: 18000, minTemperature: 5000, maxTemperature: 25000 },
                ovenMode: {
                    supportedModes: [
                        { label: "Grill", mode: 1, modeTags: [{ value: OvenMode.ModeTag.Grill }] },
                        { label: "Bake", mode: 2, modeTags: [{ value: OvenMode.ModeTag.Bake }] },
                    ],
                    currentMode: 2,
                },
            }),
        );
        await ep.add(new Endpoint(Surface, { id: "surface" }));

        return { endpoint: ep };
    },
});
