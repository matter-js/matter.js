/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { Logger, MaybePromise } from "@matter/general";
import { UnitLocalization } from "@matter/types/clusters/unit-localization";
import { UnitLocalizationBehavior } from "./UnitLocalizationBehavior.js";

const logger = Logger.get("UnitLocalizationServer");

/**
 * This is the default server implementation of {@link UnitLocalizationBehavior}.
 */
export class UnitLocalizationServer extends UnitLocalizationBehavior.with("TemperatureUnit") {
    override initialize(): MaybePromise {
        if (!this.state.supportedTemperatureUnits?.length) {
            this.state.supportedTemperatureUnits = [
                UnitLocalization.TempUnit.Celsius,
                UnitLocalization.TempUnit.Fahrenheit,
            ];
        }
        const { temperatureUnit, supportedTemperatureUnits } = this.state;
        if (temperatureUnit !== undefined && supportedTemperatureUnits.includes(temperatureUnit)) {
            return;
        }

        const unit = supportedTemperatureUnits.includes(UnitLocalization.TempUnit.Celsius)
            ? UnitLocalization.TempUnit.Celsius
            : supportedTemperatureUnits[0];
        if (temperatureUnit !== undefined) {
            logger.warn(
                `Temperature unit ${UnitLocalization.TempUnit[temperatureUnit]} is not in supportedTemperatureUnits, using ${UnitLocalization.TempUnit[unit]}`,
            );
        }
        this.state.temperatureUnit = unit;
    }
}
