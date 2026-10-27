/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { Endpoint, ServerNode } from "@matter/main";
import { ThermostatUserInterfaceConfigurationServer } from "@matter/main/behaviors/thermostat-user-interface-configuration";
import { ThermostatUserInterfaceConfiguration } from "@matter/main/clusters";
import { TemperatureSensorDevice } from "@matter/main/devices/temperature-sensor";
import { EndpointNumber } from "@matter/main/types";
import { registerDeviceType } from "./DeviceTypeRegistry.js";

const TemperatureSensor = TemperatureSensorDevice.with(ThermostatUserInterfaceConfigurationServer);

registerDeviceType({
    name: "temperature-sensor",
    async create(serverNode: ServerNode, endpoint: EndpointNumber) {
        const ep = new Endpoint(TemperatureSensor, {
            number: endpoint,
            temperatureMeasurement: { measuredValue: 2500, minMeasuredValue: -5000, maxMeasuredValue: 10000 },
            thermostatUserInterfaceConfiguration: {
                scheduleProgrammingVisibility:
                    ThermostatUserInterfaceConfiguration.ScheduleProgrammingVisibility.ScheduleProgrammingPermitted,
            },
        });
        await serverNode.add(ep);
        return { endpoint: ep };
    },
});
