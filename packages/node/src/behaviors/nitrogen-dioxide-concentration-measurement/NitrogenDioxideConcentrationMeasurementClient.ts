/**
 * @license
 * Copyright 2022-2025 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

/*** THIS FILE IS GENERATED, DO NOT EDIT ***/

import { NitrogenDioxideConcentrationMeasurement } from "#clusters/nitrogen-dioxide-concentration-measurement";
import { ClientBehavior } from "../../behavior/cluster/ClientBehavior.js";
import { Identity } from "#general";

export const NitrogenDioxideConcentrationMeasurementClientConstructor = ClientBehavior(
    NitrogenDioxideConcentrationMeasurement.Complete
);
export interface NitrogenDioxideConcentrationMeasurementClient extends InstanceType<typeof NitrogenDioxideConcentrationMeasurementClientConstructor> {}
export interface NitrogenDioxideConcentrationMeasurementClientConstructor extends Identity<typeof NitrogenDioxideConcentrationMeasurementClientConstructor> {}
export const NitrogenDioxideConcentrationMeasurementClient: NitrogenDioxideConcentrationMeasurementClientConstructor = NitrogenDioxideConcentrationMeasurementClientConstructor;
