/**
 * @license
 * Copyright 2022-2025 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

/*** THIS FILE IS GENERATED, DO NOT EDIT ***/

import { FormaldehydeConcentrationMeasurement } from "#clusters/formaldehyde-concentration-measurement";
import { ClientBehavior } from "../../behavior/cluster/ClientBehavior.js";
import { Identity } from "#general";

export const FormaldehydeConcentrationMeasurementClientConstructor = ClientBehavior(
    FormaldehydeConcentrationMeasurement.Complete
);
export interface FormaldehydeConcentrationMeasurementClient extends InstanceType<typeof FormaldehydeConcentrationMeasurementClientConstructor> {}
export interface FormaldehydeConcentrationMeasurementClientConstructor extends Identity<typeof FormaldehydeConcentrationMeasurementClientConstructor> {}
export const FormaldehydeConcentrationMeasurementClient: FormaldehydeConcentrationMeasurementClientConstructor = FormaldehydeConcentrationMeasurementClientConstructor;
