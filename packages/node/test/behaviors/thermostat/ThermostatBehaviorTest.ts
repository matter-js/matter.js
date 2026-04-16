/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { ThermostatBehavior } from "#behaviors/thermostat";

const AutoThermo = ThermostatBehavior.with("Heating", "Cooling", "AutoMode");

describe("ThermostatBehavior", () => {
    it("has correct Thermostat-specific celsius defaults in schema", () => {
        const msd = AutoThermo.schema.attributes("MinSetpointDeadBand");
        expect(msd?.default).deep.equals({ type: "celsius", value: 2 });
    });

    it("correctly specifies Thermostat-specific value in defaults", () => {
        const msd = AutoThermo.defaults.minSetpointDeadBand;
        expect(msd).equals(20);
    });
});
