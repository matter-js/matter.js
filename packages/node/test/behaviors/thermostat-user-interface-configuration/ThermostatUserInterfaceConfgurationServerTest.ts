/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { ThermostatUserInterfaceConfigurationServer } from "#behaviors/thermostat-user-interface-configuration";
import { RoomAirConditionerDevice } from "#devices/room-air-conditioner";
import { TemperatureSensorDevice } from "#devices/temperature-sensor";
import { Endpoint } from "#endpoint/Endpoint.js";
import { Environment, MockStorageService, StorageService } from "@matter/general";
import { MockServerNode } from "@matter/node/testing";
import { ThermostatUserInterfaceConfiguration } from "@matter/types/clusters/thermostat-user-interface-configuration";

const { KeypadLockout } = ThermostatUserInterfaceConfiguration;

function sensor(keypadLockout?: ThermostatUserInterfaceConfiguration.KeypadLockout) {
    return new Endpoint(TemperatureSensorDevice.with(ThermostatUserInterfaceConfigurationServer), {
        id: "sensor",
        ...(keypadLockout === undefined ? {} : { thermostatUserInterfaceConfiguration: { keypadLockout } }),
    });
}

describe("ThermostatUserInterfaceConfigurationServer", () => {
    it("instantiates", async () => {
        await using _node = await MockServerNode.create({ parts: [RoomAirConditionerDevice] });
    });

    it("defaults KeypadLockout to NoLockout", async () => {
        const device = sensor();
        await using _node = await MockServerNode.createOnline(MockServerNode.RootEndpoint, { device });

        expect(device.state.thermostatUserInterfaceConfiguration.keypadLockout).equals(KeypadLockout.NoLockout);
    });

    it("keeps a configured KeypadLockout", async () => {
        const device = sensor(KeypadLockout.Lockout2);
        await using _node = await MockServerNode.createOnline(MockServerNode.RootEndpoint, { device });

        expect(device.state.thermostatUserInterfaceConfiguration.keypadLockout).equals(KeypadLockout.Lockout2);
    });

    it("keeps a written KeypadLockout across a restart", async () => {
        const environment = new Environment("test");
        environment.set(StorageService, new MockStorageService(environment));

        {
            const device = sensor();
            await using _node = await MockServerNode.createOnline(MockServerNode.RootEndpoint, {
                id: "thermostat",
                device,
                environment,
            });
            await device.set({ thermostatUserInterfaceConfiguration: { keypadLockout: KeypadLockout.Lockout5 } });
        }

        {
            const device = sensor();
            await using _node = await MockServerNode.createOnline(MockServerNode.RootEndpoint, {
                id: "thermostat",
                device,
                environment,
            });

            expect(device.state.thermostatUserInterfaceConfiguration.keypadLockout).equals(KeypadLockout.Lockout5);
        }
    });
});
