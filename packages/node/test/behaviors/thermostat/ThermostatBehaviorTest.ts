/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { ThermostatBehavior, ThermostatServer } from "#behaviors/thermostat";
import { ThermostatDevice } from "#devices/thermostat";
import { Endpoint } from "#endpoint/index.js";
import { Thermostat } from "@matter/types/clusters/thermostat";
import { MockServerNode } from "../../node/mock-server-node.js";

const AutoThermo = ThermostatBehavior.with("Heating", "Cooling", "AutoMode");
const AutoThermoDevice = ThermostatDevice.with(ThermostatServer.with("Heating", "Cooling", "AutoMode"));

async function createAutoThermo(overrides: Record<string, number> = {}) {
    const device = new Endpoint(AutoThermoDevice, {
        number: 1,
        thermostat: {
            controlSequenceOfOperation: Thermostat.ControlSequenceOfOperation.CoolingAndHeating,
            systemMode: Thermostat.SystemMode.Auto,
            absMinHeatSetpointLimit: 700,
            minHeatSetpointLimit: 700,
            maxHeatSetpointLimit: 3000,
            absMaxHeatSetpointLimit: 3000,
            absMinCoolSetpointLimit: 1600,
            minCoolSetpointLimit: 1600,
            maxCoolSetpointLimit: 3200,
            absMaxCoolSetpointLimit: 3200,
            occupiedHeatingSetpoint: 2000,
            occupiedCoolingSetpoint: 2600,
            minSetpointDeadBand: 20,
            ...overrides,
        },
    });
    const node = await MockServerNode.createOnline(undefined, { device });
    return { node, device };
}

describe("ThermostatBehavior", () => {
    it("has correct Thermostat-specific celsius defaults in schema", () => {
        const msd = AutoThermo.schema.attributes("MinSetpointDeadBand");
        expect(msd?.default).deep.equals({ type: "celsius", value: 2 });
    });

    it("correctly specifies Thermostat-specific value in defaults", () => {
        const msd = AutoThermo.defaults.minSetpointDeadBand;
        expect(msd).equals(20);
    });

    describe("AutoMode limit deadband", () => {
        it("raises the coupled cool limit when a heat min limit write would violate the deadband", async () => {
            const { node, device } = await createAutoThermo();

            // minCool - deadband = 1600 - 200 = 1400; write 10 above so it conflicts
            await device.set({ thermostat: { minHeatSetpointLimit: 1410 } });

            expect(device.state.thermostat.minHeatSetpointLimit).equals(1410);
            expect(device.state.thermostat.minCoolSetpointLimit).equals(1610);

            await node.close();
        });

        it("lowers the coupled heat limit when a cool max limit write would violate the deadband", async () => {
            const { node, device } = await createAutoThermo();

            // maxHeat + deadband = 3000 + 200 = 3200; write 10 below so it conflicts
            await device.set({ thermostat: { maxCoolSetpointLimit: 3190 } });

            expect(device.state.thermostat.maxCoolSetpointLimit).equals(3190);
            expect(device.state.thermostat.maxHeatSetpointLimit).equals(2990);

            await node.close();
        });

        it("does not adjust when the write already satisfies the deadband", async () => {
            const { node, device } = await createAutoThermo();

            await device.set({ thermostat: { minHeatSetpointLimit: 1000 } });

            expect(device.state.thermostat.minHeatSetpointLimit).equals(1000);
            expect(device.state.thermostat.minCoolSetpointLimit).equals(1600);

            await node.close();
        });

        it("raises the coupled max limit when a min limit is written above it (ordering repair)", async () => {
            const { node, device } = await createAutoThermo({
                minHeatSetpointLimit: 700,
                maxHeatSetpointLimit: 710,
                occupiedHeatingSetpoint: 700,
                occupiedCoolingSetpoint: 1600,
            });

            await device.set({ thermostat: { minHeatSetpointLimit: 1000 } });

            expect(device.state.thermostat.minHeatSetpointLimit).equals(1000);
            expect(device.state.thermostat.maxHeatSetpointLimit).equals(1000);

            await node.close();
        });

        it("clamps a setpoint back inside the limits when a limit write crosses it", async () => {
            const { node, device } = await createAutoThermo({
                occupiedHeatingSetpoint: 1400,
                occupiedCoolingSetpoint: 1650,
            });

            // Raise minCool above the current cooling setpoint (1650)
            await device.set({ thermostat: { minCoolSetpointLimit: 1700 } });

            expect(device.state.thermostat.minCoolSetpointLimit).equals(1700);
            expect(device.state.thermostat.occupiedCoolingSetpoint).equals(1700);

            await node.close();
        });

        it("rejects when the coupled limit cannot be moved within its absolute bounds", async () => {
            const { node, device } = await createAutoThermo({
                maxCoolSetpointLimit: 3000,
                absMaxCoolSetpointLimit: 3000,
                maxHeatSetpointLimit: 2800,
            });

            // requiredCool = 2900 + 200 = 3100 > absMaxCool 3000 -> unresolvable
            await expect(device.set({ thermostat: { maxHeatSetpointLimit: 2900 } })).rejectedWith(
                /ConstraintError|deadband|absMaxCool/i,
            );

            expect(device.state.thermostat.maxHeatSetpointLimit).equals(2800);

            await node.close();
        });
    });
});
