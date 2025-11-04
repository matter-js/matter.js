/**
 * @license
 * Copyright 2022-2025 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

/*** THIS FILE IS GENERATED, DO NOT EDIT ***/

import {
    TotalVolatileOrganicCompoundsConcentrationMeasurement
} from "#clusters/total-volatile-organic-compounds-concentration-measurement";
import { ClientBehavior } from "../../behavior/cluster/ClientBehavior.js";
import { Identity } from "#general";

export const TotalVolatileOrganicCompoundsConcentrationMeasurementClientConstructor = ClientBehavior(
    TotalVolatileOrganicCompoundsConcentrationMeasurement.Complete
);
export interface TotalVolatileOrganicCompoundsConcentrationMeasurementClient extends InstanceType<typeof TotalVolatileOrganicCompoundsConcentrationMeasurementClientConstructor> {}
export interface TotalVolatileOrganicCompoundsConcentrationMeasurementClientConstructor extends Identity<typeof TotalVolatileOrganicCompoundsConcentrationMeasurementClientConstructor> {}
export const TotalVolatileOrganicCompoundsConcentrationMeasurementClient: TotalVolatileOrganicCompoundsConcentrationMeasurementClientConstructor = TotalVolatileOrganicCompoundsConcentrationMeasurementClientConstructor;
