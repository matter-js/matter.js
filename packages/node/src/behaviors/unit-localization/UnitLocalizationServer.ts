/**
 * @license
 * Copyright 2022-2025 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { UnitLocalization } from "#clusters/unit-localization";
import { MaybePromise } from "#general";
import { UnitLocalizationBehavior } from "./UnitLocalizationBehavior.js";

/**
 * This is the default server implementation of {@link UnitLocalizationBehavior}.
 */
export class UnitLocalizationServer extends UnitLocalizationBehavior.with("TemperatureUnit") {
    override initialize(): MaybePromise {
        if (this.state.temperatureUnit === undefined) {
            this.state.temperatureUnit = UnitLocalization.TempUnit.Celsius;
        }
        if (!this.state.supportedTemperatureUnits?.length) {
            this.state.supportedTemperatureUnits = [
                UnitLocalization.TempUnit.Celsius,
                UnitLocalization.TempUnit.Fahrenheit,
            ];
        }
    }
}
