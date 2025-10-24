/**
 * @license
 * Copyright 2022-2025 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

/*** THIS FILE IS GENERATED, DO NOT EDIT ***/

import { Resource } from "#models/Resource.js";

Resource.add({
    tag: "datatype", name: "MeasurementTypeEnum", xref: "cluster§2.1.3.1",

    children: [
        { tag: "field", name: "Voltage", description: "Voltage in millivolts (mV)" },
        { tag: "field", name: "ActiveCurrent", description: "Active current in milliamps (mA)" },
        { tag: "field", name: "ReactiveCurrent", description: "Reactive current in milliamps (mA)" },
        { tag: "field", name: "ApparentCurrent", description: "Apparent current in milliamps (mA)" },
        { tag: "field", name: "ActivePower", description: "Active power in milliwatts (mW)" },
        { tag: "field", name: "ReactivePower", description: "Reactive power in millivolt-amps reactive (mVAR)" },
        { tag: "field", name: "ApparentPower", description: "Apparent power in millivolt-amps (mVA)" },
        { tag: "field", name: "RmsVoltage", description: "Root mean squared voltage in millivolts (mV)" },
        { tag: "field", name: "RmsCurrent", description: "Root mean squared current in milliamps (mA)" },
        { tag: "field", name: "RmsPower", description: "Root mean squared power in milliwatts (mW)" },
        { tag: "field", name: "Frequency", description: "AC frequency in millihertz (mHz)" },
        { tag: "field", name: "PowerFactor", description: "Power Factor ratio in+/- 1/100ths of a percent." },
        { tag: "field", name: "NeutralCurrent", description: "AC neutral current in milliamps (mA)" },
        { tag: "field", name: "ElectricalEnergy", description: "Electrical energy in milliwatt-hours (mWh)" },
        { tag: "field", name: "ReactiveEnergy", description: "Reactive power in millivolt-amp-hours reactive (mVARh)" },
        { tag: "field", name: "ApparentEnergy", description: "Apparent power in millivolt-amp-hours (mVAh)" },
        { tag: "field", name: "SoilMoisture", description: "Soil moisture in percent" }
    ]
});
