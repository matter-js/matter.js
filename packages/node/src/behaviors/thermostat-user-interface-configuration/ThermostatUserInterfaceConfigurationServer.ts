/**
 * @license
 * Copyright 2022-2025 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

/*** THIS FILE WILL BE REGENERATED IF YOU DO NOT REMOVE THIS MESSAGE ***/

import { UnitLocalizationServer } from "#behaviors/unit-localization";
import { ThermostatUserInterfaceConfiguration } from "@matter/types/clusters/thermostat-user-interface-configuration";
import { UnitLocalization } from "@matter/types/clusters/unit-localization";
import { ThermostatUserInterfaceConfigurationBehavior } from "./ThermostatUserInterfaceConfigurationBehavior.js";

/**
 * This is the default server implementation of {@link ThermostatUserInterfaceConfigurationBehavior}.
 */
export class ThermostatUserInterfaceConfigurationServer extends ThermostatUserInterfaceConfigurationBehavior {
    override initialize() {
        // Set default temperature display based on UnitLocalization, falling back to Celsius
        if (this.state.temperatureDisplayMode === undefined) {
            let temperatureDisplayMode;
            if (this.agent.has(UnitLocalizationServer)) {
                const unitLocalization = this.agent.get(UnitLocalizationServer);
                if (unitLocalization.state.temperatureUnit === UnitLocalization.TempUnit.Fahrenheit) {
                    temperatureDisplayMode = ThermostatUserInterfaceConfiguration.TemperatureDisplayMode.Fahrenheit;
                }
            }
            this.state.temperatureDisplayMode =
                temperatureDisplayMode ?? ThermostatUserInterfaceConfiguration.TemperatureDisplayMode.Celsius;
        }

        this.state.keypadLockout = ThermostatUserInterfaceConfiguration.KeypadLockout.NoLockout;
    }
}
