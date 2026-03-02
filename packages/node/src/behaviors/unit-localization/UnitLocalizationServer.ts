/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { MaybePromise } from "@matter/general";
import { UnitLocalization } from "@matter/types/clusters/unit-localization";
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
