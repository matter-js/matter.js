/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { ThermostatBehavior, ThermostatServer } from "#behaviors/thermostat";
import { ThermostatDevice } from "#devices/thermostat";
import { Endpoint } from "#endpoint/index.js";
import { Bytes, ImplementationError, MatterAggregateError } from "@matter/general";
import { MockServerNode } from "@matter/node/testing";
import { Thermostat } from "@matter/types/clusters/thermostat";
import { newPreset, PresetsThermostat, thermostatConfig } from "./preset-helpers.js";

const AutoThermo = ThermostatBehavior.with("Heating", "Cooling", "AutoMode");
const AutoThermoDevice = ThermostatDevice.with(ThermostatServer.with("Heating", "Cooling", "AutoMode"));

const USER_LIMITS = {
    minHeatSetpointLimit: 700,
    maxHeatSetpointLimit: 3000,
    minCoolSetpointLimit: 1600,
    maxCoolSetpointLimit: 3200,
};

async function createAutoThermo(overrides: Record<string, number> = {}, { userLimits = true } = {}) {
    const device = new Endpoint(AutoThermoDevice, {
        number: 1,
        thermostat: {
            controlSequenceOfOperation: Thermostat.ControlSequenceOfOperation.CoolingAndHeating,
            systemMode: Thermostat.SystemMode.Auto,
            absMinHeatSetpointLimit: 700,
            absMaxHeatSetpointLimit: 3000,
            absMinCoolSetpointLimit: 1600,
            absMaxCoolSetpointLimit: 3200,
            ...(userLimits ? USER_LIMITS : {}),
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

    describe("startup reconciliation", () => {
        it("pulls a heat limit back when the cool limit cannot keep the deadband, so setpoint writes succeed", async () => {
            const { node, device } = await createAutoThermo({
                maxHeatSetpointLimit: 3500,
                absMaxHeatSetpointLimit: 3500,
                minSetpointDeadBand: 0,
            });

            expect(device.state.thermostat.maxCoolSetpointLimit).equals(3200);
            expect(device.state.thermostat.maxHeatSetpointLimit).equals(3200);

            await device.set({ thermostat: { occupiedHeatingSetpoint: 2200 } });
            expect(device.state.thermostat.occupiedHeatingSetpoint).equals(2200);

            await node.close();
        });

        it("raises the cool limit when it can keep the deadband within its absolute limits", async () => {
            const { node, device } = await createAutoThermo({ minHeatSetpointLimit: 1500 });

            expect(device.state.thermostat.minHeatSetpointLimit).equals(1500);
            expect(device.state.thermostat.minCoolSetpointLimit).equals(1700);

            await node.close();
        });

        it("moves the cooling setpoint when the setpoints violate the deadband", async () => {
            const { node, device } = await createAutoThermo({
                occupiedHeatingSetpoint: 2100,
                occupiedCoolingSetpoint: 2200,
            });

            expect(device.state.thermostat.occupiedHeatingSetpoint).equals(2100);
            expect(device.state.thermostat.occupiedCoolingSetpoint).equals(2300);

            await node.close();
        });

        it("clamps a setpoint outside its limits and moves the cooling setpoint to keep the deadband", async () => {
            const { node, device } = await createAutoThermo({ occupiedHeatingSetpoint: 3100 });

            expect(device.state.thermostat.occupiedHeatingSetpoint).equals(3000);
            expect(device.state.thermostat.occupiedCoolingSetpoint).equals(3200);

            await node.close();
        });

        it("fails startup with the violated condition when the absolute limits leave no room for the deadband", async () => {
            const error = await createAutoThermo(
                {
                    absMinHeatSetpointLimit: 2900,
                    absMaxCoolSetpointLimit: 3000,
                    occupiedHeatingSetpoint: 2900,
                    occupiedCoolingSetpoint: 3000,
                },
                { userLimits: false },
            ).then(
                () => undefined,
                (error: unknown) => error,
            );

            const cause = error instanceof MatterAggregateError ? error.errors[0]?.cause : undefined;
            expect(cause).instanceOf(ImplementationError);
            expect(String(cause)).contains(
                "cannot be fixed: maxCoolSetpointLimit (3000) - maxHeatSetpointLimit (3000) is below the deadband (200); after adjusting,",
            );
        });

        it("clears the active preset when it adjusts a setpoint", async () => {
            const presetHandle = Bytes.fromHex("01");
            const device = new Endpoint(PresetsThermostat, {
                number: 1,
                thermostat: {
                    ...thermostatConfig(5, [newPreset({ presetHandle })]),
                    activePresetHandle: presetHandle,
                    occupiedHeatingSetpoint: 3100,
                },
            });
            const node = await MockServerNode.createOnline(undefined, { device });

            expect(device.state.thermostat.occupiedHeatingSetpoint).equals(2950);
            expect(device.state.thermostat.activePresetHandle).equals(null);

            await node.close();
        });
    });

    describe("startup limit validation", () => {
        it("accepts absolute limits narrower than the defaults without user limits", async () => {
            const device = new Endpoint(ThermostatDevice.with(ThermostatServer.with("Heating")), {
                number: 1,
                thermostat: {
                    controlSequenceOfOperation: Thermostat.ControlSequenceOfOperation.HeatingOnly,
                    systemMode: Thermostat.SystemMode.Heat,
                    absMinHeatSetpointLimit: 1000,
                    absMaxHeatSetpointLimit: 2500,
                    occupiedHeatingSetpoint: 2000,
                },
            });
            const node = await MockServerNode.createOnline(undefined, { device });

            expect(device.state.thermostat.minHeatSetpointLimit).equals(1000);
            expect(device.state.thermostat.maxHeatSetpointLimit).equals(2500);

            await node.close();
        });

        it("fails startup with an ImplementationError for unordered absolute limits", async () => {
            const error = await createAutoThermo({ absMinHeatSetpointLimit: 2500, absMaxHeatSetpointLimit: 2000 }).then(
                () => undefined,
                (error: unknown) => error,
            );

            const cause = error instanceof MatterAggregateError ? error.errors[0]?.cause : undefined;
            expect(cause).instanceOf(ImplementationError);
            expect(String(cause)).contains("absMinHeatSetpointLimit (2500) is above absMaxHeatSetpointLimit (2000)");
        });

        it("orders unordered user limits by raising the max limit", async () => {
            const { node, device } = await createAutoThermo({ minHeatSetpointLimit: 2000, maxHeatSetpointLimit: 1500 });

            expect(device.state.thermostat.minHeatSetpointLimit).equals(2000);
            expect(device.state.thermostat.maxHeatSetpointLimit).equals(2000);

            await node.close();
        });

        it("orders unordered cool user limits on a heating and cooling thermostat", async () => {
            const device = new Endpoint(ThermostatDevice.with(ThermostatServer.with("Heating", "Cooling")), {
                number: 1,
                thermostat: {
                    controlSequenceOfOperation: Thermostat.ControlSequenceOfOperation.CoolingAndHeating,
                    systemMode: Thermostat.SystemMode.Cool,
                    minCoolSetpointLimit: 2500,
                    maxCoolSetpointLimit: 2000,
                    occupiedHeatingSetpoint: 2000,
                    occupiedCoolingSetpoint: 2500,
                },
            });
            const node = await MockServerNode.createOnline(undefined, { device });

            expect(device.state.thermostat.minCoolSetpointLimit).equals(2500);
            expect(device.state.thermostat.maxCoolSetpointLimit).equals(2500);

            await node.close();
        });

        it("orders unordered cool user limits on a cooling-only thermostat", async () => {
            const device = new Endpoint(ThermostatDevice.with(ThermostatServer.with("Cooling")), {
                number: 1,
                thermostat: {
                    controlSequenceOfOperation: Thermostat.ControlSequenceOfOperation.CoolingOnly,
                    systemMode: Thermostat.SystemMode.Cool,
                    minCoolSetpointLimit: 2500,
                    maxCoolSetpointLimit: 2000,
                    occupiedCoolingSetpoint: 2500,
                },
            });
            const node = await MockServerNode.createOnline(undefined, { device });

            expect(device.state.thermostat.minCoolSetpointLimit).equals(2500);
            expect(device.state.thermostat.maxCoolSetpointLimit).equals(2500);

            await node.close();
        });

        it("pulls a user limit inside narrowed absolute limits", async () => {
            const { node, device } = await createAutoThermo({ absMaxHeatSetpointLimit: 2800 });

            expect(device.state.thermostat.maxHeatSetpointLimit).equals(2800);

            await node.close();
        });
    });

    describe("limit validation", () => {
        it("rejects an absolute limit change that leaves a user limit outside", async () => {
            const { node, device } = await createAutoThermo();

            await expect(device.set({ thermostat: { absMinHeatSetpointLimit: 1000 } })).rejectedWith(
                "absMinHeatSetpointLimit (1000) must be less than or equal to minHeatSetpointLimit (700)",
            );
            await expect(device.set({ thermostat: { absMaxCoolSetpointLimit: 3000 } })).rejectedWith(
                "maxCoolSetpointLimit (3200) must be less than or equal to absMaxCoolSetpointLimit (3000)",
            );

            await node.close();
        });

        it("rejects a user limit outside the absolute limits", async () => {
            const { node, device } = await createAutoThermo();

            await expect(device.set({ thermostat: { maxCoolSetpointLimit: 3300 } })).rejectedWith(
                "CoolSetpointLimit (3300) must be within absolute limits [1600, 3200]",
            );

            await node.close();
        });

        it("rejects setpoints outside the user limits", async () => {
            const { node, device } = await createAutoThermo({
                minHeatSetpointLimit: 1000,
                maxHeatSetpointLimit: 2800,
                maxCoolSetpointLimit: 3000,
            });

            await expect(device.set({ thermostat: { occupiedHeatingSetpoint: 900 } })).rejectedWith(
                "HeatOccupiedSetpoint (900) must be greater than or equal to minHeatSetpointLimit (1000)",
            );
            await expect(device.set({ thermostat: { occupiedCoolingSetpoint: 3100 } })).rejectedWith(
                "CoolOccupiedSetpoint (3100) must be less than or equal to maxCoolSetpointLimit (3000)",
            );

            await node.close();
        });
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

        it("pins the written limit back when the coupled limit cannot move within its absolute bounds", async () => {
            const { node, device } = await createAutoThermo({
                maxCoolSetpointLimit: 3000,
                absMaxCoolSetpointLimit: 3000,
                maxHeatSetpointLimit: 2800,
            });

            // Requested maxHeat=2900 would need maxCool=3100 > absMaxCool 3000; instead maxCool pins to 3000 and
            // maxHeat is pulled back to 2800 to preserve the deadband (CHIP FixUserLimitDeadband fallback).
            await device.set({ thermostat: { maxHeatSetpointLimit: 2900 } });

            expect(device.state.thermostat.maxCoolSetpointLimit).equals(3000);
            expect(device.state.thermostat.maxHeatSetpointLimit).equals(2800);

            await node.close();
        });

        it("rejects a limit write the fix leaves invalid, naming the violated condition", async () => {
            const { node, device } = await createAutoThermo({
                absMinHeatSetpointLimit: 1500,
                minHeatSetpointLimit: 1500,
                absMaxHeatSetpointLimit: 3200,
                minCoolSetpointLimit: 1700,
            });

            await expect(device.set({ thermostat: { minHeatSetpointLimit: 3050 } })).rejectedWith(
                "could not be reconciled within the configured limits: Heat setpoint limits [3050, 3000]",
            );

            await node.close();
        });

        it("nudges the coupled setpoint to preserve the deadband when a limit write clamps a setpoint", async () => {
            const { node, device } = await createAutoThermo({
                occupiedHeatingSetpoint: 1410,
                occupiedCoolingSetpoint: 1610,
            });

            // Lower maxCool onto minCool; the cooling setpoint clamps to 1600 and heating is nudged down to keep the
            // 200 deadband (CHIP FixRange).
            await device.set({ thermostat: { maxCoolSetpointLimit: 1600 } });

            const { occupiedCoolingSetpoint, occupiedHeatingSetpoint, maxCoolSetpointLimit } = device.state.thermostat;
            expect(maxCoolSetpointLimit).equals(1600);
            expect(occupiedCoolingSetpoint).lessThanOrEqual(1600);
            expect(occupiedCoolingSetpoint - occupiedHeatingSetpoint).greaterThanOrEqual(200);

            await node.close();
        });
    });
});
