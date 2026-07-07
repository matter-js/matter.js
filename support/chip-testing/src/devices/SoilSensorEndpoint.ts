/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { Endpoint, ServerNode } from "@matter/main";
import { SoilSensorDevice } from "@matter/main/devices/soil-sensor";
import { EndpointNumber } from "@matter/main/types";
import { MeasurementType } from "@matter/types";
import { registerDeviceType } from "./DeviceTypeRegistry.js";

registerDeviceType({
    name: "soil-sensor",
    async create(serverNode: ServerNode, endpoint: EndpointNumber) {
        const ep = new Endpoint(SoilSensorDevice, {
            number: endpoint,
            soilMeasurement: {
                soilMoistureMeasurementLimits: {
                    measurementType: MeasurementType.SoilMoisture,
                    measured: true,
                    minMeasuredValue: 0,
                    maxMeasuredValue: 99,
                    accuracyRanges: [{ rangeMin: 0, rangeMax: 99, percentMax: 500 }],
                },
                soilMoistureMeasuredValue: 50,
            },
        });
        await serverNode.add(ep);
        return { endpoint: ep };
    },
});
