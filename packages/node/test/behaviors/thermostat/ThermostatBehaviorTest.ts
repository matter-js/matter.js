/**
 * @license
 * Copyright 2022-2025 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { ThermostatBehavior } from "#behaviors/thermostat";
import { AttributeModel } from "#model";

const AutoThermo = ThermostatBehavior.with("Heating", "Cooling", "AutoMode");

describe("ThermostatBehavior", () => {
    it("has correct Thermostat-specific celsius defaults in schema", () => {
        const msd = AutoThermo.schema.get(AttributeModel, "MinSetpointDeadBand");
        expect(msd?.default).deep.equals({ type: "celsius", value: 2 });
    });

    it("has correct Thermostat-specific celsius defaults in cluster", () => {
        const msd = AutoThermo.cluster.attributes.minSetpointDeadBand.default;
        expect(msd).equals(20);
    });

    it("correctly specifies Thermostat-specific value in defaults", () => {
        const msd = AutoThermo.defaults.minSetpointDeadBand;
        expect(msd).equals(20);
    });
});
